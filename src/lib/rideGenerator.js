import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { loadImageAsDataUrl } from './pdfImage.js';

const PAYMENT_LABELS = {
  cash: 'SIN UTILIZACION DEL SISTEMA FINANCIERO',
  card: 'TARJETA DE CRÉDITO',
  debit: 'TARJETA DE DÉBITO',
  transfer: 'OTROS CON UTILIZACION DEL SISTEMA FINANCIERO',
  other: 'OTROS CON UTILIZACION DEL SISTEMA FINANCIERO'
};

// Shared palette for section bars / boxes, kept print-friendly (works on a
// B/W printer, not just on screen).
const ACCENT = [39, 39, 42];    // zinc-800
const LIGHT = [244, 244, 245];  // zinc-100
const BORDER = [212, 212, 216]; // zinc-300
const MUTED = [113, 113, 122];  // zinc-500

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
export async function generateRidePdf({ invoice, details, company, sriEnvironment }) {
  if (!invoice.authorization_number) {
    throw new Error('Esta factura aún no tiene autorización del SRI');
  }

  const logo = await loadImageAsDataUrl(company?.logo_url);

  const [estab, ptoEmi, secuencial] = invoice.invoice_number.split('-');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const boxW = 78;
  const boxX = pageWidth - margin - boxW;
  const boxY = 12;
  const boxH = 46;

  // ---- Header: logo + company info (left) ----
  let textX = margin;
  let y = boxY;
  if (logo) {
    const maxW = 26, maxH = 22;
    const ratio = Math.min(maxW / logo.width, maxH / logo.height, 1);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    doc.addImage(logo.dataUrl, 'PNG', margin, y, w, h);
    textX = margin + maxW + 5;
  }
  const textMaxWidth = boxX - textX - 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(company.razon_social || '', textX, y + 4, { maxWidth: textMaxWidth });
  let ly = y + 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (company.nombre_comercial && company.nombre_comercial !== company.razon_social) {
    doc.setTextColor(...MUTED);
    doc.text(`Nombre Comercial: ${company.nombre_comercial}`, textX, ly, { maxWidth: textMaxWidth });
    ly += 4.5;
  }
  doc.setTextColor(0, 0, 0);
  doc.text(`Dirección Matriz: ${company.direccion || company.address || 'S/N'}`, textX, ly, { maxWidth: textMaxWidth });
  ly += 4.5;
  if (company.lleva_contabilidad) {
    doc.text('Obligado a llevar contabilidad: SI', textX, ly);
    ly += 4.5;
  }

  // ---- Invoice info box (right) ----
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(boxX, boxY, boxW, boxH);
  doc.setFillColor(...ACCENT);
  doc.rect(boxX, boxY, boxW, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FACTURA', boxX + boxW / 2, boxY + 6, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`R.U.C.: ${company.ruc || ''}`, boxX + 3, boxY + 14);
  doc.text(`No. ${estab}-${ptoEmi}-${secuencial}`, boxX + 3, boxY + 19.5);
  doc.setFontSize(7);
  doc.text('NÚMERO DE AUTORIZACIÓN:', boxX + 3, boxY + 25);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.authorization_number, boxX + 3, boxY + 29, { maxWidth: boxW - 6 });
  doc.setFont('helvetica', 'bold');
  doc.text('FECHA Y HORA DE AUTORIZACIÓN:', boxX + 3, boxY + 35);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.authorization_date ? new Date(invoice.authorization_date).toLocaleString() : '', boxX + 3, boxY + 39);
  doc.setTextColor(...MUTED);
  doc.text(`AMBIENTE: ${sriEnvironment === 'production' ? 'PRODUCCIÓN' : 'PRUEBAS'}   EMISIÓN: NORMAL`, boxX + 3, boxY + 43.5);
  doc.setTextColor(0, 0, 0);

  y = Math.max(ly, boxY + boxH) + 5;

  // ---- Access key barcode ----
  doc.setDrawColor(...BORDER);
  doc.setFillColor(...LIGHT);
  doc.rect(margin, y, pageWidth - margin * 2, 20, 'FD');
  try {
    const barcodeImg = accessKeyBarcode(invoice.authorization_number);
    doc.addImage(barcodeImg, 'PNG', margin + 4, y + 3, 110, 12);
  } catch {
    // no barcode lib support in this environment - the text below still has the key
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`CLAVE DE ACCESO: ${invoice.authorization_number}`, margin + 4, y + 17.5);
  y += 26;

  // ---- Customer info ----
  doc.setFillColor(...ACCENT);
  doc.rect(margin, y, pageWidth - margin * 2, 5.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DATOS DEL CLIENTE', margin + 2, y + 3.8);
  y += 5.5;
  doc.setDrawColor(...BORDER);
  doc.rect(margin, y, pageWidth - margin * 2, 12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const customer = invoice.customers;
  doc.text(`Razón Social / Nombres y Apellidos: ${customer ? customer.name : 'CONSUMIDOR FINAL'}`, margin + 2, y + 5, { maxWidth: pageWidth - margin * 2 - 4 });
  doc.text(`Identificación: ${customer ? customer.identification_number : '9999999999999'}`, margin + 2, y + 10);
  const dateText = `Fecha de Emisión: ${new Date(invoice.issue_date).toLocaleDateString()}`;
  doc.text(dateText, pageWidth - margin - 2 - doc.getTextWidth(dateText), y + 10);
  y += 12 + 6;

  // ---- Line items table ----
  const colQty = margin + 2;
  const colDesc = margin + 16;
  const colUnit = pageWidth - margin - 58;
  const colDisc = pageWidth - margin - 38;
  const colTotal = pageWidth - margin - 4;

  const drawTableHeader = () => {
    doc.setFillColor(...ACCENT);
    doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('CANT.', colQty, y + 4.7);
    doc.text('DESCRIPCIÓN', colDesc, y + 4.7);
    doc.text('P. UNITARIO', colUnit, y + 4.7, { align: 'right' });
    doc.text('DESCUENTO', colDisc, y + 4.7, { align: 'right' });
    doc.text('P. TOTAL', colTotal, y + 4.7, { align: 'right' });
    y += 7;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
  };

  drawTableHeader();

  details.forEach((item, idx) => {
    if (y > 258) {
      doc.addPage();
      y = 20;
      drawTableHeader();
    }
    const rowH = 6.5;
    if (idx % 2 === 1) {
      doc.setFillColor(...LIGHT);
      doc.rect(margin, y, pageWidth - margin * 2, rowH, 'F');
    }
    // discount_amount isn't a stored column - derive it the same way the
    // detail view does: (unit_price * quantity) - subtotal (the net amount
    // actually charged after discount).
    const grossAmount = parseFloat(item.unit_price) * parseFloat(item.quantity);
    const itemDiscount = grossAmount - parseFloat(item.subtotal);
    doc.text(String(item.quantity), colQty, y + 4.3);
    doc.text(item.product_name, colDesc, y + 4.3, { maxWidth: colUnit - colDesc - 4 });
    doc.text(parseFloat(item.unit_price).toFixed(2), colUnit, y + 4.3, { align: 'right' });
    doc.text(itemDiscount.toFixed(2), colDisc, y + 4.3, { align: 'right' });
    doc.text(parseFloat(item.total).toFixed(2), colTotal, y + 4.3, { align: 'right' });
    y += rowH;
  });
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ---- Totals box ----
  const totalsW = 68;
  const totalsX = pageWidth - margin - totalsW;
  const totalsRows = [
    ['Subtotal sin impuestos:', parseFloat(invoice.subtotal).toFixed(2)],
    ['Descuento:', parseFloat(invoice.discount_amount || 0).toFixed(2)],
    ['IVA:', parseFloat(invoice.tax_amount).toFixed(2)]
  ];
  const totalsH = totalsRows.length * 5.5 + 11;
  if (y + totalsH > 275) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...LIGHT);
  doc.setDrawColor(...BORDER);
  doc.rect(totalsX, y, totalsW, totalsH, 'FD');
  let ty = y + 5.5;
  doc.setFontSize(8.5);
  totalsRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(label, totalsX + 3, ty);
    doc.text(value, totalsX + totalsW - 3, ty, { align: 'right' });
    ty += 5.5;
  });
  doc.setDrawColor(...BORDER);
  doc.line(totalsX + 3, ty - 1.5, totalsX + totalsW - 3, ty - 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('VALOR TOTAL:', totalsX + 3, ty + 3.5);
  doc.text(parseFloat(invoice.total_amount).toFixed(2), totalsX + totalsW - 3, ty + 3.5, { align: 'right' });

  y += totalsH + 8;

  // ---- Payment method ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Forma de Pago: ${PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method}`, margin, y);

  doc.save(`RIDE_${estab}-${ptoEmi}-${secuencial}.pdf`);
}
