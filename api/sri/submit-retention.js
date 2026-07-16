import { signXml } from './_xadesSign.js';
import { generateAccessKey } from './_accessKey.js';
import { getAuthenticatedUser } from '../_authHelpers.js';
import { mapTaxPercentCode, loadOpenFactura, submitSignedXmlToSri } from './_sriClient.js';

// Comprobante de retención (tipo 07), esquema v2.0.0 - obligatorio desde
// nov/2022, confirmado contra el XSD real (ComprobanteRetencion_V2.0.0.xsd)
// que el usuario proveyó, no inferido. La v2.0.0 reestructura todo bajo
// docsSustento > docSustento (uno por documento de respaldo - acá siempre
// uno, porque cada comprobante de retención de este sistema corresponde a
// exactamente una compra), a diferencia de la v1.0.0 que tenía un array
// plano de impuestos.
//
// Defaults documentados explícitamente porque el modelo de datos de las
// Fases 1-3 no los contemplaba (se descubrieron recién al leer el XSD real):
// - codSustento '01' (Crédito Tributario) - el caso común para una compra
//   deducible de una empresa que emite retenciones.
// - pagoLocExt '01' (Local) - todos los proveedores de este sistema tienen
//   RUC ecuatoriano.
// - Una sola línea de pago (formaPago '20' = "Otros con utilización del
//   sistema financiero", total = el total de la compra) - purchases no
//   captura forma de pago todavía, es un campo obligatorio del esquema que
//   no existía en el pedido original de la Fase 1-3.
// - parteRel toma suppliers.es_parte_relacionada (agregado en esta misma
//   fase al descubrir que el esquema lo exige).
// Si el SRI rechaza por alguno de estos, el mensaje de rechazo debería
// decir cuál - mismo criterio que ya se usó para la nota de crédito.
const COD_DOC_RETENCION = '07';
const COD_DOC_SUSTENTO_BY_TYPE = { factura_compra: '01', liquidacion_compra: '03' };
const COD_IMPUESTO_IVA = '2';
const COD_RETENCION_TYPE = { renta: '1', iva: '2' };

