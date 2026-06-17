/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'gal': {
          'base':        '#0a0a0a',
          'raised':      '#141414',
          'overlay':     '#1a1a1a',
          'accent':      '#00ff2a',
          'accent-dark': '#00cc22',
          'border':      'rgba(255,255,255,0.08)',
          'text':        '#ededed',
          'muted':       '#737373',
          'primary':     '#0a0a0a',
          'secondary':   '#141414',
          'accent-light': '#00ff2a',
          'success':     '#10B981',
          'warning':     '#F59E0B',
          'danger':      '#EF4444',
        }
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
}
