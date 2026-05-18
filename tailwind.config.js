/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 900: '#1A1A2E', 800: '#16213E', 700: '#0F3460', 600: '#185FA5' },
        success: '#3B6D11', warning: '#854F0B', danger: '#A32D2D'
      }
    }
  },
  plugins: []
}
