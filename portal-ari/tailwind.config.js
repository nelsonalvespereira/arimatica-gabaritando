/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Laranja da marca com contraste WCAG AA para texto branco (5,2:1) e como texto sobre branco.
          orange: '#C2410C',
          orangeHover: '#9A3412',
          // Laranja claro: texto laranja sobre fundo ESCURO (slate-900/950).
          orangeLight: '#FB923C',
          grayLight: '#F3F4F6', 
          grayBorder: '#D1D5DB',
          grayText: '#4B5563', 
        }
      }
    },
  },
  plugins: [],
}