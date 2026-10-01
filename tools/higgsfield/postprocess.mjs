/**
 * Шаг 3. Сжать выбранные клипы через ffmpeg и разложить в public/media/scenes/<id>/
 *   window:          intro.mp4 + intro-poster.webp, loop.mp4 (бесшовная) + poster.webp, transition.mp4
 *   сцены на фото:   live.mp4 + poster.webp (первый кадр) + end.webp (последний кадр), transition.mp4
 *                    пока live нет — poster.webp и end.webp из выбранного фото, чтобы на сайте было фото
 *
 *   node tools/higgsfield/postprocess.mjs                  # все сцены по select.json
 *   node tools/higgsfield/postprocess.mjs --only airport,transfer
 *   флаги: --height 720|1080 (по умолчанию 720), --crf 23
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, here, readJson, args } from './client.mjs';

const opt = args();
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const config = readJson(join(here, 'scenes.json'));
const select = readJson(join(here, 'select.json'), {});
const manifest = readJson(join(OUT, 'manifest.json'), { keyframes: {}, videos: {} });
const dest = join(process.cwd(), 'public', 'media', 'scenes');
const height = Number(opt.height ?? 720);
const crf = String(opt.crf ?? 23);
const only = opt.only ? String(opt.only).split(',').map((s) => s.trim()) : null;

const run = (a) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });

function pickVideo(sceneId, kind) {
  const idx = select[sceneId]?.[kind] ?? 0;
  const item = manifest.videos?.[sceneId]?.[kind]?.[idx];
  return item?.file && existsSync(item.file) ? item.file : null;
}

function pickFrame(sceneId, name) {
  const idx = select[sceneId]?.[name] ?? 0;
  const item = manifest.keyframes?.[sceneId]?.[name]?.[idx];
  return item?.file && existsSync(item.file) ? item.file : null;
}

const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart', '-an'];

function encode(src, out, { trimStart = 0, endAt = 0 } = {}) {
  run([
    ...(trimStart > 0 ? ['-ss', String(trimStart)] : []),
    '-i', src,
    ...(endAt > 0 ? ['-t', String(endAt - trimStart)] : []),
    '-vf', `scale=-2:${height},format=yuv420p`,
    ...x264,
    out,
  ]);
}

/**
 * Где начинается неподвижный хвост клипа (Kling часто держит последний кадр 1–1,5 с).
 * На сайте такой хвост выглядит как зависание, поэтому у переходов его срезаем.
 * Возвращает время начала хвоста или 0, если хвоста нет.
 */
function staticTailStart(src) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', src, '-vf', 'freezedetect=n=-35dB:d=0.3', '-map', '0:v', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const log = `${r.stderr ?? ''}`;
  const starts = [...log.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  // хвост = последняя заморозка, у которой нет конца (длится до конца файла)
  if (starts.length > ends.length) return starts[starts.length - 1];
  return 0;
}

/**
 * Бесшовная петля из клипа с движением в одну сторону (облака): последние D секунд
 * плавно перетекают в начало, длина результата L − D, последний кадр переходит в первый без скачка.
 */
function seamlessLoop(src, out, fade = 1.5) {
  const L = Number(
    execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src]).toString().trim(),
  );
  if (!(L > fade * 2)) throw new Error(`Клип ${src} слишком короткий для петли (${L} с)`);
  const cut = (L - fade).toFixed(3);
  const graph = [
    `[0:v]split[a][b]`,
    `[a]trim=start=0:end=${cut},setpts=PTS-STARTPTS[main]`,
    `[b]trim=start=${cut}:end=${L.toFixed(3)},setpts=PTS-STARTPTS[tail]`,
    `[tail][main]xfade=transition=fade:duration=${fade}:offset=0,scale=-2:${height},format=yuv420p[out]`,
  ].join(';');
  run(['-i', src, '-filter_complex', graph, '-map', '[out]', ...x264, out]);
}

/** Кадр в webp: первый кадр файла или (last=true) последний. Подходит и для видео, и для картинок. */
function still(src, out, { last = false } = {}) {
  run([
    ...(last ? ['-sseof', '-0.25'] : []),
    '-i', src,
    '-update', '1',
    '-frames:v', '1',
    '-vf', `scale=-2:${height}`,
    '-c:v', 'libwebp', '-quality', '82',
    out,
  ]);
}

for (const scene of config.scenes) {
  if (only && !only.includes(scene.id)) continue;
  const dir = join(dest, scene.id);
  mkdirSync(dir, { recursive: true });
  const done = [];

  // --- иллюминатор ---
  const intro = pickVideo(scene.id, 'intro');
  if (intro) {
    const introOut = join(dir, 'intro.mp4');
    encode(intro, introOut, { trimStart: scene.intro?.trimStart ?? 0 });
    still(introOut, join(dir, 'intro-poster.webp'));
    done.push('intro');
  }

  const loop = scene.loop ? pickVideo(scene.id, 'loop') : null;
  if (loop) {
    const loopOut = join(dir, 'loop.mp4');
    if (scene.loop.mode === 'drift') seamlessLoop(loop, loopOut);
    else encode(loop, loopOut);
    still(loopOut, join(dir, 'poster.webp'));
    done.push(scene.loop.mode === 'drift' ? 'loop (бесшовная)' : 'loop');
  }

  // --- сцены на фото: оживление один раз и стоп на последнем кадре ---
  if (scene.live) {
    const live = pickVideo(scene.id, 'live');
    if (live) {
      const liveOut = join(dir, 'live.mp4');
      encode(live, liveOut);
      still(liveOut, join(dir, 'poster.webp'));
      still(liveOut, join(dir, 'end.webp'), { last: true });
      done.push('live');
    } else {
      const photo = pickFrame(scene.id, 'photo');
      if (photo) {
        still(photo, join(dir, 'poster.webp'));
        still(photo, join(dir, 'end.webp'));
        done.push('фото вместо live');
      }
    }
    // старые заглушки-петли этой сцене больше не нужны
    if (existsSync(join(dir, 'loop.mp4'))) rmSync(join(dir, 'loop.mp4'));
  }

  // --- переход к следующей сцене ---
  const transition = scene.transition ? pickVideo(scene.id, 'transition') : null;
  if (transition) {
    const tail = staticTailStart(transition);
    // оставляем 0,15 с неподвижного кадра: последний кадр должен точно совпасть с началом следующей сцены
    encode(transition, join(dir, 'transition.mp4'), { endAt: tail > 0 ? tail + 0.15 : 0 });
    done.push(tail > 0 ? `transition (хвост срезан с ${tail.toFixed(2)} с)` : 'transition');
  } else if (scene.live && existsSync(join(dir, 'transition.mp4'))) {
    // заглушка-переход не соответствует новым кадрам: без него сайт сделает мягкую смену
    rmSync(join(dir, 'transition.mp4'));
  }

  console.log(`${done.length ? '✓' : '–'} ${scene.id}: ${done.join(', ') || 'нечего обрабатывать'}`);
}

console.log('\nГотово: public/media/scenes/. Проверьте главную и закоммитьте.');
