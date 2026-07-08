export function getBrandInitials(name) {
  if (!name) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function applyBrandColors(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const rDark = Math.floor(r * 0.85);
  const gDark = Math.floor(g * 0.85);
  const bDark = Math.floor(b * 0.85);

  const rSoft = Math.floor(r + (255 - r) * 0.88);
  const gSoft = Math.floor(g + (255 - g) * 0.88);
  const bSoft = Math.floor(b + (255 - b) * 0.88);

  const root = document.documentElement;
  root.style.setProperty('--brand', hexColor);
  root.style.setProperty('--brand-dark', `#${rDark.toString(16).padStart(2, '0')}${gDark.toString(16).padStart(2, '0')}${bDark.toString(16).padStart(2, '0')}`);
  root.style.setProperty('--brand-soft', `#${rSoft.toString(16).padStart(2, '0')}${gSoft.toString(16).padStart(2, '0')}${bSoft.toString(16).padStart(2, '0')}`);
}
