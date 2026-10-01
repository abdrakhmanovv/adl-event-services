/**
 * Редактирование готового кадра через Qwen Image 3 Edit: та же камера и композиция,
 * меняется только то, что описано в промпте. Можно дать второй кадр как референс.
 *
 *   node tools/higgsfield/edit-frame.mjs --scene window --from keyframe:1 --ref keyframe:0 \
 *        --as keyframe --prompt "..."
 *
 *   --from  имя:индекс кадра из manifest.json, который редактируем (image 1)
 *   --ref   имя:индекс кадра-референса (image 2), необязательно
 *   --as    под каким именем сохранить результат (добавится в конец списка)
 *   --prompt  что изменить
 *
 * Результат: out/<scene>/<as>-<n>.png и новая запись в manifest.json. Номер печатается в конце.
 */
import { join, extname } from 'node:path';
import { OUT, submit, waitFor, resultUrls, download, readJson, writeJson, args, loadEnv } from './client.mjs';

loadEnv();
const opt = args();
const manifestFile = join(OUT, 'manifest.json');
const manifest = readJson(manifestFile, { keyframes: {}, videos: {} });

const scene = String(opt.scene ?? '');
const as = String(opt.as ?? 'edit');
const prompt = String(opt.prompt ?? '');
if (!scene || !opt.from || !prompt) {
  console.error('Нужны --scene, --from имя:индекс и --prompt');
  process.exit(1);
}

const frame = (spec) => {
  const [name, idx] = String(spec).split(':');
  const item = manifest.keyframes[scene]?.[name]?.[Number(idx ?? 0)];
  if (!item) throw new Error(`Нет кадра ${scene}/${spec} в manifest.json`);
  return item.url;
};

const image_urls = [frame(opt.from)];
if (opt.ref) image_urls.push(frame(opt.ref));

console.log(`▶ ${scene}: редактирую ${opt.from}${opt.ref ? ` с референсом ${opt.ref}` : ''} → ${as}`);
const job = await submit('/alibaba/qwen-image-3/edit', {
  prompt,
  image_urls,
  resolution: '2k',
  aspect_ratio: '16:9',
  negative_prompt:
    'text, letters, logo, watermark, different camera angle, different framing, cropped, zoomed, extra windows, people, distorted',
});
const done = await waitFor(job.status_url, { label: `${scene}/${as}` });
const urls = resultUrls(done);
if (!urls.length) {
  console.error('Не нашёл URL в ответе:', JSON.stringify(done).slice(0, 800));
  process.exit(1);
}

manifest.keyframes[scene] ??= {};
manifest.keyframes[scene][as] ??= [];
const list = manifest.keyframes[scene][as];
const index = list.length;
const ext = extname(new URL(urls[0]).pathname) || '.png';
const file = join(OUT, scene, `${as}-${index}${ext}`);
const size = await download(urls[0], file);
list.push({ url: urls[0], file, prompt, request_id: job.request_id, editedFrom: opt.from, ref: opt.ref ?? null });
writeJson(manifestFile, manifest);
console.log(`  ✓ ${file} (${Math.round(size / 1024)} КБ)`);
console.log(`INDEX ${as}:${index}`);
