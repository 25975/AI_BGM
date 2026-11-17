/* 从 samples/raw 生成 js/samples-data.js（FluidR3_GM 采样，CC BY 3.0） */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'samples', 'raw');
const OUT = path.join(ROOT, 'js', 'samples-data.js');
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToMidi(name) {
  const m = /^([A-G])([b#]?)(-?\d+)$/.exec(name);
  if (!m) throw new Error('bad note name: ' + name);
  const acc = m[2] === 'b' ? -1 : (m[2] === '#' ? 1 : 0);
  return 12 * (parseInt(m[3], 10) + 1) + PC[m[1]] + acc;
}

const banks = {};
let total = 0;
for (const bank of fs.readdirSync(RAW).sort()) {
  const dir = path.join(RAW, bank);
  if (!fs.statSync(dir).isDirectory()) continue;
  banks[bank] = {};
  for (const file of fs.readdirSync(dir).filter(f => /\.mp3$/i.test(f)).sort()) {
    const note = path.basename(file, path.extname(file));
    const midi = noteToMidi(note);
    banks[bank][midi] = fs.readFileSync(path.join(dir, file)).toString('base64');
    total++;
  }
}

const meta = {
  source: 'https://github.com/gleitz/midi-js-soundfonts',
  soundfont: 'FluidR3_GM',
  license: 'CC BY 3.0',
  credit: 'FluidR3_GM SoundFont by Frank Wen; rendered samples via MIDI.js soundfonts'
};

const body = '/* 自动生成：node tools/make-samples-data.js — 不要手改 */\n' +
  'window.GBG_SAMPLE_DATA = ' + JSON.stringify(banks) + ';\n' +
  'window.GBG_SAMPLE_META = ' + JSON.stringify(meta) + ';\n';

fs.writeFileSync(OUT, body, 'utf8');
console.log('wrote ' + OUT + '  banks=' + Object.keys(banks).length + '  samples=' + total +
  '  ' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
