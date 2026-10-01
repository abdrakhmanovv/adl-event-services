/**
 * Шаг 1. Кадры сцен через Soul V2 (текст → изображение).
 *
 *   node tools/higgsfield/gen-keyframes.mjs                # все сцены, по 4 варианта
 *   node tools/higgsfield/gen-keyframes.mjs --only hotel   # одна сцена
 *   node tools/higgsfield/gen-keyframes.mjs --variants 1   # экономно
 *   node tools/higgsfield/gen-keyframes.mjs --force        # перегенерировать, даже если уже есть
 *
 * Результат: tools/higgsfield/out/<scene>/keyframe-<n>.<ext> и запись в out/manifest.json
 */
import { join, extname } from 'node:path';
import { OUT, here, submit, waitFor, resultUrls, download, readJson, writeJson, args, loadEnv } from './client.mjs';

loadEnv();
const opt = args();
const config = readJson(join(here, 'scenes.json'));
const manifestFile = join(OUT, 'manifest.json');
const manifest = readJson(manifestFile, { keyframes: {}, videos: {} });

const ENDPOINT = '/higgsfield-ai/soul/v2/standard';
const variants = Number(opt.variants ?? 4) === 1 ? 1 : 4; // API принимает batch_size 1 или 4

const fill = (text) => text.replaceAll('{character}', config.character);

async function generate(sceneId, name, prompt) {
  manifest.keyframes[sceneId] ??= {};
  if (manifest.keyframes[sceneId][name]?.length && !opt.force) {
    console.log(`• ${sceneId}/${name}: уже есть, пропускаю (--force чтобы пересоздать)`);
    return;
  }
  const fullPrompt = `${config.style}. ${fill(prompt)}`;
  console.log(`▶ ${sceneId}/${name}: отправляю (${variants} вар.)`);
  const job = await submit(ENDPOINT, {
    prompt: fullPrompt,
    aspect_ratio: '16:9',
    resolution: '1080p',
    batch_size: variants,
    enhance_prompt: false,
  });
  const done = await waitFor(job.status_url, { label: `${sceneId}/${name}` });
  const urls = resultUrls(done);
  if (!urls.length) {
    console.error('  Не нашёл URL в ответе:', JSON.stringify(done).slice(0, 800));
    return;
  }
  const items = [];
  for (let i = 0; i < urls.length; i++) {
    const ext = extname(new URL(urls[i]).pathname) || '.jpg';
    const file = join(OUT, sceneId, `${name}-${i}${ext}`);
    const size = await download(urls[i], file);
    items.push({ url: urls[i], file, prompt: fullPrompt, request_id: job.request_id });
    console.log(`  ✓ ${file} (${Math.round(size / 1024)} КБ)`);
  }
  manifest.keyframes[sceneId][name] = items;
  writeJson(manifestFile, manifest);
}

for (const scene of config.scenes) {
  if (opt.only && opt.only !== scene.id) continue;
  if (!scene.keyframe) continue; // сцены на фото пользователя кадры не генерируют
  await generate(scene.id, 'keyframe', scene.keyframe);
  for (const [name, prompt] of Object.entries(scene.extraKeyframes ?? {})) {
    await generate(scene.id, name, prompt);
  }
}

console.log('\nГотово. Отсмотрите кадры в tools/higgsfield/out/<scene>/ и укажите выбранные в select.json');
