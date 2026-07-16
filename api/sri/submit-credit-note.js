import { signXml } from './_xadesSign.js';
import { generateAccessKey } from './_accessKey.js';
import { getAuthenticatedUser } from '../_authHelpers.js';
import { mapTaxPercentCode, loadOpenFactura, submitSignedXmlToSri } from './_sriClient.js';
import { applyCreditNoteAuthorizedEffects } from './_creditNoteEffects.js';

// Tolerancia para comparar montos en punto flotante (centavos de dólar).
const AMOUNT_EPSILON = 0.01;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invoiceId } = req.body || {};
  if (!invoiceId) {
    return res.status(400).json({ error: 'invoiceId es requerido' });
  }

  const { supabase, user, error: authError, status: authStatus } = await getAuthenticatedUser(req);
  if (authError) return res.status(authStatus).json({ error: authError });
  if (!['gerente', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'No autorizado para emitir notas de crédito de esta empresa' });
  }
  const companyId = user.company_id;
  if (!companyId) {
    return res.status(403).json({ error: 'No autorizado para emitir notas de crédito de esta empresa' });
  }

  let generateInvoiceXml, documentReception, documentAuthorization;
  try {
    ({ generateInvoiceXml, documentReception, documentAuthorization } = await loadOpenFactura());
  } catch (importError) {
    return res.status(500).json({ error: importError.message });
  }

  try {
    // Nota de crédito (ya creada en 'borrador' por el cliente, con su propio
    // invoice_number ya asignado vía el RPC atómico get_next_document_sequential).
    const { data: creditNote, error: creditNoteError } = await supabase
      .from('invoices')
      .select('*, customers(name, identification_type, identification_number, address)')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .single();

    if (creditNoteError || !creditNote) {
      return res.status(404).json({ error: 'Nota de crédito no encontrada' });
    }
    if (creditNote.invoice_type !== 'nota_credito') {
      return res.status(400).json({ error: 'Este comprobante no es una nota de crédito' });
    }
    if (creditNote.status !== 'borrador') {
      return res.status(400).json({ error: `La nota de crédito ya está en estado '${creditNote.status}', no se puede reenviar` });
    }
    if (!creditNote.credit_note_reason) {
      return res.status(400).json({ error: 'El motivo de la nota de crédito es obligatorio' });
    }
    if (!creditNote.modified_invoice_id) {
      return res.status(400).json({ error: 'La nota de crédito no tiene una factura de referencia' });
    }

    const { data: details, error: detailsError } = await supabase
      .from('invoice_details')
      .select('*')
      .eq('invoice_id', invoiceId);

    if (detailsError) throw new Error(detailsError.message);
    if (!details || details.length === 0) {
      return res.status(400).json({ error: 'La nota de crédito no tiene productos' });
    }

    // Factura original: debe existir, ser de la misma empresa y estar autorizada.
    const { data: originalInvoice, error: originalError } = await supabase
      .from('invoices')
      .select('*, point_of_sales(branch_id)')
      .eq('id', creditNote.modified_invoice_id)
      .eq('company_id', companyId)
      .single();

    if (originalError || !originalInvoice) {
      return res.status(404).json({ error: 'La factura referenciada por esta nota de crédito no existe' });
    }
    if (originalInvoice.status !== 'autorizada') {
      return res.status(400).json({ error: 'Solo se pueden emitir notas de crédito sobre facturas autorizadas' });
    }
    // El SRI rechaza notaCredito para consumidor final (identificador de
    // mensaje 69, "ERROR EN LA IDENTIFICACION DEL RECEPTOR") - confirmado
    // contra el webservice real de producción. Se valida acá para no gastar
    // un secuencial real ni pasar por firma/SOAP en un caso que el SRI
    // rechazaría de todas formas.
    if (!originalInvoice.customer_id) {
      return res.status(400).json({ error: 'El SRI no permite emitir notas de crédito sobre facturas a consumidor final - la factura original debe tener un cliente identificado (RUC/cédula)' });
    }

    // Saldo disponible: suma de NC ya autorizadas contra esta misma factura +
    // esta nueva NC no puede superar el total de la factura original. Se
    // valida ANTES de tocar firma/SRI (criterio de aceptación de la Fase 2).
    const { data: priorCreditNotes, error: priorError } = await supabase
      .from('invoices')
      .select('total_amount')
      .eq('modified_invoice_id', originalInvoice.id)
      .eq('invoice_type', 'nota_credito')
      .eq('status', 'autorizada');

    if (priorError) throw new Error(priorError.message);

    const priorCreditedTotal = (priorCreditNotes || []).reduce((sum, cn) => sum + parseFloat(cn.total_amount), 0);
    const newCreditedTotal = priorCreditedTotal + parseFloat(creditNote.total_amount);
    const originalTotal = parseFloat(originalInvoice.total_amount);

    if (newCreditedTotal > originalTotal + AMOUNT_EPSILON) {
      const remaining = Math.max(0, originalTotal - priorCreditedTotal);
      return res.status(400).json({ error: `La nota de crédito excede el saldo disponible de la factura original (saldo disponible: $${remaining.toFixed(2)})` });
    }

    // Empresa
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    if (companyError || !company) throw new Error('Empresa no encontrada');

    // Configuración de facturación (certificado, ambiente, tasa IVA) - mismo
    // requisito que una factura, la NC se firma con el mismo certificado.
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

    const formatFecha = (value) => {
      const d = new Date(value);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };
    const issueDate = new Date(creditNote.issue_date || Date.now());
    const fechaEmision = formatFecha(issueDate);
    const fechaEmisionDocSustento = formatFecha(originalInvoice.issue_date);

    const hasCustomer = !!creditNote.customers;
    const tipoIdentificacionComprador = !hasCustomer ? '07' : (creditNote.customers.identification_type === 'ruc' ? '04' : '05');
    const identificacionComprador = hasCustomer ? creditNote.customers.identification_number : '9999999999999';
    const razonSocialComprador = hasCustomer ? creditNote.customers.name : 'CONSUMIDOR FINAL';

    const [estab, ptoEmi, secuencialStr] = creditNote.invoice_number.split('-');

    // El esquema notaCredito v1.1.0 usa nombres de campo distintos a factura
    // en el detalle: codigoInterno/codigoAdicional (no codigoPrincipal/
    // codigoAuxiliar) - confirmado contra la ficha técnica del SRI y wikis de
    // proveedores certificados antes de escribir esto, no es un supuesto.
    const detalles = details.map(d => {
      const grossAmount = parseFloat(d.unit_price) * parseFloat(d.quantity);
      const discountAmount = (grossAmount * (parseFloat(d.discount_percent) || 0) / 100).toFixed(2);
      const baseImponible = parseFloat(d.subtotal).toFixed(2);
      const valorImpuesto = parseFloat(d.tax_amount).toFixed(2);
      return {
        codigoInterno: d.product_code || 'N/A',
        codigoAdicional: d.product_code || 'N/A',
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

    const accessKey = generateAccessKey({
      date: issueDate,
      codDoc: '04',
      ruc: company.ruc,
      environment: ambiente,
      establishment: estab,
      emissionPoint: ptoEmi,
      sequential: secuencialStr
    });

    // Mismo truco de orden que submit-invoice.js: infoTributaria exige a
    // claveAcceso entre ruc y codDoc según el XSD del SRI (xmlbuilder2
    // respeta el orden de inserción de claves como orden de elementos XML).
    const infoTributariaOrdered = {
      ambiente,
      tipoEmision: '1',
      razonSocial: company.razon_social,
      nombreComercial: company.nombre_comercial || company.razon_social,
      ruc: company.ruc,
      claveAcceso: accessKey,
      codDoc: '04',
      estab,
      ptoEmi,
      secuencial: secuencialStr,
      dirMatriz: company.direccion || company.address || 'S/N',
      ...regimenFields
    };

    const infoNotaCredito = {
      fechaEmision,
      dirEstablecimiento: company.direccion || company.address || 'S/N',
      tipoIdentificacionComprador,
      razonSocialComprador,
      identificacionComprador,
      obligadoContabilidad: company.lleva_contabilidad ? 'SI' : 'NO',
      codDocModificado: '01',
      numDocModificado: originalInvoice.invoice_number,
      fechaEmisionDocSustento,
      totalSinImpuestos: parseFloat(creditNote.subtotal).toFixed(2),
      valorModificacion: parseFloat(creditNote.total_amount).toFixed(2),
      moneda: 'DOLAR',
      totalConImpuestos: {
        totalImpuesto: [{
          codigo: '2',
          codigoPorcentaje,
          baseImponible: parseFloat(creditNote.subtotal).toFixed(2),
          valor: parseFloat(creditNote.tax_amount).toFixed(2)
        }]
      },
      motivo: creditNote.credit_note_reason
    };

    const builtCreditNote = {
      notaCredito: {
        '@xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@id': 'comprobante',
        '@version': '1.1.0',
        infoTributaria: infoTributariaOrdered,
        infoNotaCredito,
        detalles: { detalle: detalles }
      }
    };
    const xml = generateInvoiceXml(builtCreditNote);
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

      return res.status(400).json({ error: 'El SRI devolvió la nota de crédito en recepción', detail: receptionResult });
    }

    if (sriAuthStatus !== 'AUTORIZADO') {
      await supabase.from('invoices').update({
        status: 'devuelta',
        authorization_number: accessKey,
        sri_response_message: JSON.stringify(authObj || { estado: sriAuthStatus })
      }).eq('id', invoiceId);

      return res.status(400).json({ error: `El SRI no autorizó la nota de crédito (estado: ${sriAuthStatus})`, detail: authObj });
    }

    await supabase.from('invoices').update({
      status: 'autorizada',
      authorization_number: accessKey,
      authorization_date: new Date().toISOString(),
      signed_xml: authObj?.comprobante || signedXml,
      sri_response_message: 'Autorizado por el SRI'
    }).eq('id', invoiceId);

    // Efectos secundarios (cascada de estado + reingreso de stock + kardex
    // best-effort) - compartidos con reconcile-invoice.js, que dispara los
    // mismos efectos si esta NC no autoriza en el acto y se autoriza después
    // al reconsultar. La NC ya quedó autorizada de verdad ante el SRI en este
    // punto - si algo de esto falla no se puede "deshacer" la autorización,
    // así que se reporta como advertencia en vez de como error de la petición.
    const { warnings, originalInvoiceVoided } = await applyCreditNoteAuthorizedEffects({
      supabase, creditNoteId: invoiceId, companyId, userId: user.id
    });

    return res.status(200).json({ success: true, status: 'autorizada', accessKey, originalInvoiceVoided, warnings });
  } catch (error) {
    console.error('SRI credit note submission error:', error);
    return res.status(500).json({
      error: error.message || 'Error al enviar la nota de crédito al SRI'
    });
  }
}
