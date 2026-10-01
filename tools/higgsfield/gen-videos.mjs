/**
 * Шаг 2. Видео между кадрами через Kling O3 first-last-frame.
 *   loop       — первый кадр = последний кадр = выбранный кадр сцены (зацикленный фон)
 *   transition — первый кадр = кадр сцены N, последний = кадр сцены N+1
 *   intro      — только для window: закрытая шторка → открытая
 *
 *   node tools/higgsfield/gen-videos.mjs --what loops
 *   node tools/higgsfield/gen-videos.mjs --what transitions --only airport
 *   node tools/higgsfield/gen-videos.mjs --what intro
 *   node tools/higgsfield/gen-videos.mjs --what all --variants 2
 *   флаги: --mode std|pro|4k (по умолчанию pro), --force
 *
 * Какие кадры брать — из select.json: { "window": { "keyframe": 2, "closed": 0 }, "airport": { "keyframe": 1 } }
 */
import { join, extname } from 'node:path';
import { OUT, here, submit, waitFor, resultUrls, download, readJson, writeJson, args, loadEnv } from './client.mjs';

loadEnv();
const opt = args();
const config = readJson(join(here, 'scenes.json'));
const select = readJson(join(here, 'select.json'), {});
const manifestFile = join(OUT, 'manifest.json');
const manifest = readJson(manifestFile, { keyframes: {}, videos: {} });

const ENDPOINT = '/kling-video/o3/first-last-frame';
const what = String(opt.what ?? 'all');
const variants = Number(opt.variants ?? 1);
const mode = String(opt.mode ?? 'pro');

const fill = (text) => text.replaceAll('{character}', config.character);

function frameUrl(sceneId, name = 'keyframe') {
  const idx = select[sceneId]?.[name] ?? 0;
  const item = manifest.keyframes[sceneId]?.[name]?.[idx];
  if (!item) throw new Error(`Нет кадра ${sceneId}/${name}[${idx}] — сначала gen-keyframes и select.json`);
  return item.url;
}

async function generate(sceneId, kind, body) {
  manifest.videos[sceneId] ??= {};
  const existing = manifest.videos[sceneId][kind] ?? [];
  if (existing.length >= variants && !opt.force) {
    console.log(`• ${sceneId}/${kind}: уже есть ${existing.length}, пропускаю`);
    return;
  }
  const items = opt.force ? [] : existing;
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
    manifest.videos[sceneId][kind] = items;
    writeJson(manifestFile, manifest);
  }
}

for (let i = 0; i < config.scenes.length; i++) {
  const scene = config.scenes[i];
  const next = config.scenes[i + 1];
  if (opt.only && opt.only !== scene.id) continue;

  if ((what === 'all' || what === 'intro') && scene.intro) {
    await generate(scene.id, 'intro', {
      first_frame_url: frameUrl(scene.id, scene.intro.from),
      last_frame_url: frameUrl(scene.id, scene.intro.to === 'keyframe' ? 'keyframe' : scene.intro.to),
      prompt: fill(scene.intro.prompt),
      duration: scene.intro.duration,
    });
  }

  if ((what === 'all' || what === 'loops') && scene.loop) {
    const url = frameUrl(scene.id);
    // mode "drift": свободное движение в одну сторону (облака), шов петли потом закрывает postprocess.
    // По умолчанию первый кадр = последний: люди и свет слегка двигаются и возвращаются.
    const body = {
      first_frame_url: url,
      prompt: fill(scene.loop.prompt),
      duration: scene.loop.duration,
    };
    if (scene.loop.mode !== 'drift') body.last_frame_url = url;
    await generate(scene.id, 'loop', body);
  }

  if ((what === 'all' || what === 'transitions') && scene.transition && next) {
    await generate(scene.id, 'transition', {
      first_frame_url: frameUrl(scene.id),
      last_frame_url: frameUrl(next.id),
      prompt: fill(scene.transition.prompt),
      duration: scene.transition.duration,
    });
  }
}

console.log('\nГотово. Отсмотрите клипы в tools/higgsfield/out/<scene>/, укажите выбранные в select.json и запустите postprocess.mjs');
