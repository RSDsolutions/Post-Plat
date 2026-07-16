import { signXml } from './_xadesSign.js';
import { generateAccessKey } from './_accessKey.js';
import { getAuthenticatedUser, getSupabaseAdmin, verifyCronSecret } from '../_authHelpers.js';
import { mapTaxPercentCode, loadOpenFactura, submitSignedXmlToSri } from './_sriClient.js';

function mapPaymentMethodToSRI(method) {
  const map = { cash: '01', card: '19', debit: '16', transfer: '20', other: '20' };
  return map[method] || '01';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invoiceId } = req.body || {};
  if (!invoiceId) {
    return res.status(400).json({ error: 'invoiceId es requerido' });
  }

  // Dos caminos de autorización: JWT real de un gerente/admin (igual que
  // siempre), o el secreto del cron de reintentos (api/sri/retry-pending.js)
  // - el cron no actúa como ningún usuario en particular, así que confía en
  // el companyId del body en vez de resolverlo de una sesión (no hay
  // sesión). company_id ya no es nunca un parámetro en el camino JWT: es el
  // de la sesión autenticada, así nadie puede aprobar una factura de una
  // empresa que no es la suya con solo cambiar el body.
  let supabase, companyId;
  if (verifyCronSecret(req)) {
    supabase = getSupabaseAdmin();
    companyId = req.body?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'companyId es requerido' });
    }
  } else {
    const { supabase: authedSupabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
    if (authError) return res.status(authStatus).json({ error: authError });
    if (!['gerente', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'No autorizado para aprobar facturas de esta empresa' });
    }
    supabase = authedSupabase;
    companyId = user.company_id;
    if (!companyId) {
      return res.status(403).json({ error: 'No autorizado para aprobar facturas de esta empresa' });
    }
  }

  // signXml es nuestra propia implementación (ver _xadesSign.js) - la de
  // open-factura usa `import * as forge from "node-forge"`, que bajo la
  // interoperabilidad nativa ESM/CJS de Node deja forge.util/forge.pki/etc.
  // undefined (solo funciona empaquetado por esbuild/webpack).
  let generateInvoiceXml, documentReception, documentAuthorization;
  try {
    ({ generateInvoiceXml, documentReception, documentAuthorization } = await loadOpenFactura());
  } catch (importError) {
    return res.status(500).json({ error: importError.message });
  }

  try {
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
    // 'devuelta' se acepta para permitir el reintento completo (re-firmar y
    // reenviar) desde api/sri/retry-pending.js sobre una factura que ya
    // falló una vez - un envío nuevo siempre pide una clave de acceso nueva
    // (generateAccessKey incluye un código numérico aleatorio), así que no
    // hay riesgo de reusar una clave que el SRI ya haya visto.
    if (invoice.status !== 'borrador' && invoice.status !== 'devuelta') {
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

    // Empresa (con el límite mensual de comprobantes de su plan, si tiene uno)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*, plans(max_invoices_monthly)')
      .eq('id', companyId)
      .single();
    if (companyError || !company) throw new Error('Empresa no encontrada');

    // Reset perezoso del contador mensual: no hay infraestructura de cron en
    // este proyecto, así que el "mes nuevo" se detecta acá, en el momento en
    // que la empresa intenta emitir su primer comprobante del mes.
    const today = new Date();
    const periodStart = company.comprobantes_period_start ? new Date(company.comprobantes_period_start) : today;
    const periodChanged = today.getUTCFullYear() !== periodStart.getUTCFullYear() || today.getUTCMonth() !== periodStart.getUTCMonth();
    let monthlyComprobantes = company.monthly_comprobantes || 0;
    if (periodChanged) {
      await supabase.from('companies').update({
        prev_month_comprobantes: monthlyComprobantes,
        monthly_comprobantes: 0,
        comprobantes_period_start: today.toISOString().slice(0, 10)
      }).eq('id', companyId);
      monthlyComprobantes = 0;
    }

    const maxInvoicesMonthly = company.plans?.max_invoices_monthly;
    if (maxInvoicesMonthly != null && monthlyComprobantes >= maxInvoicesMonthly) {
      return res.status(400).json({ error: `Alcanzaste el límite de ${maxInvoicesMonthly} facturas mensuales de tu plan. Actualiza tu plan para seguir facturando este mes.` });
    }

    // Configuración de facturación (certificado, ambiente, tasa IVA)
    const { data: billingConfig, error: billingError } = await supabase
      .from('billing_configs')
      .select('*')
      .eq('company_id', companyId)
      .single();
    if (billingError || !billingConfig) {
      return res.status(400).json({ error: 'Configuración de facturación no encontrada. Configúrala en Facturación SRI.' });
    }
    if (!billingConfig.cert_storage_path) {
      return res.status(400).json({ error: 'No hay certificado de firma electrónica cargado. Súbelo en Facturación SRI.' });
    }

    // cert_password está cifrado en reposo (pgcrypto) - se descifra acá con
    // la clave server-side, nunca se lee en texto plano de la tabla directamente.
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
    // string), see _accessKey.js for why - avoids open-factura's date-transposition bug
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
    const signedXml = await signXml(certArrayBuffer, certPassword, xml);

    const { received, receptionResult, authStatus: sriAuthStatus, authObj } = await submitSignedXmlToSri({
      signedXml, accessKey, isTest, documentReception, documentAuthorization
    });

    if (!received) {
      await supabase.from('invoices').update({
        status: 'devuelta',
        authorization_number: accessKey,
        sri_response_message: JSON.stringify(receptionResult)
      }).eq('id', invoiceId);

      return res.status(400).json({ error: 'El SRI devolvió el comprobante en recepción', detail: receptionResult });
    }

    if (sriAuthStatus === 'AUTORIZADO') {
      await supabase.from('invoices').update({
        status: 'autorizada',
        authorization_number: accessKey,
        authorization_date: new Date().toISOString(),
        signed_xml: authObj?.comprobante || signedXml,
        sri_response_message: 'Autorizado por el SRI'
      }).eq('id', invoiceId);

      // Solo se cuenta contra el límite del plan lo que el SRI efectivamente
      // autorizó, no los borradores ni lo que el SRI rechazó.
      await supabase.from('companies').update({ monthly_comprobantes: monthlyComprobantes + 1 }).eq('id', companyId);

      return res.status(200).json({ success: true, status: 'autorizada', accessKey });
    }

    await supabase.from('invoices').update({
      status: 'devuelta',
      authorization_number: accessKey,
      sri_response_message: JSON.stringify(authObj || { estado: sriAuthStatus })
    }).eq('id', invoiceId);

    return res.status(400).json({ error: `El SRI no autorizó el comprobante (estado: ${sriAuthStatus})`, detail: authObj });
  } catch (error) {
    console.error('SRI submission error:', error);
    return res.status(500).json({
      error: error.message || 'Error al enviar la factura al SRI'
    });
  }
}
