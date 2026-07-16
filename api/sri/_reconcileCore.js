import { applyCreditNoteAuthorizedEffects } from './_creditNoteEffects.js';

// Lógica de reconsulta compartida entre api/sri/reconcile-invoice.js (JWT,
// una factura a la vez, gerente/admin/contador) y api/sri/retry-pending.js
// (cron, barrido de todas las empresas) - extraída para que un comprobante
// que se autoriza en una reconsulta automática dispare exactamente los
// mismos efectos (cascada de NC, cupo del plan) que una reconsulta manual.
//
// Solo tiene sentido para facturas 'devuelta' que ya tienen authorization_number
// (= clave de acceso) - el escenario que resuelve es "el SRI respondió
// RECIBIDA en recepción, pero submit-invoice.js/submit-credit-note.js agotó
// sus reintentos mientras el SRI seguía EN PROCESO". No re-firma ni reenvía
// nada, solo vuelve a preguntar por el estado de autorización.
const SRI_URLS = {
  test: { authorization: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl' },
  production: { authorization: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl' }
};

export async function reconcileInvoiceCore({ supabase, invoiceId, companyId, userId, documentAuthorization }) {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, status, authorization_number, company_id, invoice_type')
    .eq('id', invoiceId)
    .eq('company_id', companyId)
    .single();
  if (invoiceError || !invoice) {
    return { ok: false, status: 404, error: 'Factura no encontrada' };
  }
  if (invoice.status !== 'devuelta' || !invoice.authorization_number) {
    return { ok: false, status: 400, error: 'Esta factura no tiene una clave de acceso para reconsultar - hay que reenviarla de cero' };
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

    if (invoice.invoice_type !== 'nota_credito') {
      await supabase.from('companies').update({ monthly_comprobantes: (company?.monthly_comprobantes || 0) + 1 }).eq('id', companyId);
    }

    let warnings, originalInvoiceVoided;
    if (invoice.invoice_type === 'nota_credito') {
      ({ warnings, originalInvoiceVoided } = await applyCreditNoteAuthorizedEffects({
        supabase, creditNoteId: invoiceId, companyId, userId
      }));
    }

    return { ok: true, status: 200, result: { success: true, status: 'autorizada', warnings, originalInvoiceVoided } };
  }

  await supabase.from('invoices').update({
    sri_response_message: JSON.stringify(authObj || { estado: authStatus })
  }).eq('id', invoiceId);

  return { ok: true, status: 200, result: { success: true, status: 'devuelta', detail: authObj } };
}
