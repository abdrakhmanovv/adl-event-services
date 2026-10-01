/**
 * Шаг 3. Сжать выбранные клипы через ffmpeg и разложить в public/media/scenes/<id>/
 *   loop.mp4, transition.mp4, intro.mp4, poster.webp, intro-poster.webp
 *
 *   node tools/higgsfield/postprocess.mjs            # все сцены по select.json
 *   node tools/higgsfield/postprocess.mjs --only hotel
 *   флаги: --height 720|1080 (по умолчанию 720), --crf 23
 *
 * Какие клипы брать — из select.json: { "hotel": { "keyframe": 1, "loop": 0, "transition": 1 } }
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, here, readJson, args } from './client.mjs';

const opt = args();
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const config = readJson(join(here, 'scenes.json'));
const select = readJson(join(here, 'select.json'), {});
const manifest = readJson(join(OUT, 'manifest.json'), { videos: {} });
const dest = join(process.cwd(), 'public', 'media', 'scenes');
const height = Number(opt.height ?? 720);
const crf = String(opt.crf ?? 23);

const run = (a) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });

function pick(sceneId, kind) {
  const idx = select[sceneId]?.[kind] ?? 0;
  const item = manifest.videos[sceneId]?.[kind]?.[idx];
  return item?.file && existsSync(item.file) ? item.file : null;
}

function encode(src, out, { speed = 1, trimStart = 0 } = {}) {
  const filters = [`scale=-2:${height}`, 'format=yuv420p'];
  if (speed !== 1) filters.unshift(`setpts=PTS/${speed}`);
  run([
    ...(trimStart > 0 ? ['-ss', String(trimStart)] : []),
    '-i', src,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high', '-level', '4.0',
    '-movflags', '+faststart', '-an',
    out,
  ]);
}

/**
 * Бесшовная петля из клипа с движением в одну сторону (облака): последние D секунд
 * плавно перетекают в начало, длина результата L − D, последний кадр переходит в первый без скачка.
 */
function seamlessLoop(src, out, fade = 1.5) {
  const L = Number(
    execFileSync(process.env.FFPROBE || 'ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src,
    ]).toString().trim(),
  );
  if (!(L > fade * 2)) throw new Error(`Клип ${src} слишком короткий для петли (${L} с)`);
  const cut = (L - fade).toFixed(3);
  const graph = [
    `[0:v]split[a][b]`,
    `[a]trim=start=0:end=${cut},setpts=PTS-STARTPTS[main]`,
    `[b]trim=start=${cut}:end=${L.toFixed(3)},setpts=PTS-STARTPTS[tail]`,
    `[tail][main]xfade=transition=fade:duration=${fade}:offset=0,scale=-2:${height},format=yuv420p[out]`,
  ].join(';');
  run([
    '-i', src,
    '-filter_complex', graph, '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high', '-level', '4.0',
    '-movflags', '+faststart', '-an',
    out,
  ]);
}

function poster(src, out) {
  run(['-i', src, '-frames:v', '1', '-vf', `scale=-2:${height}`, '-c:v', 'libwebp', '-quality', '82', out]);
}

for (const scene of config.scenes) {
  if (opt.only && opt.only !== scene.id) continue;
  const dir = join(dest, scene.id);
  mkdirSync(dir, { recursive: true });

  const loop = pick(scene.id, 'loop');
  const transition = pick(scene.id, 'transition');
  const intro = pick(scene.id, 'intro');

  if (loop) {
    const loopOut = join(dir, 'loop.mp4');
    if (scene.loop?.mode === 'drift') seamlessLoop(loop, loopOut);
    else encode(loop, loopOut);
    // poster = первый кадр готовой петли: он виден, пока петля не начала играть
    poster(loopOut, join(dir, 'poster.webp'));
    console.log(`✓ ${scene.id}/loop${scene.loop?.mode === 'drift' ? ' (бесшовная)' : ''}`);
  } else console.log(`– ${scene.id}/loop: нет клипа`);

  if (transition) {
    encode(transition, join(dir, 'transition.mp4'));
    console.log(`✓ ${scene.id}/transition`);
  } else if (scene.transition) console.log(`– ${scene.id}/transition: нет клипа`);

  if (intro) {
    // trimStart: срезать неподвижное начало, чтобы шторка двигалась с первого кадра воспроизведения
    const introOut = join(dir, 'intro.mp4');
    encode(intro, introOut, { trimStart: scene.intro?.trimStart ?? 0 });
    poster(introOut, join(dir, 'intro-poster.webp'));
    console.log(`✓ ${scene.id}/intro`);
  }
}

console.log('\nГотово: public/media/scenes/. Проверьте главную и закоммитьте.');
