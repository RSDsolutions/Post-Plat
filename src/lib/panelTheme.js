// Modo claro/oscuro del panel de gerente/contador (Fase 4) - análogo a
// src/lib/themes.js pero mucho más simple: es un toggle binario personal
// (users.ui_preferences), no una paleta elegible por la empresa.
export const PANEL_MODES = ['light', 'dark'];

export const DEFAULT_UI_PREFERENCES = { panel_mode: 'light' };

export function getSafePanelMode(raw) {
  const mode = raw?.panel_mode;
  return PANEL_MODES.includes(mode) ? mode : DEFAULT_UI_PREFERENCES.panel_mode;
}
