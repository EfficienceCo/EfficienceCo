/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
          950: 'var(--brand-950)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        'nova-sm': 'var(--r-sm)',
        nova: 'var(--r-md)',
        'nova-lg': 'var(--r-lg)',
        'nova-xl': 'var(--r-xl)',
      },
      boxShadow: {
        nova: 'var(--shadow-sm)',
        'nova-md': 'var(--shadow-md)',
        'nova-xl': 'var(--shadow-xl)',
        brand: 'var(--shadow-brand)',
      },
    },
  },
  plugins: [],
};
