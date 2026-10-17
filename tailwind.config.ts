import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B0A09', 2: '#17120F' },
        gold: { DEFAULT: '#D4AF37', light: '#F3D98B', deep: '#9C7A1E' },
        cream: '#F7EFD9',
        yellow: '#F2C230',
        purple: '#5B2A6E',
        wine: '#6B1230',
        red: '#B3261E',
      },
      fontFamily: {
        heading: ['var(--font-playfair)', 'serif'],
        body: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
