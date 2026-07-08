// Invoice utilities and SRI-compliant voucher generation

/**
 * Generate SRI-compliant invoice number
 * Format: RUC-Estab-PuntosVenta-Secuencial
 * Example: 1234567890001-001-001-000000001
 */
export function generateInvoiceNumber(config, sequential) {
  const ruc = (config.ruc || '').padStart(13, '0');
  const estab = (config.establishment || '001').padStart(3, '0');
  const pos = (config.pointOfSale || '001').padStart(3, '0');
  const seq = String(sequential).padStart(9, '0');

  return `${ruc}-${estab}-${pos}-${seq}`;
}

/**
 * Calculate check digit for RUC (Ecuador)
 * Required for SRI compliance
 */
export function calculateRUCCheckDigit(ruc) {
  const rucWithoutCheck = ruc.substring(0, 12);
  const weights = [3, 2, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(rucWithoutCheck[i]) * weights[i];
  }

  const remainder = sum % 11;
  const checkDigit = 11 - remainder;

  return checkDigit === 11 ? 0 : checkDigit === 10 ? 1 : checkDigit;
}

/**
 * Validate RUC format
 */
export function validateRUC(ruc) {
  if (!ruc || ruc.length !== 13) return false;

  const calculatedDigit = calculateRUCCheckDigit(ruc);
  const lastDigit = parseInt(ruc[12]);

  return calculatedDigit === lastDigit;
}

/**
 * Generate XML for SRI submission
 * This is a simplified template - full implementation depends on SRI requirements
 */
