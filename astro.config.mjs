// @ts-check
import { defineConfig } from 'astro/config';

// Сайт опубликован на своём домене adl-service.kz (GitHub Pages + файл public/CNAME),
// поэтому он живёт в корне домена. Переопределить можно переменными SITE_URL и SITE_BASE.
const base = process.env.SITE_BASE ?? '/';
const site = process.env.SITE_URL ?? 'https://adl-service.kz';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  compressHTML: true,
  devToolbar: { enabled: false },
  // старая страница «Погрузка и транспортировка» вошла в «Доставку и логистику»
  redirects: {
    '/logistics': `${base.replace(/\/$/, '')}/delivery/`,
  },
});
