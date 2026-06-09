import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,css}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: 'var(--gold)',
          light: 'var(--gold-light)',
          dark: 'var(--gold-dark)',
          muted: 'rgba(160,120,38,0.18)',
        },
        cream: 'var(--cream)',
        oak: 'var(--oak)',
        obsidian: 'var(--obsidian)',
      },
      fontFamily: {
        cinzel: ['var(--font-cinzel)', 'serif'],
        playfair: ['var(--font-playfair)', 'serif'],
        inter: ['var(--font-inter)', 'sans-serif'],
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #D4AF37 0%, #E8CC6A 50%, #A88B1F 100%)',
        'dark-gradient': 'linear-gradient(180deg, #0D0D0D 0%, #1A110B 100%)',
      },
      boxShadow: {
        gold: '0 0 20px rgba(212,175,55,0.4), 0 0 60px rgba(212,175,55,0.1)',
        'gold-sm': '0 0 10px rgba(212,175,55,0.3)',
        'gold-lg': '0 0 40px rgba(212,175,55,0.5), 0 0 80px rgba(212,175,55,0.2)',
      },
      animation: {
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        'pulse-gold': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
