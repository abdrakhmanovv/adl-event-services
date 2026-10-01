/**
 * Шаг 1 для сцен на фото пользователя.
 *   1) обрезает фото до 16:9 (scenes.json → crop.y задаёт отступ сверху, иначе по центру);
 *   2) загружает в Higgsfield → manifest.keyframes[scene].photo[0];
 *   3) если есть clean — правит через Qwen (убрать надписи и т.п.) → photo[1].
 *
 *   node tools/higgsfield/prep-photos.mjs                  # все сцены с фото
 *   node tools/higgsfield/prep-photos.mjs --only airport,transfer
 *   node tools/higgsfield/prep-photos.mjs --only hotel --force   # заново
 *
 * Какой вариант брать дальше — select.json → photo (0 исходник, 1 очищенный).
 */
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { OUT, here, readJson, args, loadEnv, uploadFile, editImage, download, updateManifest } from './client.mjs';

loadEnv();
const opt = args();
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const config = readJson(join(here, 'scenes.json'));
const root = join(here, '..', '..');
const only = opt.only ? String(opt.only).split(',').map((s) => s.trim()) : null;

const even = (n) => Math.floor(n / 2) * 2;

for (const scene of config.scenes) {
  if (!scene.photo) continue;
  if (only && !only.includes(scene.id)) continue;

  const manifest = readJson(join(OUT, 'manifest.json'), { keyframes: {} });
  const have = manifest.keyframes?.[scene.id]?.photo ?? [];
  const cleanMissing = Boolean(scene.clean) && have.length < 2;
  if (have.length && !cleanMissing && !opt.force) {
    console.log(`• ${scene.id}: фото уже подготовлено (${have.length} вар.), пропускаю`);
    continue;
  }

  const dir = join(OUT, scene.id);
  mkdirSync(dir, { recursive: true });
  let items;
  let url0;

  if (have.length && !opt.force) {
    // исходник уже загружен в прошлый раз, осталось только почистить
    items = [have[0]];
    url0 = have[0].url;
    console.log(`▶ ${scene.id}: исходник есть, делаю только чистку`);
  } else {
    // 1. обрезка до 16:9
    const src = join(root, scene.photo);
    const [w, h] = execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src])
      .toString()
      .trim()
      .split(',')
      .map(Number);
    let cw = even(w);
    let ch = even((w * 9) / 16);
    if (ch > h) {
      ch = even(h);
      cw = even((h * 16) / 9);
    }
    const x = Math.min(scene.crop?.x ?? even((w - cw) / 2), w - cw);
    const y = Math.min(scene.crop?.y ?? even((h - ch) / 2), h - ch);
    const cropped = join(dir, 'photo-0.jpg');
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-vf', `crop=${cw}:${ch}:${x}:${y}`, '-q:v', '2', cropped]);
    console.log(`▶ ${scene.id}: ${w}×${h} → ${cw}×${ch} (x ${x}, y ${y})`);

    // 2. загрузка исходника
    url0 = await uploadFile(cropped);
    items = [{ url: url0, file: cropped, source: scene.photo }];
    console.log(`  ✓ загружено photo-0`);
  }

  const save = () =>
    updateManifest((m) => {
      m.keyframes[scene.id] ??= {};
      m.keyframes[scene.id].photo = items;
    });
  save();

  // 3. чистка надписей. Ссылку на результат сохраняем до скачивания: правка платная,
  // и обрыв сети при скачивании не должен её терять.
  if (scene.clean) {
    const { url, request_id } = await editImage([url0], scene.clean, `${scene.id}/clean`);
    const ext = extname(new URL(url).pathname) || '.png';
    const file = join(dir, `photo-1${ext}`);
    items.push({ url, file, prompt: scene.clean, request_id, editedFrom: 'photo:0' });
    save();
    await download(url, file);
    console.log(`  ✓ очищенный вариант photo-1`);
  }
}

console.log('\nГотово. Проверьте out/<scene>/photo-*.{jpg,png}; в select.json → photo выберите 0 или 1.');
