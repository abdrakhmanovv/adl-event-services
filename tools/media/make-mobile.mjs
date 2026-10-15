/**
 * Лёгкие версии клипов и кадров для телефона в вертикальном положении.
 *
 * На вертикальном экране видна только узкая полоса широкого кадра, а скачивать весь кадр
 * незачем. Скрипт вырезает из готовых файлов сцены полосу 9:16 вокруг точки фокуса
 * (focus сцены в src/content/ru/home.ts) и сжимает её чуть сильнее: файлы в 3–4 раза легче.
 * В переходах сдвиг от фокуса этой сцены к фокусу следующей вшивается прямо в видео,
 * с той же плавностью, что раньше делал браузер.
 *
 *   node tools/media/make-mobile.mjs                 # все сцены
 *   node tools/media/make-mobile.mjs --only hotel,expo
 *
 * Берёт файлы из public/media/scenes/<id>/ и кладёт рядом версии с суффиксом -m.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const root = process.cwd();
const media = join(root, 'public', 'media', 'scenes');

const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? argv[onlyIdx + 1].split(',').map((s) => s.trim()) : null;

// размер полосы: 9:16 при высоте 720 (как у клипов для компьютера)
const MW = 406;
const MH = 720;
const CRF = '26';

// порядок сцен и фокусы — из того же файла, что читает сайт
const homeTs = readFileSync(join(root, 'src', 'content', 'ru', 'home.ts'), 'utf8');
const order = [];
const focus = {};
for (const m of homeTs.matchAll(/media:\s*'([\w-]+)',\s*\r?\n\s*focus:\s*([\d.]+)/g)) {
  order.push(m[1]);
  focus[m[1]] = Number(m[2]);
}
if (!order.length) throw new Error('Не нашёл focus сцен в src/content/ru/home.ts');

const run = (a) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
const duration = (f) =>
  Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString().trim());
const kb = (f) => Math.round(statSync(f).size / 1024);

const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart', '-an'];

/** Горизонтальная позиция полосы: фокус f (0…1) в центре полосы, не выходя за края кадра. */
const xAt = (f) => `clip(iw*${f}-ow/2,0,iw-ow)`;

/**
 * Позиция полосы в переходе: от фокуса f0 к f1 во второй половине движения
 * (с 25% до 90% длительности), плавно в начале и в конце — как делал браузер.
 */
const xPan = (f0, f1, d) => {
  const u = `clip((t/${d.toFixed(3)}-0.25)/0.65,0,1)`;
  return `clip(iw*(${f0}+(${(f1 - f0).toFixed(4)})*(pow(${u},2)*(3-2*${u})))-ow/2,0,iw-ow)`;
};

function cropVideo(src, out, x) {
  run(['-i', src, '-vf', `scale=-2:${MH},crop=${MW}:${MH}:'${x}':0,format=yuv420p`, ...x264, out]);
}

function cropStill(src, out, f, { last = false } = {}) {
  run([
    ...(last ? ['-sseof', '-0.25'] : []),
    '-i', src,
    '-update', '1',
    '-frames:v', '1',
    '-vf', `scale=-2:${MH},crop=${MW}:${MH}:'${xAt(f)}':0`,
    '-c:v', 'libwebp', '-quality', '80',
    out,
  ]);
}

let before = 0;
let after = 0;

for (let i = 0; i < order.length; i++) {
  const id = order[i];
  if (only && !only.includes(id)) continue;
  const dir = join(media, id);
  if (!existsSync(dir)) continue;
  const f = focus[id];
  const fNext = focus[order[i + 1]] ?? f;
  const file = (n) => join(dir, n);
  const done = [];

  const pair = (desktop, mobile) => {
    before += kb(desktop);
    after += kb(mobile);
    done.push(`${mobile.split(/[\\/]/).pop()} ${kb(desktop)}→${kb(mobile)} КБ`);
  };

  if (existsSync(file('intro.mp4'))) {
    cropVideo(file('intro.mp4'), file('intro-m.mp4'), xAt(f));
    cropStill(file('intro-m.mp4'), file('intro-poster-m.webp'), 0.5); // уже вырезано — берём как есть
    pair(file('intro.mp4'), file('intro-m.mp4'));
  }

  if (existsSync(file('loop.mp4'))) {
    cropVideo(file('loop.mp4'), file('loop-m.mp4'), xAt(f));
    cropStill(file('loop-m.mp4'), file('poster-m.webp'), 0.5);
    pair(file('loop.mp4'), file('loop-m.mp4'));
  }

  if (existsSync(file('live.mp4'))) {
    cropVideo(file('live.mp4'), file('live-m.mp4'), xAt(f));
    cropStill(file('live-m.mp4'), file('poster-m.webp'), 0.5);
    cropStill(file('live-m.mp4'), file('end-m.webp'), 0.5, { last: true });
    pair(file('live.mp4'), file('live-m.mp4'));
  } else if (!existsSync(file('loop.mp4')) && existsSync(file('poster.webp'))) {
    // сцена пока без оживления — просто фото
    cropStill(file('poster.webp'), file('poster-m.webp'), f);
    if (existsSync(file('end.webp'))) cropStill(file('end.webp'), file('end-m.webp'), f);
    done.push('фото');
  }

  if (existsSync(file('transition.mp4'))) {
    const d = duration(file('transition.mp4'));
    cropVideo(file('transition.mp4'), file('transition-m.mp4'), fNext === f ? xAt(f) : xPan(f, fNext, d));
    pair(file('transition.mp4'), file('transition-m.mp4'));
  }

  console.log(`✓ ${id} (фокус ${f}${fNext !== f ? ` → ${fNext}` : ''}): ${done.join(', ')}`);
}

if (before) console.log(`\nВидео для телефона: ${Math.round(before / 1024 * 10) / 10} МБ → ${Math.round(after / 1024 * 10) / 10} МБ`);
