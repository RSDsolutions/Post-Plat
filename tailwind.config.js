/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          dark:    'var(--brand-dark)',
          soft:    'var(--brand-soft)',
        },
        // Tokens del tema del POS (src/styles/themes.css) - resueltos por
        // data-pos-theme/data-pos-accent en el contenedor raíz de POSLayout.
        // Se usan como clases normales (bg-pos-bg, text-pos-text-muted...),
        // nunca var(--pos-x) directo en el JSX.
        'pos-bg':           'var(--pos-bg)',
        'pos-surface':      'var(--pos-surface)',
        'pos-surface-2':    'var(--pos-surface-2)',
        'pos-border':       'var(--pos-border)',
        'pos-text':         'var(--pos-text)',
        'pos-text-muted':   'var(--pos-text-muted)',
        'pos-accent':       'var(--pos-accent)',
        'pos-accent-hover': 'var(--pos-accent-hover)',
        'pos-accent-text':  'var(--pos-accent-text)',
        'pos-accent-soft':  'var(--pos-accent-soft)',
        'pos-success':      'var(--pos-success)',
        'pos-danger':       'var(--pos-danger)',
        'pos-warning':      'var(--pos-warning)',
        // Tokens del modo claro/oscuro del panel gerente/contador
        // (src/styles/panel-theme.css) - resueltos por data-panel-mode en el
        // contenedor raíz de StoreManagerLayout. Independientes de los pos-*
        // de arriba (no aplican al POS).
        'panel-bg':           'var(--panel-bg)',
        'panel-surface':      'var(--panel-surface)',
        'panel-surface-2':    'var(--panel-surface-2)',
        'panel-border':       'var(--panel-border)',
        'panel-text':         'var(--panel-text)',
        'panel-text-muted':   'var(--panel-text-muted)',
        'panel-accent':       'var(--panel-accent)',
        'panel-accent-hover': 'var(--panel-accent-hover)',
        'panel-accent-text':  'var(--panel-accent-text)',
        'panel-accent-soft':  'var(--panel-accent-soft)',
        'panel-success':      'var(--panel-success)',
        'panel-danger':       'var(--panel-danger)',
        'panel-warning':      'var(--panel-warning)',
      },
    },
  },
  plugins: [],
};