function formatFechaDDMMYYYY(value) {
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // pointOfSaleId/sequential se resuelven en el cliente (mismo patrón que
  // notaCredito en InvoiceManagement.jsx: getNextDocumentSequential() se
  // llama con la sesión real del gerente, nunca desde este endpoint) -
  // getAuthenticatedUser() devuelve un cliente service_role (ver
  // _authHelpers.js), y get_next_document_sequential() internamente
  // depende de current_company_id(), que a su vez depende de auth.uid() -
  // NULL para service_role, así que la RPC fallaría siempre si se llamara
  // desde acá ("Punto de venta no encontrado en esta empresa", confirmado
  // en la prueba real contra el SRI de esta misma fase).
  const { purchaseId, pointOfSaleId, sequential } = req.body || {};
  if (!purchaseId) {
    return res.status(400).json({ error: 'purchaseId es requerido' });
  }
  if (!pointOfSaleId || !sequential) {
    return res.status(400).json({ error: 'pointOfSaleId y sequential son requeridos' });
  }

  const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
  if (authError) return res.status(authStatus).json({ error: authError });
  if (!['gerente', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'No autorizado para emitir comprobantes de retención de esta empresa' });
  }
  const companyId = user.company_id;
  if (!companyId) {
    return res.status(403).json({ error: 'No autorizado para emitir comprobantes de retención de esta empresa' });
  }

  let generateInvoiceXml, documentReception, documentAuthorization;
  try {
    ({ generateInvoiceXml, documentReception, documentAuthorization } = await loadOpenFactura());
  } catch (importError) {
    return res.status(500).json({ error: importError.message });
  }

  try {
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('*, suppliers(*)')
      .eq('id', purchaseId)
      .eq('company_id', companyId)
      .single();

    if (purchaseError || !purchase) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    if (!COD_DOC_SUSTENTO_BY_TYPE[purchase.purchase_doc_type]) {
      return res.status(400).json({ error: 'Solo se puede emitir un comprobante de retención sobre facturas o liquidaciones de compra' });
    }
    if (!/^\d{3}-\d{3}-\d{9}$/.test(purchase.supplier_document_number)) {
      return res.status(400).json({ error: 'El número de documento del proveedor debe tener el formato 001-001-000000123 para poder emitir la retención' });
    }

    const { data: details, error: detailsError } = await supabase
      .from('purchase_details')
      .select('*')
      .eq('purchase_id', purchaseId);
    if (detailsError) throw new Error(detailsError.message);
    if (!details || details.length === 0) {
      return res.status(400).json({ error: 'La compra no tiene líneas de detalle' });
    }

    const { data: retentions, error: retentionsError } = await supabase
      .from('purchase_retentions')
      .select('*')
      .eq('purchase_id', purchaseId);
    if (retentionsError) throw new Error(retentionsError.message);
    if (!retentions || retentions.length === 0) {
      return res.status(400).json({ error: 'Esta compra no tiene retenciones aplicadas' });
    }
    if (retentions.some(r => r.retention_sri_status === 'autorizada')) {
      return res.status(400).json({ error: 'Esta compra ya tiene un comprobante de retención autorizado' });
    }

    const company = await supabase.from('companies').select('*').eq('id', companyId).single()
      .then(({ data, error }) => { if (error || !data) throw new Error('Empresa no encontrada'); return data; });

    const billingConfig = await supabase.from('billing_configs').select('*').eq('company_id', companyId).single()
      .then(({ data, error }) => {
        if (error || !data) throw new Error('Configuración de facturación no encontrada. Configúrala en Facturación SRI.');
        return data;
      });
    if (!billingConfig.cert_storage_path) {
      return res.status(400).json({ error: 'No hay certificado de firma electrónica cargado. Súbelo en Facturación SRI.' });
    }

    const certEncryptionKey = process.env.CERT_ENCRYPTION_KEY;
    if (!certEncryptionKey) {
      return res.status(500).json({ error: 'Configuración de servidor incompleta: falta CERT_ENCRYPTION_KEY' });
    }
    const { data: certPassword, error: certPasswordError } = await supabase.rpc('get_cert_password', {
      p_company_id: companyId,
      p_key: certEncryptionKey
    });
    if (certPasswordError || !certPassword) {
      return res.status(400).json({ error: 'No se pudo recuperar la contraseña del certificado. Vuelve a subirlo en Facturación SRI.' });
    }

    const { data: certBlob, error: certError } = await supabase.storage.from('sri-certificates').download(billingConfig.cert_storage_path);
    if (certError || !certBlob) throw new Error('No se pudo descargar el certificado de firma electrónica');
    const certArrayBuffer = await certBlob.arrayBuffer();

    // El punto de emisión debe pertenecer a esta empresa (el sequential ya
    // lo trae el caller, resuelto client-side - ver nota arriba).
    const { data: pos, error: posError } = await supabase.from('point_of_sales').select('*').eq('id', pointOfSaleId).eq('company_id', companyId).single();
    if (posError || !pos) return res.status(400).json({ error: 'Punto de emisión no encontrado' });
    const secuencialStr = String(sequential).padStart(9, '0');

    const isTest = billingConfig.sri_environment !== 'production';
    const ambiente = isTest ? '1' : '2';
    const issueDate = new Date();
    const estab = pos.numero_establecimiento;
    const ptoEmi = pos.numero_pos;

    const accessKey = generateAccessKey({
      date: issueDate, codDoc: COD_DOC_RETENCION, ruc: company.ruc, environment: ambiente,
      establishment: estab, emissionPoint: ptoEmi, sequential: secuencialStr
    });

    const regimenFields = {};
    if (billingConfig.accounting_regime === 'rimpe') {
      regimenFields.contribuyenteRimpe = 'CONTRIBUYENTE RÉGIMEN RIMPE';
    }

    const infoTributariaOrdered = {
      ambiente, tipoEmision: '1', razonSocial: company.razon_social,
      nombreComercial: company.nombre_comercial || company.razon_social, ruc: company.ruc,
      claveAcceso: accessKey, codDoc: COD_DOC_RETENCION, estab, ptoEmi, secuencial: secuencialStr,
      dirMatriz: company.direccion || company.address || 'S/N', ...regimenFields
    };

    const supplier = purchase.suppliers;
    const infoCompRetencion = {
      fechaEmision: formatFechaDDMMYYYY(issueDate),
      dirEstablecimiento: company.direccion || company.address || 'S/N',
      obligadoContabilidad: company.lleva_contabilidad ? 'SI' : 'NO',
      tipoIdentificacionSujetoRetenido: '04', // suppliers.ruc siempre es RUC en este sistema
      parteRel: supplier.es_parte_relacionada ? 'SI' : 'NO',
      razonSocialSujetoRetenido: supplier.razon_social,
      identificacionSujetoRetenido: supplier.ruc,
      periodoFiscal: `${String(issueDate.getMonth() + 1).padStart(2, '0')}/${issueDate.getFullYear()}`
    };

    // Un impuestoDocSustento por cada tarifa de IVA distinta presente en las
    // líneas de la compra (incluye 0% si corresponde) - así el esquema
    // siempre tiene al menos una entrada, sin importar si la compra tiene o
    // no líneas gravadas.
    const rateGroups = new Map();
    for (const d of details) {
      const rate = parseFloat(d.iva_rate) || 0;
      const base = parseFloat(d.subtotal) || 0;
      rateGroups.set(rate, (rateGroups.get(rate) || 0) + base);
    }
    const impuestosDocSustento = Array.from(rateGroups.entries()).map(([rate, base]) => ({
      codImpuestoDocSustento: COD_IMPUESTO_IVA,
      codigoPorcentaje: mapTaxPercentCode(rate),
      baseImponible: base.toFixed(2),
      tarifa: rate.toFixed(2),
      valorImpuesto: (base * rate / 100).toFixed(2)
    }));

    const [estabSust, ptoEmiSust, secuencialSust] = purchase.supplier_document_number.split('-');
    const numDocSustento = `${estabSust}${ptoEmiSust}${secuencialSust}`;

    // codigoRetencion viene del catálogo (retention_concepts.codigo_sri), no
    // de la fila de purchase_retentions directamente.
    const conceptIds = [...new Set(retentions.map(r => r.retention_concept_id))];
    const { data: concepts, error: conceptsError } = await supabase.from('retention_concepts').select('id, codigo_sri').in('id', conceptIds);
    if (conceptsError) throw new Error(conceptsError.message);
    const conceptCodeById = Object.fromEntries((concepts || []).map(c => [c.id, c.codigo_sri]));

    const retencionesXml = retentions.map(r => ({
      codigo: COD_RETENCION_TYPE[r.retention_type],
      codigoRetencion: conceptCodeById[r.retention_concept_id] || '000',
      baseImponible: parseFloat(r.retention_base).toFixed(2),
      porcentajeRetener: parseFloat(r.retention_percentage).toFixed(2),
      valorRetenido: parseFloat(r.retention_amount).toFixed(2)
    }));

    const docSustento = {
      codSustento: '01',
      codDocSustento: COD_DOC_SUSTENTO_BY_TYPE[purchase.purchase_doc_type],
      numDocSustento,
      fechaEmisionDocSustento: formatFechaDDMMYYYY(purchase.document_date),
      pagoLocExt: '01',
      totalSinImpuestos: (parseFloat(purchase.subtotal_0) + parseFloat(purchase.subtotal_iva)).toFixed(2),
      importeTotal: parseFloat(purchase.total).toFixed(2),
      impuestosDocSustento: { impuestoDocSustento: impuestosDocSustento },
      retenciones: { retencion: retencionesXml },
      pagos: { pago: [{ formaPago: '20', total: parseFloat(purchase.total).toFixed(2) }] }
    };

    const builtRetention = {
      comprobanteRetencion: {
        '@xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@id': 'comprobante',
        '@version': '2.0.0',
        infoTributaria: infoTributariaOrdered,
        infoCompRetencion,
        docsSustento: { docSustento: [docSustento] }
      }
    };
    const xml = generateInvoiceXml(builtRetention);
    const signedXml = await signXml(certArrayBuffer, certPassword, xml);

    const { received, receptionResult, authStatus: sriAuthStatus, authObj } = await submitSignedXmlToSri({
      signedXml, accessKey, isTest, documentReception, documentAuthorization
    });

    const retentionIds = retentions.map(r => r.id);

    if (!received) {
      await supabase.from('purchase_retentions').update({
        retention_sri_status: 'devuelta', retention_access_key: accessKey, point_of_sale_id: pointOfSaleId,
        sri_response_message: JSON.stringify(receptionResult)
      }).in('id', retentionIds);
      return res.status(400).json({ error: 'El SRI devolvió el comprobante de retención en recepción', detail: receptionResult });
    }

    if (sriAuthStatus !== 'AUTORIZADO') {
      await supabase.from('purchase_retentions').update({
        retention_sri_status: 'devuelta', retention_access_key: accessKey, point_of_sale_id: pointOfSaleId,
        sri_response_message: JSON.stringify(authObj || { estado: sriAuthStatus })
      }).in('id', retentionIds);
      return res.status(400).json({ error: `El SRI no autorizó el comprobante de retención (estado: ${sriAuthStatus})`, detail: authObj });
    }

    await supabase.from('purchase_retentions').update({
      retention_sri_status: 'autorizada', retention_access_key: accessKey,
      retention_authorization_number: accessKey, point_of_sale_id: pointOfSaleId,
      signed_xml: authObj?.comprobante || signedXml, sri_response_message: 'Autorizado por el SRI'
    }).in('id', retentionIds);

    return res.status(200).json({ success: true, status: 'autorizada', accessKey });
  } catch (error) {
    console.error('SRI retention submission error:', error);
    return res.status(500).json({ error: error.message || 'Error al enviar el comprobante de retención al SRI' });
  }
}
