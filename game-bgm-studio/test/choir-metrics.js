(async function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  for (var t = 0; t < 150 && !(window.LoopForge && LoopForge.ready()); t++) await wait(100);
  var G = window.GBG;
  var song = G.composer.generate({
    styleId: 'epic', seed: 'choir-2026', bars: 16, intensity: 2, clarity: 0.55
  });
  var choir = song.parts.filter(function (p) { return p.id === 'choir'; })[0];
  var solo = await G.audio.renderRange(song, {
    fromBar: 0, toBar: 16, tailSec: 1, sampleRate: 32000,
    mix: { solo: { choir: true } }
  });
  var full = await G.audio.renderRange(song, {
    fromBar: 0, toBar: 16, tailSec: 1, sampleRate: 32000
  });
  function stats(res) {
    var d = res.channels[0];
    var peak = 0, sum = 0, zc = 0, prev = 0;
    for (var i = 0; i < d.length; i++) {
      var v = d[i];
      if (Math.abs(v) > peak) peak = Math.abs(v);
      sum += v * v;
      if (i > 0 && ((v < 0) !== (prev < 0))) zc++;
      prev = v;
    }
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / d.length).toFixed(4), zcr: +(zc / d.length).toFixed(4) };
  }
  var midis = choir ? choir.notes.map(function (n) { return n.midi; }) : [];
  return {
    songTitle: song.meta.title,
    choirNotes: midis.length,
    choirRange: midis.length ? [Math.min.apply(null, midis), Math.max.apply(null, midis)] : null,
    solo: stats(solo),
    full: stats(full),
    loopBars: song.meta.loopTo - song.meta.loopFrom
  };
})()