export function generateSRIXML(invoice, details, company) {
  const invoiceDate = new Date(invoice.issue_date);
  const dateString = invoiceDate.toISOString().split('T')[0].replace(/-/g, '/');
  const timeString = invoiceDate.toISOString().split('T')[1].substring(0, 8);

  let detailsXML = '';
  details.forEach((detail, index) => {
    detailsXML += `
    <detalles>
      <codigoInterno>${detail.product_code}</codigoInterno>
      <descripcion>${escapeXML(detail.product_name)}</descripcion>
      <cantidad>${detail.quantity}</cantidad>
      <precioUnitario>${parseFloat(detail.unit_price).toFixed(2)}</precioUnitario>
      <descuento>${parseFloat(detail.discount_amount || 0).toFixed(2)}</descuento>
      <precioTotalSinImpuesto>${parseFloat(detail.subtotal).toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${Math.round(detail.tax_rate)}</codigoPorcentaje>
          <baseImponible>${parseFloat(detail.subtotal).toFixed(2)}</baseImponible>
          <valor>${parseFloat(detail.tax_amount).toFixed(2)}</valor>
        </impuesto>
      </impuestos>
      <precioTotal>${parseFloat(detail.total).toFixed(2)}</precioTotal>
    </detalles>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${company.environment === 'production' ? '1' : '2'}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXML(company.razonSocial)}</razonSocial>
    <nombreComercial>${escapeXML(company.nombreComercial)}</nombreComercial>
    <ruc>${company.ruc}</ruc>
    <claveAcceso>${generateAccessKey(invoice)}</claveAcceso>
    <tipoComprobante>01</tipoComprobante>
    <secuencial>${String(invoice.sequential).padStart(9, '0')}</secuencial>
    <dirMatriz>${escapeXML(company.address)}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${dateString}</fechaEmision>
    <dirEstablecimiento>${escapeXML(company.address)}</dirEstablecimiento>
    <obligadoContabilidad>${company.llevaContabilidad ? 'SI' : 'NO'}</obligadoContabilidad>
    <tipoIdentificacionComprador>${company.tipoIdentificacion || '04'}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXML(invoice.customer_name || 'Consumidor Final')}</razonSocialComprador>
    <identificacionComprador>${company.ruc}</identificacionComprador>
    <direccionComprador>${escapeXML(company.address)}</direccionComprador>
    <totalSinImpuestos>${parseFloat(invoice.taxable_amount).toFixed(2)}</totalSinImpuestos>
    <totalDescuento>${parseFloat(invoice.discount_amount || 0).toFixed(2)}</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>${Math.round(invoice.tax_rate)}</codigoPorcentaje>
        <baseImponible>${parseFloat(invoice.taxable_amount).toFixed(2)}</baseImponible>
        <valor>${parseFloat(invoice.tax_amount).toFixed(2)}</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${parseFloat(invoice.total_amount).toFixed(2)}</importeTotal>
    <moneda>USD</moneda>
    <pagos>
      <pago>
        <formaPago>${mapPaymentMethodToSRI(invoice.payment_method)}</formaPago>
        <total>${parseFloat(invoice.total_amount).toFixed(2)}</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>${detailsXML}
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="Correo">
      ${invoice.customer_email || 'no@especificado.com'}
    </campoAdicional>
    <campoAdicional nombre="Teléfono">
      ${invoice.customer_phone || 'N/A'}
    </campoAdicional>
  </infoAdicional>
</factura>`;
}

/**
 * Generate access key for SRI
 * Format: DD/MM/YYYY + RUC (13 digits) + Type (2 digits) + Sequential (9 digits) + Check digit (1 digit)
 */
export function generateAccessKey(invoice) {
  const date = new Date(invoice.issue_date);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear().toString().substring(2);

  const ruc = (invoice.ruc || '').padStart(13, '0');
  const type = '01'; // Factura
  const sequential = String(invoice.sequential).padStart(9, '0');

  const baseKey = year + month + day + ruc + type + sequential;
  const checkDigit = calculateAccessKeyCheckDigit(baseKey);

  return baseKey + checkDigit;
}

/**
 * Calculate check digit for access key
 */
export function calculateAccessKeyCheckDigit(baseKey) {
  const weights = [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2, 7, 6, 5];
  let sum = 0;

  for (let i = 0; i < baseKey.length; i++) {
    sum += parseInt(baseKey[i]) * weights[i];
  }

  const remainder = sum % 11;
  const checkDigit = 11 - remainder;

  return checkDigit === 11 ? 0 : checkDigit === 10 ? 1 : checkDigit;
}

/**
 * Map payment method to SRI code
 * 01: Cash, 02: Check, 03: Credit Transfer, 04: Credit Card, 05: Debit Card, etc
 */
export function mapPaymentMethodToSRI(method) {
  const methodMap = {
    cash: '01',
    check: '02',
    transfer: '03',
    card: '04',
    debit: '05',
    other: '20'
  };
  return methodMap[method] || '01';
}

/**
 * Escape special characters for XML
 */
export function escapeXML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format invoice data for display
 */
export function formatInvoiceForDisplay(invoice) {
  return {
    ...invoice,
    issue_date_formatted: new Date(invoice.issue_date).toLocaleDateString('es-ES'),
    subtotal_formatted: `$${parseFloat(invoice.subtotal_amount).toFixed(2)}`,
    discount_formatted: `$${parseFloat(invoice.discount_amount || 0).toFixed(2)}`,
    tax_formatted: `$${parseFloat(invoice.tax_amount).toFixed(2)}`,
    total_formatted: `$${parseFloat(invoice.total_amount).toFixed(2)}`,
    status_label: getInvoiceStatusLabel(invoice.status),
    sri_status_label: getSRIStatusLabel(invoice.sri_status)
  };
}

/**
 * Get human-readable status label
 */
export function getInvoiceStatusLabel(status) {
  const labels = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    sent: 'Enviada',
    rejected: 'Rechazada',
    cancelled: 'Cancelada'
  };
  return labels[status] || status;
}

/**
 * Get human-readable SRI status label
 */
export function getSRIStatusLabel(status) {
  const labels = {
    pending: 'Pendiente de envío',
    sent: 'Enviada al SRI',
    accepted: 'Aceptada por SRI',
    rejected: 'Rechazada por SRI',
    error: 'Error en envío'
  };
  return labels[status] || status;
}

/**
 * Validate invoice data before creation
 */
export function validateInvoiceData(invoice, config) {
  const errors = [];

  if (!config.ruc || !validateRUC(config.ruc)) {
    errors.push('RUC inválido o no configurado');
  }

  if (!invoice.total_amount || invoice.total_amount <= 0) {
    errors.push('Monto total debe ser mayor a 0');
  }

  if (!invoice.payment_method) {
    errors.push('Método de pago requerido');
  }

  if (!config.establishment || !config.pointOfSale) {
    errors.push('Establecimiento y punto de venta no configurados');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
