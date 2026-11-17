/* ==========================================================================
 * audio.js — 音频引擎
 * 实时播放（前瞻调度）/ 离线渲染 / 混响与延迟总线 / 分轨导出 / 试听
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;
  var INST = GBG.instruments;

  var SPB = 0; // 只在实例中使用

  function masterLevel(style) {
    return (style && style.gain ? style.gain : 0.9) * 0.82 * 1.3;
  }

  /* ---------------- 混响 IR ---------------- */
  var irCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function makeIR(ctx, seconds, decay) {
    if (irCache && irCache.has(ctx)) return irCache.get(ctx);
    var sr = ctx.sampleRate;
    var len = Math.max(1, Math.floor(sr * seconds));
    var buf = ctx.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var lp = 0;
      for (var i = 0; i < len; i++) {
        var t = i / len;
        var env = Math.pow(1 - t, 2.0) * Math.exp(-t * 2.6);
        var n = Math.random() * 2 - 1;
        lp = lp * 0.72 + n * 0.28; // 高频收敛，听感更暖
        d[i] = lp * env;
      }
      // 早期反射
      var taps = ch === 0 ? [0.009, 0.017, 0.027, 0.041] : [0.012, 0.021, 0.033, 0.047];
      taps.forEach(function (tp, idx) {
        var pos = Math.floor(tp * sr);
        if (pos < len) d[pos] += (idx % 2 ? -1 : 1) * 0.25 * Math.pow(0.75, idx);
      });
    }
    if (irCache) irCache.set(ctx, buf);
    return buf;
  }

  /* 按声部做频率分工：清晰度越高，垫音/琶音让出越多低频 */
  function partEQ(ctx, part, clarity) {
    var c = clarity || 0;
    if (c < 0.03) return null;
    var role = part.role;
    var hp = 0;
    if (role === 'pad') hp = 70 + 90 * c + (part.minIntensity >= 1 ? 70 * c : 0);
    else if (role === 'arp') hp = 220 * c;
    else if (role === 'counter') hp = 120 * c;
    else if (role === 'stab') hp = 130 * c;
    else if (role === 'texture') hp = 200 * c;
    else if (role === 'lead') hp = 80 * c;
    else return null;
    if (hp < 30) return null;
    var f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = Math.min(500, hp);
    f.Q.value = 0.6;
    return f;
  }

  /* ---------------- 图构建 ---------------- */
  function buildGraph(ctx, song, opts) {    opts = opts || {};
    var bpm = song.meta.bpm;
    var spb = 60 / bpm;
    var style = song.style || {};

    var dry = ctx.createGain();
    dry.gain.value = 1;

    // 低频清理，避免次低频占用动态余量
    var rumbleHP = ctx.createBiquadFilter();
    rumbleHP.type = 'highpass';
    rumbleHP.frequency.value = 30;
    rumbleHP.Q.value = 0.7;

    var glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 14;
    glue.ratio.value = 3;
    glue.attack.value = 0.006;
    glue.release.value = 0.22;

    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    var master = ctx.createGain();
    master.gain.value = opts.masterGain === undefined ? masterLevel(style) : masterLevel(style) * opts.masterGain / 0.82;

    dry.connect(rumbleHP);
    rumbleHP.connect(glue);
    glue.connect(limiter);

    // 风格化总线滤波（Lo-Fi 暖度）
    var tone = null;
    var air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 7000;
    air.gain.value = style.lowpass ? 0.5 : 1.6;
    limiter.connect(air);
    if (style.lowpass) {
      tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = style.lowpass;
      tone.Q.value = 0.5;
      air.connect(tone);
      tone.connect(master);
    } else {
      air.connect(master);
    }
    master.connect(ctx.destination);

    var analyser = null;
    if (opts.analyser && ctx.createAnalyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      master.connect(analyser);
    }

    // 混响
    var conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = makeIR(ctx, opts.reverbSec || 2.2, 2.6);
    var revHP = ctx.createBiquadFilter();
    revHP.type = 'highpass';
    revHP.frequency.value = 170;
    var revWet = ctx.createGain();
    // 清晰度越高，混响与延迟越收敛，避免声部被尾音糊在一起
    var clarity = (song.meta && song.meta.clarity) || 0;
    revWet.gain.value = opts.noReverb ? 0 : 0.62 * (1 - 0.3 * clarity);
    revHP.connect(conv);
    conv.connect(revWet);
    revWet.connect(dry);

    // 延迟（附点八分）
    var delayInput = ctx.createGain();
    var delay = ctx.createDelay(3);
    delay.delayTime.value = U.clamp(spb * 0.75, 0.05, 2.5);
    var fb = ctx.createGain();
    fb.gain.value = 0.34;
    var fbLP = ctx.createBiquadFilter();
    fbLP.type = 'lowpass';
    fbLP.frequency.value = 3200;
    var dlyWet = ctx.createGain();
    dlyWet.gain.value = 0.5 * (1 - 0.22 * clarity);
    delayInput.connect(delay);
    delay.connect(fb);
    fb.connect(fbLP);
    fbLP.connect(delay);
    delay.connect(dlyWet);
    dlyWet.connect(dry);

    var graph = {
      ctx: ctx,
      song: song,
      spb: spb,
      dry: dry,
      master: master,
      analyser: analyser,
      revInput: revHP,
      dlyInput: delayInput,
      parts: {}
    };

    song.parts.forEach(function (p) {
      var input = ctx.createGain();
      var rev = ctx.createGain();
      var dly = ctx.createGain();
      input.gain.value = p.gain || 0.6;
      rev.gain.value = 1;
      dly.gain.value = 1;

      // 按声部做频率分工：垫音让出低频、琶音让出低中频，避免糊在一起
      var eq = partEQ(ctx, p, clarity);
      if (eq) {
        input.connect(eq);
        eq.connect(dry);
      } else {
        input.connect(dry);
      }

      rev.connect(revHP);
      dly.connect(delayInput);
      graph.parts[p.id] = { input: input, eq: eq, rev: rev, dly: dly, part: p };
    });

    applyMix(graph, song, opts.mix || {}, !!opts.offline);
    return graph;
  }

  function applyMix(graph, song, mix, immediate) {
    mix = mix || {};
    var mute = mix.mute || {};
    var solo = mix.solo || {};
    var volume = mix.volume || {};
    var anySolo = song.parts.some(function (p) { return solo[p.id]; });
    graph.audible = {};
    song.parts.forEach(function (p) {
      var node = graph.parts[p.id];
      if (!node) return;
      var audible = anySolo ? !!solo[p.id] : !mute[p.id];
      var vol = volume[p.id] === undefined ? 1 : volume[p.id];
      var g = (p.gain || 0.6) * vol;
      var now = graph.ctx.currentTime;
      node.input.gain.cancelScheduledValues(now);
      node.rev.gain.cancelScheduledValues(now);
      node.dly.gain.cancelScheduledValues(now);
      if (immediate) {
        node.input.gain.value = audible ? g : 0;
        node.rev.gain.value = audible ? 1 : 0;
        node.dly.gain.value = audible ? 1 : 0;
      } else {
        node.input.gain.setTargetAtTime(audible ? g : 0, now, 0.015);
        node.rev.gain.setTargetAtTime(audible ? 1 : 0, now, 0.015);
        node.dly.gain.setTargetAtTime(audible ? 1 : 0, now, 0.015);
      }
      if (audible) graph.audible[p.id] = true;
    });
  }

  /* ---------------- 事件索引 ---------------- */
  function buildBarIndex(song) {
    var bars = [];
    for (var i = 0; i < song.meta.bars; i++) bars.push([]);
    song.parts.forEach(function (part) {
      part.notes.forEach(function (n) {
        var bar = Math.floor(n.t / 4);
        if (bar < 0) bar = 0;
        if (bar >= bars.length) return;
        bars[bar].push({ part: part, n: n });
      });
    });
    bars.forEach(function (b) {
      b.sort(function (x, y) { return x.n.t - y.n.t; });
    });
    return bars;
  }

  function scheduleBar(ctx, graph, barIndex, bar, barTime) {
    var events = barIndex[bar] || [];
    var spb = graph.spb;
    var t0 = bar * 4;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var part = ev.part;
      if (graph.audible && !graph.audible[part.id]) continue;
      var n = ev.n;
      var bus = graph.parts[part.id];
      if (!bus) continue;
      var when = barTime + Math.max(0, (n.t - t0)) * spb;
      var dur = Math.max(0.04, n.d * spb);
      try {
        if (part.role === 'drums') {
          INST.playDrum(ctx, bus, n.drum, when, n.vel, { pan: part.pan || 0, midi: n.midi });
        } else {
          INST.playVoice(ctx, bus, part.instrument, n.midi, when, dur, n.vel, { pan: part.pan || 0 });
        }
      } catch (e) {
        // 单个音符失败不影响整体
      }
    }
  }

  /* ---------------- 实时引擎 ---------------- */
  function AudioEngine() {
    this.ctx = null;
    this.graph = null;
    this.song = null;
    this.barIndex = null;
    this.playing = false;
    this.timer = null;
    this.loopEnabled = true;
    this.barIdx = 0;
    this.nextBarTime = 0;
    this.lastBarTime = 0;
    this.queue = [];
    this.loopStart = 0;
    this.endBar = 0;
    this.startBar = 0;
    this.frozenBeat = 0;
    this.mix = { mute: {}, solo: {}, volume: {} };
    this.onEnd = null;
    this._scratch = null;
  }

  AudioEngine.prototype.ensure = function () {
    if (this.ctx) return Promise.resolve(this.ctx);
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('浏览器不支持 Web Audio API'));
    this.ctx = new AC({ latencyHint: 'interactive' });
    var self = this;
    return this.ctx.resume().then(function () { return self.ctx; });
  };

  AudioEngine.prototype.setSong = function (song) {
    this.stop();
    this.song = song;
    this.barIndex = buildBarIndex(song);
    if (this.graph && this.ctx) {
      try { this.graph.master.disconnect(); } catch (e) {}
    }
    this.graph = null;
    if (this.ctx) {
      this.graph = buildGraph(this.ctx, song, { analyser: true, mix: this.mix });
    }
  };

  AudioEngine.prototype.setMix = function (mix) {
    this.mix = mix;
    if (this.graph && this.song) applyMix(this.graph, this.song, mix);
  };

  AudioEngine.prototype.play = function (fromBar, opts) {
    opts = opts || {};
    var self = this;
    if (!this.song) return Promise.resolve();
    return this.ensure().then(function () {
      if (!self.graph || self.graph.song !== self.song) {
        self.graph = buildGraph(self.ctx, self.song, { analyser: true, mix: self.mix });
      }
      self.ctx.resume();
      clearInterval(self.timer);
      self.playing = true;
      self.startBar = fromBar === undefined ? (opts.fromLoop ? self.song.loop.startBar : 0) : fromBar;
      self.barIdx = self.startBar;
      self.loopStart = self.song.loop.startBar;
      self.endBar = self.loopEnabled ? self.song.loop.endBar : self.song.meta.bars;
      self.queue = [];
      self.nextBarTime = self.ctx.currentTime + 0.12;
      self.lastBarTime = self.nextBarTime;
      self.graph.master.gain.cancelScheduledValues(self.ctx.currentTime);
      self.graph.master.gain.setTargetAtTime(masterLevel(self.song.style), self.ctx.currentTime, 0.02);
      self.tick();
      self.timer = setInterval(function () { self.tick(); }, 35);
    });
  };

  AudioEngine.prototype.tick = function () {
    if (!this.playing) return;
    var now = this.ctx.currentTime;
    var horizon = now + 0.4;
    var guard = 0;
    while (this.nextBarTime < horizon && guard++ < 48) {
      if (this.barIdx >= this.endBar) {
        if (this.loopEnabled && this.endBar > this.loopStart) {
          this.barIdx = this.loopStart;
        } else {
          break;
        }
      }
      scheduleBar(this.ctx, this.graph, this.barIndex, this.barIdx, this.nextBarTime);
      this.queue.push({ bar: this.barIdx, time: this.nextBarTime });
      while (this.queue.length > 40) this.queue.shift();
      this.lastBarTime = this.nextBarTime;
      this.nextBarTime += U.barsToSec(1, this.song.meta.bpm, 4);
      this.barIdx++;
    }
    if (!this.loopEnabled && this.barIdx >= this.endBar && now > this.lastBarTime + U.barsToSec(1, this.song.meta.bpm, 4)) {
      this.frozenBeat = this.endBar * 4;
      this.stop();
      if (this.onEnd) this.onEnd();
    }
  };

  AudioEngine.prototype.pause = function () {
    if (!this.playing) return;
    this.frozenBeat = this.getPosition();
    this.stop();
  };

  AudioEngine.prototype.stop = function () {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.graph && this.ctx) {
      var now = this.ctx.currentTime;
      var g = this.graph;
      try {
        g.master.gain.cancelScheduledValues(now);
        g.master.gain.setTargetAtTime(0, now, 0.02);
      } catch (e) {}
      // 断开总线，让仍在排程中的长音彻底静音；下次播放时重建
      // 延迟断开，先让主增益淡出，避免爆音
      setTimeout(function () {
        try { g.dry.disconnect(); } catch (e) {}
        try { g.master.disconnect(); } catch (e) {}
      }, 140);
    }
    this.graph = null;
    this.queue = [];
  };

  AudioEngine.prototype.seek = function (beat) {
    beat = Math.max(0, beat);
    var wasPlaying = this.playing;
    this.stop();
    this.frozenBeat = beat;
    if (wasPlaying) this.play(Math.floor(beat / 4));
  };

  AudioEngine.prototype.setLoop = function (on) {
    var wasPlaying = this.playing;
    var pos = this.getPosition();
    this.loopEnabled = !!on;
    if (wasPlaying) {
      this.stop();
      this.play(Math.floor(pos / 4));
    }
  };

  AudioEngine.prototype.getPosition = function () {
    if (!this.playing || !this.ctx) return this.frozenBeat || 0;
    var now = this.ctx.currentTime;
    var q = this.queue;
    for (var i = q.length - 1; i >= 0; i--) {
      if (q[i].time <= now) {
        var barStart = q[i].bar * 4;
        var beat = barStart + (now - q[i].time) * this.song.meta.bpm / 60;
        var barEnd = barStart + 4;
        if (beat > barEnd) beat = barEnd;
        return beat;
      }
    }
    return this.startBar * 4;
  };

  AudioEngine.prototype.getSpectrum = function () {
    if (!this.graph || !this.graph.analyser) return null;
    if (!this._scratch) this._scratch = new Uint8Array(this.graph.analyser.frequencyBinCount);
    this.graph.analyser.getByteFrequencyData(this._scratch);
    return this._scratch;
  };

  AudioEngine.prototype.audition = function (instrumentId, midi, dur) {
    var self = this;
    return this.ensure().then(function () {
      var bus = self.makeAuditionBus();
      return INST.audition(self.ctx, bus, instrumentId, midi, dur || 1);
    });
  };

  AudioEngine.prototype.auditionDrum = function (kitName, drumId) {
    var self = this;
    return this.ensure().then(function () {
      var bus = self.makeAuditionBus();
      INST.playDrum(self.ctx, bus, drumId, self.ctx.currentTime + 0.03, 0.9, {});
      return true;
    });
  };

  AudioEngine.prototype.makeAuditionBus = function () {
    var bus = {
      input: this.ctx.createGain(),
      reverb: this.ctx.createGain(),
      delay: this.ctx.createGain()
    };
    bus.input.gain.value = 1;
    bus.reverb.gain.value = 1;
    bus.delay.gain.value = 1;
    bus.input.connect(this.graph ? this.graph.dry : this.ctx.destination);
    if (this.graph) {
      bus.reverb.connect(this.graph.revInput);
      bus.delay.connect(this.graph.dlyInput);
    }
    return bus;
  };

  /* ---------------- 离线渲染 ---------------- */
  function renderRange(song, options) {
    options = options || {};
    return Promise.resolve().then(function () {
      var sr = options.sampleRate || 44100;
      var bpm = song.meta.bpm;
      var spb = 60 / bpm;
      var from = options.fromBar === undefined ? 0 : options.fromBar;
      var to = options.toBar === undefined ? song.meta.bars : options.toBar;
      var tail = options.tailSec === undefined ? 2.4 : options.tailSec;
      var durSec = (to - from) * 4 * spb + tail;
      var frames = Math.max(1, Math.ceil(durSec * sr));
      var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
      if (!OAC) return Promise.reject(new Error('浏览器不支持 OfflineAudioContext'));
      var ctx = new OAC(2, frames, sr);
      var mix = options.mix || {};
      var graph = buildGraph(ctx, song, {
        mix: mix,
        masterGain: options.masterGain,
        reverbSec: options.reverbSec,
        noReverb: options.noReverb,
        offline: true
      });
      var barIndex = options.barIndex || buildBarIndex(song);
      for (var bar = from; bar < to; bar++) {
        scheduleBar(ctx, graph, barIndex, bar, (bar - from) * 4 * spb + 0.02);
      }
      return ctx.startRendering().then(function (buffer) {
        var L = buffer.getChannelData(0);
        var R = buffer.getChannelData(1);
        var channels = [L, R];
        if (options.seamlessLoop) {
          var loopSamples = Math.round((to - from) * 4 * spb * sr);
          var tailSamples = Math.min(frames - loopSamples, Math.round(tail * sr));
          channels = GBG.wav.foldTail(channels, loopSamples, tailSamples, sr);
        }
        return { channels: channels, sampleRate: sr, frames: channels[0].length, duration: channels[0].length / sr };
      });
    });
  }

  GBG.audio = {
    AudioEngine: AudioEngine,
    buildGraph: buildGraph,
    buildBarIndex: buildBarIndex,
    scheduleBar: scheduleBar,
    renderRange: renderRange,
    applyMix: applyMix,
    makeIR: makeIR
  };
})(typeof window !== 'undefined' ? window : globalThis);
