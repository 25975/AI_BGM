/* 纯逻辑测试：预设配方、确定性、WAV、ZIP（不依赖浏览器） */
'use strict';

const path = require('path');
require(path.join(__dirname, '..', 'js', 'util.js'));
require(path.join(__dirname, '..', 'js', 'wav.js'));
require(path.join(__dirname, '..', 'js', 'zip.js'));
require(path.join(__dirname, '..', 'js', 'presets.js'));

const SFX = globalThis.SFX;
const P = SFX.presets;
const U = SFX.util;

let pass = 0;
const failures = [];
function check(ok, name, info) {
  if (ok) { pass++; return true; }
  failures.push({ name: name, info: info });
  return false;
}

function walkNumbers(value, pathStr, bad) {
  if (typeof value === 'number') {
    if (!isFinite(value)) bad.push(pathStr + '=' + value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkNumbers(v, pathStr + '[' + i + ']', bad));
    return;
  }
  Object.keys(value).forEach(k => walkNumbers(value[k], pathStr + '.' + k, bad));
}

/* ---------------- 基础 ---------------- */
check(P.CATEGORIES.length === 7, '7 个类别');
check(P.list.length >= 60, '预设数量 >= 60', { count: P.list.length });
check(Object.keys(P.STYLES).length === 4, '4 种风格');

const ids = new Set();
P.list.forEach(p => {
  check(!ids.has(p.id), '预设 id 唯一: ' + p.id);
  ids.add(p.id);
  check(!!P.byId(p.id), 'byId: ' + p.id);
  check(p.dur[0] > 0 && p.dur[1] >= p.dur[0], '时长范围: ' + p.id);
  check(P.byCategory(p.cat).indexOf(p) >= 0, '分类归属: ' + p.id);
});

/* ---------------- 全部预设 × 风格 × 种子 ---------------- */
const styles = Object.keys(P.STYLES);
const seeds = [1, 42, 987654];
let specCount = 0;
P.list.forEach(preset => {
  styles.forEach(style => {
    seeds.forEach(seed => {
      const recipe = P.makeRecipe(preset.id, { seed: seed, style: style });
      let spec;
      try { spec = P.buildSpec(recipe); } catch (e) {
        check(false, '构建失败: ' + preset.id + '/' + style + '/' + seed, e.message);
        return;
      }
      specCount++;
      const label = preset.id + '/' + style + '/' + seed;
      check(spec.layers.length > 0, '有层: ' + label);
      check(isFinite(spec.duration) && spec.duration >= 0.05 && spec.duration <= 5,
        '时长合法: ' + label, spec.duration);
      check(isFinite(spec.fx.reverb) && spec.fx.reverb >= 0 && spec.fx.reverb <= 1,
        '混响范围: ' + label, spec.fx.reverb);
      const bad = [];
      walkNumbers(spec.layers, 'layers', bad);
      check(bad.length === 0, '层参数有限: ' + label, bad.slice(0, 4));
      spec.layers.forEach((l, li) => {
        check(['noise', 'tone', 'metal'].indexOf(l.type) >= 0, '层类型: ' + label + '#' + li, l.type);
        check(isFinite(l.dur) && l.dur > 0, '层时长: ' + label + '#' + li, l.dur);
        check(isFinite(l.gain) && l.gain >= 0, '层增益: ' + label + '#' + li, l.gain);
        check(isFinite(l.t) && l.t >= 0, '层起点: ' + label + '#' + li, l.t);
      });
    });
  });
});
console.log('已构建配方 ' + specCount + ' 份');

/* ---------------- 确定性 ---------------- */
const r1 = P.makeRecipe('skill_fire_impact', { seed: 12345, style: 'dark' });
const r2 = P.makeRecipe('skill_fire_impact', { seed: 12345, style: 'dark' });
check(JSON.stringify(P.buildSpec(r1).layers) === JSON.stringify(P.buildSpec(r2).layers), '同种子同参数可复现');
const r3 = P.makeRecipe('skill_fire_impact', { seed: 12346, style: 'dark' });
check(JSON.stringify(P.buildSpec(r1).layers) !== JSON.stringify(P.buildSpec(r3).layers), '不同种子产生不同结果');

/* ---------------- 参数影响 ---------------- */
function firstToneF0(spec) {
  for (const l of spec.layers) if (l.type === 'tone') return l.f0;
  return null;
}
const low = P.buildSpec(P.makeRecipe('ui_confirm', {
  seed: 7, style: 'realistic', macros: Object.assign(P.defaultMacros(P.byId('ui_confirm')), { pitch: -6 })
}));
const high = P.buildSpec(P.makeRecipe('ui_confirm', {
  seed: 7, style: 'realistic', macros: Object.assign(P.defaultMacros(P.byId('ui_confirm')), { pitch: 6 })
}));
const fLow = firstToneF0(low), fHigh = firstToneF0(high);
check(fLow > 0 && fHigh / fLow > 1.9 && fHigh / fLow < 2.1, '音高 +12 半音（-6 → +6）约翻倍', { fLow, fHigh });

