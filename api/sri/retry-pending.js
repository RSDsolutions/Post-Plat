import { getSupabaseAdmin, verifyCronSecret } from '../_authHelpers.js';
import { loadOpenFactura, submitSignedXmlToSri } from './_sriClient.js';
import { reconcileInvoiceCore } from './_reconcileCore.js';
import { classifyDevueltaInvoice } from './_retryClassifier.js';
import submitInvoiceHandler from './submit-invoice.js';

// ---------------------------------------------------------------------------
// Cron (cada 15 min, ver vercel.json) que barre TODAS las empresas buscando
// facturas/notas de crédito 'devuelta' con clave de acceso, de más de 10
// minutos de antigüedad (get_invoices_pending_retry - la comparación de edad
// se hace en SQL con now(), nunca con new Date() de JS, para no repetir el
// bug de zona horaria de AUDITORIA_SISTEMA.md #10). Por cada candidata:
//   - 'EN PROCESO' la última vez -> reconsultar (reconcileInvoiceCore, sin
//     re-firmar - el SRI ya la tiene en su cola).
//   - Sin mensaje específico, o un mensaje reconocible como recuperable
//     (timeout/servicio no disponible) -> reintento completo, reusando
//     submit-invoice.js con el secreto del cron (re-firma y reenvía con una
//     clave de acceso nueva).
//   - Cualquier otro motivo (RUC inválido, clave duplicada, firma, fecha
//     extemporánea, consumidor final...) -> no se toca, requiere corrección
//     humana. Ver _retryClassifier.js.
//
// Presupuesto de tiempo suave (no solo el límite de ~20 candidatas de la
// RPC): un reintento completo puede tardar 15-20s (polling de autorización),
// así que un lote de 20 podría exceder maxDuration=60 sin este freno - lo
// que quede sin procesar simplemente lo recoge la próxima corrida, 15
// minutos después.
const TIME_BUDGET_MS = 45000;

export default async function handler(req, res) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();

  const { data: candidates, error: candidatesError } = await supabase.rpc('get_invoices_pending_retry', { p_limit: 20 });
  if (candidatesError) {
    console.error('retry-pending: error obteniendo candidatas:', candidatesError);
    return res.status(500).json({ error: candidatesError.message });
  }

  const summary = { reconciled: 0, retried: 0, skipped: 0, errored: 0, truncated: false };
  const perCompany = new Map();
  const noteFor = (companyId) => {
    if (!perCompany.has(companyId)) {
      perCompany.set(companyId, { reconciled: 0, retried: 0, skipped: 0, errored: 0 });
    }
    return perCompany.get(companyId);
  };

  let documentAuthorization;
  try {
    ({ documentAuthorization } = await loadOpenFactura());
  } catch (importError) {
    console.error('retry-pending: no se pudo cargar open-factura:', importError);
    return res.status(500).json({ error: importError.message });
  }

  for (const invoice of candidates || []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      summary.truncated = true;
      break;
    }

    const company = noteFor(invoice.company_id);
    const classification = classifyDevueltaInvoice(invoice.sri_response_message);

    try {
      if (classification === 'reconcile') {
        await reconcileInvoiceCore({
          supabase, invoiceId: invoice.id, companyId: invoice.company_id, userId: null, documentAuthorization
        });
        summary.reconciled++;
        company.reconciled++;
      } else if (classification === 'full-retry') {
        const mockReq = {
          method: 'POST',
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          body: { invoiceId: invoice.id, companyId: invoice.company_id }
        };
        const mockRes = {
          _status: 200,
          status(code) { this._status = code; return this; },
          json(body) { this._json = body; return this; }
        };
        await submitInvoiceHandler(mockReq, mockRes);
        summary.retried++;
        company.retried++;
      } else {
        summary.skipped++;
        company.skipped++;
      }
    } catch (error) {
      console.error(`retry-pending: error procesando ${invoice.id}:`, error);
      summary.errored++;
      company.errored++;
    }
  }

  const sweepRows = Array.from(perCompany.entries()).map(([companyId, counts]) => ({
    company_id: companyId,
    user_id: null,
    action: 'sri_retry_sweep',
    description: `Reconciliadas: ${counts.reconciled}, reenviadas: ${counts.retried}, omitidas: ${counts.skipped}, con error: ${counts.errored}`
  }));
  if (sweepRows.length > 0) {
    const { error: logError } = await supabase.from('activity_log').insert(sweepRows);
    if (logError) console.error('retry-pending: no se pudo registrar en activity_log:', logError);
  }

  return res.status(200).json({ success: true, candidatesFound: (candidates || []).length, ...summary });
}
