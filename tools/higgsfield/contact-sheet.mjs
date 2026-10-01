/**
 * Лист-превью: до четырёх кадров сцены сеткой 2×2 с номерами 1–4 в углу.
 *
 *   node tools/higgsfield/contact-sheet.mjs                    # все сцены, кадры keyframe-0..3
 *   node tools/higgsfield/contact-sheet.mjs --only hotel
 *   node tools/higgsfield/contact-sheet.mjs --only window --name closed
 *
 * Результат: tools/higgsfield/out/<scene>/contact-<name>.jpg
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, here, readJson, args } from './client.mjs';

const opt = args();
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const config = readJson(join(here, 'scenes.json'));
const name = String(opt.name ?? 'keyframe');
const font = 'C\\:/Windows/Fonts/arialbd.ttf';

const label = (n) =>
  `scale=960:540,drawtext=fontfile='${font}':text='${n}':x=28:y=20:fontsize=64:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14`;

for (const scene of config.scenes) {
  if (opt.only && opt.only !== scene.id) continue;
  const dir = join(OUT, scene.id);
  const files = [0, 1, 2, 3].map((i) => join(dir, `${name}-${i}.png`)).filter(existsSync);
  if (files.length === 0) {
    console.log(`– ${scene.id}: нет кадров ${name}-*.png`);
    continue;
  }
  // недостающие ячейки заполняем чёрным, чтобы сетка всегда была 2×2
  const inputs = [];
  files.forEach((f) => inputs.push('-i', f));
  for (let i = files.length; i < 4; i++) inputs.push('-f', 'lavfi', '-i', 'color=c=black:s=960x540:d=1');
  const chains = [0, 1, 2, 3].map((i) => `[${i}:v]${i < files.length ? label(i + 1) : 'scale=960:540'}[v${i}]`);
  const graph = `${chains.join(';')};[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0`;
  const out = join(dir, `contact-${name}.jpg`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-frames:v', '1', '-q:v', '3', out], {
    stdio: 'inherit',
  });
  console.log(`✓ ${out}`);
}
