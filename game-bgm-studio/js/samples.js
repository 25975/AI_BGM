/* ==========================================================================
 * samples.js — FluidR3_GM 真实乐器采样层
 * 采样授权：CC BY 3.0，FluidR3_GM SoundFont by Frank Wen
 * 有采样时优先用真实录音；解码失败 / 未加载时自动回退到程序化合成
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;
  var DATA = global.GBG_SAMPLE_DATA || {};
  var META = global.GBG_SAMPLE_META || {};

  var banks = null;          // { bank: [{midi, buf, loop}] }
  var loadPromise = null;
  var decodeCtx = null;

  var TARGET = {
    string_ensemble_1: 0.62,
    choir_aahs: 0.55,
    brass_section: 0.62,
    voice_oohs: 0.55,
    cello: 0.6,
    pizzicato_strings: 0.7,
    timpani: 0.8
  };

  var total = 0;
  Object.keys(DATA).forEach(function (b) {
    total += Object.keys(DATA[b]).length;
  });

  function getDecodeCtx() {
    if (decodeCtx) return decodeCtx;
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (OAC) {
      decodeCtx = new OAC(1, 1, 44100);
    } else {
      var AC = global.AudioContext || global.webkitAudioContext;
      decodeCtx = new AC();
    }
    return decodeCtx;
  }

  function decodeBase64(b64) {
    var bin = global.atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Promise(function (resolve, reject) {
      var ctx = getDecodeCtx();
      if (ctx.decodeAudioData.length > 1) {
        ctx.decodeAudioData(arr.buffer, resolve, reject);
      } else {
        ctx.decodeAudioData(arr.buffer).then(resolve, reject);
      }
    });
  }

  function normalize(buf, bank) {
    var target = TARGET[bank] || 0.6;
    var peak = 0;
    var ch, i, d;
    for (ch = 0; ch < buf.numberOfChannels; ch++) {
      d = buf.getChannelData(ch);
      for (i = 0; i < d.length; i++) {
        var v = Math.abs(d[i]);
        if (v > peak) peak = v;
      }
    }
    if (peak < 0.0005) return;
    var gain = Math.min(10, target / peak);
    for (ch = 0; ch < buf.numberOfChannels; ch++) {
      d = buf.getChannelData(ch);
      for (i = 0; i < d.length; i++) d[i] *= gain;
    }
  }

  function findZero(d, from, to) {
    from = Math.max(1, from);
    to = Math.min(d.length - 1, to);
    for (var i = from; i <= to; i++) {
      if (d[i - 1] <= 0 && d[i] > 0) return i;
    }
    return Math.max(from, Math.min(to, from));
  }

  function makeLoop(buf) {
    var sr = buf.sampleRate;
    var d = buf.getChannelData(0);
    var n = d.length;
    var start = Math.floor(n * 0.46);
    var end = Math.floor(n * 0.84);
    start = findZero(d, start, Math.min(n - 1, start + Math.floor(sr * 0.12)));
    end = findZero(d, Math.max(start + 1, end - Math.floor(sr * 0.12)), Math.min(n - 1, end));
    if (end - start < sr * 0.2) {
      start = Math.floor(n * 0.35);
      end = Math.floor(n * 0.75);
    }
    return { start: start / sr, end: end / sr };
  }

  function load() {
    if (loadPromise) return loadPromise;
    var names = Object.keys(DATA);
    if (!names.length) {
      loadPromise = Promise.resolve(null);
      return loadPromise;
    }
    var result = {};
    var jobs = [];
    names.forEach(function (bank) {
      result[bank] = [];
      Object.keys(DATA[bank]).forEach(function (key) {
        jobs.push(decodeBase64(DATA[bank][key]).then(function (buf) {
          normalize(buf, bank);
          result[bank].push({ midi: parseInt(key, 10), buf: buf, loop: makeLoop(buf) });
        }));
      });
    });
    loadPromise = Promise.all(jobs).then(function () {
      Object.keys(result).forEach(function (bank) {
        result[bank].sort(function (a, b) { return a.midi - b.midi; });
      });
      banks = result;
      return banks;
    }).catch(function (err) {
      loadPromise = null;
      throw err;
    });
    return loadPromise;
  }

  function canPlay(bank) {
    return !!(banks && banks[bank] && banks[bank].length);
  }

  function nearest(bank, midi) {
    var list = banks[bank];
    if (!list || !list.length) return null;
    var best = list[0], bestD = Math.abs(midi - best.midi);
    for (var i = 1; i < list.length; i++) {
      var dd = Math.abs(midi - list[i].midi);
      if (dd < bestD) { best = list[i]; bestD = dd; }
    }
    return best;
  }

  function connectTail(ctx, out, buses, inst, opts) {
    var tail = out;
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = U.clamp(opts.pan || 0, -1, 1);
      out.connect(p);
      tail = p;
    }
    var rev = opts.sends && opts.sends.rev !== undefined ? opts.sends.rev : inst.sendRev;
    var dly = opts.sends && opts.sends.dly !== undefined ? opts.sends.dly : inst.sendDly;
    if (buses.reverb && rev > 0.001) {
      var rg = ctx.createGain(); rg.gain.value = rev;
      tail.connect(rg); rg.connect(buses.reverb);
    }
    if (buses.delay && dly > 0.001) {
      var dg = ctx.createGain(); dg.gain.value = dly;
      tail.connect(dg); dg.connect(buses.delay);
    }
    tail.connect(buses.input || buses.dry || ctx.destination);
  }

  function playSample(ctx, buses, inst, midi, when, dur, vel, opts) {
    opts = opts || {};
    var spec = inst.sample;
    if (!spec || !canPlay(spec.bank)) return null;
    var s = nearest(spec.bank, midi);
    if (!s) return null;

    var t0 = Math.max(when, ctx.currentTime + 0.002);
    var end = t0 + Math.max(0.05, dur);
    var stopAt = end + (inst.env.r || 0.6) + 0.12;
    var rate = Math.pow(2, (midi - s.midi) / 12);
    var gain = inst.gain * (0.3 + 0.7 * vel) * (opts.gain || 1) * (spec.gain === undefined ? 1 : spec.gain);

    var out = ctx.createGain();
    connectTail(ctx, out, buses, inst, opts);

    var src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = U.clamp(rate, 0.5, 2);
    var useLoop = !!spec.loop && dur > 0.45;
    if (useLoop) {
      src.loop = true;
      src.loopStart = s.loop.start;
      src.loopEnd = Math.max(s.loop.start + 0.1, s.loop.end);
    }

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(16000, 7000 + 6000 * vel);
    lp.Q.value = 0.35;
    var chain = src;
    if (spec.low) {
      var low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = spec.low.freq || 120;
      low.gain.value = spec.low.gain === undefined ? 3 : spec.low.gain;
      chain.connect(low);
      chain = low;
    }
    chain.connect(lp);
    lp.connect(out);

    var atk = Math.max(0.004, Math.min(inst.sample.attack === undefined ? 0.02 : inst.sample.attack, dur * 0.5));
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(gain, t0 + atk);
    out.gain.setTargetAtTime(gain * (inst.env.s || 0.9), t0 + atk, 0.08);
    out.gain.setTargetAtTime(0.0001, Math.max(t0 + 0.02, end), Math.max(0.02, (inst.env.r || 0.5) / 3.5));

    src.start(t0);
    src.stop(stopAt);
    return { sources: [src], gain: out, end: stopAt };
  }

  function playTimpani(ctx, buses, midi, when, vel, opts) {
    opts = opts || {};
    if (!canPlay('timpani')) return null;
    var s = nearest('timpani', midi || 48);
    if (!s) return null;
    var t0 = Math.max(when, ctx.currentTime + 0.002);
    var rate = Math.pow(2, ((midi || 48) - s.midi) / 12);
    var out = ctx.createGain();
    connectTail(ctx, out, buses, { sendRev: 0.22, sendDly: 0 }, opts);
    var src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = U.clamp(rate, 0.5, 2);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    var low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 85;
    low.gain.value = 3;
    src.connect(low);
    low.connect(lp);
    lp.connect(out);
    var peak = 0.8 * (0.3 + 0.7 * vel);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(peak, t0 + 0.003);
    out.gain.setTargetAtTime(0.0001, t0 + 0.03, 0.5);
    src.start(t0);
    src.stop(t0 + 3.2);
    return { sources: [src], gain: out, end: t0 + 3.2 };
  }

  GBG.samples = {
    load: load,
    ready: function () { return loadPromise || load(); },
    canPlay: canPlay,
    count: function () {
      var n = 0;
      Object.keys(banks || {}).forEach(function (b) { n += banks[b].length; });
      return n;
    },
    total: total,
    meta: META,
    play: playSample,
    playTimpani: playTimpani
  };
})(typeof window !== 'undefined' ? window : globalThis);
