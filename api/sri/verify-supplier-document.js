import { getAuthenticatedUser } from '../_authHelpers.js';
import { loadOpenFactura } from './_sriClient.js';

// Consulta el estado de autorización de un documento AJENO (la factura que
// un proveedor entregó) directamente contra el webservice real del SRI -
// nunca firma ni reenvía nada, solo pregunta "¿esta clave de acceso está
// autorizada de verdad?". Ayuda a detectar un proveedor con un comprobante
// rechazado o inventado antes de registrar la compra.
//
// Siempre consulta PRODUCCIÓN: el documento de un proveedor real, si es
// real, fue autorizado en el ambiente de producción del SRI - no tendría
// sentido validar una clave de acceso real contra el ambiente de pruebas
// (que ni siquiera comparte la misma base de datos de comprobantes).
const SRI_AUTH_URL_PRODUCTION = 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accessKey } = req.body || {};
  if (!accessKey || !/^\d{49}$/.test(accessKey)) {
    return res.status(400).json({ error: 'accessKey debe tener 49 dígitos' });
  }

  const { error: authError, status: authStatus } = await getAuthenticatedUser(req);
  if (authError) return res.status(authStatus).json({ error: authError });

  let documentAuthorization;
  try {
    ({ documentAuthorization } = await loadOpenFactura());
  } catch (importError) {
    return res.status(500).json({ error: importError.message });
  }

  try {
    const authResult = await documentAuthorization(accessKey, SRI_AUTH_URL_PRODUCTION);
    const auth = authResult?.RespuestaAutorizacionComprobante?.autorizaciones?.autorizacion;
    const authObj = Array.isArray(auth) ? auth[0] : auth;

    // found=false solo pasa con una clave BIEN formada (49 dígitos, checksum
    // válido) que simplemente nunca se presentó al SRI - confirmado con
    // datos reales: una clave con checksum inválido no cae acá, el SRI
    // responde igual pero con estado RECHAZADA y el motivo estructural en
    // "mensajes" (identificador 80, "ERROR EN LA ESTRUCTURA DE LA CLAVE DE
    // ACCESO") - ese caso ya lo cubre la rama de abajo, no esta.
    if (!authObj) {
      return res.status(200).json({ found: false, estado: null, message: 'El SRI no tiene ningún comprobante con esta clave de acceso' });
    }

    return res.status(200).json({
      found: true,
      estado: authObj.estado,
      fechaAutorizacion: authObj.fechaAutorizacion || null,
      mensajes: authObj.mensajes || null
    });
  } catch (error) {
    console.error('SRI supplier document verification error:', error);
    return res.status(500).json({ error: error.message || 'Error al consultar el comprobante ante el SRI' });
  }
}
