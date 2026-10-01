/**
 * Минимальный клиент Higgsfield API без зависимостей (Node 18+).
 * Ключи берутся из tools/higgsfield/.env:
 *   HF_API_KEY_ID=...
 *   HF_API_KEY_SECRET=...
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = dirname(fileURLToPath(import.meta.url));
export const OUT = join(here, 'out');
export const API = 'https://api.higgsfield.ai';

export function loadEnv() {
  const file = join(here, '.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const id = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) {
    console.error('Нет ключей. Создайте tools/higgsfield/.env по образцу .env.example');
    process.exit(1);
  }
  return { id, secret };
}

/** fetch с повторами при сетевых сбоях и ответах 5xx/429: 4 попытки, пауза растёт. */
async function fetchRetry(url, init, tries = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastErr = err;
    }
    if (attempt < tries) {
      const wait = 2000 * attempt;
      process.stdout.write(`  сеть: ${lastErr?.cause?.code || lastErr?.message}, повтор через ${wait / 1000} с\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function headers() {
  const { id, secret } = loadEnv();
  return {
    Authorization: `Key ${id}:${secret}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** Отправить задачу. Возвращает { request_id, status_url, cancel_url, status }. */
export async function submit(endpoint, body) {
  const url = endpoint.startsWith('http') ? endpoint : `${API}${endpoint}`;
  const res = await fetchRetry(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Higgsfield ${res.status} на ${endpoint}: ${text.slice(0, 600)}`);
  }
  return json;
}

/** Ждать завершения задачи по status_url. */
export async function waitFor(statusUrl, { interval = 5000, timeout = 15 * 60 * 1000, label = '' } = {}) {
  const started = Date.now();
  let lastStatus = '';
  while (Date.now() - started < timeout) {
    const res = await fetchRetry(statusUrl, { headers: headers() });
    const json = await res.json().catch(() => ({}));
    const status = String(json.status || '').toLowerCase();
    if (status !== lastStatus) {
      process.stdout.write(`  ${label} ${status || res.status}\n`);
      lastStatus = status;
    }
    if (['completed', 'succeeded', 'success', 'done'].includes(status)) return json;
    if (['failed', 'error', 'cancelled', 'canceled', 'nsfw'].includes(status)) {
      throw new Error(`Задача завершилась со статусом ${status}: ${JSON.stringify(json).slice(0, 600)}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Таймаут ожидания ${statusUrl}`);
}

/** Достать URL результата из ответа любой модели. */
export function resultUrls(json) {
  const urls = [];
  const push = (v) => {
    if (!v) return;
    if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === 'object') {
      if (v.url) urls.push(v.url);
      else Object.values(v).forEach(push);
    }
  };
  push(json.images);
  push(json.image);
  push(json.video);
  push(json.videos);
  push(json.output);
  push(json.result);
  return Array.from(new Set(urls));
}

/** Скачать файл. Повторяет целиком (запрос и чтение тела): обрыв бывает и посреди скачивания. */
export async function download(url, dest, tries = 5) {
  mkdirSync(dirname(dest), { recursive: true });
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buf);
      return buf.length;
    } catch (err) {
      lastErr = err;
      if (attempt < tries) {
        const wait = 2000 * attempt;
        process.stdout.write(`  скачивание: ${err?.cause?.code || err?.message}, повтор через ${wait / 1000} с\n`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`Не скачалось ${url}: ${lastErr?.message}`);
}

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export const MANIFEST = join(OUT, 'manifest.json');

/**
 * Изменить manifest.json безопасно для параллельных процессов: перечитать свежую версию
 * с диска, применить правку и сразу записать. Возвращает обновлённый manifest.
 */
export function updateManifest(fn) {
  const fresh = readJson(MANIFEST, { keyframes: {}, videos: {} });
  fresh.keyframes ??= {};
  fresh.videos ??= {};
  fn(fresh);
  writeJson(MANIFEST, fresh);
  return fresh;
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

/**
 * Загрузить локальный файл в хранилище Higgsfield и получить публичную ссылку для моделей.
 * POST /files/generate-upload-url → PUT файла по upload_url → public_url.
 */
export async function uploadFile(file) {
  const type = MIME[extname(file).toLowerCase()];
  if (!type) throw new Error(`Неподдерживаемый формат для загрузки: ${file}`);
  const res = await fetchRetry(`${API}/files/generate-upload-url`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ content_type: type }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.upload_url || !json.public_url) {
    throw new Error(`Не удалось получить ссылку для загрузки (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  // ключи API в хранилище не отправляем: только заголовки, которые выдал сервер
  const put = await fetchRetry(json.upload_url, {
    method: 'PUT',
    headers: json.upload_headers ?? { 'Content-Type': type },
    body: readFileSync(file),
  });
  if (!put.ok) throw new Error(`Загрузка ${file} не удалась: HTTP ${put.status}`);
  return json.public_url;
}

/** Правка изображения через Qwen Image 3 Edit. Возвращает URL результата. */
export async function editImage(imageUrls, prompt, label = 'edit') {
  const job = await submit('/alibaba/qwen-image-3/edit', {
    prompt,
    image_urls: imageUrls,
    resolution: '2k',
    aspect_ratio: '16:9',
    negative_prompt:
      'text, letters, words, logo, watermark, caption, different camera angle, different framing, cropped, zoomed, extra people, distorted faces, extra fingers',
  });
  const done = await waitFor(job.status_url, { label });
  const urls = resultUrls(done);
  if (!urls.length) throw new Error(`Правка ${label} не вернула изображение: ${JSON.stringify(done).slice(0, 400)}`);
  return { url: urls[0], request_id: job.request_id };
}

/** Разбор аргументов вида --only window --variants 2 --force */
export function args() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const key = a[i].slice(2);
      const next = a[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else out[key] = true;
    }
  }
  return out;
}
