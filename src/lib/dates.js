export const DEMO_DATE = new Date('2025-07-10T12:00:00Z');

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function daysFrom(date, reference = new Date()) {
  const diffTime = date.getTime() - reference.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function formatDate(date) {
  return date.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateLong(date) {
  return date.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatDateRelative(date) {
  const days = daysFrom(date);
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  if (days > 0) return `en ${days} días`;
  return `hace ${Math.abs(days)} días`;
}

// The renewal date a payment should produce. If the subscription still has
// time left (paying early/on time), the new period starts where the current
// one ends, so nothing is lost. If it already lapsed (paying late, or first
// payment ever), the new period starts today instead - there's no remaining
// time to preserve, and starting from the old date would leave the company
// still short.
export function computeNextRenewal(currentRenewalDate, cycleDays, now = new Date()) {
  const base = currentRenewalDate && currentRenewalDate.getTime() > now.getTime() ? currentRenewalDate : now;
  return addDays(base, cycleDays);
}

// Reconstructs which period each past payment covered, purely from the order
// payments happened in - no separate "period" column needed. Payment N's
// period runs from its own date to the next payment's date (or to the
// current renewal date, for the most recent one), so the chain has no gaps
// or overlaps by construction.
export function buildPaymentSequence(payments, currentRenewalDate) {
  const sorted = [...payments].sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date));
  return sorted.map((p, i) => ({
    ...p,
    sequence: i + 1,
    periodStart: new Date(p.payment_date),
    periodEnd: i < sorted.length - 1 ? new Date(sorted[i + 1].payment_date) : currentRenewalDate
  }));
}
