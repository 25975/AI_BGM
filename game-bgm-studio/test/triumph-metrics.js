(async function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  for (var t = 0; t < 150 && !(window.LoopForge && LoopForge.ready()); t++) await wait(100);
  var G = window.GBG;
  var song = G.composer.generate({
    styleId: 'triumph', seed: 'victory-test', bars: 16, intensity: 2, clarity: 0.55
  });
  function stats(res) {
    var d = res.channels[0];
    var peak = 0, sum = 0;
    for (var i = 0; i < d.length; i++) {
      var v = d[i];
      if (Math.abs(v) > peak) peak = Math.abs(v);
      sum += v * v;
    }
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  }
  var full = await G.audio.renderRange(song, {
    fromBar: 0, toBar: 16, tailSec: 1, sampleRate: 22050
  });
  var solos = {};
  for (var id of ['solo', 'ost', 'choir', 'brass']) {
    var r = await G.audio.renderRange(song, {
      fromBar: 0, toBar: 16, tailSec: 1, sampleRate: 22050,
      mix: { solo: (function () { var o = {}; o[id] = true; return o; })() }
    });
    var s = stats(r);
    var part = song.parts.filter(function (p) { return p.id === id; })[0];
    s.notes = part ? part.notes.length : 0;
    solos[id] = s;
  }
  return {
    title: song.meta.title,
    style: song.meta.styleId,
    bpm: song.meta.bpm,
    bars: song.meta.bars,
    parts: song.parts.map(function (p) { return { id: p.id, name: p.name, role: p.role, inst: p.instrument, notes: p.notes.length }; }),
    full: stats(full),
    solos: solos
  };
})()
