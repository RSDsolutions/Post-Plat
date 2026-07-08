export function validateRUC(value) {
  const cleaned = value.replace(/\s+/g, '');
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, error: 'El RUC debe contener solo números' };
  }
  if (cleaned.length !== 13) {
    return { valid: false, error: 'El RUC debe tener 13 dígitos' };
  }
  if (!cleaned.endsWith('001')) {
    return { valid: false, error: 'El RUC debe terminar en 001' };
  }
  return { valid: true };
}
