/** @type {import('tailwindcss').Config} */
// Palette and fonts lifted from the Stitch "Obsidian Kinetic" export
// (code.html), which is the visual reference for the board and admin console.
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#070a10',
          900: '#0b0f17',
          850: '#101622',
          800: '#161e2e',
          700: '#1e293b',
          600: '#334155',
        },
        techblue: {
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
          950: '#0f172a',
        },
        cyanaccent: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
        },
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
