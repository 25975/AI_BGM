/* 打印编曲文本摘要，人工检查音乐合理性 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console }; ctx.globalThis = ctx;
vm.createContext(ctx);
['js/util.js', 'js/theory.js', 'js/styles.js', 'js/instruments.js', 'js/composer.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
const { composer, theory } = ctx.GBG;

const styleId = process.argv[2] || 'epic';
const seed = process.argv[3] || '4242';
const song = composer.generate({ styleId, seed, bars: 16, form: 'loop', intensity: 2 });

console.log(`\n${song.meta.styleName} | ${song.meta.bpm} BPM | ${song.meta.keyLabel} | ${song.meta.bars} bars | seed ${seed}`);
console.log('sections:', song.sections.map(s => `${s.name}@${s.startBar}+${s.bars}`).join('  '));
console.log('chords:', song.chords.map(c => `${c.bar}:${c.symbol}`).join(' '));
for (const p of song.parts) {
  if (!p.notes.length) { console.log(`\n[${p.name}] 0 notes`); continue; }
  const notes = p.notes.filter(n => n.t < 16 * 4);
  const pitches = notes.map(n => n.midi);
  console.log(`\n[${p.name}] ${p.notes.length} notes, ${p.instrument}, gain ${p.gain.toFixed(2)}, range ${Math.min(...pitches)}-${Math.max(...pitches)}`);
  if (p.role === 'drums') {
    const byBar = {};
    notes.forEach(n => { const b = Math.floor(n.t / 4); (byBar[b] = byBar[b] || []).push(`${n.drum}@${((n.t % 4)).toFixed(2)}`); });
    console.log('  bar0:', (byBar[0] || []).join(' '));
    console.log('  bar1:', (byBar[1] || []).join(' '));
  } else {
    // 按小节打印音高与起拍
    for (let bar = 0; bar < 4; bar++) {
      const ns = notes.filter(n => n.t >= bar * 4 && n.t < bar * 4 + 4);
      console.log(`  bar${bar}: ` + ns.map(n => `${theory.pcName(n.midi % 12)}${Math.floor(n.midi / 12) - 1}@${(n.t - bar * 4).toFixed(2)}/${n.d.toFixed(2)}`).join(' '));
    }
  }
}
