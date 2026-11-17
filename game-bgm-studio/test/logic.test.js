/* 逻辑冒烟测试：加载纯逻辑模块并生成所有风格 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
['js/util.js', 'js/theory.js', 'js/styles.js', 'js/composer.js', 'js/instruments.js'].forEach(f => {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(code, ctx, { filename: f });
});

const GBG = ctx.GBG;
const { composer, styles, theory, util } = GBG;

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('FAIL: ' + msg); }
}

const report = [];
for (const st of styles.list) {
  const t0 = Date.now();
  const song = composer.generate({
    styleId: st.id, seed: 4242, bpm: Math.round((st.bpm[0] + st.bpm[1]) / 2),
    bars: 32, form: 'full', intensity: 2, density: st.density, complexity: st.complexity
  });
  const ms = Date.now() - t0;
  check(song.parts.length > 0, st.id + ' 无声部');
  check(song.chords.length > 0, st.id + ' 无和弦');
  const noteCount = song.stats.notes;
  check(noteCount > 20, st.id + ' 音符太少 ' + noteCount);
  let bad = 0, maxT = 0;
  const seen = {};
  song.parts.forEach(p => {
    p.notes.forEach(n => {
      if (!isFinite(n.t) || n.t < -0.01 || n.t > song.meta.bars * 4 + 1) bad++;
      if (!isFinite(n.midi) || n.midi < 0 || n.midi > 127) bad++;
      if (!isFinite(n.d) || n.d <= 0 || n.d > 64) bad++;
      if (!isFinite(n.vel) || n.vel <= 0 || n.vel > 1) bad++;
      maxT = Math.max(maxT, n.t + n.d);
      seen[p.id] = (seen[p.id] || 0) + 1;
    });
  });
  check(bad === 0, st.id + ' 非法音符 ' + bad);
  check(song.loop.startBar >= 0 && song.loop.endBar <= song.meta.bars, st.id + ' 循环点非法');
  const chordBars = song.chords.length;
  report.push({
    style: st.id, notes: noteCount, parts: song.parts.length, chords: chordBars,
    ms, loop: song.loop.startBar + '-' + song.loop.endBar, dur: Math.round(song.stats.durationSec),
    perPart: seen
  });
}

// 确定性
const a = composer.generate({ styleId: 'cyberpunk', seed: 12345, bars: 32 });
const b = composer.generate({ styleId: 'cyberpunk', seed: 12345, bars: 32 });
const sig = s => s.parts.map(p => p.notes.map(n => n.midi + '@' + n.t.toFixed(3)).join(',')).join('|');
check(sig(a) === sig(b), '同种子结果不一致');
const c = composer.generate({ styleId: 'cyberpunk', seed: 12346, bars: 32 });
check(sig(a) !== sig(c), '不同种子结果相同');

// 强度分层
for (const inten of [0, 1, 2, 3]) {
  const s = composer.generate({ styleId: 'epic', seed: 999, bars: 32, intensity: inten, form: 'loop' });
  const notes = s.parts.filter(p => p.notes.length > 0).map(p => p.id + ':' + p.notes.length).join(' ');
  console.log(`intensity ${inten}: ${notes}`);
}

// 和声/音域检查
styles.list.forEach(st => {
  const s = composer.generate({ styleId: st.id, seed: 7, bars: 32, intensity: 3 });
  s.chords.forEach(ch => {
    check(ch.pcs.length >= 3, st.id + ' 和弦音数不足 ' + ch.symbol);
    check(ch.voicing.length >= 3, st.id + ' 和弦排列不足 ' + ch.symbol);
    check(ch.voicing.every(m => m >= 30 && m <= 90), st.id + ' 和弦音域异常 ' + ch.voicing);
  });
});

// 清晰度：音符更少、同时发声更少、主旋律不被裁剪、种子可复现
function polyphony(song) {
  const slots = song.meta.bars * 16;
  let total = 0;
  for (let s = 0; s < slots; s++) {
    const t = s / 4;
    const sounding = new Set();
    song.parts.forEach(p => {
      if (p.notes.some(n => n.t <= t && t < n.t + n.d)) sounding.add(p.id);
    });
    total += sounding.size;
  }
  return total / slots;
}
['epic', 'cyberpunk', 'battle', 'lofi'].forEach(id => {
  const full = composer.generate({ styleId: id, seed: 99, bars: 32, clarity: 0 });
  const clean = composer.generate({ styleId: id, seed: 99, bars: 32, clarity: 0.7 });
  check(clean.stats.notes < full.stats.notes * 0.85, id + ' 清晰度未降低音符数');
  check(polyphony(clean) < polyphony(full) * 0.85, id + ' 清晰度未降低同时声部数');
  const leadCount = s => s.parts.filter(p => p.role === 'lead').reduce((a, p) => a + p.notes.length, 0);
  check(leadCount(clean) === leadCount(full), id + ' 主旋律被误删');
  const again = composer.generate({ styleId: id, seed: 99, bars: 32, clarity: 0.7 });
  check(JSON.stringify(again.parts.map(p => p.notes.length)) === JSON.stringify(clean.parts.map(p => p.notes.length)), id + ' 清晰度结果不可复现');
});

// 非法 / 缺失参数（旧分享链接）兜底
const bad = composer.generate({
  styleId: 'epic', seed: 1, bars: NaN, bpm: NaN, rootPc: NaN,
  density: NaN, complexity: NaN, clarity: NaN, intensity: NaN, swing: NaN
});
check(bad.stats.notes > 0, '非法参数仍能生成');
check(isFinite(bad.meta.bpm) && isFinite(bad.meta.clarity) && isFinite(bad.meta.intensity), '非法参数被修正');
check(bad.parts.every(p => p.notes.every(n => isFinite(n.t) && isFinite(n.midi) && isFinite(n.vel))), '非法参数不产生 NaN 音符');

console.table(report);
console.log(failures === 0 ? '\n所有逻辑测试通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures ? 1 : 0);
