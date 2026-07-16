import { formatUSD, formatNumber } from './format.js';

// ---- Date range presets ----
// Ecuador business week runs Monday-Sunday, so "Esta semana" starts Monday
// rather than JS's default Sunday-first week.

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeekMonday(d) {
  const x = startOfDay(d);
  const diff = (x.getDay() + 6) % 7; // days since Monday
  x.setDate(x.getDate() - diff);
  return x;
}

export const DATE_PRESETS = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes anterior' },
  { id: 'year', label: 'Este año' },
  { id: 'all', label: 'Todo' },
  { id: 'custom', label: 'Personalizado' }
];

export function computeDateRange(presetId, customStart, customEnd) {
  const now = new Date();
  const today = startOfDay(now);
  switch (presetId) {
    case 'today':
      return { start: today, end: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { start: y, end: endOfDay(y) };
    }
    case 'week':
      return { start: startOfWeekMonday(now), end: endOfDay(now) };
    case 'month':
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOfDay(now) };
    case 'lastMonth': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: s, end: endOfDay(e) };
    }
    case 'year':
      return { start: new Date(today.getFullYear(), 0, 1), end: endOfDay(now) };
    case 'all':
      return { start: null, end: null };
    case 'custom':
      return {
        start: customStart ? startOfDay(new Date(customStart)) : null,
        end: customEnd ? endOfDay(new Date(customEnd)) : null
      };
    default:
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOfDay(now) };
  }
}

// ---- Formatting ----

export function formatDate(value) {
  return new Date(value).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDateRangeLabel(start, end) {
  if (!start && !end) return 'Todo el histórico';
  if (!start) return `Hasta ${formatDate(end)}`;
  if (!end) return `Desde ${formatDate(start)}`;
  return `${formatDate(start)} — ${formatDate(end)}`;
}

// Groups by LOCAL calendar day using local getters (not toISOString, which
// would bucket late-night sales into the wrong day for UTC-negative zones
// like Ecuador). The key is a plain 'YYYY-MM-DD' string, not a real
// timestamp - format it back with formatDayKey, not `new Date()`.
export function toLocalDayKey(value) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDayKey(key, style = 'short') {
  const [y, m, d] = String(key).split('-');
  return style === 'short' ? `${d}/${m}` : `${d}/${m}/${y}`;
}

export function formatCellValue(value, format) {
  if (value === null || value === undefined) return '-';
  switch (format) {
    case 'usd': return formatUSD(value);
    case 'number': return formatNumber(Math.round(Number(value) || 0));
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'datetime': return formatDateTime(value);
    case 'date': return formatDate(value);
    case 'daykey': return formatDayKey(value, 'long');
    default: return String(value);
  }
}

export const STATUS_LABELS = {
  borrador: 'Borrador',
  autorizada: 'Autorizada',
  anulada: 'Anulada',
  devuelta: 'Devuelta'
};

export const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  card: 'Tarjeta de Crédito',
  debit: 'Tarjeta de Débito',
  transfer: 'Transferencia',
  other: 'Otro'
};

const ROLE_LABELS = { operario: 'Operario', vendedor: 'Vendedor', gerente: 'Gerente', admin: 'Admin', contador: 'Contador' };

