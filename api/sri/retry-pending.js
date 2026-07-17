import { getSupabaseAdmin, verifyCronSecret } from '../_authHelpers.js';
import { loadOpenFactura, submitSignedXmlToSri } from './_sriClient.js';
import { reconcileInvoiceCore } from './_reconcileCore.js';
import { classifyDevueltaInvoice } from './_retryClassifier.js';
import submitInvoiceHandler from './submit-invoice.js';
import { sendEmail } from '../emails/_lib.js';
import { trialEndingEmail } from '../emails/_templates.js';

// Mejoras Admin Fase 6: mismo archivo/dispatcher (por el límite de 12
// funciones serverless de Vercel Hobby, ver AUDITORIA_SISTEMA.md), pero
// con su propio cron DIARIO (vercel.json apunta a esta misma ruta con
// "?job=trials" en vez de crear un archivo nuevo) - un query param decide
// qué lógica corre, ya que un cron no manda body custom como sí puede
// hacerlo api/admin/users.js con `action`. No toca nada de lo de abajo
// (reintentos SRI, cada 15 min) cuando job=trials.
async function runTrialJob(supabase) {
  const summary = { warned: 0, warnFailed: 0, expired: 0 };

  // Aviso: trial vence en <= 3 días, todavía no se le avisó, sigue activa y
  // no está dada de baja. trial_warning_sent_at evita reenviarlo cada día.
  const { data: warningCandidates, error: warningError } = await supabase
    .from('companies')
    .select('id, nombre_comercial, email, admin_email, trial_ends_at')
    .eq('subscription_status', 'activa')
    .is('deleted_at', null)
    .is('trial_warning_sent_at', null)
    .not('trial_ends_at', 'is', null)
    .lte('trial_ends_at', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString());

  if (warningError) {
    console.error('retry-pending[trials]: error buscando avisos de trial:', warningError);
  } else {
    for (const company of warningCandidates || []) {
      const to = company.email || company.admin_email;
      const daysRemaining = Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      try {
        const { subject, html } = trialEndingEmail({
          companyName: company.nombre_comercial,
          daysRemaining: Math.max(0, daysRemaining),
          trialEndsAtLabel: new Date(company.trial_ends_at).toLocaleDateString('es-EC'),
          upgradeUrl: process.env.EMAIL_APP_URL || null
        });
        await sendEmail({ to, subject, html });
        summary.warned++;
      } catch (error) {
        console.error(`retry-pending[trials]: error enviando aviso a ${company.id}:`, error);
        summary.warnFailed++;
      } finally {
        // Se marca como avisada aunque el correo haya fallado (sin destinatario,
        // Resend caído, etc.) - mismo criterio que el resto del sistema: no
        // reintentar un correo indefinidamente, y no bloquear la transición a
        // 'vencida' de más abajo porque un envío puntual falló.
        await supabase.from('companies').update({ trial_warning_sent_at: new Date().toISOString() }).eq('id', company.id);
      }
    }
  }

  // Vencimiento real: trial_ends_at ya pasó, sigue 'activa' (si ya está
  // suspendida/vencida/dada de baja no hay nada que hacer). Nunca usa
  // new Date()/toISOString() como límite de comparación contra Postgres -
  // se compara del lado de SQL con .lt(..., new Date().toISOString()) que
  // Postgres interpreta como instante real (timestamptz-like), no como el
  // bug de AUDITORIA_SISTEMA.md #10 (ese es sobre columnas sin huso que se
  // leen mal desde JS, no sobre el filtro en sí).
  const { data: expiredCandidates, error: expiredError } = await supabase
    .from('companies')
    .select('id, nombre_comercial')
    .eq('subscription_status', 'activa')
    .is('deleted_at', null)
    .not('trial_ends_at', 'is', null)
    .lt('trial_ends_at', new Date().toISOString());

  if (expiredError) {
    console.error('retry-pending[trials]: error buscando trials vencidos:', expiredError);
  } else {
    for (const company of expiredCandidates || []) {
      const { error: updateError } = await supabase.from('companies').update({ subscription_status: 'vencida' }).eq('id', company.id);
      if (updateError) {
        console.error(`retry-pending[trials]: error marcando vencida ${company.id}:`, updateError);
        continue;
      }
      await supabase.from('activity_log').insert([{
        company_id: company.id, user_id: null, action: 'Empresa vencida (trial)',
        description: 'Período de prueba vencido - transición automática a Vencida'
      }]);
      summary.expired++;
    }
  }

  return summary;
}

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

  if (req.query?.job === 'trials') {
    const summary = await runTrialJob(supabase);
    return res.status(200).json({ success: true, job: 'trials', ...summary });
  }

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
