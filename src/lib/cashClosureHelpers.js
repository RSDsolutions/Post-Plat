import { PAYMENT_METHOD_LABELS } from './reportsHelpers.js';

export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHOD_LABELS);

function emptyTotals() {
  return PAYMENT_METHOD_KEYS.reduce((acc, k) => { acc[k] = 0; return acc; }, {});
}

// Lo esperado de un cierre: suma de total_amount de las facturas del turno
// (ya filtradas por cajero + punto de venta + fecha + status != 'anulada' en
// quien llama), agrupado por forma de pago. Facturas sin payment_method caen
// en 'other', igual que el resto del sistema (reportsHelpers.js).
export function computeExpectedTotals(invoices) {
  const totals = emptyTotals();
  invoices.forEach(inv => {
    const method = PAYMENT_METHOD_KEYS.includes(inv.payment_method) ? inv.payment_method : 'other';
    totals[method] += Number(inv.total_amount) || 0;
  });
  return totals;
}

// Diferencia contado - esperado, forma de pago por forma de pago. Positivo =
// sobra, negativo = falta.
export function computeDifference(expected, counted) {
  const diff = {};
  PAYMENT_METHOD_KEYS.forEach(k => {
    diff[k] = (Number(counted[k]) || 0) - (Number(expected[k]) || 0);
  });
  return diff;
}

export function totalOf(totals) {
  return PAYMENT_METHOD_KEYS.reduce((sum, k) => sum + (Number(totals[k]) || 0), 0);
}

export function hasAnyDifference(difference, epsilon = 0.01) {
  return PAYMENT_METHOD_KEYS.some(k => Math.abs(Number(difference[k]) || 0) > epsilon);
}
