/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'ctp-base': '#1e1e2e',
        'ctp-mantle': '#181825',
        'ctp-crust': '#11111b',
        'ctp-surface0': '#313244',
        'ctp-surface1': '#45475a',
        'ctp-surface2': '#585b70',
        'ctp-overlay0': '#6c7086',
        'ctp-subtext0': '#a6adc8',
        'ctp-subtext1': '#bac2de',
        'ctp-text': '#cdd6f4',
        'ctp-blue': '#89b4fa',
        'ctp-sky': '#89dceb',
        'ctp-lavender': '#b4befe',
        'ctp-yellow': '#f9e2af',
        'ctp-peach': '#fab387',
        'ctp-red': '#f38ba8',
        'ctp-green': '#a6e3a1',
        'ctp-teal': '#94e2d5',
      },
    },
  },
  plugins: [],
}
