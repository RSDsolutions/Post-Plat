import { getAuthenticatedUser } from '../_authHelpers.js';
import { reconcileInvoiceCore } from './_reconcileCore.js';

// ---------------------------------------------------------------------------
// Reconsulta el estado de UNA factura ya recibida por el SRI, sin volver a
// firmarla ni reenviarla. Distinto de api/sri/submit-invoice.js (que arma,
// firma y envía) y de api/sri/status.js (que solo hace ping a las 4 URLs del
// SRI para saber si el servicio está arriba, no consulta ningún comprobante).
//
// La lógica real vive en _reconcileCore.js, compartida con
// api/sri/retry-pending.js (cron) - este archivo es solo el wrapper que
// verifica el JWT y traduce el resultado a una respuesta HTTP.
//
// Autorización: gerente/admin/contador (a diferencia de submit-invoice.js,
// que es solo gerente/admin - contador puede reconsultar pero NO reenviar).
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invoiceId } = req.body || {};
  if (!invoiceId) {
    return res.status(400).json({ error: 'invoiceId es requerido' });
  }

  const { supabase, user, error: authError, status: authStatusCode } = await getAuthenticatedUser(req);
  if (authError) return res.status(authStatusCode).json({ error: authError });
  if (!['gerente', 'admin', 'contador'].includes(user.role)) {
    return res.status(403).json({ error: 'No autorizado para reconsultar facturas de esta empresa' });
  }
  const companyId = user.company_id;
  if (!companyId) {
    return res.status(403).json({ error: 'No autorizado para reconsultar facturas de esta empresa' });
  }

  let documentAuthorization;
  try {
    ({ documentAuthorization } = await import('open-factura/dist/index.mjs'));
  } catch (importError) {
    console.error('Failed to load open-factura:', importError);
    return res.status(500).json({ error: 'No se pudo cargar el módulo de consulta SRI en el servidor' });
  }

  try {
    const { ok, status, error, result } = await reconcileInvoiceCore({ supabase, invoiceId, companyId, userId: user.id, documentAuthorization });
    if (!ok) return res.status(status).json({ error });
    return res.status(status).json(result);
  } catch (error) {
    console.error('SRI reconcile error:', error);
    return res.status(500).json({ error: error.message || 'Error al reconsultar la factura' });
  }
}
