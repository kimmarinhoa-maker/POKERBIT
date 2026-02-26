import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        outfit: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
        'glow-green': '0 0 15px rgba(34,197,94,0.15)',
        'glow-red': '0 0 15px rgba(239,68,68,0.15)',
        'glow-blue': '0 0 15px rgba(59,130,246,0.15)',
        'glow-amber': '0 0 15px rgba(245,158,11,0.15)',
        'glow-purple': '0 0 15px rgba(168,85,247,0.15)',
        'glow-emerald': '0 0 15px rgba(16,185,129,0.15)',
        'toast': '0 8px 30px rgba(0,0,0,0.5)',
        'modal': '0 25px 50px rgba(0,0,0,0.5)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'tab-fade': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'progress-fill': {
          '0%': { width: '0%' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.2s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'tab-fade': 'tab-fade 0.15s ease-out',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'progress-fill': 'progress-fill 0.8s ease-out',
      },
      colors: {
        poker: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        danger: {
          500: '#ef4444',
          900: '#450a0a',
        },
        warning: {
          500: '#f59e0b',
          900: '#451a03',
        },
        info: {
          400: '#60a5fa',
          500: '#3b82f6',
          900: '#1e3a5f',
        },
        success: {
          400: '#34d399',
          500: '#10b981',
          900: '#064e3b',
        },
        dark: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
    },
  },
  plugins: [],
};

export default config;