function sum(arr, fn) {
  return arr.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

// ---- Dataset ----
// One fetch (invoices + nested customer/line items, plus products & users)
// feeds every report tab below via client-side aggregation - the data
// volumes for a single-store POS don't justify a query per tab.
export function buildReportDataset({ invoices, products, users, stockRows, purchases }) {
  const productMap = new Map(products.map(p => [p.id, p]));
  const userMap = new Map(users.map(u => [u.id, u]));
  // activeInvoices alimenta sumas de venta (impuestos, productos, cajeros...)
  // que no saben restar notas de crédito - a diferencia de accountingHelpers.
  // buildSalesLedger (que sí las neta con signo), acá simplemente se excluyen
  // para no contarlas como una venta más con el signo equivocado. Esto
  // subreporta el efecto de las NC en vez de sumarlo mal; netearlas de verdad
  // en cada una de las pestañas de Reports.jsx queda fuera de esta fase.
  const activeInvoices = invoices.filter(inv => inv.status !== 'anulada' && inv.invoice_type !== 'nota_credito');
  // Igual criterio que activeInvoices: una compra anulada no debe sumar al
  // total comprado ni a lo retenido de ese proveedor.
  const activePurchases = (purchases || []).filter(p => p.status !== 'anulada');
  return { invoices, activeInvoices, productMap, userMap, stockRows: stockRows || [], purchases: purchases || [], activePurchases };
}

export const REPORT_TABS = [
  { id: 'overview', label: 'Resumen' },
  { id: 'sales', label: 'Ventas' },
  { id: 'products', label: 'Productos' },
  { id: 'customers', label: 'Clientes' },
  { id: 'cashiers', label: 'Cajeros' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'tax', label: 'Impuestos / SRI' },
  { id: 'purchases', label: 'Compras' },
  { id: 'purchaseRetentions', label: 'Retenciones a Proveedores' }
];

function buildOverviewReport(dataset) {
  const { activeInvoices, invoices } = dataset;
  const totalRevenue = sum(activeInvoices, i => i.total_amount);
  const totalDiscount = sum(activeInvoices, i => i.discount_amount);
  const totalTax = sum(activeInvoices, i => i.tax_amount);
  const invoiceCount = activeInvoices.length;
  const avgTicket = invoiceCount ? totalRevenue / invoiceCount : 0;
  const voidedCount = invoices.length - invoiceCount;

  const byDay = new Map();
  activeInvoices.forEach(inv => {
    const key = toLocalDayKey(inv.issue_date);
    const cur = byDay.get(key) || { date: key, invoices: 0, revenue: 0 };
    cur.invoices += 1;
    cur.revenue += Number(inv.total_amount) || 0;
    byDay.set(key, cur);
  });
  const dailyRows = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    kpis: [
      { label: 'Ingresos Totales', value: totalRevenue, format: 'usd', accent: 'emerald' },
      { label: 'Facturas Emitidas', value: invoiceCount, format: 'number', accent: 'blue' },
      { label: 'Ticket Promedio', value: avgTicket, format: 'usd', accent: 'amber' },
      { label: 'Descuentos Otorgados', value: totalDiscount, format: 'usd', accent: 'pink' },
      { label: 'IVA Recaudado', value: totalTax, format: 'usd', accent: 'purple' },
      { label: 'Facturas Anuladas', value: voidedCount, format: 'number', accent: 'red' }
    ],
    chart: { type: 'trend', valueFormat: 'usd', data: dailyRows.map(r => ({ label: formatDayKey(r.date), value: r.revenue })) },
    table: {
      title: 'Resumen Diario',
      columns: [
        { key: 'date', label: 'Fecha', align: 'left', width: 40, format: 'daykey' },
        { key: 'invoices', label: 'Facturas', align: 'right', width: 30, format: 'number' },
        { key: 'revenue', label: 'Ingresos', align: 'right', width: 40, format: 'usd' }
      ],
      rows: dailyRows,
      totals: { invoices: invoiceCount, revenue: totalRevenue }
    }
  };
}

