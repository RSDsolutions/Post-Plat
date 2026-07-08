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
      },
    },
  },
  plugins: [],
};
