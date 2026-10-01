/**
 * Последний кадр выбранного live-клипа → загрузка в Higgsfield → manifest.keyframes[scene].liveEnd.
 * С этого кадра начинается переход к следующей сцене, поэтому стык «замерло → поехало» не виден.
 *
 *   node tools/higgsfield/extract-last.mjs --only airport,transfer
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, here, readJson, args, loadEnv, uploadFile, updateManifest } from './client.mjs';

loadEnv();
const opt = args();
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const config = readJson(join(here, 'scenes.json'));
const select = readJson(join(here, 'select.json'), {});
const only = opt.only ? String(opt.only).split(',').map((s) => s.trim()) : null;

for (const scene of config.scenes) {
  if (!scene.live) continue;
  if (only && !only.includes(scene.id)) continue;
  const manifest = readJson(join(OUT, 'manifest.json'), { videos: {} });
  const idx = select[scene.id]?.live ?? 0;
  const clip = manifest.videos?.[scene.id]?.live?.[idx]?.file;
  if (!clip || !existsSync(clip)) {
    console.log(`– ${scene.id}: нет live-клипа, пропускаю`);
    continue;
  }
  const out = join(OUT, scene.id, `live-end-${idx}.png`);
  // -sseof: читать с конца файла, берём самый последний кадр
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-sseof', '-0.25', '-i', clip, '-update', '1', '-q:v', '1', out]);
  const url = await uploadFile(out);
  updateManifest((m) => {
    m.keyframes[scene.id] ??= {};
    m.keyframes[scene.id].liveEnd = [{ url, file: out, fromClip: clip }];
  });
  console.log(`✓ ${scene.id}: последний кадр live → ${out}`);
}
