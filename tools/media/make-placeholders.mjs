/**
 * Временные заглушки медиа для проверки плеера сцен, пока нет клипов из Higgsfield.
 * Делает для каждой сцены poster.webp, loop.mp4, transition.mp4 (кроме последней),
 * а для первой ещё intro-poster.webp и intro.mp4.
 *
 *   node tools/media/make-placeholders.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const out = join(process.cwd(), 'public', 'media', 'scenes');

const scenes = [
  { id: 'window', color: '0x3a2f27' },
  { id: 'airport', color: '0x2a3a44' },
  { id: 'transfer', color: '0x1f2a33' },
  { id: 'hotel', color: '0x4a3a2c' },
  { id: 'expo', color: '0x243b3d' },
  { id: 'evening', color: '0x2c2540' },
  { id: 'departure', color: '0x27313a' },
];

const run = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const size = '1280x720';

scenes.forEach((s, i) => {
  const dir = join(out, s.id);
  mkdirSync(dir, { recursive: true });
  const next = scenes[i + 1];

  // фоновая петля: медленно «дышащий» градиент
  run([
    '-f', 'lavfi', '-i', `color=c=${s.color}:s=${size}:d=5:r=30`,
    '-vf', `geq=r='r(X,Y)+20*sin(2*PI*T/5+X/300)':g='g(X,Y)+20*sin(2*PI*T/5+Y/300)':b='b(X,Y)+20*sin(2*PI*T/5)'`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-movflags', '+faststart', '-an',
    join(dir, 'loop.mp4'),
  ]);
  run(['-i', join(dir, 'loop.mp4'), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '85', join(dir, 'poster.webp')]);

  if (next) {
    // переход: резкий зум и уход в цвет следующей сцены
    run([
      '-f', 'lavfi', '-i', `color=c=${s.color}:s=${size}:d=2:r=30`,
      '-vf', `zoompan=z='1+1.5*in/60':d=1:s=${size}:fps=30,fade=t=out:st=1.2:d=0.8:color=${next.color}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-movflags', '+faststart', '-an',
      join(dir, 'transition.mp4'),
    ]);
  }

  if (i === 0) {
    // интро: из тёмного «закрытой шторки» в цвет сцены
    run([
      '-f', 'lavfi', '-i', `color=c=0x141110:s=${size}:d=1.6:r=30`,
      '-vf', `fade=t=out:st=0.4:d=1.2:color=${s.color}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-movflags', '+faststart', '-an',
      join(dir, 'intro.mp4'),
    ]);
    run(['-i', join(dir, 'intro.mp4'), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '85', join(dir, 'intro-poster.webp')]);
  }
  console.log(`✓ ${s.id}`);
});

if (!existsSync(out)) console.error('Папка не создана?');
