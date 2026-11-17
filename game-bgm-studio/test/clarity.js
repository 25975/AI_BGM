/* 编曲精简效果对比：音符数 / 同时发声声部数 / 每小节鼓点数 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console }; ctx.globalThis = ctx;
vm.createContext(ctx);
['js/util.js', 'js/theory.js', 'js/styles.js', 'js/instruments.js', 'js/composer.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
const { composer } = ctx.GBG;

function metrics(song) {
  const bars = song.meta.bars;
  const slots = bars * 16;
  let sumNotes = 0, sumParts = 0, maxNotes = 0, maxParts = 0;
  for (let s = 0; s < slots; s++) {
    const t = s / 4;
    let n = 0, p = 0;
    song.parts.forEach(part => {
      if (!part.notes.length) return;
      let hit = false;
      for (const note of part.notes) {
        if (note.t <= t && t < note.t + note.d) { n++; hit = true; }
      }
      if (hit) p++;
    });
    sumNotes += n; sumParts += p;
    maxNotes = Math.max(maxNotes, n); maxParts = Math.max(maxParts, p);
  }
  const drums = song.parts.find(p => p.role === 'drums');
  return {
    notes: song.stats.notes,
    avgNotes: +(sumNotes / slots).toFixed(2),
    maxNotes,
    avgParts: +(sumParts / slots).toFixed(2),
    maxParts,
    drumsPerBar: drums ? +(drums.notes.length / bars).toFixed(1) : 0,
    lead: (song.parts.find(p => p.role === 'lead') || { notes: [] }).notes.length
  };
}

const ids = process.argv.slice(2);
const list = ids.length ? ids : ['epic', 'cyberpunk', 'battle', 'chiptune', 'jazz', 'lofi', 'tribal', 'horror'];
console.log('style      clarity  notes  avgN maxN avgP maxP drums/bar lead');
for (const id of list) {
  for (const c of [0, 0.55, 0.8]) {
    const song = composer.generate({ styleId: id, seed: 4242, bars: 32, form: 'loop', intensity: 2, clarity: c });
    const m = metrics(song);
    console.log(`${id.padEnd(10)} ${String(c).padEnd(7)} ${String(m.notes).padEnd(5)} ${String(m.avgNotes).padEnd(5)} ${String(m.maxNotes).padEnd(4)} ${String(m.avgParts).padEnd(4)} ${String(m.maxParts).padEnd(4)} ${String(m.drumsPerBar).padEnd(9)} ${m.lead}`);
    if (song.parts.some(p => p.notes.some(n => !isFinite(n.vel) || n.vel <= 0 || n.vel > 1))) console.log('  !! invalid velocity');
  }
}
