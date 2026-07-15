import { STATUS_LABELS, PAYMENT_METHOD_LABELS } from './reportsHelpers.js';

// Reparte invoice.subtotal entre base 0% y base gravada, usando las líneas
// (invoice_details.tax_percent) solo para determinar la PROPORCIÓN del
// reparto - nunca como fuente de los montos en sí.
//
// Por qué: en datos reales, la suma de invoice_details.subtotal/tax_amount
// no siempre coincide centavo a centavo con invoices.subtotal/tax_amount de
// la cabecera (se confirmó con datos reales de prueba: varias facturas con
// descuento difieren en unos centavos entre cabecera y líneas). La cabecera
// es la fuente de verdad porque es lo que efectivamente se firmó y se envió
// al SRI - por eso el Libro de Ventas debe construirse sobre invoice.subtotal/
// tax_amount, igual que reportsHelpers.buildTaxReport, para que ambos
// reportes cuadren siempre (no solo cuando las líneas casualmente coinciden
// con la cabecera). El tax_percent de cada línea solo decide qué fracción de
// esa base es 0% vs gravada.
function splitInvoiceByTaxRate(invoice) {
  const invoiceBase = Number(invoice.subtotal) || 0;
  const invoiceIva = Number(invoice.tax_amount) || 0;
  const details = invoice.invoice_details || [];
  if (details.length === 0) {
    // Sin líneas cargadas (no debería pasar si se usa fetchInvoicesForReports,
    // pero por si acaso): todo a gravada si hay IVA, si no todo a 0%.
    return invoiceIva > 0 ? { base0: 0, baseGravada: invoiceBase, iva: invoiceIva } : { base0: invoiceBase, baseGravada: 0, iva: 0 };
  }
  let lineBase0 = 0, lineTotal = 0;
  details.forEach(d => {
    const lineBase = Number(d.subtotal) || 0;
    lineTotal += lineBase;
    if ((Number(d.tax_percent) || 0) === 0) lineBase0 += lineBase;
  });
  const ratio0 = lineTotal > 0 ? lineBase0 / lineTotal : 0;
  return { base0: invoiceBase * ratio0, baseGravada: invoiceBase * (1 - ratio0), iva: invoiceIva };
}

// Acumula una factura (sign=1) o la resta (sign=-1, notas de crédito) en los
// totales y en los desgloses por forma de pago / sucursal - una sola función
// para no repetir el mismo loop en cada signo.
function accumulate(target, invoice, branchNameById, sign) {
  const { base0, baseGravada, iva } = splitInvoiceByTaxRate(invoice);
  const total = Number(invoice.total_amount) || 0;
  const discount = Number(invoice.discount_amount) || 0;

  target.base0 += sign * base0;
  target.baseGravada += sign * baseGravada;
  target.iva += sign * iva;
  target.descuentos += sign * discount;
  target.total += sign * total;

  const pm = invoice.payment_method || 'other';
  target.byPaymentMethod.set(pm, (target.byPaymentMethod.get(pm) || 0) + sign * total);

  const branchId = invoice.point_of_sales?.branch_id || null;
  const branchLabel = branchId ? (branchNameById.get(branchId) || 'Sucursal') : 'Sin sucursal';
  const cur = target.byBranch.get(branchLabel) || { base0: 0, baseGravada: 0, iva: 0, total: 0 };
  cur.base0 += sign * base0;
  cur.baseGravada += sign * baseGravada;
  cur.iva += sign * iva;
  cur.total += sign * total;
  target.byBranch.set(branchLabel, cur);
}

