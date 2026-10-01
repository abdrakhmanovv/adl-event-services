/**
 * Шаг 2. Видео через Kling O3 first-last-frame.
 *   intro       — только window: закрытая шторка → открытая
 *   loop        — только window: бесконечная петля облаков (mode drift)
 *   live        — сцены на фото: фото оживает один раз (только первый кадр, конец свободный)
 *   transition  — переход: последний кадр сцены → первый кадр следующей
 *                 у window стартует с keyframe, у сцен на фото — с liveEnd (последний кадр live,
 *                 его делает extract-last.mjs)
 *
 *   node tools/higgsfield/gen-videos.mjs --what live --only airport,transfer
 *   node tools/higgsfield/gen-videos.mjs --what transitions --only window
 *   node tools/higgsfield/gen-videos.mjs --what all
 *   флаги: --mode std|pro|4k (по умолчанию pro), --variants N, --force
 *
 * Какие кадры брать — select.json: { "airport": { "photo": 1, "live": 0, "transition": 0 } }
 */
import { join, extname } from 'node:path';
import { OUT, here, submit, waitFor, resultUrls, download, readJson, args, loadEnv, updateManifest } from './client.mjs';

loadEnv();
const opt = args();
const config = readJson(join(here, 'scenes.json'));
const select = readJson(join(here, 'select.json'), {});
const manifestFile = join(OUT, 'manifest.json');

const ENDPOINT = '/kling-video/o3/first-last-frame';
const what = String(opt.what ?? 'all');
const variants = Number(opt.variants ?? 1);
const mode = String(opt.mode ?? 'pro');
const only = opt.only ? String(opt.only).split(',').map((s) => s.trim()) : null;

const fill = (text) => text.replaceAll('{character}', config.character);
const wants = (kind) => what === 'all' || what === kind || what === `${kind}s`;

/** URL выбранного кадра сцены из manifest (читаем свежий: другие процессы могли дописать). */
function frameUrl(sceneId, name) {
  const manifest = readJson(manifestFile, { keyframes: {} });
  const idx = select[sceneId]?.[name] ?? 0;
  const item = manifest.keyframes?.[sceneId]?.[name]?.[idx];
  if (!item) {
    const hint =
      name === 'photo' ? 'запустите prep-photos.mjs' : name === 'liveEnd' ? 'сначала live и extract-last.mjs' : 'запустите gen-keyframes.mjs';
    throw new Error(`Нет кадра ${sceneId}/${name}[${idx}] — ${hint}`);
  }
  return item.url;
}

/** Первый кадр сцены: фото пользователя или сгенерированный keyframe. */
const startFrame = (scene) => frameUrl(scene.id, scene.photo ? 'photo' : 'keyframe');
/** Кадр, на котором сцена замирает: конец live у фото-сцен, keyframe у иллюминатора. */
const endFrame = (scene) => (scene.live ? frameUrl(scene.id, 'liveEnd') : frameUrl(scene.id, 'keyframe'));

async function generate(sceneId, kind, body) {
  const manifest = readJson(manifestFile, { videos: {} });
  const existing = manifest.videos?.[sceneId]?.[kind] ?? [];
  if (existing.length >= variants && !opt.force) {
    console.log(`• ${sceneId}/${kind}: уже есть ${existing.length}, пропускаю`);
    return;
  }
  const items = opt.force ? [] : [...existing];
  for (let v = items.length; v < variants; v++) {
    console.log(`▶ ${sceneId}/${kind} #${v}: отправляю (${body.duration} с, ${mode})`);
    const job = await submit(ENDPOINT, { mode, aspect_ratio: '16:9', sound: 'off', ...body });
    const done = await waitFor(job.status_url, { label: `${sceneId}/${kind}#${v}` });
    const urls = resultUrls(done);
    if (!urls.length) {
      console.error('  Не нашёл URL в ответе:', JSON.stringify(done).slice(0, 800));
      continue;
    }
    const ext = extname(new URL(urls[0]).pathname) || '.mp4';
    const file = join(OUT, sceneId, `${kind}-${v}${ext}`);
    const size = await download(urls[0], file);
    items.push({ url: urls[0], file, prompt: body.prompt, request_id: job.request_id });
    console.log(`  ✓ ${file} (${Math.round(size / 1024 / 1024)} МБ)`);
    updateManifest((m) => {
      m.videos[sceneId] ??= {};
      m.videos[sceneId][kind] = items;
    });
  }
}

for (let i = 0; i < config.scenes.length; i++) {
  const scene = config.scenes[i];
  const next = config.scenes[i + 1];
  if (only && !only.includes(scene.id)) continue;

  if (wants('intro') && scene.intro) {
    await generate(scene.id, 'intro', {
      first_frame_url: frameUrl(scene.id, scene.intro.from),
      last_frame_url: frameUrl(scene.id, scene.intro.to),
      prompt: fill(scene.intro.prompt),
      duration: scene.intro.duration,
    });
  }

  if (wants('loop') && scene.loop) {
    const url = startFrame(scene);
    const body = { first_frame_url: url, prompt: fill(scene.loop.prompt), duration: scene.loop.duration };
    if (scene.loop.mode !== 'drift') body.last_frame_url = url;
    await generate(scene.id, 'loop', body);
  }

  if (wants('live') && scene.live) {
    await generate(scene.id, 'live', {
      first_frame_url: startFrame(scene),
      prompt: fill(scene.live.prompt),
      duration: scene.live.duration,
    });
  }

  if (wants('transition') && scene.transition && next) {
    await generate(scene.id, 'transition', {
      first_frame_url: endFrame(scene),
      last_frame_url: startFrame(next),
      prompt: fill(scene.transition.prompt),
      duration: scene.transition.duration,
    });
  }
}

console.log('\nГотово. Отсмотрите клипы в tools/higgsfield/out/<scene>/; для переходов после live запустите extract-last.mjs.');
