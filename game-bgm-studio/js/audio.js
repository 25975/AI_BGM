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
  function makeIR(ctx, seconds, decay, opts) {
    opts = opts || {};
    var preDelay = opts.preDelay === undefined ? 0.028 : opts.preDelay;
    var damping = opts.damping === undefined ? 0.55 : opts.damping;
    var key = seconds.toFixed(2) + '|' + decay.toFixed(2) + '|' + preDelay.toFixed(3) + '|' + damping.toFixed(2);
    var store = null;
    if (irCache) {
      store = irCache.get(ctx);
      if (!store) { store = {}; irCache.set(ctx, store); }
      if (store[key]) return store[key];
    }
    var sr = ctx.sampleRate;
    var pre = Math.floor(preDelay * sr);
    var len = Math.max(pre + 1, pre + Math.floor(seconds * sr));
    var buf = ctx.createBuffer(2, len, sr);
    var baseSeed = opts.seed || 0x9e3779b9;
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var seed = (baseSeed + ch * 0x85ebca6b) >>> 0;
      function rnd() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296 * 2 - 1;
      }
      var lp = 0;
      var taps = [];
      for (var k = 0; k < 9; k++) {
        taps.push({
          pos: Math.floor((0.008 + Math.pow(k / 9, 0.8) * 0.075 + rnd() * 0.008) * sr),
          gain: (0.16 + rnd() * 0.18) * Math.pow(0.82, k),
          sign: rnd() < 0 ? -1 : 1
        });
      }
      for (var i = pre; i < len; i++) {
        var t = (i - pre) / (len - pre);
        var n = rnd();
        // 高频随时间更快衰减，模拟音乐厅的空气与软装吸收
        var coef = 0.25 + (1 - Math.exp(-t * 2.8)) * damping;
        lp = lp * coef + n * (1 - coef);
        var env = Math.exp(-t * decay) * Math.pow(1 - t, 1.15);
        d[i] = lp * env;
      }
      taps.forEach(function (tap) {
        var pos = pre + tap.pos;
        if (pos < len) d[pos] += tap.sign * tap.gain;
      });
    }
    if (store) store[key] = buf;
    return buf;
  }

  /* 按声部做频率分工：清晰度越高，垫音/琶音让出越多低频 */
  function partEQ(ctx, part, clarity) {
    var c = clarity || 0;
    // 管弦鼓组切掉一点 100Hz 以下的“轰”，保留鼓皮冲击与镲片
    if (part.role === 'drums' && /^kit:(orch|battle)$/.test(part.instrument || '')) {
      var drumEq = ctx.createBiquadFilter();
      drumEq.type = 'lowshelf';
      drumEq.frequency.value = 105;
      drumEq.gain.value = -3.5;
      return drumEq;
    }
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

  /* 立体声宽度：用 M/S 矩阵把管弦声场拉开，避免所有声部挤在中间 */
  function stereoWidth(ctx, value) {
    if (!ctx.createChannelSplitter || !ctx.createChannelMerger) return null;
    var w = U.clamp(0.85 + (value === undefined ? 0.9 : value) * 0.45, 0.9, 1.3);
    if (Math.abs(w - 1) < 0.001) return null;
    var input = ctx.createGain();
    var split = ctx.createChannelSplitter(2);
    var merge = ctx.createChannelMerger(2);
    var ll = ctx.createGain(), lr = ctx.createGain(), rl = ctx.createGain(), rr = ctx.createGain();
    ll.gain.value = (1 + w) / 2;
    rr.gain.value = (1 + w) / 2;
    lr.gain.value = (1 - w) / 2;
    rl.gain.value = (1 - w) / 2;
    input.connect(split);
    split.connect(ll, 0); ll.connect(merge, 0, 0);
    split.connect(lr, 0); lr.connect(merge, 0, 1);
    split.connect(rl, 1); rl.connect(merge, 0, 0);
    split.connect(rr, 1); rr.connect(merge, 0, 1);
    return { input: input, output: merge };
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
    rumbleHP.frequency.value = 32;
    rumbleHP.Q.value = 0.7;

    // 低中频稍微让位，减少“糊”和廉价感
    var mud = ctx.createBiquadFilter();
    mud.type = 'peaking';
    mud.frequency.value = 260;
    mud.Q.value = 0.9;
    mud.gain.value = -1.2;

    var glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 12;
    glue.ratio.value = 2.2;
    glue.attack.value = 0.02;
    glue.release.value = 0.25;

    // 轻微磁带式饱和：给数字合成增加谐波，但管弦只保留极轻的染色
    var shaper = ctx.createWaveShaper();
    var curve = new Float32Array(2048);
    var drive = style.family === 'orchestral' ? 0.35 : 0.8;
    for (var ci = 0; ci < curve.length; ci++) {
      var cx = (ci / (curve.length - 1)) * 2 - 1;
      curve[ci] = Math.tanh(cx * drive) / drive;
    }
    shaper.curve = curve;
    shaper.oversample = '2x';

    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.8;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;

    // 中高频存在感：让弦乐、铜管、人声从低频里浮出来
    var presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2800;
    presence.Q.value = 0.8;
    presence.gain.value = style.family === 'orchestral' ? 1.5 : 0.8;

    var master = ctx.createGain();
    master.gain.value = opts.masterGain === undefined ? masterLevel(style) : masterLevel(style) * opts.masterGain / 0.82;

    dry.connect(mud);
    mud.connect(rumbleHP);
    rumbleHP.connect(glue);
    glue.connect(shaper);
    shaper.connect(presence);
    presence.connect(limiter);

    // 风格化总线滤波（Lo-Fi 暖度）
    var tone = null;
    var air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 7000;
    air.gain.value = style.lowpass ? 0.2 : (style.family === 'orchestral' ? 0.8 : 1.2);
    limiter.connect(air);
    if (style.lowpass) {
      tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = style.lowpass;
      tone.Q.value = 0.5;
      air.connect(tone);
    }
    var preMaster = style.lowpass ? tone : air;
    var widthNode = stereoWidth(ctx, style.width);
    if (widthNode) {
      preMaster.connect(widthNode.input);
      widthNode.output.connect(master);
    } else {
      preMaster.connect(master);
    }
    master.connect(ctx.destination);

    var analyser = null;
    if (opts.analyser && ctx.createAnalyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      master.connect(analyser);
    }

    // 混响：按风格给不同长度与湿度，避免所有风格共用一块“金属板”
    var revAmt = style.reverb === undefined ? 0.38 : style.reverb;
    var revSec = opts.reverbSec || (1.65 + revAmt * 3.3);
    var revDecay = 2.0 + (1 - revAmt) * 0.9;
    var conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = makeIR(ctx, revSec, revDecay, {
      preDelay: 0.026,
      damping: style.family === 'orchestral' ? 0.62 : 0.48,
      seed: 0x51ed270b
    });
    var revHP = ctx.createBiquadFilter();
    revHP.type = 'highpass';
    revHP.frequency.value = 180;
    var revLP = ctx.createBiquadFilter();
    revLP.type = 'lowpass';
    revLP.frequency.value = 8800;
    revLP.Q.value = 0.5;
    var revWet = ctx.createGain();
    // 清晰度越高，混响与延迟越收敛，避免声部被尾音糊在一起
    var clarity = (song.meta && song.meta.clarity) || 0;
    revWet.gain.value = opts.noReverb ? 0 : revAmt * 1.15 * (1 - 0.25 * clarity);
    revHP.connect(revLP);
    revLP.connect(conv);
    conv.connect(revWet);
    revWet.connect(dry);

    // 延迟（附点八分）：只留风格定义的少量空间感
    var delayInput = ctx.createGain();
    var delay = ctx.createDelay(3);
    delay.delayTime.value = U.clamp(spb * 0.75, 0.05, 2.5);
    var fb = ctx.createGain();
    fb.gain.value = 0.24;
    var fbLP = ctx.createBiquadFilter();
    fbLP.type = 'lowpass';
    fbLP.frequency.value = 2800;
    var dlyWet = ctx.createGain();
    var dlyAmt = style.delay === undefined ? 0.1 : style.delay;
    dlyWet.gain.value = dlyAmt * (1 - 0.2 * clarity);
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
      if (immediate || !audible) {
        node.input.gain.value = audible ? g : 0;
        node.rev.gain.value = audible ? 1 : 0;
        node.dly.gain.value = audible ? 1 : 0;
      } else {
        node.input.gain.setTargetAtTime(g, now, 0.015);
        node.rev.gain.setTargetAtTime(1, now, 0.015);
        node.dly.gain.setTargetAtTime(1, now, 0.015);
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
