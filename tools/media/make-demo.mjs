/**
 * Ролик-превью начала главной так, как его увидит посетитель: шторка с надписью,
 * открытие, облака, переход в аэропорт, оживление, переход в трансфер, оживление.
 * Скорости как на сайте: открытие ×2, переходы ×1.35. Текст сцен наложен поверх.
 *
 *   node tools/media/make-demo.mjs
 * Результат: tools/higgsfield/out/demo-start.mp4
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const m = (p) => join(process.cwd(), 'public', 'media', 'scenes', p);
const out = join(process.cwd(), 'tools', 'higgsfield', 'out', 'demo-start.mp4');

// путь к шрифту и текстовым файлам — только ASCII, с экранированием двоеточия для ffmpeg
const font = 'C\\:/Windows/Fonts/arialbd.ttf';
const fontReg = 'C\\:/Windows/Fonts/arial.ttf';
const textFile = (name, text) => {
  const p = join(tmpdir(), `adl-demo-${name}.txt`);
  writeFileSync(p, text, 'utf8');
  return p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, '$1\\:');
};

const base = 'scale=1280:720,fps=24,format=yuv420p,setsar=1';
const shadow = 'shadowcolor=black@0.55:shadowx=0:shadowy=2';
const label = (file, size, y, f = font) =>
  `drawtext=fontfile='${f}':textfile='${file}':fontcolor=white:fontsize=${size}:x=(w-text_w)/2+0.009*w:y=${y}:${shadow}`;
// как на сайте: затемнение снизу под текстом сцены
const fade = 'drawbox=x=0:y=ih-300:w=iw:h=300:color=black@0.28:t=fill,drawbox=x=0:y=ih-200:w=iw:h=200:color=black@0.3:t=fill';
const title = (file, sub) =>
  `${fade},drawtext=fontfile='${font}':textfile='${file}':fontcolor=white:fontsize=46:x=80:y=h-230:${shadow},` +
  `drawtext=fontfile='${fontReg}':textfile='${sub}':fontcolor=white@0.85:fontsize=22:x=80:y=h-160:${shadow}`;

const t = {
  shadeLabel: textFile('shade-label', 'ADL Event Services'),
  shadeTitle: textFile('shade-title', 'Добро пожаловать\nв Казахстан'),
  heroA: textFile('hero-a', 'Вы занимаетесь\nбизнесом.'),
  heroB: textFile('hero-b', 'Мы занимаемся\nорганизацией\nвашего\nпребывания.'),
  airport: textFile('airport', 'Встречаем в зале прилёта'),
  airportSub: textFile('airport-sub', 'Сопровождающий с табличкой, помощь с багажом, автомобиль у выхода.'),
  transfer: textFile('transfer', 'Довозим вовремя каждый день'),
  transferSub: textFile('transfer-sub', 'Аэропорт, отель, EXPO, деловые встречи.'),
};

const inputs = [
  '-loop', '1', '-t', '1.5', '-i', m('window/intro-poster.webp'), // 0: закрытая шторка 1,5 с
  '-i', m('window/intro.mp4'), // 1
  '-i', m('window/loop.mp4'), // 2
  '-i', m('window/transition.mp4'), // 3
  '-i', m('airport/live.mp4'), // 4
  '-i', m('airport/transition.mp4'), // 5
  '-i', m('transfer/live.mp4'), // 6
];

const heroText =
  `drawtext=fontfile='${font}':textfile='${t.heroA}':fontcolor=white:fontsize=50:line_spacing=-4:x=80:y=90:${shadow},` +
  `drawtext=fontfile='${font}':textfile='${t.heroB}':fontcolor=white:fontsize=50:line_spacing=-4:x=w-text_w-80:y=h-text_h-170:${shadow}`;

const graph = [
  `[0:v]${base},${label(t.shadeLabel, 15, 'h*0.40', fontReg)},${label(t.shadeTitle, 30, 'h*0.44')}[a]`,
  `[1:v]setpts=PTS/2,${base}[b]`,
  `[2:v]trim=0:3.5,setpts=PTS-STARTPTS,${base},${heroText}[c]`,
  `[3:v]setpts=PTS/1.35,${base}[d]`,
  `[4:v]${base},tpad=stop_mode=clone:stop_duration=1.2,${title(t.airport, t.airportSub)}[e]`,
  `[5:v]setpts=PTS/1.35,${base}[f]`,
  `[6:v]${base},tpad=stop_mode=clone:stop_duration=1.5,${title(t.transfer, t.transferSub)}[g]`,
  `[a][b][c][d][e][f][g]concat=n=7:v=1:a=0[out]`,
].join(';');

execFileSync(
  ffmpeg,
  ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-c:v', 'libx264', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
console.log(`✓ ${out}`);
