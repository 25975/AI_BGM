/* 导出层单元测试：WAV 编码 / 循环接缝 / manifest / MIDI / ZIP（Node，无浏览器） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/util.js', 'js/theory.js', 'js/styles.js', 'js/instruments.js', 'js/composer.js',
  'js/wav.js', 'js/midi.js', 'js/zip.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
});
const GBG = ctx.GBG;
const { composer, wav, midi, zip } = GBG;

let failures = 0;
function ok(cond, name, info) {
  if (cond) { console.log('  ok  ' + name); }
  else { failures++; console.log('  FAIL ' + name + (info === undefined ? '' : ' -> ' + JSON.stringify(info))); }
}

console.log('\n== WAV 编码 ==');
const sr = 22050;
const n = sr * 2;
const L = new Float32Array(n);
const R = new Float32Array(n);
for (let i = 0; i < n; i++) {
  L[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / sr);
  R[i] = 0.4 * Math.sin(2 * Math.PI * 330 * i / sr);
}
const buf = wav.encode([L, R], {
  sampleRate: sr, bitDepth: 16,
  loop: { startFrame: 0, endFrame: n - 1 },
  title: '单元测试', key: 'C 小调', comment: 'test'
});
const dv = new DataView(buf);
const tag = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
ok(tag(0) === 'RIFF' && tag(8) === 'WAVE', 'RIFF/WAVE 头');
ok(dv.getUint16(20, true) === 1 && dv.getUint16(22, true) === 2, 'PCM 立体声');
ok(dv.getUint16(34, true) === 16, '16-bit');
const bytes = new Uint8Array(buf);
let smplPos = -1;
for (let i = 0; i < bytes.length - 4; i++) {
  if (bytes[i] === 0x73 && bytes[i + 1] === 0x6D && bytes[i + 2] === 0x70 && bytes[i + 3] === 0x6C) { smplPos = i; break; }
}
ok(smplPos > 0, '含 smpl 块', smplPos);
ok(dv.getUint32(smplPos + 36, true) === 1, 'smpl numLoops=1');
ok(dv.getUint32(smplPos + 52, true) === 0, 'smpl start=0');
ok(dv.getUint32(smplPos + 56, true) === n - 1, 'smpl end=n-1');
// INFO 中文 UTF-8
const infoText = Buffer.from(buf).toString('utf8');
ok(infoText.includes('单元测试'), 'INFO 中文 UTF-8');
ok(buf.byteLength > n * 4, '数据长度合理', buf.byteLength);

const buf24 = wav.encode([L, R], { sampleRate: sr, bitDepth: 24, loop: { startFrame: 0, endFrame: n - 1 } });
ok(new DataView(buf24).getUint16(34, true) === 24, '24-bit 编码');

console.log('\n== 循环接缝 ==');
const N = sr * 2;
const src = new Float32Array(N + sr * 0.5);
for (let i = 0; i < src.length; i++) src[i] = 0.35 * Math.sin(2 * Math.PI * 110 * i / sr) + 0.2 * Math.sin(2 * Math.PI * 331 * i / sr);
const folded = wav.foldTail([src, src], N, sr * 0.5, sr);
const d = folded[0];
let maxStep = 0, avgStep = 0;
for (let i = 1; i < d.length; i++) {
  const step = Math.abs(d[i] - d[i - 1]);
  maxStep = Math.max(maxStep, step);
  avgStep += step;
}
avgStep /= (d.length - 1);
ok(d.length === N, '循环长度正确', d.length);
ok(maxStep < 0.25, '首尾衔接无大跳变', { maxStep, avgStep });
ok(Math.abs(d[0] - src[N]) < 1e-6, '开头取自然延续采样');
ok(isFinite(d[N - 1]), '结尾有效');
// 能量不应出现明显空洞
let e0 = 0, e1 = 0;
for (let i = 0; i < 400; i++) { e0 += d[i] * d[i]; e1 += d[N - 400 + i] * d[N - 400 + i]; }
ok(e0 > 1 && e1 > 1, '接缝两侧能量正常', { e0: +e0.toFixed(1), e1: +e1.toFixed(1) });

console.log('\n== Manifest ==');
const song = composer.generate({ styleId: 'cyberpunk', seed: 123, bars: 32, form: 'full', intensity: 2 });
const manFull = wav.buildManifest(song, { sampleRate: sr });
ok(manFull.loop.startSample === Math.round(song.loop.startBar * 4 * 60 / song.meta.bpm * sr), '全曲导出循环点=绝对位置');
const manLoop = wav.buildManifest(song, { sampleRate: sr, offsetBar: song.loop.startBar, toBar: song.loop.endBar, loopOnly: true });
ok(manLoop.loop.startSample === 0, '循环区间导出循环点从 0 开始', manLoop.loop.startSample);
ok(manLoop.loop.endSample === Math.round((song.loop.endBar - song.loop.startBar) * 4 * 60 / song.meta.bpm * sr) - 1, '循环终点正确');
ok(manLoop.export.note.includes('循环区间'), 'manifest 说明循环区间');
ok(manLoop.loop.frame60.end > 0 && manLoop.loop.frame30.end > 0, '帧率换算有效');

console.log('\n== MIDI ==');
const m = midi.write(song);
const md = new DataView(m.buffer);
const mtag = o => String.fromCharCode(m[o], m[o + 1], m[o + 2], m[o + 3]);
ok(mtag(0) === 'MThd', 'MThd');
ok(md.getUint16(8, false) === 1, 'format 1');
const tracks = md.getUint16(10, false);
ok(tracks === song.parts.filter(p => p.notes.length).length + 1, '轨数正确', { tracks });
let marker = false;
const s = Buffer.from(m).toString('latin1');
ok(s.includes('LOOP_START') && s.includes('LOOP_END'), '含循环 Marker');
ok(s.includes('LoopForge'), '含生成器信息');
ok(s.includes('Bass - ') || s.includes('Pad - ') || s.includes('Drums - '), '含 ASCII 声部名');
// 字节全部可解析（结尾 FF 2F）
ok(m[m.length - 3] === 0xFF && m[m.length - 2] === 0x2F, 'End of Track');
ok(s.indexOf('\uFFFD') === -1, '无乱码字符');

console.log('\n== ZIP ==');
const z = zip.build([
  { name: 'a.txt', data: new Uint8Array(Buffer.from('hello')) },
  { name: 'sub/b.bin', data: new Uint8Array([1, 2, 3, 4]) }
]);
ok(z[0] === 0x50 && z[1] === 0x4B, 'PK 头');
const bufStr = Buffer.from(z).toString('latin1');
ok(bufStr.includes('a.txt') && bufStr.includes('sub/b.bin'), '文件名写入');
ok(z.length > 100, 'ZIP 长度合理', z.length);

console.log(failures === 0 ? '\n导出层测试全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures ? 1 : 0);
