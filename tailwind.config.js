/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        bookerly: ['Bookerly', 'Literata', 'Merriweather', 'Georgia', 'serif'],
        ember: ['"Amazon Ember"', 'Inter', 'system-ui', 'sans-serif'],
        baskerville: ['"Libre Baskerville"', 'Baskerville', 'Georgia', 'serif'],
        dyslexic: ['OpenDyslexic', 'sans-serif'],
      },
      colors: {
        kindle: {
          light: '#fbfbf9',
          lightText: '#181818',
          sepia: '#f6eedb',
          sepiaText: '#382f24',
          dark: '#141414',
          darkSurface: '#1f1f1f',
          darkText: '#e3e3e3',
          eink: '#eae8e3',
          einkBorder: '#cfcdc8',
          einkText: '#111111',
          accent: '#0c66b8',
        }
      },
      boxShadow: {
        'kindle': '0 4px 20px -2px rgba(0, 0, 0, 0.1), 0 2px 6px -1px rgba(0, 0, 0, 0.06)',
        'kindle-eink': '2px 3px 0px rgba(0, 0, 0, 0.15)',
        'book-cover': '2px 4px 12px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.15)',
      }
    },
  },
  plugins: [],
}


