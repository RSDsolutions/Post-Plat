export const DEMO_DATE = new Date('2025-07-10T12:00:00Z');

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function daysFrom(date, reference = DEMO_DATE) {
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
