import { createClient } from '@supabase/supabase-js';
import { signXml } from './xadesSign.js';
import { generateAccessKey } from './accessKey.js';

const SRI_URLS = {
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
function mapTaxPercentCode(rate) {
  const r = parseFloat(rate);
  if (r === 0) return '0';
  if (r === 12) return '2';
  if (r === 14) return '3';
  if (r === 15) return '4';
  if (r === 5) return '5';
  if (r === 8) return '8';
  return '4';
}

function mapPaymentMethodToSRI(method) {
  const map = { cash: '01', card: '19', debit: '16', transfer: '20', other: '20' };
  return map[method] || '01';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invoiceId, companyId, userId } = req.body || {};
  if (!invoiceId || !companyId || !userId) {
    return res.status(400).json({ error: 'invoiceId, companyId y userId son requeridos' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.VITE_SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Configuración de servidor incompleta: falta la URL o la clave secreta de Supabase en las variables de entorno de Vercel' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // signXml is our own local implementation (see xadesSign.js) - open-factura's version
  // uses `import * as forge from "node-forge"`, which under native Node.js ESM/CJS interop
  // leaves forge.util/forge.pki/etc. undefined (only works when bundled by esbuild/webpack).
  let generateInvoiceXml, documentReception, documentAuthorization;
  try {
    // open-factura's "main" (CJS) entry does require('node-fetch'), but node-fetch v3
    // is ESM-only, which throws ERR_REQUIRE_ESM. Import the package's .mjs build directly
    // to bypass Node's CJS "main" resolution (Node ignores the "module" field).
    const openFactura = await import('open-factura/dist/index.mjs');
    ({ generateInvoiceXml, documentReception, documentAuthorization } = openFactura);
  } catch (importError) {
    console.error('Failed to load open-factura:', importError);
    return res.status(500).json({
      error: 'No se pudo cargar el módulo de firma electrónica en el servidor',
      detail: importError.message,
      stack: importError.stack
    });
  }

  try {
    // Verificar que el usuario pertenece a la empresa y tiene rol autorizado
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, company_id, role')
      .eq('id', userId)
      .single();

    if (userError || !user || user.company_id !== companyId || !['gerente', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'No autorizado para aprobar facturas de esta empresa' });
    }

    // Factura
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, customers(name, identification_type, identification_number, address)')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    if (invoice.status !== 'borrador') {
      return res.status(400).json({ error: `La factura ya está en estado '${invoice.status}', no se puede reenviar` });
    }

    // Detalles
    const { data: details, error: detailsError } = await supabase
      .from('invoice_details')
      .select('*')
      .eq('invoice_id', invoiceId);

    if (detailsError) throw new Error(detailsError.message);
    if (!details || details.length === 0) {
      return res.status(400).json({ error: 'La factura no tiene productos' });
    }

    // Empresa
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    if (companyError || !company) throw new Error('Empresa no encontrada');

    // Configuración de facturación (certificado, ambiente, tasa IVA)
    const { data: billingConfig, error: billingError } = await supabase
      .from('billing_configs')
      .select('*')
      .eq('company_id', companyId)
      .single();
    if (billingError || !billingConfig) {
      return res.status(400).json({ error: 'Configuración de facturación no encontrada. Configúrala en Facturación SRI.' });
    }
    if (!billingConfig.cert_storage_path || !billingConfig.cert_password) {
      return res.status(400).json({ error: 'No hay certificado de firma electrónica cargado. Súbelo en Facturación SRI.' });
    }

    // Descargar certificado
    const { data: certBlob, error: certError } = await supabase
      .storage
      .from('sri-certificates')
      .download(billingConfig.cert_storage_path);
    if (certError || !certBlob) throw new Error('No se pudo descargar el certificado de firma electrónica');
    const certArrayBuffer = await certBlob.arrayBuffer();

    const isTest = billingConfig.sri_environment !== 'production';
    const ambiente = isTest ? '1' : '2';
    const taxRate = parseFloat(billingConfig.tax_rate) || 12;
    const codigoPorcentaje = mapTaxPercentCode(taxRate);

    const issueDate = new Date(invoice.issue_date || Date.now());
    const fechaEmision = `${String(issueDate.getDate()).padStart(2, '0')}/${String(issueDate.getMonth() + 1).padStart(2, '0')}/${issueDate.getFullYear()}`;

    const hasCustomer = !!invoice.customers;
    const tipoIdentificacionComprador = !hasCustomer ? '07' : (invoice.customers.identification_type === 'ruc' ? '04' : '05');
    const identificacionComprador = hasCustomer ? invoice.customers.identification_number : '9999999999999';
    const razonSocialComprador = hasCustomer ? invoice.customers.name : 'CONSUMIDOR FINAL';
    const direccionComprador = hasCustomer ? (invoice.customers.address || 'S/N') : 'S/N';

    const [estab, ptoEmi, secuencialStr] = invoice.invoice_number.split('-');

    const detalles = details.map(d => {
      // d.subtotal is already net of discount (computed at sale time as
      // unitPrice*quantity - discount); SRI's schema expects the gross amount
      // and the discount reported separately, with
      // precioTotalSinImpuesto = (cantidad*precioUnitario) - descuento
      const grossAmount = parseFloat(d.unit_price) * parseFloat(d.quantity);
      const discountAmount = (grossAmount * (parseFloat(d.discount_percent) || 0) / 100).toFixed(2);
      const baseImponible = parseFloat(d.subtotal).toFixed(2);
      const valorImpuesto = parseFloat(d.tax_amount).toFixed(2);
      return {
        codigoPrincipal: d.product_code || 'N/A',
        codigoAuxiliar: d.product_code || 'N/A',
        descripcion: d.product_name,
        cantidad: String(d.quantity),
        precioUnitario: parseFloat(d.unit_price).toFixed(2),
        descuento: discountAmount,
        precioTotalSinImpuesto: baseImponible,
        impuestos: {
          impuesto: [{
            codigo: '2',
            codigoPorcentaje,
            tarifa: String(taxRate),
            baseImponible,
            valor: valorImpuesto
          }]
        }
      };
    });

    const regimenFields = {};
    if (billingConfig.accounting_regime === 'micro') {
      regimenFields.regimenMicroempresas = 'CONTRIBUYENTE RÉGIMEN MICROEMPRESAS';
    } else if (billingConfig.accounting_regime === 'rimpe') {
      regimenFields.contribuyenteRimpe = 'CONTRIBUYENTE RÉGIMEN RIMPE';
    }

    const invoiceInput = {
      infoTributaria: {
        ambiente,
        tipoEmision: '1',
        razonSocial: company.razon_social,
        nombreComercial: company.nombre_comercial || company.razon_social,
        ruc: company.ruc,
        codDoc: '01',
        estab,
        ptoEmi,
        secuencial: secuencialStr,
        dirMatriz: company.direccion || company.address || 'S/N',
        ...regimenFields
      },
      infoFactura: {
        fechaEmision,
        dirEstablecimiento: company.direccion || company.address || 'S/N',
        obligadoContabilidad: company.lleva_contabilidad ? 'SI' : 'NO',
        tipoIdentificacionComprador,
        razonSocialComprador,
        identificacionComprador,
        direccionComprador,
        totalSinImpuestos: parseFloat(invoice.subtotal).toFixed(2),
        totalDescuento: parseFloat(invoice.discount_amount || 0).toFixed(2),
        totalConImpuestos: {
          totalImpuesto: [{
            codigo: '2',
            codigoPorcentaje,
            descuentoAdicional: '0.00',
            baseImponible: parseFloat(invoice.subtotal).toFixed(2),
            tarifa: String(taxRate),
            valor: parseFloat(invoice.tax_amount).toFixed(2)
          }]
        },
        propina: '0.00',
        importeTotal: parseFloat(invoice.total_amount).toFixed(2),
        moneda: 'DOLAR',
        pagos: {
          pago: [{
            formaPago: mapPaymentMethodToSRI(invoice.payment_method),
            total: parseFloat(invoice.total_amount).toFixed(2),
            plazo: '0',
            unidadTiempo: 'dias'
          }]
        }
      },
      detalles: { detalle: detalles }
    };

    // Generate the access key directly from the real Date object (not the dd/mm/yyyy
    // string), see accessKey.js for why - avoids open-factura's date-transposition bug
    const accessKey = generateAccessKey({
      date: issueDate,
      codDoc: invoiceInput.infoTributaria.codDoc,
      ruc: invoiceInput.infoTributaria.ruc,
      environment: invoiceInput.infoTributaria.ambiente,
      establishment: invoiceInput.infoTributaria.estab,
      emissionPoint: invoiceInput.infoTributaria.ptoEmi,
      sequential: invoiceInput.infoTributaria.secuencial
    });

    // The SRI XSD requires infoTributaria's children in this exact sequence -
    // claveAcceso must sit between ruc and codDoc, not appended at the end
    // (xmlbuilder2 renders object keys in insertion order as XML element order)
    const { ambiente: amb, tipoEmision, razonSocial, nombreComercial, ruc, codDoc, estab: estabField, ptoEmi: ptoEmiField, secuencial, dirMatriz, ...regimenTail } = invoiceInput.infoTributaria;
    const infoTributariaOrdered = {
      ambiente: amb,
      tipoEmision,
      razonSocial,
      nombreComercial,
      ruc,
      claveAcceso: accessKey,
      codDoc,
      estab: estabField,
      ptoEmi: ptoEmiField,
      secuencial,
      dirMatriz,
      ...regimenTail
    };

    const builtInvoice = {
      factura: {
        '@xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@id': 'comprobante',
        '@version': '1.0.0',
        infoTributaria: infoTributariaOrdered,
        infoFactura: invoiceInput.infoFactura,
        detalles: invoiceInput.detalles
      }
    };
    const xml = generateInvoiceXml(builtInvoice);
    const signedXml = await signXml(certArrayBuffer, billingConfig.cert_password, xml);

    const urls = isTest ? SRI_URLS.test : SRI_URLS.production;

    const receptionResult = await documentReception(signedXml, urls.reception);
    const receptionStatus = receptionResult?.RespuestaRecepcionComprobante?.estado || receptionResult?.estado;

    if (receptionStatus !== 'RECIBIDA') {
      await supabase.from('invoices').update({
        status: 'devuelta',
        authorization_number: accessKey,
        sri_response_message: JSON.stringify(receptionResult)
      }).eq('id', invoiceId);

      return res.status(400).json({ error: 'El SRI devolvió el comprobante en recepción', detail: receptionResult });
    }

    // El SRI suele tardar unos segundos en autorizar tras recibir el comprobante
    let authObj = null;
    let authStatus = 'EN PROCESO';
    for (let attempt = 0; attempt < 5 && authStatus === 'EN PROCESO'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const authResult = await documentAuthorization(accessKey, urls.authorization);
      const auth = authResult?.RespuestaAutorizacionComprobante?.autorizaciones?.autorizacion;
      authObj = Array.isArray(auth) ? auth[0] : auth;
      authStatus = authObj?.estado || 'EN PROCESO';
    }

    if (authStatus === 'AUTORIZADO') {
      await supabase.from('invoices').update({
        status: 'autorizada',
        authorization_number: accessKey,
        authorization_date: new Date().toISOString(),
        signed_xml: authObj?.comprobante || signedXml,
        sri_response_message: 'Autorizado por el SRI'
      }).eq('id', invoiceId);

      return res.status(200).json({ success: true, status: 'autorizada', accessKey });
    }

    await supabase.from('invoices').update({
      status: 'devuelta',
      authorization_number: accessKey,
      sri_response_message: JSON.stringify(authObj || { estado: authStatus })
    }).eq('id', invoiceId);

    return res.status(400).json({ error: `El SRI no autorizó el comprobante (estado: ${authStatus})`, detail: authObj });
  } catch (error) {
    console.error('SRI submission error:', error);
    return res.status(500).json({
      error: error.message || 'Error al enviar la factura al SRI',
      stack: error.stack
    });
  }
}
