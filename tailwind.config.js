/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          canvas: '#0d1017',
          panel: '#131722',
          card: '#1a202f',
          elevated: '#22293d',
          hover: '#263045',
        },
        border: {
          subtle: '#22293d',
          active: '#38435e',
        },
        studio: {
          950: '#0d1017',
          900: '#131722',
          850: '#1a202f',
          800: '#22293d',
          700: '#334155',
          600: '#475569',
          accent: '#6366f1',
          accentHover: '#4f46e5',
          cyan: '#06b6d4',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
