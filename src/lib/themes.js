// Catálogo de temas/paletas del POS - única fuente de verdad, consumida por
// useStore.js (aplicación del tema), AppearanceSettings.jsx y CompanyWizard.jsx
// (Fase 3, selección) para no duplicar listas.
//
// Los colores de "preview" son solo para renderizar tarjetas de selección
// (mini esquema de color, no imágenes estáticas) - deben coincidir con los
// valores reales de src/styles/themes.css. Si se ajusta un color allá,
// ajustar también acá.

export const POS_THEMES = [
  {
    id: 'light-classic',
    name: 'Claro Clásico',
    description: 'Fondo blanco y tarjetas con borde suave - el look de referencia, ideal para locales bien iluminados.',
    mode: 'light',
    preview: { bg: '#ffffff', surface: '#f4f4f5', text: '#18181b', border: '#e4e4e7' }
  },
  {
    id: 'light-soft',
    name: 'Claro Suave',
    description: 'Tonos cálidos, tarjetas elevadas con sombra y esquinas más redondeadas - un ambiente más cercano.',
    mode: 'light',
    preview: { bg: '#faf7f2', surface: '#ffffff', text: '#292420', border: '#e7ddd0' }
  },
  {
    id: 'dark-classic',
    name: 'Oscuro Clásico',
    description: 'Sobrio y de bajo brillo - el diseño oscuro tradicional, para locales con poca luz.',
    mode: 'dark',
    preview: { bg: '#09090b', surface: '#18181b', text: '#f4f4f5', border: '#27272a' }
  },
  {
    id: 'dark-contrast',
    name: 'Oscuro Alto Contraste',
    description: 'Negro puro, texto muy brillante y botones grandes - pensado para uso rápido y táctil.',
    mode: 'dark',
    preview: { bg: '#000000', surface: '#0a0a0a', text: '#ffffff', border: '#2e2e2e' }
  }
];

export const POS_ACCENTS = [
  { id: 'blue', name: 'Azul', preview: '#2563eb' },
  { id: 'emerald', name: 'Esmeralda', preview: '#047857' },
  { id: 'violet', name: 'Violeta', preview: '#6d28d9' },
  { id: 'amber', name: 'Ámbar', preview: '#f59e0b' },
  { id: 'rose', name: 'Rosa', preview: '#e11d48' },
  { id: 'slate', name: 'Pizarra', preview: '#475569' }
];

export const POS_THEME_IDS = POS_THEMES.map(t => t.id);
export const POS_ACCENT_IDS = POS_ACCENTS.map(a => a.id);

// Default de fábrica para empresas nuevas (coincide con el DEFAULT de la
// columna companies.ui_settings) y fallback en tiempo de ejecución si el
// jsonb guardado falta o trae un valor desconocido.
export const DEFAULT_UI_SETTINGS = { pos_theme: 'light-classic', pos_accent: 'blue' };

// Nunca confía ciegamente en lo que vino de la base - si alguna vez se
// retira un tema/paleta del catálogo, o el jsonb está corrupto/vacío, cae al
// default en vez de aplicar un data-pos-theme desconocido (que dejaría el
// POS sin ningún token de color resuelto).
export function getSafeUiSettings(raw) {
  const theme = raw?.pos_theme;
  const accent = raw?.pos_accent;
  return {
    pos_theme: POS_THEME_IDS.includes(theme) ? theme : DEFAULT_UI_SETTINGS.pos_theme,
    pos_accent: POS_ACCENT_IDS.includes(accent) ? accent : DEFAULT_UI_SETTINGS.pos_accent
  };
}

export function getThemeById(id) {
  return POS_THEMES.find(t => t.id === id) || POS_THEMES.find(t => t.id === DEFAULT_UI_SETTINGS.pos_theme);
}

export function getAccentById(id) {
  return POS_ACCENTS.find(a => a.id === id) || POS_ACCENTS.find(a => a.id === DEFAULT_UI_SETTINGS.pos_accent);
}
