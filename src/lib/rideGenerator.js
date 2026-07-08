import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

const PAYMENT_LABELS = {
  cash: 'SIN UTILIZACION DEL SISTEMA FINANCIERO',
  card: 'TARJETA DE CRÉDITO',
  debit: 'TARJETA DE DÉBITO',
  transfer: 'OTROS CON UTILIZACION DEL SISTEMA FINANCIERO',
  other: 'OTROS CON UTILIZACION DEL SISTEMA FINANCIERO'
};

function accessKeyBarcode(accessKey) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, accessKey, {
    format: 'CODE128',
    displayValue: false,
    height: 40,
    margin: 0
  });
  return canvas.toDataURL('image/png');
}

// Generates the RIDE (Representación Impresa del Documento Electrónico) as a PDF
// and triggers a browser download. Only meaningful for invoices already authorized
// by the SRI (needs a real authorization_number/date).
export function generateRidePdf({ invoice, details, company, sriEnvironment }) {
  if (!invoice.authorization_number) {
    throw new Error('Esta factura aún no tiene autorización del SRI');
  }

  const [estab, ptoEmi, secuencial] = invoice.invoice_number.split('-');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = 15;

  // Header: company info (left) + invoice box (right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(company.razon_social || '', margin, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  y += 5;
  doc.text(`Nombre Comercial: ${company.nombre_comercial || ''}`, margin, y);
  y += 5;
  doc.text(`Dirección Matriz: ${company.direccion || company.address || 'S/N'}`, margin, y, { maxWidth: 95 });
  y += 5;
  if (company.lleva_contabilidad) {
    doc.text('Obligado a llevar contabilidad: SI', margin, y);
    y += 5;
  }

  const boxX = pageWidth - margin - 80;
  const boxY = 12;
  doc.rect(boxX, boxY, 80, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('R.U.C.: ' + (company.ruc || ''), boxX + 3, boxY + 6);
  doc.text('FACTURA', boxX + 3, boxY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`No. ${estab}-${ptoEmi}-${secuencial}`, boxX + 3, boxY + 18);
  doc.text(`NÚMERO DE AUTORIZACIÓN:`, boxX + 3, boxY + 24);
  doc.setFontSize(7);
  doc.text(invoice.authorization_number, boxX + 3, boxY + 28, { maxWidth: 74 });
  doc.setFontSize(9);
  doc.text(`FECHA Y HORA DE AUTORIZACIÓN:`, boxX + 3, boxY + 34);
  doc.setFontSize(7);
  doc.text(invoice.authorization_date ? new Date(invoice.authorization_date).toLocaleString() : '', boxX + 3, boxY + 38);
  doc.setFontSize(7);
  doc.text(`AMBIENTE: ${sriEnvironment === 'production' ? 'PRODUCCIÓN' : 'PRUEBAS'}   EMISIÓN: NORMAL`, boxX + 3, boxY + 41.5);

  y = Math.max(y, boxY + 44) + 4;

  // Access key barcode
  try {
    const barcodeImg = accessKeyBarcode(invoice.authorization_number);
    doc.addImage(barcodeImg, 'PNG', margin, y, 120, 15);
    y += 16;
    doc.setFontSize(7);
    doc.text(`CLAVE DE ACCESO: ${invoice.authorization_number}`, margin, y);
    y += 6;
  } catch {
    doc.setFontSize(8);
    doc.text(`CLAVE DE ACCESO: ${invoice.authorization_number}`, margin, y);
    y += 6;
  }

  // Customer info
  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(9);
  const customer = invoice.customers;
  doc.text(`Razón Social / Nombres y Apellidos: ${customer ? customer.name : 'CONSUMIDOR FINAL'}`, margin, y);
  y += 5;
  doc.text(`Identificación: ${customer ? customer.identification_number : '9999999999999'}`, margin, y);
  const dateText = `Fecha de Emisión: ${new Date(invoice.issue_date).toLocaleDateString()}`;
  doc.text(dateText, pageWidth - margin - doc.getTextWidth(dateText), y);
  y += 7;

  // Line items table
  doc.setDrawColor(0);
  doc.setFillColor(230, 230, 230);
  doc.rect(margin, y, pageWidth - margin * 2, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Cant.', margin + 2, y + 4);
  doc.text('Descripción', margin + 18, y + 4);
  doc.text('P. Unitario', pageWidth - margin - 55, y + 4);
  doc.text('Descuento', pageWidth - margin - 35, y + 4);
  doc.text('P. Total', pageWidth - margin - 15, y + 4);
  y += 6;
  doc.setFont('helvetica', 'normal');

  details.forEach(item => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(item.quantity), margin + 2, y + 4);
    doc.text(item.product_name, margin + 18, y + 4, { maxWidth: pageWidth - margin - 18 - 60 });
    doc.text(parseFloat(item.unit_price).toFixed(2), pageWidth - margin - 55, y + 4);
    doc.text('0.00', pageWidth - margin - 35, y + 4);
    doc.text(parseFloat(item.total).toFixed(2), pageWidth - margin - 15, y + 4);
    y += 6;
    doc.setDrawColor(220);
    doc.line(margin, y, pageWidth - margin, y);
  });

  y += 6;

  // Totals box
  const totalsX = pageWidth - margin - 60;
  doc.setFontSize(9);
  const rows = [
    ['Subtotal sin impuestos:', parseFloat(invoice.subtotal).toFixed(2)],
    ['Descuento:', parseFloat(invoice.discount_amount || 0).toFixed(2)],
    ['IVA:', parseFloat(invoice.tax_amount).toFixed(2)],
    ['VALOR TOTAL:', parseFloat(invoice.total_amount).toFixed(2)]
  ];
  rows.forEach(([label, value], i) => {
    if (i === rows.length - 1) doc.setFont('helvetica', 'bold');
    doc.text(label, totalsX, y);
    doc.text(value, pageWidth - margin - 15, y, { align: 'right' });
    y += 5;
  });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Forma de Pago: ${PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method}`, margin, y);

  doc.save(`RIDE_${estab}-${ptoEmi}-${secuencial}.pdf`);
}
