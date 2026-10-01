/**
 * Ролик-превью главной так, как её увидит посетитель: шторка с надписью, открытие,
 * облака, затем по очереди все сцены (оживление и короткая пауза) и переходы между ними.
 * Скорости как на сайте: открытие ×2, переходы ×1.35. Текст сцен наложен поверх.
 *
 *   node tools/media/make-demo.mjs
 * Результат: tools/higgsfield/out/demo-full.mp4
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const m = (p) => join(process.cwd(), 'public', 'media', 'scenes', p);
const out = join(process.cwd(), 'tools', 'higgsfield', 'out', 'demo-full.mp4');

// путь к шрифту и текстовым файлам — только ASCII, с экранированием двоеточия для ffmpeg
const font = 'C\\:/Windows/Fonts/arialbd.ttf';
const fontReg = 'C\\:/Windows/Fonts/arial.ttf';
let n = 0;
const textFile = (text) => {
  const p = join(tmpdir(), `adl-demo-${n++}.txt`);
  writeFileSync(p, text, 'utf8');
  return p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, '$1\\:');
};

const base = 'scale=1280:720,fps=24,format=yuv420p,setsar=1';
const shadow = 'shadowcolor=black@0.55:shadowx=0:shadowy=2';
// как на сайте: затемнение снизу под текстом сцены
const fade = 'drawbox=x=0:y=ih-300:w=iw:h=300:color=black@0.28:t=fill,drawbox=x=0:y=ih-200:w=iw:h=200:color=black@0.3:t=fill';
const title = (head, sub) =>
  `${fade},drawtext=fontfile='${font}':textfile='${textFile(head)}':fontcolor=white:fontsize=46:x=80:y=h-230:${shadow},` +
  `drawtext=fontfile='${fontReg}':textfile='${textFile(sub)}':fontcolor=white@0.85:fontsize=22:x=80:y=h-160:${shadow}`;

const scenes = [
  { id: 'airport', head: 'Встречаем в зале прилёта', sub: 'Сопровождающий с табличкой, помощь с багажом, автомобиль у выхода.' },
  { id: 'transfer', head: 'Довозим вовремя каждый день', sub: 'Аэропорт, отель, EXPO, деловые встречи.' },
  { id: 'hotel', head: 'Номера забронированы заранее', sub: 'Отели рядом с площадкой, единый счёт, координатор на ресепшн.' },
  { id: 'expo', head: 'Оборудование на стенде к нужному часу', sub: 'Доставка, погрузка, перенос и вывоз оборудования.' },
  { id: 'evening', head: 'После деловой программы', sub: 'Ужины, встречи, знакомство с городом.' },
  { id: 'departure', head: 'Провожаем в аэропорт', sub: 'Обратный трансфер и закрывающие документы. Один координатор от прилёта до вылета.' },
];

const inputs = [];
const chains = [];
const labels = [];
const add = (args, filter) => {
  const i = inputs.filter((a) => a === '-i').length;
  inputs.push(...args);
  const label = `s${labels.length}`;
  chains.push(`[${i}:v]${filter}[${label}]`);
  labels.push(`[${label}]`);
};

// иллюминатор
const shadeLabel = textFile('ADL Event Services');
const shadeTitle = textFile('Добро пожаловать\nв Казахстан');
add(
  ['-loop', '1', '-t', '1.5', '-i', m('window/intro-poster.webp')],
  `${base},drawtext=fontfile='${fontReg}':textfile='${shadeLabel}':fontcolor=white:fontsize=15:x=(w-text_w)/2+0.009*w:y=h*0.40:${shadow},` +
    `drawtext=fontfile='${font}':textfile='${shadeTitle}':fontcolor=white:fontsize=30:x=(w-text_w)/2+0.009*w:y=h*0.44:${shadow}`,
);
add(['-i', m('window/intro.mp4')], `setpts=PTS/2,${base}`);
add(
  ['-i', m('window/loop.mp4')],
  `trim=0:3.5,setpts=PTS-STARTPTS,${base},` +
    `drawtext=fontfile='${font}':textfile='${textFile('Вы занимаетесь\nбизнесом.')}':fontcolor=white:fontsize=50:line_spacing=-4:x=80:y=90:${shadow},` +
    `drawtext=fontfile='${font}':textfile='${textFile('Мы занимаемся\nорганизацией\nвашего\nпребывания.')}':fontcolor=white:fontsize=50:line_spacing=-4:x=w-text_w-80:y=h-text_h-170:${shadow}`,
);
add(['-i', m('window/transition.mp4')], `setpts=PTS/1.35,${base}`);

// сцены на фото
for (const s of scenes) {
  if (!existsSync(m(`${s.id}/live.mp4`))) continue;
  add(['-i', m(`${s.id}/live.mp4`)], `${base},tpad=stop_mode=clone:stop_duration=1.2,${title(s.head, s.sub)}`);
  if (existsSync(m(`${s.id}/transition.mp4`))) add(['-i', m(`${s.id}/transition.mp4`)], `setpts=PTS/1.35,${base}`);
}

const graph = `${chains.join(';')};${labels.join('')}concat=n=${labels.length}:v=1:a=0[out]`;
execFileSync(
  ffmpeg,
  ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-c:v', 'libx264', '-crf', '22', '-preset', 'medium', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
console.log(`✓ ${out}`);
