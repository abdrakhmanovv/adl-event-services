/**
 * Минимальный клиент Higgsfield API без зависимостей (Node 18+).
 * Ключи берутся из tools/higgsfield/.env:
 *   HF_API_KEY_ID=...
 *   HF_API_KEY_SECRET=...
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
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
    const res = await fetch(statusUrl, { headers: headers() });
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

export async function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не скачалось ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
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
