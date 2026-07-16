import { getAuthenticatedUser } from '../_authHelpers.js';

// ---------------------------------------------------------------------------
// Reconsulta el estado de UNA factura ya recibida por el SRI, sin volver a
// firmarla ni reenviarla. Distinto de api/sri/submit-invoice.js (que arma,
// firma y envía) y de api/sri/status.js (que solo hace ping a las 4 URLs del
// SRI para saber si el servicio está arriba, no consulta ningún comprobante -
// la Fase 3 original asumía que status.js ya hacía esto, no es así).
//
// Solo tiene sentido para facturas 'devuelta' que ya tienen authorization_number
// (= clave de acceso, se guarda ahí tanto si el SRI autorizó como si
// rechazó - ver submit-invoice.js). El escenario real que esto resuelve: el
// SRI respondió RECIBIDA en recepción, pero submit-invoice.js agotó sus 5
// reintentos (15s) mientras el SRI seguía "EN PROCESO" - el comprobante
// puede terminar autorizándose más tarde sin que nadie lo reenvíe.
// Una factura 'borrador' nunca llegó a generar clave de acceso, no hay nada
// que reconsultar - hay que reenviarla de cero (submit-invoice.js).
//
// Autorización: gerente/admin/contador (a diferencia de submit-invoice.js,
// que es solo gerente/admin - contador puede reconsultar pero NO reenviar,
// ver invoices.resend_sri en el catálogo de permisos).
const SRI_URLS = {
  test: { authorization: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl' },
  production: { authorization: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl' }
};

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
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, status, authorization_number, company_id')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .single();
    if (invoiceError || !invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    if (invoice.status !== 'devuelta' || !invoice.authorization_number) {
      return res.status(400).json({ error: 'Esta factura no tiene una clave de acceso para reconsultar - hay que reenviarla de cero' });
    }

    const { data: billingConfig } = await supabase
      .from('billing_configs')
      .select('sri_environment')
      .eq('company_id', companyId)
      .single();
    const { data: company } = await supabase
      .from('companies')
      .select('monthly_comprobantes')
      .eq('id', companyId)
      .single();
    const isTest = billingConfig?.sri_environment !== 'production';
    const url = isTest ? SRI_URLS.test.authorization : SRI_URLS.production.authorization;

    const authResult = await documentAuthorization(invoice.authorization_number, url);
    const auth = authResult?.RespuestaAutorizacionComprobante?.autorizaciones?.autorizacion;
    const authObj = Array.isArray(auth) ? auth[0] : auth;
    const authStatus = authObj?.estado || 'EN PROCESO';

    if (authStatus === 'AUTORIZADO') {
      await supabase.from('invoices').update({
        status: 'autorizada',
        authorization_date: new Date().toISOString(),
        signed_xml: authObj?.comprobante || undefined,
        sri_response_message: 'Autorizado por el SRI (reconsulta)'
      }).eq('id', invoiceId);

      // Reconsultar y encontrar AUTORIZADO cuenta contra el límite del plan
      // igual que un envío exitoso - submit-invoice.js hace el mismo +1
      // directo (no hay RPC de incremento atómico en este proyecto).
      await supabase.from('companies').update({ monthly_comprobantes: (company?.monthly_comprobantes || 0) + 1 }).eq('id', companyId);

      return res.status(200).json({ success: true, status: 'autorizada' });
    }

    await supabase.from('invoices').update({
      sri_response_message: JSON.stringify(authObj || { estado: authStatus })
    }).eq('id', invoiceId);

    return res.status(200).json({ success: true, status: 'devuelta', detail: authObj });
  } catch (error) {
    console.error('SRI reconcile error:', error);
    return res.status(500).json({ error: error.message || 'Error al reconsultar la factura' });
  }
}