function buildSalesReport(dataset) {
  const { activeInvoices, invoices } = dataset;
  const totalRevenue = sum(activeInvoices, i => i.total_amount);
  const invoiceCount = activeInvoices.length;
  const avgTicket = invoiceCount ? totalRevenue / invoiceCount : 0;
  const voidedCount = invoices.filter(i => i.status === 'anulada').length;

  const methodColors = { cash: '#10b981', card: '#3b82f6', debit: '#a855f7', transfer: '#f59e0b', other: '#71717a' };
  const byMethod = new Map();
  activeInvoices.forEach(inv => {
    const key = inv.payment_method || 'other';
    byMethod.set(key, (byMethod.get(key) || 0) + (Number(inv.total_amount) || 0));
  });
  const donutData = Array.from(byMethod.entries())
    .map(([method, value]) => ({ label: PAYMENT_METHOD_LABELS[method] || method, value, color: methodColors[method] || '#71717a' }))
    .sort((a, b) => b.value - a.value);

  const rows = invoices.map(inv => ({
    date: inv.issue_date,
    invoiceNumber: inv.invoice_number,
    customer: inv.customers?.name || 'Consumidor Final',
    paymentMethod: PAYMENT_METHOD_LABELS[inv.payment_method] || inv.payment_method || '-',
    status: STATUS_LABELS[inv.status] || inv.status,
    discount: Number(inv.discount_amount) || 0,
    tax: Number(inv.tax_amount) || 0,
    total: Number(inv.total_amount) || 0
  })).sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    kpis: [
      { label: 'Ingresos Totales', value: totalRevenue, format: 'usd', accent: 'emerald' },
      { label: 'Facturas Emitidas', value: invoiceCount, format: 'number', accent: 'blue' },
      { label: 'Ticket Promedio', value: avgTicket, format: 'usd', accent: 'amber' },
      { label: 'Facturas Anuladas', value: voidedCount, format: 'number', accent: 'red' }
    ],
    chart: { type: 'donut', valueFormat: 'usd', data: donutData },
    table: {
      title: 'Detalle de Facturas',
      columns: [
        { key: 'date', label: 'Fecha', align: 'left', width: 30, format: 'datetime' },
        { key: 'invoiceNumber', label: 'No. Factura', align: 'left', width: 32, format: 'text' },
        { key: 'customer', label: 'Cliente', align: 'left', width: 42, format: 'text' },
        { key: 'paymentMethod', label: 'Pago', align: 'left', width: 26, format: 'text' },
        { key: 'status', label: 'Estado', align: 'left', width: 22, format: 'text' },
        { key: 'discount', label: 'Descuento', align: 'right', width: 24, format: 'usd' },
        { key: 'tax', label: 'IVA', align: 'right', width: 20, format: 'usd' },
        { key: 'total', label: 'Total', align: 'right', width: 24, format: 'usd' }
      ],
      rows,
      totals: { discount: sum(rows, r => r.discount), tax: sum(rows.filter(r => r.status !== 'Anulada'), r => r.tax), total: totalRevenue }
    }
  };
}

