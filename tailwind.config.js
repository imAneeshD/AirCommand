/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        atc: {
          bg: '#060b12',
          panel: '#0b131f',
          surface: '#111c2d',
          border: '#1e3048',
          cyan: '#22d3ee',
          green: '#10b981',
          amber: '#f59e0b',
          red: '#ef4444',
          muted: '#64748b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      }
    },
  },
  plugins: [],
}
