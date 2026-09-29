/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0A2540', 2: '#1A365D' },
        slateink: '#64748B',
        surface: '#F8F9FA',
        danger: '#D32F2F',
        warning: '#F57C00',
        safe: '#388E3C',
        // Enterprise dark telemetry console palette
        console: '#0b0f19',
        panel: '#111827',
        gridline: '#1e293b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Roboto Mono"', 'monospace'],
      },
      keyframes: {
        'pulse-border': {
          '0%, 100%': { borderColor: 'rgba(239,68,68,0.9)', boxShadow: '0 0 0 rgba(239,68,68,0)' },
          '50%': { borderColor: 'rgba(239,68,68,0.4)', boxShadow: '0 0 24px rgba(239,68,68,0.35)' },
        },
        'scan-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'blink-caret': {
          '0%, 45%': { opacity: 1 },
          '50%, 95%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
      animation: {
        'pulse-border': 'pulse-border 1.6s ease-in-out infinite',
        'scan-sweep': 'scan-sweep 2.4s linear infinite',
        'blink-caret': 'blink-caret 1s step-end infinite',
      },
    },
  },
  plugins: [],
}
