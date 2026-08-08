/**
 * Tailwind v4 は PostCSS プラグイン1つで動く。
 * v3 までの tailwind.config.js は要らない（色などの設定は app/globals.css に書く）
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
