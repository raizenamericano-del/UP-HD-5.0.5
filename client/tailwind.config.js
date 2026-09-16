/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Palet brand ALL VD HD v5 — violet → cyan (dark premium ala Play Store)
        brand: {
          DEFAULT: '#8b5cf6',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          dark: '#5b21b6',
        },
        // titik tengah gradien (indigo)
        iris: { DEFAULT: '#6366f1', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5' },
        // aksen cyan
        accent: { DEFAULT: '#22d3ee', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
        inks: {
          950: '#06060f',
          900: '#0a0a16',
          850: '#0d0d1c',
          800: '#121226',
          700: '#1a1a33',
          600: '#242444',
        },
        // alias (kompat komponen)
        ink: {
          950: '#06060f',
          900: '#0a0a16',
          850: '#0d0d1c',
          800: '#121226',
          700: '#1a1a33',
        },
        line: 'rgba(255,255,255,0.09)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 18px 50px -18px rgba(0,0,0,0.75)',
        glow: '0 0 50px -12px rgba(139,92,246,0.65)',
        'glow-iris': '0 0 50px -12px rgba(99,102,241,0.55)',
        'glow-accent': '0 0 50px -12px rgba(34,211,238,0.5)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
        glass: '0 8px 32px 0 rgba(0,0,0,0.45), inset 0 1px 0 0 rgba(255,255,255,0.08)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      backgroundImage: {
        'grad-brand': 'linear-gradient(100deg, #8b5cf6 0%, #6366f1 48%, #22d3ee 100%)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.55' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        gradientX: { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        scan: { '0%': { transform: 'translateY(-120%)' }, '100%': { transform: 'translateY(320%)' } },
        aurora: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)', opacity: '0.55' },
          '50%': { transform: 'translate3d(4%, -3%, 0) scale(1.15)', opacity: '0.85' },
        },
        morphpop: { '0%': { transform: 'scale(0.8)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
        floaty: 'floaty 5.5s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.2s cubic-bezier(0.4,0,0.6,1) infinite',
        gradientX: 'gradientX 9s ease infinite',
        scan: 'scan 2.6s ease-in-out infinite',
        aurora: 'aurora 16s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