// 8 个打击变体必须在音高 / 长度 / 泛音上有可听差异
const impactVariants = [];
for (let vi = 0; vi < 8; vi++) {
  impactVariants.push(P.buildSpec(P.makeRecipe('blade_light', { seed: 1000 + vi * 7919 })));
}
const bodyF0s = impactVariants.map(firstToneF0);
const f0Ratio = Math.max(...bodyF0s) / Math.min(...bodyF0s);
const durRatio = Math.max(...impactVariants.map(s => s.duration)) / Math.min(...impactVariants.map(s => s.duration));
const ringBases = impactVariants.map(s => {
  const l = s.layers.filter(x => x.type === 'metal')[0];
  return l ? Math.round(l.base) : 0;
});
check(f0Ratio > 1.12, '打击变体音高有差异', f0Ratio);
check(durRatio > 1.15, '打击变体长度有差异', durRatio);
check(new Set(ringBases).size >= 4, '打击变体泛音有差异', ringBases);

const basePitchSpec = P.buildSpec(P.makeRecipe('blade_light', {
  seed: 123, style: 'realistic', macros: Object.assign(P.defaultMacros(P.byId('blade_light')), { pitch: 5 })
}));
check(basePitchSpec.meta.macros.pitch === 5, 'meta 保留用户设定的音高');
check(basePitchSpec.meta.actualMacros && basePitchSpec.meta.actualMacros.pitch !== undefined, 'meta 记录实际抖动后的参数');

const realistic = P.buildSpec(P.makeRecipe('monster_growl', { seed: 3, style: 'realistic' }));
const pixel = P.buildSpec(P.makeRecipe('monster_growl', { seed: 3, style: 'pixel' }));
check(pixel.fx.reverb < realistic.fx.reverb, '像素风格混响更少');

const preset = P.byId('blade_light');
const defaultRecipe = P.makeRecipe(preset.id, { seed: 5 });
check(Math.abs(defaultRecipe.macros.weight - preset.defaults.weight) < 1e-9, '默认宏参数取预设值');

// 波形覆盖
const squareSpec = P.buildSpec(P.makeRecipe('ui_confirm', { seed: 11, waveform: 'square' }));
check(squareSpec.meta.waveform === 'square', '波形覆盖写入 meta', squareSpec.meta.waveform);
const sineSpec = P.buildSpec(P.makeRecipe('ui_confirm', { seed: 11, waveform: 'sine' }));
check(sineSpec.meta.waveform === 'sine', '正弦波形覆盖');
check(squareSpec.meta.macros.pitch === sineSpec.meta.macros.pitch, '波形不改变宏参数');
const autoSpec = P.buildSpec(P.makeRecipe('ui_confirm', { seed: 11 }));
check(autoSpec.meta.waveform === 'auto', '默认波形为自动');

/* ---------------- WAV ---------------- */
const sr = 44100;
const n = 4410;
const ch = new Float32Array(n);
for (let i = 0; i < n; i++) ch[i] = Math.sin(2 * Math.PI * 440 * i / sr) * 0.5;
const wav16 = SFX.wav.encode([ch], { sampleRate: sr, bitDepth: 16 });
const v16 = new DataView(wav16);
check(String.fromCharCode(v16.getUint8(0), v16.getUint8(1), v16.getUint8(2), v16.getUint8(3)) === 'RIFF', 'WAV RIFF');
check(String.fromCharCode(v16.getUint8(8), v16.getUint8(9), v16.getUint8(10), v16.getUint8(11)) === 'WAVE', 'WAV WAVE');
const dataIdx = (() => {
  for (let i = 12; i < wav16.byteLength - 8; i++) {
    if (v16.getUint8(i) === 100 && v16.getUint8(i + 1) === 97 && v16.getUint8(i + 2) === 116 && v16.getUint8(i + 3) === 97) return i;
  }
  return -1;
})();
check(dataIdx > 0, 'WAV 找到 data 块');
check(v16.getUint32(dataIdx + 4, true) === n * 2, 'WAV 16-bit 数据长度', v16.getUint32(dataIdx + 4, true));

const wav24 = SFX.wav.encode([ch], { sampleRate: sr, bitDepth: 24 });
const v24 = new DataView(wav24);
const dataIdx24 = (() => {
  for (let i = 12; i < wav24.byteLength - 8; i++) {
    if (v24.getUint8(i) === 100 && v24.getUint8(i + 1) === 97 && v24.getUint8(i + 2) === 116 && v24.getUint8(i + 3) === 97) return i;
  }
  return -1;
})();
check(dataIdx24 > 0 && v24.getUint32(dataIdx24 + 4, true) === n * 3, 'WAV 24-bit 数据长度');

const norm = SFX.wav.normalize([ch], -1);
check(Math.abs(SFX.wav.peakOf(norm) - Math.pow(10, -1 / 20)) < 0.002, '峰值归一化 -1 dBFS');

/* ---------------- ZIP ---------------- */
check(SFX.zip.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'CRC32 已知值');
const zip = SFX.zip.build([
  { name: 'SFX/a.wav', data: new Uint8Array([1, 2, 3, 4]) },
  { name: 'SFX/中文.txt', data: new TextEncoder().encode('测试') }
]);
const zv = new DataView(zip.buffer);
check(zv.getUint32(0, true) === 0x04034B50, 'ZIP 本地文件头');
const eocd = zip.length - 22;
check(zv.getUint32(eocd, true) === 0x06054B50, 'ZIP EOCD');
check(zv.getUint16(eocd + 10, true) === 2, 'ZIP 文件数');

/* ---------------- 汇总 ---------------- */
console.log('\n通过 ' + pass + ' 项');
if (failures.length) {
  console.log('失败 ' + failures.length + ' 项：');
  failures.slice(0, 20).forEach(f => console.log('  ✗ ' + f.name + (f.info !== undefined ? '  ' + JSON.stringify(f.info) : '')));
  process.exitCode = 1;
} else {
  console.log('全部逻辑测试通过 ✅');
}