// Libro de ventas mensual, alineado al Formulario 104 del SRI: base
// imponible 0%, base gravada, IVA generado, descuentos, totales por forma de
// pago y por sucursal, y conteo de comprobantes por estado.
//
// activeInvoices se define igual que reportsHelpers.buildTaxReport
// (status !== 'anulada') a propósito, para que los totales cuadren contra el
// reporte de Impuestos/SRI existente en el mismo período - ese es el
// criterio de aceptación de esta fase.
//
// Notas de crédito: invoice_type='nota_credito' todavía no existe en ningún
// dato real (no hay flujo para emitirlas), pero el cálculo ya las resta de
// cada total si algún día aparecen - no hace falta tocar este archivo cuando
// se implemente esa fase, alcanza con que empiecen a insertarse con ese
// invoice_type.
export function buildSalesLedger(invoices, branches = []) {
  const branchNameById = new Map(branches.map(b => [b.id, b.name]));
  const active = invoices.filter(inv => inv.status !== 'anulada');
  const sales = active.filter(inv => inv.invoice_type !== 'nota_credito');
  const creditNotes = active.filter(inv => inv.invoice_type === 'nota_credito');

  const net = { base0: 0, baseGravada: 0, iva: 0, descuentos: 0, total: 0, byPaymentMethod: new Map(), byBranch: new Map() };
  sales.forEach(inv => accumulate(net, inv, branchNameById, 1));
  creditNotes.forEach(inv => accumulate(net, inv, branchNameById, -1));

  const byStatus = new Map();
  invoices.forEach(inv => byStatus.set(inv.status, (byStatus.get(inv.status) || 0) + 1));

  const rows = sales.map(inv => {
    const s = splitInvoiceByTaxRate(inv);
    return {
      date: inv.issue_date,
      invoiceNumber: inv.invoice_number,
      customer: inv.customers?.name || 'Consumidor Final',
      customerId: inv.customers?.identification_number || '-',
      base0: s.base0,
      baseGravada: s.baseGravada,
      iva: s.iva,
      discount: Number(inv.discount_amount) || 0,
      total: Number(inv.total_amount) || 0,
      paymentMethod: PAYMENT_METHOD_LABELS[inv.payment_method] || inv.payment_method || '-',
      status: STATUS_LABELS[inv.status] || inv.status
    };
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    kpis: [
      { label: 'Base Imponible 0%', value: net.base0, format: 'usd', accent: 'blue' },
      { label: 'Base Gravada', value: net.baseGravada, format: 'usd', accent: 'purple' },
      { label: 'IVA Generado', value: net.iva, format: 'usd', accent: 'emerald' },
      { label: 'Descuentos', value: net.descuentos, format: 'usd', accent: 'pink' },
      { label: 'Total Facturado', value: net.total, format: 'usd', accent: 'amber' }
    ],
    byPaymentMethod: Array.from(net.byPaymentMethod.entries())
      .map(([method, total]) => ({ method: PAYMENT_METHOD_LABELS[method] || method, total }))
      .sort((a, b) => b.total - a.total),
    byBranch: Array.from(net.byBranch.entries())
      .map(([branch, v]) => ({ branch, ...v }))
      .sort((a, b) => b.total - a.total),
    byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status: STATUS_LABELS[status] || status, count })),
    creditNotesCount: creditNotes.length,
    table: {
      title: 'Libro de Ventas',
      columns: [
        { key: 'date', label: 'Fecha', align: 'left', width: 26, format: 'datetime' },
        { key: 'invoiceNumber', label: 'No. Factura', align: 'left', width: 30, format: 'text' },
        { key: 'customer', label: 'Cliente', align: 'left', width: 40, format: 'text' },
        { key: 'customerId', label: 'RUC/Cédula', align: 'left', width: 28, format: 'text' },
        { key: 'base0', label: 'Base 0%', align: 'right', width: 22, format: 'usd' },
        { key: 'baseGravada', label: 'Base Gravada', align: 'right', width: 24, format: 'usd' },
        { key: 'iva', label: 'IVA', align: 'right', width: 20, format: 'usd' },
        { key: 'discount', label: 'Descuento', align: 'right', width: 22, format: 'usd' },
        { key: 'total', label: 'Total', align: 'right', width: 24, format: 'usd' }
      ],
      rows,
      totals: { base0: net.base0, baseGravada: net.baseGravada, iva: net.iva, discount: net.descuentos, total: net.total }
    }
  };
}

// Conciliación SRI: cuenta comprobantes por estado y lista los que no
// quedaron 'autorizada' (ni 'anulada', que es una decisión del gerente, no
// una falla del SRI) junto con su motivo. sri_response_message es JSON crudo
// de la respuesta del SRI (ver api/sri/submit-invoice.js) - se intenta
// extraer un mensaje legible, si no se muestra tal cual.
function extractReason(invoice) {
  if (invoice.status === 'borrador') return 'Nunca se envió al SRI (o el envío no llegó a completarse)';
  if (!invoice.sri_response_message) return 'Sin motivo registrado';
  try {
    const parsed = JSON.parse(invoice.sri_response_message);
    const mensajes = parsed?.comprobantes?.comprobante?.mensajes?.mensaje
      || parsed?.RespuestaRecepcionComprobante?.comprobantes?.comprobante?.mensajes?.mensaje;
    const list = Array.isArray(mensajes) ? mensajes : (mensajes ? [mensajes] : []);
    if (list.length > 0) {
      return list.map(m => `${m.identificador || ''} ${m.mensaje || ''}`.trim()).join('; ');
    }
    return invoice.sri_response_message;
  } catch {
    return invoice.sri_response_message;
  }
}

export function buildSriReconciliation(invoices) {
  const counts = { autorizada: 0, devuelta: 0, borrador: 0, anulada: 0 };
  invoices.forEach(inv => { counts[inv.status] = (counts[inv.status] || 0) + 1; });

  const pending = invoices
    .filter(inv => inv.status === 'devuelta' || inv.status === 'borrador')
    .map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      date: inv.issue_date,
      status: STATUS_LABELS[inv.status] || inv.status,
      reason: extractReason(inv),
      // Solo una factura 'devuelta' con clave de acceso ya asignada es
      // reconsultable de verdad (el SRI llegó a recibirla) - una 'borrador'
      // nunca llegó a generar clave de acceso, reconsultar no tiene con qué.
      reconcilable: inv.status === 'devuelta' && !!inv.authorization_number
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return { counts, pending, allClear: counts.devuelta === 0 && counts.borrador === 0 };
}
