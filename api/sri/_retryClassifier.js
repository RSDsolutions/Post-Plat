// Decide qué hacer con una factura/NC 'devuelta' con clave de acceso, a
// partir del último sri_response_message guardado (JSON crudo de la
// respuesta del SRI - ver submit-invoice.js/_reconcileCore.js):
//
// - 'reconcile'   -> el SRI la recibió y seguía 'EN PROCESO' la última vez
//                    que se consultó. Solo hace falta reconsultar de nuevo
//                    (reconcileInvoiceCore, sin re-firmar).
// - 'full-retry'  -> no hay mensaje específico del SRI (probable falla de
//                    red/infra propia antes de completar el intercambio), o
//                    el mensaje que dio describe algo recuperable
//                    (timeout, servicio no disponible). Reintento completo
//                    (re-firmar y reenviar, vía submit-invoice.js).
// - 'skip'        -> el SRI dio un motivo de rechazo concreto que no es de
//                    infraestructura (RUC inválido, clave duplicada, firma,
//                    fecha extemporánea, consumidor final en NC, etc.) -
//                    reintentar el mismo comprobante no lo va a arreglar,
//                    hace falta que un humano lo corrija.
const RECOVERABLE_PATTERN = /timeout|tiempo de espera|no disponible|temporal|indispon|conexi[oó]n|servicio/i;

function extractMensajes(parsed) {
  const collected = [];
  const push = (m) => {
    if (!m) return;
    if (Array.isArray(m)) m.forEach(push);
    else collected.push(m);
  };
  push(parsed?.RespuestaRecepcionComprobante?.comprobantes?.comprobante?.mensajes?.mensaje);
  push(parsed?.mensajes?.mensaje);
  return collected;
}

export function classifyDevueltaInvoice(sriResponseMessage) {
  if (!sriResponseMessage) return 'full-retry';

  let parsed;
  try {
    parsed = JSON.parse(sriResponseMessage);
  } catch {
    return 'skip';
  }

  const estado = parsed?.estado || parsed?.RespuestaRecepcionComprobante?.estado;
  if (estado === 'EN PROCESO') return 'reconcile';

  const mensajes = extractMensajes(parsed);
  if (mensajes.length === 0) return 'full-retry';

  const allRecoverable = mensajes.every(m => RECOVERABLE_PATTERN.test(`${m.mensaje || ''} ${m.informacionAdicional || ''}`));
  return allRecoverable ? 'full-retry' : 'skip';
}