function buildProductsReport(dataset) {
  const { activeInvoices, productMap } = dataset;
  const byProduct = new Map();

  activeInvoices.forEach(inv => {
    (inv.invoice_details || []).forEach(d => {
      const key = d.product_id || d.product_name;
      const product = productMap.get(d.product_id);
      const cur = byProduct.get(key) || {
        name: d.product_name,
        category: product?.category || 'Sin categoría',
        quantity: 0,
        revenue: 0,
        discount: 0,
        cost: 0
      };
      const qty = Number(d.quantity) || 0;
      const grossLine = Number(d.unit_price) * qty;
      cur.quantity += qty;
      cur.revenue += Number(d.total) || 0;
      cur.discount += Math.max(0, grossLine - (Number(d.subtotal) || 0));
      cur.cost += (Number(product?.cost_price) || 0) * qty;
      byProduct.set(key, cur);
    });
  });

  const rows = Array.from(byProduct.values())
    .map(p => ({ ...p, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalUnits = sum(rows, r => r.quantity);
  const totalRevenue = sum(rows, r => r.revenue);
  const topProduct = rows[0]?.name || '-';
  const categoryTotals = new Map();
  rows.forEach(r => categoryTotals.set(r.category, (categoryTotals.get(r.category) || 0) + r.revenue));
  const topCategory = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

  return {
    kpis: [
      { label: 'Productos Vendidos', value: rows.length, format: 'number', accent: 'blue' },
      { label: 'Unidades Vendidas', value: totalUnits, format: 'number', accent: 'emerald' },
      { label: 'Producto Más Vendido', value: topProduct, format: 'text', accent: 'amber' },
      { label: 'Categoría Líder', value: topCategory, format: 'text', accent: 'purple' }
    ],
    chart: { type: 'bars', title: 'Top 8 Productos por Ingresos', data: rows.slice(0, 8).map(r => ({ label: r.name, value: r.revenue, formatted: formatUSD(r.revenue) })) },
    table: {
      title: 'Ventas por Producto',
      columns: [
        { key: 'name', label: 'Producto', align: 'left', width: 56, format: 'text' },
        { key: 'category', label: 'Categoría', align: 'left', width: 34, format: 'text' },
        { key: 'quantity', label: 'Unidades', align: 'right', width: 24, format: 'number' },
        { key: 'discount', label: 'Descuento', align: 'right', width: 26, format: 'usd' },
        { key: 'revenue', label: 'Ingresos', align: 'right', width: 28, format: 'usd' },
        { key: 'margin', label: 'Margen', align: 'right', width: 22, format: 'percent' }
      ],
      rows,
      totals: { quantity: totalUnits, discount: sum(rows, r => r.discount), revenue: totalRevenue }
    }
  };
}

function buildCustomersReport(dataset) {
  const { activeInvoices } = dataset;
  const byCustomer = new Map();

  activeInvoices.forEach(inv => {
    const key = inv.customer_id || 'final';
    const cur = byCustomer.get(key) || {
      name: inv.customers?.name || 'Consumidor Final',
      identification: inv.customers?.identification_number || '-',
      purchases: 0,
      total: 0,
      savings: 0
    };
    cur.purchases += 1;
    cur.total += Number(inv.total_amount) || 0;
    cur.savings += Number(inv.discount_amount) || 0;
    byCustomer.set(key, cur);
  });

  const rows = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
  const named = rows.filter(r => r.name !== 'Consumidor Final');
  const topCustomer = named[0]?.name || rows[0]?.name || '-';
  const totalSavings = sum(rows, r => r.savings);
  const totalSpent = sum(rows, r => r.total);
  const avgPerCustomer = rows.length ? totalSpent / rows.length : 0;

  return {
    kpis: [
      { label: 'Clientes Atendidos', value: rows.length, format: 'number', accent: 'blue' },
      { label: 'Cliente Top', value: topCustomer, format: 'text', accent: 'emerald' },
      { label: 'Ahorro Total Otorgado', value: totalSavings, format: 'usd', accent: 'pink' },
      { label: 'Promedio por Cliente', value: avgPerCustomer, format: 'usd', accent: 'amber' }
    ],
    chart: { type: 'bars', title: 'Top 8 Clientes por Gasto', data: rows.slice(0, 8).map(r => ({ label: r.name, value: r.total, formatted: formatUSD(r.total) })) },
    table: {
      title: 'Detalle por Cliente',
      columns: [
        { key: 'name', label: 'Cliente', align: 'left', width: 56, format: 'text' },
        { key: 'identification', label: 'Identificación', align: 'left', width: 36, format: 'text' },
        { key: 'purchases', label: 'Compras', align: 'right', width: 24, format: 'number' },
        { key: 'savings', label: 'Ahorro', align: 'right', width: 28, format: 'usd' },
        { key: 'total', label: 'Total Gastado', align: 'right', width: 32, format: 'usd' }
      ],
      rows,
      totals: { purchases: sum(rows, r => r.purchases), savings: totalSavings, total: totalSpent }
    }
  };
}

function buildCashiersReport(dataset) {
  const { activeInvoices, userMap } = dataset;
  const byUser = new Map();

  activeInvoices.forEach(inv => {
    const key = inv.user_id || 'unknown';
    const user = userMap.get(inv.user_id);
    const cur = byUser.get(key) || {
      name: user?.name || 'Desconocido',
      role: user?.role ? (ROLE_LABELS[user.role] || user.role) : '-',
      invoices: 0,
      revenue: 0
    };
    cur.invoices += 1;
    cur.revenue += Number(inv.total_amount) || 0;
    byUser.set(key, cur);
  });

  const rows = Array.from(byUser.values())
    .map(r => ({ ...r, avgTicket: r.invoices ? r.revenue / r.invoices : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = sum(rows, r => r.revenue);
  const totalInvoices = sum(rows, r => r.invoices);

  return {
    kpis: [
      { label: 'Cajeros Activos', value: rows.length, format: 'number', accent: 'blue' },
      { label: 'Mejor Cajero', value: rows[0]?.name || '-', format: 'text', accent: 'emerald' },
      { label: 'Ingresos Totales', value: totalRevenue, format: 'usd', accent: 'amber' },
      { label: 'Ticket Promedio General', value: totalInvoices ? totalRevenue / totalInvoices : 0, format: 'usd', accent: 'purple' }
    ],
    chart: { type: 'bars', title: 'Ranking de Cajeros por Ingresos', data: rows.map(r => ({ label: r.name, value: r.revenue, formatted: formatUSD(r.revenue) })) },
    table: {
      title: 'Desempeño por Cajero',
      columns: [
        { key: 'name', label: 'Cajero', align: 'left', width: 46, format: 'text' },
        { key: 'role', label: 'Rol', align: 'left', width: 28, format: 'text' },
        { key: 'invoices', label: 'Facturas', align: 'right', width: 26, format: 'number' },
        { key: 'avgTicket', label: 'Ticket Prom.', align: 'right', width: 30, format: 'usd' },
        { key: 'revenue', label: 'Ingresos', align: 'right', width: 30, format: 'usd' }
      ],
      rows,
      totals: { invoices: totalInvoices, revenue: totalRevenue }
    }
  };
}

function buildInventoryReport(dataset) {
  const { stockRows } = dataset;
  const products = stockRows.filter(p => p.is_active !== false);

  const rows = products.map(p => {
    const stock = Number(p.quantity) || 0;
    const minStock = Number(p.min_stock) || 0;
    const cost = Number(p.cost_price) || 0;
    let status = 'OK';
    if (stock <= 0) status = 'Agotado';
    else if (stock <= minStock) status = 'Bajo';
    return { name: p.name, category: p.category || 'Sin categoría', stock, minStock, value: stock * cost, status };
  }).sort((a, b) => b.value - a.value);

  const totalValue = sum(rows, r => r.value);
  const totalUnits = sum(rows, r => r.stock);
  const lowStockCount = rows.filter(r => r.status !== 'OK').length;

  const categoryColors = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#71717a'];
  const byCategory = new Map();
  rows.forEach(r => byCategory.set(r.category, (byCategory.get(r.category) || 0) + r.value));
  const donutData = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: categoryColors[i % categoryColors.length] }));

  return {
    kpis: [
      { label: 'Productos Activos', value: rows.length, format: 'number', accent: 'blue' },
      { label: 'Valor de Inventario', value: totalValue, format: 'usd', accent: 'emerald' },
      { label: 'Unidades en Stock', value: totalUnits, format: 'number', accent: 'purple' },
      { label: 'Bajo Stock Mínimo', value: lowStockCount, format: 'number', accent: lowStockCount > 0 ? 'red' : 'emerald' }
    ],
    chart: { type: 'donut', valueFormat: 'usd', data: donutData },
    table: {
      title: 'Inventario Actual',
      columns: [
        { key: 'name', label: 'Producto', align: 'left', width: 52, format: 'text' },
        { key: 'category', label: 'Categoría', align: 'left', width: 32, format: 'text' },
        { key: 'stock', label: 'Stock', align: 'right', width: 20, format: 'number' },
        { key: 'minStock', label: 'Mínimo', align: 'right', width: 20, format: 'number' },
        { key: 'value', label: 'Valor', align: 'right', width: 28, format: 'usd' },
        { key: 'status', label: 'Estado', align: 'left', width: 24, format: 'text' }
      ],
      rows,
      totals: { stock: totalUnits, value: totalValue }
    }
  };
}

function buildTaxReport(dataset) {
  const { invoices, activeInvoices } = dataset;
  const totalTax = sum(activeInvoices, i => i.tax_amount);
  const totalBase = sum(activeInvoices, i => i.subtotal);
  const totalCollected = sum(activeInvoices, i => i.total_amount);
  const authorized = invoices.filter(i => i.status === 'autorizada').length;
  const draft = invoices.filter(i => i.status === 'borrador').length;
  const voided = invoices.filter(i => i.status === 'anulada').length;

  const statusColors = { autorizada: '#10b981', borrador: '#f59e0b', anulada: '#ef4444', devuelta: '#a855f7' };
  const byStatus = new Map();
  invoices.forEach(inv => byStatus.set(inv.status, (byStatus.get(inv.status) || 0) + 1));
  const donutData = Array.from(byStatus.entries()).map(([status, count]) => ({
    label: STATUS_LABELS[status] || status,
    value: count,
    color: statusColors[status] || '#71717a'
  }));

  const rows = invoices.map(inv => ({
    date: inv.issue_date,
    invoiceNumber: inv.invoice_number,
    status: STATUS_LABELS[inv.status] || inv.status,
    base: Number(inv.subtotal) || 0,
    tax: Number(inv.tax_amount) || 0,
    total: Number(inv.total_amount) || 0,
    authorization: inv.authorization_number || '-'
  })).sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    kpis: [
      { label: 'IVA Recaudado', value: totalTax, format: 'usd', accent: 'emerald' },
      { label: 'Base Imponible', value: totalBase, format: 'usd', accent: 'blue' },
      { label: 'Autorizadas SRI', value: authorized, format: 'number', accent: 'emerald' },
      { label: 'En Borrador', value: draft, format: 'number', accent: 'amber' },
      { label: 'Anuladas', value: voided, format: 'number', accent: 'red' }
    ],
    chart: { type: 'donut', valueFormat: 'number', data: donutData },
    table: {
      title: 'Detalle Tributario',
      columns: [
        { key: 'date', label: 'Fecha', align: 'left', width: 28, format: 'datetime' },
        { key: 'invoiceNumber', label: 'No. Factura', align: 'left', width: 32, format: 'text' },
        { key: 'status', label: 'Estado', align: 'left', width: 24, format: 'text' },
        { key: 'base', label: 'Base Imponible', align: 'right', width: 28, format: 'usd' },
        { key: 'tax', label: 'IVA', align: 'right', width: 22, format: 'usd' },
        { key: 'total', label: 'Total', align: 'right', width: 24, format: 'usd' },
        { key: 'authorization', label: 'No. Autorización SRI', align: 'left', width: 60, format: 'text' }
      ],
      rows,
      totals: { base: totalBase, tax: totalTax, total: totalCollected }
    }
  };
}

function buildPurchasesReport(dataset) {
  const { activePurchases, purchases } = dataset;
  const totalPurchased = sum(activePurchases, p => p.total);
  const purchaseCount = activePurchases.length;
  const avgPurchase = purchaseCount ? totalPurchased / purchaseCount : 0;
  const voidedCount = purchases.length - purchaseCount;

  const bySupplier = new Map();
  activePurchases.forEach(p => {
    const key = p.supplier_id || p.suppliers?.id || 'sin_proveedor';
    const retained = sum(p.purchase_retentions || [], r => r.retention_amount);
    const cur = bySupplier.get(key) || {
      name: p.suppliers?.razon_social || 'Proveedor eliminado',
      ruc: p.suppliers?.ruc || '-',
      purchases: 0,
      total: 0,
      retained: 0
    };
    cur.purchases += 1;
    cur.total += Number(p.total) || 0;
    cur.retained += retained;
    bySupplier.set(key, cur);
  });

  const rows = Array.from(bySupplier.values())
    .map(r => ({ ...r, net: r.total - r.retained }))
    .sort((a, b) => b.total - a.total);
  const totalRetainedAll = sum(rows, r => r.retained);

  return {
    kpis: [
      { label: 'Total Comprado', value: totalPurchased, format: 'usd', accent: 'blue' },
      { label: 'Compras Registradas', value: purchaseCount, format: 'number', accent: 'emerald' },
      { label: 'Proveedores Activos', value: rows.length, format: 'number', accent: 'purple' },
      { label: 'Compra Promedio', value: avgPurchase, format: 'usd', accent: 'amber' },
      { label: 'Compras Anuladas', value: voidedCount, format: 'number', accent: 'red' }
    ],
    chart: { type: 'bars', title: 'Top 8 Proveedores por Compras', data: rows.slice(0, 8).map(r => ({ label: r.name, value: r.total, formatted: formatUSD(r.total) })) },
    table: {
      title: 'Compras por Proveedor',
      columns: [
        { key: 'name', label: 'Proveedor', align: 'left', width: 46, format: 'text' },
        { key: 'ruc', label: 'RUC', align: 'left', width: 28, format: 'text' },
        { key: 'purchases', label: 'Compras', align: 'right', width: 22, format: 'number' },
        { key: 'total', label: 'Total Comprado', align: 'right', width: 30, format: 'usd' },
        { key: 'retained', label: 'Retenido', align: 'right', width: 26, format: 'usd' },
        { key: 'net', label: 'Neto Pagado', align: 'right', width: 28, format: 'usd' }
      ],
      rows,
      totals: { purchases: purchaseCount, total: totalPurchased, retained: totalRetainedAll, net: totalPurchased - totalRetainedAll }
    }
  };
}

// Insumo directo para la declaración mensual al SRI: retenido IVA/renta del
// período, desglosado por concepto - separado de buildPurchasesReport (que
// responde "a quién le compramos") porque son dos preguntas distintas y el
// contrato de cada pestaña es una sola tabla.
function buildPurchaseRetentionsReport(dataset) {
  const { activePurchases } = dataset;
  const allRetentions = activePurchases.flatMap(p => p.purchase_retentions || []);

  const totalIva = sum(allRetentions.filter(r => r.retention_type === 'iva'), r => r.retention_amount);
  const totalRenta = sum(allRetentions.filter(r => r.retention_type === 'renta'), r => r.retention_amount);
  const totalRetained = totalIva + totalRenta;
  const authorized = allRetentions.filter(r => r.retention_sri_status === 'autorizada').length;
  const pending = allRetentions.filter(r => r.retention_sri_status === 'pendiente').length;

  const typeColors = { iva: '#3b82f6', renta: '#f59e0b' };
  const byType = new Map();
  allRetentions.forEach(r => byType.set(r.retention_type, (byType.get(r.retention_type) || 0) + (Number(r.retention_amount) || 0)));
  const donutData = Array.from(byType.entries())
    .filter(([, value]) => value > 0)
    .map(([type, value]) => ({ label: type === 'iva' ? 'Retención IVA' : 'Retención Renta', value, color: typeColors[type] || '#71717a' }));

  const byConcept = new Map();
  allRetentions.forEach(r => {
    const key = `${r.retention_concept_id || 'sin_concepto'}_${r.retention_type}`;
    const cur = byConcept.get(key) || {
      codigo: r.retention_concepts?.codigo_sri || '-',
      concepto: r.retention_concepts?.descripcion || 'Sin concepto',
      tipo: r.retention_type === 'iva' ? 'IVA' : 'Renta',
      count: 0,
      base: 0,
      amount: 0
    };
    cur.count += 1;
    cur.base += Number(r.retention_base) || 0;
    cur.amount += Number(r.retention_amount) || 0;
    byConcept.set(key, cur);
  });

  const rows = Array.from(byConcept.values()).sort((a, b) => b.amount - a.amount);

  return {
    kpis: [
      { label: 'Total Retenido', value: totalRetained, format: 'usd', accent: 'purple' },
      { label: 'Retenido IVA', value: totalIva, format: 'usd', accent: 'blue' },
      { label: 'Retenido Renta', value: totalRenta, format: 'usd', accent: 'amber' },
      { label: 'Comprobantes Autorizados', value: authorized, format: 'number', accent: 'emerald' },
      { label: 'Pendientes de Emitir', value: pending, format: 'number', accent: pending > 0 ? 'red' : 'emerald' }
    ],
    chart: { type: 'donut', valueFormat: 'usd', data: donutData },
    table: {
      title: 'Retenciones por Concepto',
      columns: [
        { key: 'codigo', label: 'Código SRI', align: 'left', width: 22, format: 'text' },
        { key: 'concepto', label: 'Concepto', align: 'left', width: 50, format: 'text' },
        { key: 'tipo', label: 'Tipo', align: 'left', width: 18, format: 'text' },
        { key: 'count', label: 'Retenciones', align: 'right', width: 24, format: 'number' },
        { key: 'base', label: 'Base Imponible', align: 'right', width: 28, format: 'usd' },
        { key: 'amount', label: 'Monto Retenido', align: 'right', width: 28, format: 'usd' }
      ],
      rows,
      totals: { count: allRetentions.length, base: sum(rows, r => r.base), amount: totalRetained }
    }
  };
}

export function buildReport(tabId, dataset) {
  switch (tabId) {
    case 'sales': return buildSalesReport(dataset);
    case 'products': return buildProductsReport(dataset);
    case 'customers': return buildCustomersReport(dataset);
    case 'cashiers': return buildCashiersReport(dataset);
    case 'inventory': return buildInventoryReport(dataset);
    case 'tax': return buildTaxReport(dataset);
    case 'purchases': return buildPurchasesReport(dataset);
    case 'purchaseRetentions': return buildPurchaseRetentionsReport(dataset);
    case 'overview':
    default:
      return buildOverviewReport(dataset);
  }
}
