// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages публикует проектный сайт по адресу https://<login>.github.io/<repo>/,
// поэтому base = имя репозитория. В GitHub Actions оба значения берутся из окружения.
// При переезде на свой домен задайте SITE_URL=https://ваш-домен и SITE_BASE=/ (или создайте CNAME).
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const owner = process.env.GITHUB_REPOSITORY_OWNER;

const base = process.env.SITE_BASE ?? (repo ? `/${repo}` : '/adl-event-services');
const site = process.env.SITE_URL ?? (owner ? `https://${owner}.github.io` : 'http://127.0.0.1:4321');

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
