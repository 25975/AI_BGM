/* ==========================================================================
 * engine.js — Web Audio 合成与离线渲染
 * 把 presets.js 生成的「层描述」渲染成 PCM，再交给 WAV 导出或试听。
 * ========================================================================== */
(function (global) {
  'use strict';

  var SFX = global.SFX = global.SFX || {};
  var U = SFX.util;
  var clamp = U.clamp;

  var noiseCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function cacheFor(ctx) {
    var c;
    if (noiseCache) {
      c = noiseCache.get(ctx);
      if (!c) { c = { noise: null }; noiseCache.set(ctx, c); }
    } else {
      c = ctx.__sfx || (ctx.__sfx = { noise: null });
    }
    return c;
  }

  function noiseBuffer(ctx) {
    var c = cacheFor(ctx);
    if (c.noise) return c.noise;
    var rng = c.rng || (c.rng = new U.Rng('sfx-noise'));
    var len = Math.floor(ctx.sampleRate * 2.0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = rng.next() * 2 - 1;
      last = 0.97 * last + 0.03 * w;
      d[i] = w * 0.75 + last * 1.4;
    }
    c.noise = buf;
    return buf;
  }

  function impulseResponse(ctx, seconds, decay, rng) {
    var sr = ctx.sampleRate;
    var len = Math.max(1, Math.floor(sr * seconds));
    var buf = ctx.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var lp = 0;
      for (var i = 0; i < len; i++) {
        var t = i / len;
        var env = Math.pow(1 - t, 2.2) * Math.exp(-t * decay);
        var n = (rng ? rng.next() : Math.random()) * 2 - 1;
        lp = lp * 0.8 + n * 0.2;
        d[i] = lp * env;
      }
      var taps = ch === 0 ? [0.008, 0.017, 0.029] : [0.011, 0.021, 0.034];
      taps.forEach(function (tp, idx) {
        var pos = Math.floor(tp * sr);
        if (pos < len) d[pos] += (idx % 2 ? -1 : 1) * 0.3 * Math.pow(0.7, idx);
      });
    }
    return buf;
  }

  function driveCurve(amount) {
    var n = 2048;
    var curve = new Float32Array(n);
    var k = 1 + amount * 9;
    if (amount < 0.02) {
      for (var j = 0; j < n; j++) curve[j] = (j / (n - 1)) * 2 - 1;
      return curve;
    }
    var norm = Math.tanh(k);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * k) / norm;
    }
    return curve;
  }

  function panner(ctx, pan) {
    if (!ctx.createStereoPanner) return null;
    var p = ctx.createStereoPanner();
    p.pan.value = clamp(pan || 0, -1, 1);
    return p;
  }

  function scheduleNoise(ctx, dest, l) {
    var t0 = 0.02 + (l.t || 0);
    var dur = clamp(l.dur, 0.005, 6);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;

    var gain = ctx.createGain();
    var a = clamp(l.env.a || 0.001, 0.0002, dur * 0.8);
    var d = clamp(l.env.d || dur * 0.8, 0.005, Math.max(0.01, dur - a));
    var peak = clamp(l.gain, 0, 2);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);

    var node = src;
    if (l.filter) {
      var f = ctx.createBiquadFilter();
      f.type = l.filter.type || 'bandpass';
      f.Q.value = l.filter.q === undefined ? 0.8 : l.filter.q;
      var f0 = clamp(l.filter.f0 || 1000, 20, ctx.sampleRate / 2 - 200);
      var f1 = clamp(l.filter.f1 || f0, 20, ctx.sampleRate / 2 - 200);
      f.frequency.setValueAtTime(f0, t0);
      if (Math.abs(f1 - f0) > 1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      node.connect(f);
      node = f;
    }
    node.connect(gain);

    var p = panner(ctx, l.pan);
    if (p) {
      if (l.panFrom !== null && l.panFrom !== undefined && l.panTo !== null && l.panTo !== undefined) {
        p.pan.setValueAtTime(clamp(l.panFrom, -1, 1), t0);
        p.pan.linearRampToValueAtTime(clamp(l.panTo, -1, 1), t0 + dur);
      }
      gain.connect(p);
      p.connect(dest);
    } else {
      gain.connect(dest);
    }

    if (l.trem && l.trem.rate > 0) {
      var lfo = ctx.createOscillator();
      lfo.frequency.value = clamp(l.trem.rate, 0.5, 40);
      var lg = ctx.createGain();
      lg.gain.value = peak * clamp(l.trem.depth || 0.3, 0, 0.45);
      lfo.connect(lg);
      lg.connect(gain.gain);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.1);
    }

    src.start(t0);
    src.stop(t0 + dur + 0.08);
    return gain;
  }

  function scheduleTone(ctx, dest, l, waveOverride) {
    var t0 = 0.02 + (l.t || 0);
    var dur = clamp(l.dur, 0.01, 6);
    var gain = ctx.createGain();
    var a = clamp(l.env.a || 0.002, 0.0005, dur * 0.8);
    var d = clamp(l.env.d || dur * 0.8, 0.005, Math.max(0.01, dur - a));
    var peak = clamp(l.gain, 0, 2);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);

    var osc = ctx.createOscillator();
    osc.type = waveOverride || l.wave || 'sine';
    var f0 = clamp(l.f0 || 440, 20, ctx.sampleRate / 2 - 400);
    osc.frequency.setValueAtTime(f0, t0);
    if (l.f1 && Math.abs(l.f1 - f0) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(clamp(l.f1, 20, ctx.sampleRate / 2 - 400), t0 + (l.pitchTime || dur * 0.6));
    }

    var node = osc;
    if (l.filter) {
      var f = ctx.createBiquadFilter();
      f.type = l.filter.type || 'lowpass';
      f.Q.value = l.filter.q === undefined ? 0.7 : l.filter.q;
      f.frequency.value = clamp(l.filter.f0 || 1200, 20, ctx.sampleRate / 2 - 200);
      node.connect(f);
      node = f;
    }
    node.connect(gain);

    if (l.fm && l.fm.ratio) {
      var mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.setValueAtTime(f0 * clamp(l.fm.ratio, 0.25, 12), t0);
      var mg = ctx.createGain();
      var idx = clamp(l.fm.index === undefined ? 2 : l.fm.index, 0, 20);
      mg.gain.setValueAtTime(f0 * idx, t0);
      mg.gain.setTargetAtTime(f0 * idx * (l.fm.sustain === undefined ? 0.08 : l.fm.sustain), t0, Math.max(0.01, (l.fm.decay || 0.2) / 3));
      mod.connect(mg);
      mg.connect(osc.frequency);
      mod.start(t0);
      mod.stop(t0 + dur + 0.05);
    }

    if (l.vibrato && l.vibrato.rate) {
      var vib = ctx.createOscillator();
      vib.frequency.value = clamp(l.vibrato.rate, 0.5, 18);
      var vg = ctx.createGain();
      var depth = clamp(l.vibrato.depth === undefined ? 8 : l.vibrato.depth, 0, 80);
      vg.gain.setValueAtTime(0, t0);
      vg.gain.linearRampToValueAtTime(depth, t0 + (l.vibrato.delay || 0.1));
      vib.connect(vg);
      vg.connect(osc.detune);
      vib.start(t0);
      vib.stop(t0 + dur + 0.05);
    }

    var p = panner(ctx, l.pan);
    if (p) {
      if (l.panFrom !== null && l.panFrom !== undefined) {
        p.pan.setValueAtTime(clamp(l.panFrom, -1, 1), t0);
        p.pan.linearRampToValueAtTime(clamp(l.panTo, -1, 1), t0 + dur);
      }
      gain.connect(p);
      p.connect(dest);
    } else {
      gain.connect(dest);
    }

    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return gain;
  }

  function scheduleMetal(ctx, dest, l) {
    var t0 = 0.02 + (l.t || 0);
    var dur = clamp(l.dur, 0.02, 6);
    var gainOut = ctx.createGain();
    gainOut.gain.value = 1;
    var base = clamp(l.base || 420, 30, ctx.sampleRate / 2 - 600);
    var ratios = l.ratios && l.ratios.length ? l.ratios : [1, 2.76, 4.07, 5.4, 8.93];
    var p = panner(ctx, l.pan);
    if (p) gainOut.connect(p); else gainOut.connect(dest);

    ratios.forEach(function (r, i) {
      var f = base * r * (1 + (l.detune ? U.clamp(l.detune, -0.02, 0.02) * (i % 3 - 1) : 0));
      if (f > ctx.sampleRate / 2 - 200 || f < 20) return;
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      var g = ctx.createGain();
      var amp = clamp(l.gain, 0, 2) * (0.85 / (1 + i * 0.55));
      var decay = dur * (1 - i * 0.09);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.02, decay));
      osc.connect(g);
      g.connect(gainOut);
      osc.start(t0);
      osc.stop(t0 + Math.max(0.03, decay) + 0.05);
    });
    if (p) p.connect(dest);
    return gainOut;
  }

  function render(spec, opts) {
    opts = opts || {};
    var sr = opts.sampleRate || 44100;
    var duration = clamp(spec.duration + 0.12, 0.06, 5.0);
    var frames = Math.max(256, Math.ceil(duration * sr));
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('浏览器不支持 OfflineAudioContext'));
    var ctx = new OAC(2, frames, sr);

    // 噪声底与混响 IR 也必须由种子决定，否则“同种子可复现”不成立
    var seedBase = spec.meta && spec.meta.seed !== undefined && spec.meta.seed !== null
      ? spec.meta.seed : 'sfx';
    var noiseRng = new U.Rng(seedBase + ':' + (spec.meta && spec.meta.presetId || '') + ':noise');
    var irRng = new U.Rng(seedBase + ':' + (spec.meta && spec.meta.presetId || '') + ':ir');
    cacheFor(ctx).rng = noiseRng;

    var master = ctx.createGain();
    master.gain.value = 0.85;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.0008;
    limiter.release.value = 0.05;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 25;

    comp.connect(limiter);
    limiter.connect(master);
    master.connect(hp);
    hp.connect(ctx.destination);

    var input = ctx.createGain();
    input.gain.value = 1;
    var shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(spec.fx && spec.fx.drive ? spec.fx.drive : 0);
    shaper.oversample = '2x';
    input.connect(shaper);
    shaper.connect(comp);

    // 混响
    var conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = impulseResponse(ctx, 1.35, 3.0, irRng);
    var revHP = ctx.createBiquadFilter();
    revHP.type = 'highpass';
    revHP.frequency.value = 220;
    var revWet = ctx.createGain();
    revWet.gain.value = spec.fx && spec.fx.reverb ? clamp(spec.fx.reverb, 0, 1) * 0.85 : 0;
    input.connect(revHP);
    revHP.connect(conv);
    conv.connect(revWet);
    revWet.connect(comp);

    // 延迟
    var delayWet = null;
    if (spec.fx && spec.fx.delay > 0.001) {
      var delay = ctx.createDelay(1);
      delay.delayTime.value = 0.13;
      var fb = ctx.createGain();
      fb.gain.value = 0.24;
      var dLP = ctx.createBiquadFilter();
      dLP.type = 'lowpass';
      dLP.frequency.value = 3200;
      delayWet = ctx.createGain();
      delayWet.gain.value = clamp(spec.fx.delay, 0, 1) * 0.5;
      input.connect(delay);
      delay.connect(fb);
      fb.connect(dLP);
      dLP.connect(delay);
      delay.connect(delayWet);
      delayWet.connect(comp);
    }

    var waveOverride = spec.meta && spec.meta.waveform && spec.meta.waveform !== 'auto'
      ? spec.meta.waveform : null;
    var buses = { input: input, reverb: revHP, delay: null, waveOverride: waveOverride };
    (spec.layers || []).forEach(function (l) {
      try {
        if (l.type === 'noise') scheduleNoise(ctx, input, l);
        else if (l.type === 'metal') scheduleMetal(ctx, input, l);
        else scheduleTone(ctx, input, l, waveOverride);
      } catch (e) {
        // 单层失败不影响整体
      }
    });

    return ctx.startRendering().then(function (buffer) {
      var channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
      if (opts.normalize !== false) SFX.wav.normalize(channels, -1);
      return {
        channels: channels,
        sampleRate: sr,
        duration: frames / sr,
        peak: SFX.wav.peakOf(channels),
        spec: spec
      };
    });
  }

  /* ---------------- 试听播放器 ---------------- */
  function Player() {
    this.ctx = null;
    this.source = null;
    this.gain = null;
    this.onended = null;
  }
  Player.prototype.ensure = function () {
    if (this.ctx) return Promise.resolve(this.ctx);
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('浏览器不支持 Web Audio API'));
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.9;
    this.gain.connect(this.ctx.destination);
    var self = this;
    return this.ctx.resume().then(function () { return self.ctx; });
  };
  Player.prototype.play = function (channels, sampleRate, onended) {
    var self = this;
    return this.ensure().then(function () {
      self.stop();
      var ctx = self.ctx;
      var len = channels[0].length;
      var buffer = ctx.createBuffer(channels.length, len, sampleRate);
      for (var ch = 0; ch < channels.length; ch++) buffer.copyToChannel(channels[ch], ch);
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(self.gain);
      src.onended = function () {
        if (self.source === src) self.source = null;
        if (onended) onended();
      };
      self.source = src;
      src.start();
      return true;
    });
  };
  Player.prototype.stop = function () {
    if (this.source) {
      try { this.source.stop(); } catch (e) {}
      this.source = null;
    }
  };
  Player.prototype.playing = function () { return !!this.source; };

  SFX.engine = {
    render: render,
    Player: Player,
    noiseBuffer: noiseBuffer,
    impulseResponse: impulseResponse
  };
})(typeof window !== 'undefined' ? window : globalThis);
