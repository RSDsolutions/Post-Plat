import { jsPDF } from 'jspdf';
import { formatUSD } from './format.js';

const PAYMENT_LABELS = {
  cash: 'Efectivo',
  card: 'Tarjeta de Crédito',
  debit: 'Tarjeta de Débito',
  transfer: 'Transferencia',
  other: 'Otro'
};

// Simple internal sale receipt (narrow ticket format), not the official SRI RIDE.
// A newly created sale stays in 'borrador' until the gerente approves it and the
// SRI authorizes it, so this is what the cashier can hand to the customer/print
// immediately, distinct from rideGenerator.js (which requires a real SRI
// authorization number and is generated later from Facturas).
export function generateSaleReceipt({ sale, company }) {
  const width = 80;
  const doc = new jsPDF({ unit: 'mm', format: [width, 250] });
  const margin = 4;
  const contentWidth = width - margin * 2;
  let y = 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(company?.nombre_comercial || company?.razon_social || 'Comprobante de Venta', width / 2, y, { align: 'center' });
  y += 5;

  if (company?.ruc) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`RUC: ${company.ruc}`, width / 2, y, { align: 'center' });
    y += 4;
  }

  doc.setDrawColor(0);
  doc.line(margin, y, width - margin, y);
  y += 4;

  doc.setFontSize(8);
  doc.text(`Fecha: ${new Date(sale.completedAt).toLocaleString()}`, margin, y);
  y += 4;
  doc.text(`Atendido por: ${sale.cashierName || ''}`, margin, y);
  y += 4;
  if (sale.invoiceNumber) {
    doc.text(`No. ${sale.invoiceNumber}`, margin, y);
    y += 4;
  }
  doc.text(sale.invoiceType === 'factura' ? `Cliente: ${sale.customerName}` : 'Consumidor Final', margin, y, { maxWidth: contentWidth });
  y += 5;

  doc.line(margin, y, width - margin, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Cant.  Descripción', margin, y);
  doc.text('Total', width - margin, y, { align: 'right' });
  y += 4;
  doc.setFont('helvetica', 'normal');

  sale.items.forEach(item => {
    doc.text(`${item.quantity}x ${item.name}`, margin, y, { maxWidth: contentWidth - 14 });
    doc.text(formatUSD(item.lineTotal), width - margin, y, { align: 'right' });
    y += 4.5;
  });

  y += 1;
  doc.line(margin, y, width - margin, y);
  y += 4;

  const totalsRows = [
    ['Subtotal:', formatUSD(sale.subtotal)],
    ...(sale.discount > 0 ? [['Descuento:', '-' + formatUSD(sale.discount)]] : []),
    [`IVA (${sale.taxRate}%):`, formatUSD(sale.tax)]
  ];
  doc.setFontSize(8);
  totalsRows.forEach(([label, value]) => {
    doc.text(label, margin, y);
    doc.text(value, width - margin, y, { align: 'right' });
    y += 4;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL:', margin, y);
  doc.text(formatUSD(sale.total), width - margin, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Forma de pago: ${PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}`, margin, y);
  y += 4;

  if (sale.paymentMethod === 'cash' && sale.cashReceived != null) {
    doc.text(`Recibido: ${formatUSD(sale.cashReceived)}`, margin, y);
    y += 4;
    doc.text(`Vuelto: ${formatUSD(sale.change)}`, margin, y);
    y += 4;
  }

  y += 3;
  doc.line(margin, y, width - margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.text(
    sale.sriAuthorized
      ? 'Comprobante autorizado por el SRI'
      : 'Comprobante interno - pendiente de autorización del SRI',
    width / 2, y, { align: 'center', maxWidth: contentWidth }
  );
  y += 6;
  doc.text('¡Gracias por su compra!', width / 2, y, { align: 'center' });

  return doc;
}
