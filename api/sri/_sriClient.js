// Cliente SOAP compartido para cualquier tipo de comprobante (factura, nota
// de crédito...) - la parte de "hablar con el SRI" es idéntica sin importar
// qué documento se envía: mismas URLs, mismo ciclo recepción→autorización
// con los mismos reintentos, mismo módulo de firma. Cómo se arma y firma el
// XML antes de llegar acá sigue siendo responsabilidad de cada endpoint
// (submit-invoice.js, submit-credit-note.js) - el formato interno de
// infoFactura/infoNotaCredito no tiene nada en común.
//
// Extraído en la Fase 2 (nota de crédito) para no duplicar este código -
// sin cambiar el comportamiento del envío de facturas que ya existía.

export const SRI_URLS = {
  test: {
    reception: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorization: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl'
  },
  production: {
    reception: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorization: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl'
  }
};

// Tabla 17 SRI - Codigos de porcentaje de IVA (verificar vigencia periodicamente)
export function mapTaxPercentCode(rate) {
  const r = parseFloat(rate);
  if (r === 0) return '0';
  if (r === 12) return '2';
  if (r === 14) return '3';
  if (r === 15) return '4';
  if (r === 5) return '5';
  if (r === 8) return '8';
  return '4';
}

// open-factura's "main" (CJS) entry does require('node-fetch'), but node-fetch v3
// is ESM-only, which throws ERR_REQUIRE_ESM. Import the package's .mjs build directly
// to bypass Node's CJS "main" resolution (Node ignores the "module" field).
//
// generateInvoiceXml pese al nombre es un envoltorio genérico sobre
// xmlbuilder2 (create(obj).end()) - no le importa el nombre de la clave raíz
// del objeto que recibe, así que sirve igual para construir el XML de
// notaCredito (confirmado leyendo node_modules/open-factura/dist/index.mjs:
// no hay ningún generador de nota de crédito propio en el paquete).
export async function loadOpenFactura() {
  try {
    return await import('open-factura/dist/index.mjs');
  } catch (importError) {
    console.error('Failed to load open-factura:', importError);
    throw new Error('No se pudo cargar el módulo de firma electrónica en el servidor');
  }
}

// Envía un XML ya firmado al SRI: recepción, y si RECIBIDA, autorización con
// reintentos (hasta 5, 3s entre cada uno - el SRI suele tardar unos segundos
// en autorizar tras recibir el comprobante). Mismo comportamiento exacto que
// ya tenía submit-invoice.js antes de esta fase.
export async function submitSignedXmlToSri({ signedXml, accessKey, isTest, documentReception, documentAuthorization }) {
  const urls = isTest ? SRI_URLS.test : SRI_URLS.production;

  const receptionResult = await documentReception(signedXml, urls.reception);
  const receptionStatus = receptionResult?.RespuestaRecepcionComprobante?.estado || receptionResult?.estado;

  if (receptionStatus !== 'RECIBIDA') {
    return { received: false, receptionResult };
  }

  let authObj = null;
  let authStatus = 'EN PROCESO';
  for (let attempt = 0; attempt < 5 && authStatus === 'EN PROCESO'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const authResult = await documentAuthorization(accessKey, urls.authorization);
    const auth = authResult?.RespuestaAutorizacionComprobante?.autorizaciones?.autorizacion;
    authObj = Array.isArray(auth) ? auth[0] : auth;
    authStatus = authObj?.estado || 'EN PROCESO';
  }

  return { received: true, authStatus, authObj };
}
