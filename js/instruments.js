/* ==========================================================================
 * instruments.js — 纯 Web Audio 合成音色库（无采样素材）
 * 合成器引擎：多层振荡器 / FM / 滤波包络 / 颤音 / 噪声瞬态 / 立体声扩展
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;

  var ctxData = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function cacheFor(ctx) {
    var c;
    if (ctxData) {
      c = ctxData.get(ctx);
      if (!c) { c = { noise: null, pulse: {} }; ctxData.set(ctx, c); }
    } else {
      c = ctx.__gbg || (ctx.__gbg = { noise: null, pulse: {} });
    }
    return c;
  }

  function noiseBuffer(ctx) {
    var c = cacheFor(ctx);
    if (c.noise) return c.noise;
    var len = Math.floor(ctx.sampleRate * 2.5);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      // 轻微粉噪倾向，听感更柔和
      last = 0.94 * last + 0.06 * w;
      data[i] = w * 0.7 + last * 1.6;
    }
    c.noise = buf;
    return buf;
  }

  function pulseWave(ctx, duty) {
    var c = cacheFor(ctx);
    var key = String(duty);
    if (c.pulse[key]) return c.pulse[key];
    var n = 48;
    var real = new Float32Array(n);
    var imag = new Float32Array(n);
    for (var i = 1; i < n; i++) {
      imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    }
    var w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    c.pulse[key] = w;
    return w;
  }

  /* ---------------- 合成器音色定义 ----------------
   * env: a 起音, d 衰减, s 延音比例, r 释放
   * filt: type/freq/q/env{a,d,amt,s}
   * osc: [{w, mul, detune, gain, fm:{ratio,index,decay,sustain}, pitch:{from,time}}]
   * vib: {rate, depth, delay}
   * noise: {amt, decay, hp}
   * spread: 立体声展开 (0-1)
   */
  var DEFS = {
    /* ===== 键盘 / 打击旋律 ===== */
    piano: {
      name: '钢琴', group: 'keys', gain: 0.62, sendRev: 0.22, sendDly: 0.04,
      env: { a: 0.002, d: 1.1, s: 0.14, r: 0.4 },
      filt: { type: 'lowpass', freq: 4600, q: 0.4, env: { a: 0.002, d: 0.7, amt: 1.4, s: 0.35 } },
      osc: [
        { w: 'triangle', mul: 1, gain: 1 },
        { w: 'sine', mul: 2, gain: 0.42, detune: 2 },
        { w: 'sine', mul: 3, gain: 0.16 },
        { w: 'sine', mul: 4.02, gain: 0.08 }
      ],
      noise: { amt: 0.06, decay: 0.03, hp: 1200 },
      spread: 0.15
    },
    ePiano: {
      name: '电钢琴', group: 'keys', gain: 0.6, sendRev: 0.24, sendDly: 0.08,
      env: { a: 0.004, d: 1.0, s: 0.22, r: 0.5 },
      filt: { type: 'lowpass', freq: 3200, q: 0.6, env: { a: 0.004, d: 0.5, amt: 0.9, s: 0.5 } },
      osc: [
        { w: 'sine', mul: 1, gain: 1 },
        { w: 'sine', mul: 2, gain: 0.22 },
        { w: 'sine', mul: 1, gain: 0.35, fm: { ratio: 2, index: 1.6, decay: 0.35, sustain: 0.05 } }
      ],
      spread: 0.2
    },
    celesta: {
      name: '钟琴', group: 'keys', gain: 0.42, sendRev: 0.3, sendDly: 0.08,
      env: { a: 0.002, d: 0.9, s: 0.03, r: 0.7 },
      filt: { type: 'highpass', freq: 420, q: 0.5 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.9 },
        { w: 'sine', mul: 4, gain: 0.28 },
        { w: 'sine', mul: 6.01, gain: 0.1 }
      ],
      noise: { amt: 0.03, decay: 0.02, hp: 4000 },
      spread: 0.2
    },
    musicBox: {
      name: '八音盒', group: 'keys', gain: 0.38, sendRev: 0.42, sendDly: 0.14,
      env: { a: 0.002, d: 0.7, s: 0.02, r: 0.8 },
      filt: { type: 'highpass', freq: 600, q: 0.4 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.8 },
        { w: 'sine', mul: 5.4, gain: 0.18 },
        { w: 'sine', mul: 8.9, gain: 0.06 }
      ],
      noise: { amt: 0.04, decay: 0.015, hp: 5000 },
      spread: 0.3
    },
    vibes: {
      name: '颤音琴', group: 'keys', gain: 0.4, sendRev: 0.34, sendDly: 0.1,
      env: { a: 0.003, d: 1.4, s: 0.12, r: 1.2 },
      filt: { type: 'lowpass', freq: 5200, q: 0.5 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.9 },
        { w: 'sine', mul: 4, gain: 0.2 },
        { w: 'sine', mul: 10.1, gain: 0.04 }
      ],
      tremolo: { rate: 5.2, depth: 0.28 },
      spread: 0.35
    },
    marimba: {
      name: '马林巴', group: 'keys', gain: 0.5, sendRev: 0.18, sendDly: 0.04,
      env: { a: 0.002, d: 0.42, s: 0.02, r: 0.3 },
      filt: { type: 'lowpass', freq: 2600, q: 0.5, env: { a: 0.001, d: 0.2, amt: 1.2, s: 0.5 } },
      osc: [
        { w: 'sine', mul: 1, gain: 1 },
        { w: 'sine', mul: 4, gain: 0.3 },
        { w: 'sine', mul: 9.2, gain: 0.05 }
      ],
      noise: { amt: 0.05, decay: 0.02, hp: 2000 },
      spread: 0.1
    },
    glassBell: {
      name: '玻璃铃', group: 'keys', gain: 0.36, sendRev: 0.5, sendDly: 0.18,
      env: { a: 0.01, d: 1.6, s: 0.12, r: 1.6 },
      filt: { type: 'lowpass', freq: 6000, q: 0.7 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.9 },
        { w: 'sine', mul: 2.76, gain: 0.26 },
        { w: 'sine', mul: 5.4, gain: 0.12 }
      ],
      spread: 0.4
    },
    fmBell: {
      name: 'FM 铃音', group: 'keys', gain: 0.4, sendRev: 0.4, sendDly: 0.2,
      env: { a: 0.002, d: 1.2, s: 0.06, r: 1.1 },
      filt: { type: 'lowpass', freq: 7000, q: 0.6 },
      osc: [
        { w: 'sine', mul: 1, gain: 1, fm: { ratio: 3.5, index: 2.4, decay: 0.5, sustain: 0.08 } }
      ],
      spread: 0.3
    },

    /* ===== 拨弦 / 民族 ===== */
    harp: {
      name: '竖琴', group: 'pluck', gain: 0.5, sendRev: 0.36, sendDly: 0.06,
      env: { a: 0.002, d: 0.65, s: 0.06, r: 0.7 },
      filt: { type: 'lowpass', freq: 6000, q: 0.5, env: { a: 0.002, d: 0.35, amt: 1.2, s: 0.3 } },
      osc: [
        { w: 'triangle', mul: 1, gain: 0.9 },
        { w: 'sawtooth', mul: 1, gain: 0.16, detune: 4 },
        { w: 'sine', mul: 2, gain: 0.25 }
      ],
      noise: { amt: 0.05, decay: 0.02, hp: 3000 },
      spread: 0.3
    },
    guzheng: {
      name: '古筝', group: 'ethnic', gain: 0.48, sendRev: 0.34, sendDly: 0.06,
      env: { a: 0.002, d: 0.9, s: 0.08, r: 0.5 },
      filt: { type: 'lowpass', freq: 5000, q: 1.2, env: { a: 0.002, d: 0.4, amt: 1.3, s: 0.3 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.5 },
        { w: 'triangle', mul: 1, gain: 0.7 },
        { w: 'sine', mul: 3, gain: 0.12 }
      ],
      vib: { rate: 5.6, depth: 9, delay: 0.25 },
      noise: { amt: 0.04, decay: 0.015, hp: 3500 },
      spread: 0.25
    },
    pipa: {
      name: '琵琶', group: 'ethnic', gain: 0.44, sendRev: 0.26, sendDly: 0.05,
      env: { a: 0.001, d: 0.28, s: 0.02, r: 0.25 },
      filt: { type: 'lowpass', freq: 7000, q: 1.5, env: { a: 0.001, d: 0.15, amt: 1.4, s: 0.2 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.45 },
        { w: 'triangle', mul: 2, gain: 0.35 }
      ],
      noise: { amt: 0.08, decay: 0.02, hp: 4000 },
      spread: 0.2
    },
    koto: {
      name: '筝（和风）', group: 'ethnic', gain: 0.48, sendRev: 0.4, sendDly: 0.06,
      env: { a: 0.002, d: 0.8, s: 0.05, r: 0.6 },
      filt: { type: 'lowpass', freq: 4200, q: 1, env: { a: 0.002, d: 0.3, amt: 1.1, s: 0.3 } },
      osc: [
        { w: 'triangle', mul: 1, gain: 0.9 },
        { w: 'sawtooth', mul: 1, gain: 0.18, detune: -5 },
        { w: 'sine', mul: 2, gain: 0.14 }
      ],
      vib: { rate: 5, depth: 6, delay: 0.3 },
      noise: { amt: 0.04, decay: 0.015, hp: 3000 },
      spread: 0.3
    },
    shamisen: {
      name: '三味线', group: 'ethnic', gain: 0.4, sendRev: 0.24, sendDly: 0.05,
      env: { a: 0.001, d: 0.22, s: 0.02, r: 0.2 },
      filt: { type: 'bandpass', freq: 1600, q: 1.2 },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.4 },
        { w: 'triangle', mul: 1, gain: 0.3 }
      ],
      noise: { amt: 0.12, decay: 0.02, hp: 2500 },
      spread: 0.1
    },
    lute: {
      name: '鲁特琴', group: 'ethnic', gain: 0.4, sendRev: 0.28, sendDly: 0.05,
      env: { a: 0.002, d: 0.45, s: 0.05, r: 0.35 },
      filt: { type: 'lowpass', freq: 3200, q: 1 },
      osc: [
        { w: 'triangle', mul: 1, gain: 0.8 },
        { w: 'sawtooth', mul: 1, gain: 0.2, detune: 6 }
      ],
      noise: { amt: 0.05, decay: 0.02, hp: 2000 },
      spread: 0.2
    },
    pizzStrings: {
      name: '拨弦组', group: 'pluck', gain: 0.46, sendRev: 0.22, sendDly: 0.03,
      env: { a: 0.002, d: 0.3, s: 0.04, r: 0.3 },
      filt: { type: 'lowpass', freq: 2600, q: 0.8 },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.5 },
        { w: 'triangle', mul: 1, gain: 0.5 },
        { w: 'sine', mul: 2, gain: 0.15 }
      ],
      noise: { amt: 0.06, decay: 0.02, hp: 2500 },
      spread: 0.35
    },

    /* ===== 弦乐 / 铜管 ===== */
    strings: {
      name: '弦乐组', group: 'strings', gain: 0.3, sendRev: 0.36, sendDly: 0.03,
      env: { a: 0.28, d: 0.4, s: 0.85, r: 0.7 },
      filt: { type: 'lowpass', freq: 2300, q: 0.6, env: { a: 0.2, d: 0.3, amt: 0.5, s: 0.8 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.5, detune: -7 },
        { w: 'sawtooth', mul: 1, gain: 0.5, detune: 7 },
        { w: 'sawtooth', mul: 1, gain: 0.3, detune: 0 }
      ],
      vib: { rate: 4.8, depth: 5, delay: 0.4 },
      spread: 0.6
    },
    stringPad: {
      name: '弦乐铺底', group: 'strings', gain: 0.28, sendRev: 0.42, sendDly: 0.03,
      env: { a: 0.75, d: 0.6, s: 0.9, r: 1.4 },
      filt: { type: 'lowpass', freq: 1600, q: 0.5, env: { a: 0.5, d: 0.5, amt: 0.5, s: 0.9 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.45, detune: -11 },
        { w: 'sawtooth', mul: 1, gain: 0.45, detune: 11 },
        { w: 'sawtooth', mul: 0.5, gain: 0.25 }
      ],
      vib: { rate: 4.2, depth: 4, delay: 0.8 },
      spread: 0.7
    },
    soloViolin: {
      name: '小提琴', group: 'strings', gain: 0.34, sendRev: 0.32, sendDly: 0.04,
      env: { a: 0.12, d: 0.3, s: 0.88, r: 0.35 },
      filt: { type: 'lowpass', freq: 3200, q: 0.8 },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.7 },
        { w: 'square', mul: 1, gain: 0.1, detune: 4 }
      ],
      vib: { rate: 5.5, depth: 13, delay: 0.25 },
      spread: 0.2
    },
    fiddle: {
      name: '凯尔特小提琴', group: 'strings', gain: 0.34, sendRev: 0.3, sendDly: 0.04,
      env: { a: 0.06, d: 0.25, s: 0.86, r: 0.3 },
      filt: { type: 'lowpass', freq: 3400, q: 0.9 },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.65 },
        { w: 'sawtooth', mul: 1, gain: 0.2, detune: 8 }
      ],
      vib: { rate: 6, depth: 10, delay: 0.18 },
      noise: { amt: 0.015, decay: 0.08, hp: 2000 },
      spread: 0.3
    },
    cello: {
      name: '大提琴', group: 'strings', gain: 0.36, sendRev: 0.3, sendDly: 0.03,
      env: { a: 0.14, d: 0.35, s: 0.86, r: 0.5 },
      filt: { type: 'lowpass', freq: 1400, q: 0.7 },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.6 },
        { w: 'sawtooth', mul: 0.5, gain: 0.25 },
        { w: 'triangle', mul: 2, gain: 0.12 }
      ],
      vib: { rate: 4.6, depth: 7, delay: 0.3 },
      spread: 0.3
    },
    brassSection: {
      name: '铜管组', group: 'brass', gain: 0.34, sendRev: 0.3, sendDly: 0.04,
      env: { a: 0.05, d: 0.3, s: 0.82, r: 0.35 },
      filt: { type: 'lowpass', freq: 900, q: 0.9, env: { a: 0.06, d: 0.35, amt: 2.2, s: 0.55 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.6, detune: -5 },
        { w: 'sawtooth', mul: 1, gain: 0.5, detune: 6 },
        { w: 'square', mul: 1, gain: 0.1 }
      ],
      vib: { rate: 5, depth: 4, delay: 0.45 },
      spread: 0.4
    },
    brassStab: {
      name: '铜管重击', group: 'brass', gain: 0.38, sendRev: 0.26, sendDly: 0.05,
      env: { a: 0.008, d: 0.18, s: 0.25, r: 0.25 },
      filt: { type: 'lowpass', freq: 1200, q: 1.1, env: { a: 0.01, d: 0.2, amt: 2.4, s: 0.2 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.6, detune: -6 },
        { w: 'sawtooth', mul: 1, gain: 0.6, detune: 6 },
        { w: 'square', mul: 0.5, gain: 0.15 }
      ],
      spread: 0.5
    },
    frenchHorn: {
      name: '圆号', group: 'brass', gain: 0.3, sendRev: 0.36, sendDly: 0.03,
      env: { a: 0.1, d: 0.35, s: 0.84, r: 0.5 },
      filt: { type: 'lowpass', freq: 700, q: 0.7, env: { a: 0.12, d: 0.4, amt: 1.4, s: 0.6 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.5, detune: -4 },
        { w: 'sine', mul: 1, gain: 0.4 },
        { w: 'triangle', mul: 2, gain: 0.1 }
      ],
      vib: { rate: 4.4, depth: 4, delay: 0.5 },
      spread: 0.3
    },

    /* ===== 管乐 ===== */
    flute: {
      name: '长笛', group: 'winds', gain: 0.34, sendRev: 0.34, sendDly: 0.05,
      env: { a: 0.07, d: 0.25, s: 0.88, r: 0.25 },
      filt: { type: 'lowpass', freq: 3600, q: 0.6 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.8 },
        { w: 'triangle', mul: 2, gain: 0.16 },
        { w: 'sine', mul: 3, gain: 0.06 }
      ],
      vib: { rate: 5.2, depth: 9, delay: 0.28 },
      noise: { amt: 0.06, decay: 0.12, hp: 2600 },
      spread: 0.3
    },
    recorder: {
      name: '竖笛', group: 'winds', gain: 0.3, sendRev: 0.3, sendDly: 0.04,
      env: { a: 0.03, d: 0.2, s: 0.9, r: 0.18 },
      filt: { type: 'lowpass', freq: 3000, q: 0.8 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.7 },
        { w: 'triangle', mul: 2, gain: 0.2 }
      ],
      vib: { rate: 5.6, depth: 6, delay: 0.2 },
      noise: { amt: 0.09, decay: 0.06, hp: 3000 },
      spread: 0.2
    },
    whistle: {
      name: '锡笛', group: 'winds', gain: 0.28, sendRev: 0.3, sendDly: 0.05,
      env: { a: 0.02, d: 0.2, s: 0.9, r: 0.2 },
      filt: { type: 'lowpass', freq: 4200, q: 0.9 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.7 },
        { w: 'triangle', mul: 3, gain: 0.1 }
      ],
      vib: { rate: 6, depth: 11, delay: 0.2 },
      noise: { amt: 0.1, decay: 0.05, hp: 3500 },
      spread: 0.2
    },
    dizi: {
      name: '笛子', group: 'ethnic-wind', gain: 0.32, sendRev: 0.36, sendDly: 0.06,
      env: { a: 0.04, d: 0.25, s: 0.86, r: 0.3 },
      filt: { type: 'lowpass', freq: 3800, q: 0.8 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.72 },
        { w: 'triangle', mul: 2, gain: 0.22 },
        { w: 'sine', mul: 3, gain: 0.08 }
      ],
      vib: { rate: 6.2, depth: 14, delay: 0.2 },
      noise: { amt: 0.1, decay: 0.07, hp: 2800 },
      spread: 0.25
    },
    shakuhachi: {
      name: '尺八', group: 'ethnic-wind', gain: 0.3, sendRev: 0.44, sendDly: 0.06,
      env: { a: 0.09, d: 0.3, s: 0.85, r: 0.4 },
      filt: { type: 'lowpass', freq: 2400, q: 0.7 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.8 },
        { w: 'triangle', mul: 1, gain: 0.2 },
        { w: 'sine', mul: 2, gain: 0.1 }
      ],
      vib: { rate: 4.8, depth: 16, delay: 0.35 },
      noise: { amt: 0.18, decay: 0.25, hp: 1500 },
      spread: 0.3
    },
    erhu: {
      name: '二胡', group: 'ethnic-wind', gain: 0.3, sendRev: 0.36, sendDly: 0.05,
      env: { a: 0.09, d: 0.3, s: 0.88, r: 0.4 },
      filt: { type: 'lowpass', freq: 2600, q: 0.9 },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.6 },
        { w: 'sine', mul: 1, gain: 0.4 },
        { w: 'sine', mul: 2, gain: 0.1 }
      ],
      vib: { rate: 6, depth: 16, delay: 0.3 },
      spread: 0.25
    },

    /* ===== 合成器 ===== */
    warmPad: {
      name: '暖垫 Pad', group: 'synth', gain: 0.3, sendRev: 0.34, sendDly: 0.08,
      env: { a: 0.6, d: 0.6, s: 0.88, r: 1.3 },
      filt: { type: 'lowpass', freq: 1000, q: 0.6, env: { a: 0.4, d: 0.5, amt: 0.6, s: 0.8 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.4, detune: -9 },
        { w: 'sawtooth', mul: 1, gain: 0.4, detune: 9 },
        { w: 'triangle', mul: 0.5, gain: 0.3 }
      ],
      vib: { rate: 3.2, depth: 3, delay: 1 },
      spread: 0.6
    },
    glassPad: {
      name: '玻璃 Pad', group: 'synth', gain: 0.28, sendRev: 0.5, sendDly: 0.18,
      env: { a: 1.1, d: 0.8, s: 0.9, r: 2 },
      filt: { type: 'lowpass', freq: 2600, q: 0.5 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.5 },
        { w: 'sine', mul: 2.01, gain: 0.22 },
        { w: 'sine', mul: 3.02, gain: 0.12 },
        { w: 'sine', mul: 4.99, gain: 0.06 }
      ],
      vib: { rate: 2.4, depth: 5, delay: 1.2 },
      spread: 0.7
    },
    choirPad: {
      name: '人声垫', group: 'synth', gain: 0.28, sendRev: 0.55, sendDly: 0.1,
      env: { a: 0.9, d: 0.8, s: 0.9, r: 1.8 },
      filt: { type: 'lowpass', freq: 1800, q: 0.4 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.45, detune: -6 },
        { w: 'sine', mul: 1, gain: 0.45, detune: 7 },
        { w: 'sine', mul: 2, gain: 0.18 },
        { w: 'sine', mul: 3.01, gain: 0.08 }
      ],
      vib: { rate: 4, depth: 9, delay: 0.8 },
      spread: 0.75
    },
    organPad: {
      name: '风琴', group: 'synth', gain: 0.25, sendRev: 0.28, sendDly: 0.04,
      env: { a: 0.04, d: 0.2, s: 0.9, r: 0.3 },
      filt: { type: 'lowpass', freq: 3000, q: 0.4 },
      osc: [
        { w: 'sine', mul: 1, gain: 0.5 },
        { w: 'sine', mul: 2, gain: 0.28 },
        { w: 'sine', mul: 3, gain: 0.16 },
        { w: 'sine', mul: 4, gain: 0.1 },
        { w: 'sine', mul: 6, gain: 0.05 }
      ],
      spread: 0.3
    },
    supersaw: {
      name: '超级锯齿', group: 'synth', gain: 0.22, sendRev: 0.3, sendDly: 0.12,
      env: { a: 0.03, d: 0.3, s: 0.85, r: 0.3 },
      filt: { type: 'lowpass', freq: 2800, q: 0.7, env: { a: 0.02, d: 0.5, amt: 0.8, s: 0.6 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.3, detune: -18 },
        { w: 'sawtooth', mul: 1, gain: 0.3, detune: -9 },
        { w: 'sawtooth', mul: 1, gain: 0.3, detune: 0 },
        { w: 'sawtooth', mul: 1, gain: 0.3, detune: 9 },
        { w: 'sawtooth', mul: 1, gain: 0.3, detune: 18 }
      ],
      spread: 0.9
    },
    sawLead: {
      name: '锯齿主音', group: 'synth', gain: 0.3, sendRev: 0.24, sendDly: 0.18,
      env: { a: 0.01, d: 0.2, s: 0.8, r: 0.25 },
      filt: { type: 'lowpass', freq: 2200, q: 1.2, env: { a: 0.01, d: 0.3, amt: 1.2, s: 0.6 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.65 },
        { w: 'square', mul: 1, gain: 0.15, detune: 7 },
        { w: 'sine', mul: 0.5, gain: 0.2 }
      ],
      vib: { rate: 5.4, depth: 6, delay: 0.3 },
      spread: 0.4
    },
    squareLead: {
      name: '方波主音', group: 'synth', gain: 0.28, sendRev: 0.2, sendDly: 0.14,
      env: { a: 0.008, d: 0.2, s: 0.8, r: 0.2 },
      filt: { type: 'lowpass', freq: 3000, q: 0.8 },
      osc: [
        { w: 'square', mul: 1, gain: 0.6 },
        { w: 'square', mul: 1, gain: 0.2, detune: 8 }
      ],
      vib: { rate: 5.5, depth: 5, delay: 0.3 },
      spread: 0.3
    },
    pulse25: {
      name: '25% 方波', group: 'chip', gain: 0.26, sendRev: 0.12, sendDly: 0.16,
      env: { a: 0.003, d: 0.12, s: 0.72, r: 0.06 },
      filt: { type: 'lowpass', freq: 5200, q: 0.5 },
      osc: [{ w: 'pulse', duty: 0.25, mul: 1, gain: 0.8 }],
      spread: 0.1
    },
    pulse12: {
      name: '12.5% 方波', group: 'chip', gain: 0.24, sendRev: 0.1, sendDly: 0.14,
      env: { a: 0.002, d: 0.1, s: 0.7, r: 0.05 },
      filt: { type: 'lowpass', freq: 4200, q: 0.6 },
      osc: [{ w: 'pulse', duty: 0.125, mul: 1, gain: 0.8 }],
      spread: 0.1
    },
    pluckSynth: {
      name: '合成拨弦', group: 'synth', gain: 0.32, sendRev: 0.22, sendDly: 0.16,
      env: { a: 0.003, d: 0.2, s: 0.08, r: 0.2 },
      filt: { type: 'lowpass', freq: 4200, q: 1.4, env: { a: 0.002, d: 0.16, amt: 1.6, s: 0.15 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.5 },
        { w: 'square', mul: 1, gain: 0.2 }
      ],
      spread: 0.4
    },
    triangleBass: {
      name: '三角波贝斯', group: 'chip', gain: 0.42, sendRev: 0.05, sendDly: 0.02,
      env: { a: 0.002, d: 0.08, s: 0.95, r: 0.04 },
      filt: { type: 'lowpass', freq: 1200, q: 0.4 },
      osc: [{ w: 'triangle', mul: 1, gain: 1 }],
      spread: 0
    },
    sineSub: {
      name: '正弦低音', group: 'bass', gain: 0.5, sendRev: 0.06, sendDly: 0.02,
      env: { a: 0.01, d: 0.2, s: 0.92, r: 0.25 },
      filt: { type: 'lowpass', freq: 320, q: 0.4 },
      osc: [
        { w: 'sine', mul: 1, gain: 1 },
        { w: 'triangle', mul: 2, gain: 0.06 }
      ],
      spread: 0
    },
    sawBass: {
      name: '锯齿贝斯', group: 'bass', gain: 0.36, sendRev: 0.08, sendDly: 0.03,
      env: { a: 0.004, d: 0.18, s: 0.7, r: 0.12 },
      filt: { type: 'lowpass', freq: 520, q: 1.2, env: { a: 0.006, d: 0.2, amt: 1.5, s: 0.4 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.6 },
        { w: 'sine', mul: 1, gain: 0.28 }
      ],
      spread: 0.1
    },
    reeseBass: {
      name: 'Reese 贝斯', group: 'bass', gain: 0.34, sendRev: 0.1, sendDly: 0.03,
      env: { a: 0.012, d: 0.25, s: 0.85, r: 0.2 },
      filt: { type: 'lowpass', freq: 420, q: 1.6, env: { a: 0.02, d: 0.3, amt: 0.9, s: 0.55 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.5, detune: -14 },
        { w: 'sawtooth', mul: 1, gain: 0.5, detune: 14 },
        { w: 'sine', mul: 1, gain: 0.32 }
      ],
      vib: { rate: 0.8, depth: 7, delay: 0.1 },
      spread: 0.4
    },
    acidBass: {
      name: 'Acid 贝斯', group: 'bass', gain: 0.32, sendRev: 0.12, sendDly: 0.06,
      env: { a: 0.003, d: 0.15, s: 0.5, r: 0.1 },
      filt: { type: 'lowpass', freq: 400, q: 12, env: { a: 0.005, d: 0.18, amt: 4, s: 0.25 } },
      osc: [
        { w: 'sawtooth', mul: 1, gain: 0.7 },
        { w: 'square', mul: 0.5, gain: 0.3 }
      ],
      spread: 0
    },
    fm808: {
      name: '808 低音', group: 'bass', gain: 0.44, sendRev: 0.05, sendDly: 0.02,
      env: { a: 0.002, d: 0.8, s: 0.3, r: 0.3 },
      filt: { type: 'lowpass', freq: 280, q: 0.5 },
      osc: [
        { w: 'sine', mul: 1, gain: 1, pitch: { from: 2.4, time: 0.06 } },
        { w: 'triangle', mul: 2, gain: 0.06 }
      ],
      spread: 0
    },
    uprightBass: {
      name: '立式贝斯', group: 'bass', gain: 0.4, sendRev: 0.14, sendDly: 0.02,
      env: { a: 0.006, d: 0.55, s: 0.28, r: 0.25 },
      filt: { type: 'lowpass', freq: 1400, q: 0.8, env: { a: 0.005, d: 0.25, amt: 0.8, s: 0.5 } },
      osc: [
        { w: 'triangle', mul: 1, gain: 0.7 },
        { w: 'sine', mul: 2, gain: 0.22 },
        { w: 'sawtooth', mul: 1, gain: 0.12 }
      ],
      noise: { amt: 0.04, decay: 0.03, hp: 1200 },
      spread: 0.1
    },

    /* ===== 纹理 / 音效 ===== */
    airTexture: {
      name: '空气质感', group: 'fx', gain: 0.16, sendRev: 0.6, sendDly: 0.1, noiseOnly: 'air',
      env: { a: 1.5, d: 1, s: 0.9, r: 2.5 },
      filt: { type: 'bandpass', freq: 1200, q: 0.8 }
    },
    vinylNoise: {
      name: '磁带噪底', group: 'fx', gain: 0.1, sendRev: 0.1, sendDly: 0.02, noiseOnly: 'vinyl',
      env: { a: 0.4, d: 0.2, s: 0.95, r: 0.8 },
      filt: { type: 'highpass', freq: 1800, q: 0.4 }
    },
    noiseRiser: {
      name: '上升音效', group: 'fx', gain: 0.14, sendRev: 0.4, sendDly: 0.2, noiseOnly: 'sweep',
      env: { a: 0.2, d: 0.5, s: 0.9, r: 0.5 },
      filt: { type: 'bandpass', freq: 600, q: 2 }
    }
  };

  /* ---------------- 鼓组音色 ---------------- */
  var DRUMS = {
    /* 管弦 */
    timpani:   { name: '定音鼓', kind: 'tom', f: [120, 62], decay: 1.3, gain: 0.9, noise: 0.5, lp: 900 },
    bassDrum:  { name: '大鼓', kind: 'kick', f: [140, 48], decay: 0.9, gain: 0.95, click: 0.25, noise: 0.5 },
    orchSnare: { name: '军鼓', kind: 'snare', f: 190, decay: 0.22, gain: 0.6, noise: 0.8, bp: 2200 },
    taiko:     { name: '太鼓', kind: 'tom', f: [150, 72], decay: 0.55, gain: 0.9, noise: 0.35, lp: 700 },
    tom:       { name: '嗵鼓', kind: 'tom', f: [200, 110], decay: 0.35, gain: 0.7, noise: 0.3, lp: 1300 },
    crash:     { name: '镲片', kind: 'cymbal', decay: 1.8, gain: 0.4, hp: 3500, noise: 1 },
    /* 电子 */
    kick909:   { name: '909 底鼓', kind: 'kick', f: [180, 50], decay: 0.34, gain: 1, click: 0.4, noise: 0.2 },
    snare909:  { name: '909 军鼓', kind: 'snare', f: 200, decay: 0.18, gain: 0.62, noise: 0.8, bp: 1800 },
    clap:      { name: '拍手', kind: 'clap', decay: 0.16, gain: 0.6, bp: 1400 },
    hat909:    { name: '闭镲', kind: 'hat', decay: 0.045, gain: 0.34, hp: 8000 },
    openHat:   { name: '开镲', kind: 'hat', decay: 0.3, gain: 0.3, hp: 7000 },
    ride909:   { name: '叮叮镲', kind: 'cymbal', decay: 0.5, gain: 0.24, hp: 5000, noise: 1 },
    rimshot:   { name: '边击', kind: 'wood', f: 880, decay: 0.07, gain: 0.4 },
    /* 柔和 */
    kickSoft:  { name: '柔底鼓', kind: 'kick', f: [120, 46], decay: 0.45, gain: 0.7, click: 0.1, noise: 0.1 },
    snap:      { name: '响指', kind: 'clap', decay: 0.12, gain: 0.5, bp: 2000 },
    hatSoft:   { name: '柔闭镲', kind: 'hat', decay: 0.04, gain: 0.26, hp: 7500 },
    brush:     { name: '鼓刷', kind: 'snare', f: 170, decay: 0.2, gain: 0.34, noise: 1, bp: 2600 },
    /* 鼓打贝斯 */
    kickPunch: { name: '冲击底鼓', kind: 'kick', f: [200, 55], decay: 0.28, gain: 1, click: 0.55, noise: 0.15 },
    breakSnare:{ name: '碎拍军鼓', kind: 'snare', f: 210, decay: 0.2, gain: 0.7, noise: 0.9, bp: 2100 },
    ghostSnare:{ name: '鬼音军鼓', kind: 'snare', f: 230, decay: 0.08, gain: 0.3, noise: 0.7, bp: 2600 },
    /* 芯片 */
    chipKick:  { name: '芯片底鼓', kind: 'kick', f: [260, 60], decay: 0.14, gain: 0.8, click: 0, noise: 0.1 },
    chipSnare: { name: '芯片军鼓', kind: 'noiseSnare', decay: 0.13, gain: 0.5, hp: 1200 },
    chipHat:   { name: '芯片镲', kind: 'noiseHat', decay: 0.035, gain: 0.22, hp: 6000 },
    chipTom:   { name: '芯片嗵鼓', kind: 'tom', f: [300, 150], decay: 0.12, gain: 0.5, noise: 0.05, lp: 2000 },
    /* 民族 / 部落 */
    woodblock: { name: '木鱼', kind: 'wood', f: 1200, decay: 0.06, gain: 0.35 },
    gong:      { name: '锣', kind: 'gong', decay: 3.2, gain: 0.4, noise: 0.8 },
    djembe:    { name: '金贝鼓', kind: 'tom', f: [180, 78], decay: 0.3, gain: 0.75, noise: 0.4, lp: 1200 },
    shaker:    { name: '沙锤', kind: 'noiseHat', decay: 0.07, gain: 0.22, hp: 5000, bp: 0 },
    tambourine:{ name: '铃鼓', kind: 'noiseHat', decay: 0.14, gain: 0.24, hp: 6500 },
    /* 爵士 */
    rideJazz:  { name: '爵士叮叮镲', kind: 'cymbal', decay: 0.75, gain: 0.2, hp: 4200, noise: 1 },
    hatPedal:  { name: '踩镲', kind: 'hat', decay: 0.06, gain: 0.2, hp: 7000 },
    /* 悬疑 / 恐怖 */
    heartbeat: { name: '心跳', kind: 'kick', f: [90, 42], decay: 0.5, gain: 0.85, click: 0, noise: 0.05, lp: 300 },
    metalHit:  { name: '金属撞击', kind: 'metal', decay: 1.6, gain: 0.3, noise: 0.5 },
    tick:      { name: '滴答', kind: 'wood', f: 1600, decay: 0.03, gain: 0.24 },
    subBoom:   { name: '次低冲击', kind: 'kick', f: [110, 30], decay: 1.6, gain: 0.7, click: 0, noise: 0.05, lp: 200 }
  };

  var KITS = {
    orch:    { kick: 'timpani', snare: 'orchSnare', hat: 'shaker', taiko: 'taiko', tom: 'tom', crash: 'crash' },
    battle:  { kick: 'bassDrum', snare: 'orchSnare', hat: 'shaker', taiko: 'taiko', tom: 'tom', crash: 'crash' },
    elec:    { kick: 'kick909', snare: 'snare909', clap: 'clap', hat: 'hat909', openhat: 'openHat', ride: 'ride909', rim: 'rimshot' },
    edm:     { kick: 'kick909', clap: 'clap', hat: 'hat909', openhat: 'openHat', ride: 'ride909', snare: 'snare909' },
    lofi:    { kick: 'kickSoft', snap: 'snap', hat: 'hatSoft', shaker: 'shaker', rim: 'rimshot', snare: 'brush' },
    dnb:     { kick: 'kickPunch', snare: 'breakSnare', hat: 'hat909', openhat: 'openHat', ghost: 'ghostSnare' },
    chip:    { kick: 'chipKick', snare: 'chipSnare', hat: 'chipHat', tom: 'chipTom' },
    ethnic:  { kick: 'bassDrum', taiko: 'taiko', wood: 'woodblock', gong: 'gong', shaker: 'shaker', snare: 'orchSnare' },
    celtic:  { kick: 'kickSoft', snare: 'rimshot', shaker: 'shaker', tom: 'tom', hat: 'hatSoft' },
    tribal:  { kick: 'djembe', taiko: 'taiko', snare: 'clap', shaker: 'shaker', tom: 'tom' },
    jazz:    { kick: 'kickSoft', ride: 'rideJazz', brush: 'brush', pedal: 'hatPedal', rim: 'rimshot' },
    tension: { kick: 'kickSoft', tick: 'tick', hat: 'hatSoft', rim: 'rimshot' },
    horror:  { kick: 'heartbeat', metal: 'metalHit', tick: 'tick', sub: 'subBoom' },
    ambient: { kick: 'subBoom', sub: 'subBoom', hat: 'hatSoft', tick: 'tick' },
    casual:  { kick: 'kickSoft', snap: 'snap', shaker: 'shaker', wood: 'woodblock' }
  };

  var PITCHED_DRUM = { timpani: true, tom: true, taiko: true, djembe: true, chipTom: true, bassDrum: true, kickSoft: true, subBoom: true };

  /* ---------------- 播放：旋律音色 ---------------- */
  function playVoice(ctx, buses, instId, midi, when, dur, vel, opts) {
    opts = opts || {};
    var inst = DEFS[instId] || DEFS.piano;
    var t0 = Math.max(when, ctx.currentTime + 0.002);
    var end = t0 + Math.max(0.05, dur);
    var stopAt = end + inst.env.r + 0.1;
    var freq = U.midiToFreq(midi + (opts.transpose || 0));
    var sources = [];

    if (inst.noiseOnly) {
      return playNoiseTexture(ctx, buses, inst, t0, dur, vel, freq, opts);
    }

    var out = ctx.createGain();
    var panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = U.clamp(opts.pan || 0, -1, 1);
      out.connect(panner);
    }
    var tail = panner || out;

    // 动态：力度影响音量与亮度
    var peak = inst.gain * (0.28 + 0.72 * vel) * (opts.gain || 1);
    var env = inst.env;

    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(peak, t0 + Math.min(env.a, Math.max(0.004, dur * 0.5)));
    out.gain.setTargetAtTime(peak * env.s, t0 + Math.min(env.a, Math.max(0.004, dur * 0.5)), Math.max(0.015, env.d / 3.2));
    var relStart = Math.max(t0 + 0.02, end);
    // 保持到释放点
    out.gain.setTargetAtTime(0.0001, relStart, Math.max(0.02, env.r / 3.5));

    // 混响/延迟发送
    var revAmt = opts.sends && opts.sends.rev !== undefined ? opts.sends.rev : inst.sendRev;
    var dlyAmt = opts.sends && opts.sends.dly !== undefined ? opts.sends.dly : inst.sendDly;
    if (buses.reverb && revAmt > 0.001) {
      var rg = ctx.createGain(); rg.gain.value = revAmt;
      tail.connect(rg); rg.connect(buses.reverb);
    }
    if (buses.delay && dlyAmt > 0.001) {
      var dg = ctx.createGain(); dg.gain.value = dlyAmt;
      tail.connect(dg); dg.connect(buses.delay);
    }
    tail.connect(buses.input || buses.dry || ctx.destination);

    // 滤波器
    var filt = null;
    if (inst.filt) {
      filt = ctx.createBiquadFilter();
      filt.type = inst.filt.type || 'lowpass';
      filt.Q.value = inst.filt.q || 0.7;
      var base = inst.filt.freq * (0.75 + 0.5 * vel);
      var fenv = inst.filt.env;
      if (fenv) {
        filt.frequency.setValueAtTime(Math.max(60, base * 0.7), t0);
        filt.frequency.linearRampToValueAtTime(Math.min(18000, base * (1 + fenv.amt)), t0 + Math.max(0.002, fenv.a));
        filt.frequency.setTargetAtTime(Math.min(18000, base * (fenv.s || 1)), t0 + Math.max(0.003, fenv.a), Math.max(0.02, (fenv.d || 0.2) / 3));
      } else {
        filt.frequency.value = Math.min(18000, base);
      }
      filt.connect(out);
    }
    var dest = filt || out;

    // 音源
    var oscs = [];
    var lfoTargets = [];
    var nOsc = inst.osc.length;
    inst.osc.forEach(function (spec, i) {
      var o = ctx.createOscillator();
      if (spec.w === 'pulse') {
        o.setPeriodicWave(pulseWave(ctx, spec.duty || 0.25));
      } else {
        o.type = spec.w || 'sine';
      }
      var f = freq * (spec.mul || 1);
      if (spec.pitch) {
        o.frequency.setValueAtTime(Math.max(20, f * spec.pitch.from), t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f), t0 + (spec.pitch.time || 0.05));
      } else {
        o.frequency.value = f;
      }
      if (spec.detune) o.detune.value = spec.detune;

      var og = ctx.createGain();
      og.gain.value = spec.gain === undefined ? 1 : spec.gain;

      if (inst.spread && ctx.createStereoPanner && nOsc > 1) {
        var sp = ctx.createStereoPanner();
        sp.pan.value = inst.spread * ((i / (nOsc - 1)) - 0.5) * 1.6;
        o.connect(og); og.connect(sp); sp.connect(dest);
      } else {
        o.connect(og); og.connect(dest);
      }

      // FM 调制
      if (spec.fm) {
        var mod = ctx.createOscillator();
        mod.type = spec.fm.type || 'sine';
        mod.frequency.value = f * spec.fm.ratio;
        var mg = ctx.createGain();
        mg.gain.setValueAtTime(f * spec.fm.index, t0);
        mg.gain.setTargetAtTime(f * spec.fm.index * (spec.fm.sustain === undefined ? 0.1 : spec.fm.sustain), t0, Math.max(0.01, (spec.fm.decay || 0.3) / 3));
        mod.connect(mg); mg.connect(o.frequency);
        mod.start(t0); mod.stop(stopAt);
        sources.push(mod);
      }

      o.start(t0);
      o.stop(stopAt);
      sources.push(o);
      oscs.push(o);
      lfoTargets.push(o.detune);
    });

    // 颤音
    if (inst.vib && oscs.length) {
      var lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = inst.vib.rate;
      var lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t0);
      lg.gain.linearRampToValueAtTime(inst.vib.depth, t0 + Math.max(0.05, inst.vib.delay || 0.2));
      lfo.connect(lg);
      lfoTargets.forEach(function (d) { lg.connect(d); });
      lfo.start(t0); lfo.stop(stopAt);
      sources.push(lfo);
    }

    // 全局颤动（颤音琴）
    if (inst.tremolo) {
      var tl = ctx.createOscillator();
      tl.frequency.value = inst.tremolo.rate;
      var tg = ctx.createGain();
      tg.gain.value = peak * inst.tremolo.depth;
      tl.connect(tg); tg.connect(out.gain);
      tl.start(t0); tl.stop(stopAt);
      sources.push(tl);
    }

    // 噪声瞬态
    if (inst.noise) {
      var ns = ctx.createBufferSource();
      ns.buffer = noiseBuffer(ctx);
      ns.loop = true;
      var nf = ctx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = inst.noise.hp || 1500;
      var ng = ctx.createGain();
      var namp = peak * (inst.noise.amt || 0.1) * 2.2;
      ng.gain.setValueAtTime(namp, t0);
      ng.gain.setTargetAtTime(0.0001, t0, Math.max(0.01, (inst.noise.decay || 0.05) / 2.5));
      ns.connect(nf); nf.connect(ng); ng.connect(out);
      ns.start(t0); ns.stop(t0 + Math.min(dur + 0.2, 0.8));
      sources.push(ns);
    }

    return { sources: sources, gain: out, end: stopAt };
  }

  /* ---------------- 噪声纹理 ---------------- */
  function playNoiseTexture(ctx, buses, inst, t0, dur, vel, freq, opts) {
    var out = ctx.createGain();
    var panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = U.clamp(opts.pan || 0, -1, 1);
      out.connect(panner);
    }
    var tail = panner || out;
    var peak = inst.gain * (0.3 + 0.7 * vel) * (opts.gain || 1);
    var len = Math.max(0.4, dur);
    var a = Math.min(inst.env.a, len * 0.6);

    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(peak, t0 + a);
    out.gain.setTargetAtTime(peak * inst.env.s, t0 + a, Math.max(0.05, inst.env.d / 3));
    out.gain.setTargetAtTime(0.0001, t0 + len, Math.max(0.05, inst.env.r / 3));

    var revAmt = opts.sends && opts.sends.rev !== undefined ? opts.sends.rev : inst.sendRev;
    if (buses.reverb && revAmt > 0.001) {
      var rg = ctx.createGain(); rg.gain.value = revAmt;
      tail.connect(rg); rg.connect(buses.reverb);
    }
    if (buses.delay && inst.sendDly > 0.001) {
      var dg = ctx.createGain(); dg.gain.value = inst.sendDly;
      tail.connect(dg); dg.connect(buses.delay);
    }
    tail.connect(buses.input || buses.dry || ctx.destination);

    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    var filt = ctx.createBiquadFilter();
    filt.type = inst.filt.type;
    filt.frequency.value = inst.filt.freq * (0.6 + 0.8 * vel);
    filt.Q.value = inst.filt.q;
    src.connect(filt);
    filt.connect(out);

    var mode = inst.noiseOnly;
    if (mode === 'sweep') {
      // 上升扫频
      filt.frequency.setValueAtTime(300, t0);
      filt.frequency.exponentialRampToValueAtTime(9000, t0 + len);
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.linearRampToValueAtTime(peak, t0 + len * 0.95);
      out.gain.setTargetAtTime(0.0001, t0 + len, 0.05);
    } else if (mode === 'air') {
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13 + Math.random() * 0.1;
      var lg = ctx.createGain();
      lg.gain.value = 500;
      lfo.connect(lg); lg.connect(filt.frequency);
      lfo.start(t0); lfo.stop(t0 + len + 1);
    } else if (mode === 'vinyl') {
      // 黑胶噪声：高频嘶声 + 稀疏噼啪
      filt.type = 'highpass';
      filt.frequency.value = 2600;
      var crackle = ctx.createBufferSource();
      var cbuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
      var cd = cbuf.getChannelData(0);
      for (var i = 0; i < cd.length; i++) {
        cd[i] = 0;
        if (Math.random() < 0.0016) cd[i] = (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6);
      }
      crackle.buffer = cbuf;
      var cg = ctx.createGain(); cg.gain.value = 0.5;
      crackle.connect(cg); cg.connect(out);
      crackle.start(t0);
    }

    src.start(t0);
    src.stop(t0 + len + inst.env.r + 0.2);
    return { sources: src, gain: out, end: t0 + len + inst.env.r + 0.2 };
  }

  /* ---------------- 播放：鼓 ---------------- */
  function playDrum(ctx, buses, drumId, when, vel, opts) {
    opts = opts || {};
    var d = DRUMS[drumId];
    if (!d) return null;
    var t0 = Math.max(when, ctx.currentTime + 0.002);
    var sources = [];
    var out = ctx.createGain();
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = U.clamp(opts.pan || 0, -1, 1);
      out.connect(p);
      p.connect(buses.input || ctx.destination);
      if (buses.reverb) {
        var rg = ctx.createGain(); rg.gain.value = opts.rev === undefined ? 0.16 : opts.rev;
        p.connect(rg); rg.connect(buses.reverb);
      }
    } else {
      out.connect(buses.input || ctx.destination);
    }
    var g = d.gain * (0.25 + 0.75 * vel);
    var dur = opts.dur || 0;

    function noiseLayer(decay, type, freq, q, amt) {
      var ns = ctx.createBufferSource();
      ns.buffer = noiseBuffer(ctx);
      ns.loop = true;
      var nf = ctx.createBiquadFilter();
      nf.type = type;
      nf.frequency.value = freq;
      if (q) nf.Q.value = q;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(g * amt, t0);
      ng.gain.setTargetAtTime(0.0001, t0, Math.max(0.008, decay / 3));
      ns.connect(nf); nf.connect(ng); ng.connect(out);
      ns.start(t0); ns.stop(t0 + decay * 2 + 0.05);
      sources.push(ns);
      return nf;
    }

    function tone(freq, decay, amt, type, f1) {
      var o = ctx.createOscillator();
      o.type = type || 'sine';
      if (f1) {
        o.frequency.setValueAtTime(freq, t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t0 + decay * 0.6);
      } else {
        o.frequency.setValueAtTime(freq, t0);
      }
      var og = ctx.createGain();
      og.gain.setValueAtTime(g * amt, t0);
      og.gain.setTargetAtTime(0.0001, t0, Math.max(0.008, decay / 3));
      o.connect(og); og.connect(out);
      o.start(t0); o.stop(t0 + decay * 2 + 0.05);
      sources.push(o);
      return o;
    }

    switch (d.kind) {
      case 'kick': {
        var f = d.f || [160, 50];
        var dec = d.decay;
        tone(f[0], dec, 1, 'sine', f[1]);
        if (d.click) {
          var cg = ctx.createGain();
          var co = ctx.createOscillator();
          co.type = 'triangle';
          co.frequency.setValueAtTime(1400, t0);
          co.frequency.exponentialRampToValueAtTime(200, t0 + 0.03);
          cg.gain.setValueAtTime(g * d.click, t0);
          cg.gain.setTargetAtTime(0.0001, t0, 0.01);
          co.connect(cg); cg.connect(out);
          co.start(t0); co.stop(t0 + 0.1);
          sources.push(co);
        }
        if (d.noise) noiseLayer(dec * 0.3, 'lowpass', d.lp || 400, 0.7, d.noise * 0.5);
        break;
      }
      case 'tom': {
        var tf = d.f || [180, 100];
        tone(tf[0], d.decay, 1, 'sine', tf[1]);
        if (d.noise) noiseLayer(d.decay * 0.5, 'lowpass', d.lp || 800, 0.7, d.noise * 0.5);
        break;
      }
      case 'snare': {
        noiseLayer(d.decay, 'bandpass', d.bp || 1800, 0.8, d.noise || 0.8);
        tone(d.f || 190, d.decay * 0.8, 0.35, 'triangle');
        break;
      }
      case 'noiseSnare': {
        noiseLayer(d.decay, 'highpass', d.hp || 1200, 0.6, 0.9);
        break;
      }
      case 'clap': {
        for (var i = 0; i < 3; i++) {
          var cg2 = ctx.createGain();
          var ns2 = ctx.createBufferSource();
          ns2.buffer = noiseBuffer(ctx);
          ns2.loop = true;
          var bp = ctx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = d.bp || 1500; bp.Q.value = 1.4;
          cg2.gain.setValueAtTime(g * 0.9, t0 + i * 0.009);
          cg2.gain.setTargetAtTime(0.0001, t0 + i * 0.009, 0.012);
          ns2.connect(bp); bp.connect(cg2); cg2.connect(out);
          ns2.start(t0 + i * 0.009); ns2.stop(t0 + i * 0.009 + 0.12);
          sources.push(ns2);
        }
        noiseLayer(d.decay, 'bandpass', (d.bp || 1500) * 1.1, 0.7, 0.35);
        break;
      }
      case 'hat': {
        noiseLayer(d.decay, 'highpass', d.hp || 8000, 0.5, 1);
        break;
      }
      case 'noiseHat': {
        if (d.bp) noiseLayer(d.decay, 'bandpass', d.bp, 1, 1);
        else noiseLayer(d.decay, 'highpass', d.hp || 5000, 0.5, 1);
        break;
      }
      case 'cymbal': {
        noiseLayer(d.decay, 'highpass', d.hp || 4000, 0.4, 1);
        var mt = ctx.createOscillator();
        mt.type = 'square'; mt.frequency.value = 520;
        var mtg = ctx.createGain();
        mtg.gain.setValueAtTime(g * 0.05, t0);
        mtg.gain.setTargetAtTime(0.0001, t0, d.decay / 4);
        mt.connect(mtg); mtg.connect(out);
        mt.start(t0); mt.stop(t0 + d.decay + 0.1);
        sources.push(mt);
        break;
      }
      case 'wood': {
        tone(d.f || 1200, d.decay, 0.55, 'triangle');
        tone((d.f || 1200) * 1.5, d.decay * 0.5, 0.2, 'sine');
        break;
      }
      case 'gong': {
        var partials = [1, 1.48, 2.1, 2.9, 4.2, 5.7];
        partials.forEach(function (p, idx) {
          tone((d.f || 110) * p, d.decay / (1 + idx * 0.35), 0.5 / (idx + 1), 'sine');
        });
        noiseLayer(d.decay * 0.7, 'bandpass', 900, 0.6, 0.5);
        break;
      }
      case 'metal': {
        var mp = [1, 2.76, 4.07, 5.4, 8.9, 11.3];
        mp.forEach(function (p, idx) {
          tone(120 * p, d.decay / (1 + idx * 0.2), 0.4 / (idx + 1), 'sine');
        });
        noiseLayer(d.decay * 0.4, 'bandpass', 2400, 1.2, 0.6);
        break;
      }
      default:
        noiseLayer(d.decay || 0.1, 'highpass', 4000, 0.5, 0.6);
    }

    return { sources: sources, gain: out, end: t0 + (d.decay || 0.2) * 2 + 0.3 };
  }

  /* ---------------- 试听 ---------------- */
  function audition(ctx, buses, instId, midi, dur) {
    return playVoice(ctx, buses, instId, midi, ctx.currentTime + 0.02, dur || 0.9, 0.85, { pan: 0 });
  }

  var instrumentList = Object.keys(DEFS).map(function (id) {
    return { id: id, name: DEFS[id].name, group: DEFS[id].group };
  });

  GBG.instruments = {
    defs: DEFS,
    drums: DRUMS,
    kits: KITS,
    list: instrumentList,
    names: (function () {
      var o = {};
      Object.keys(DEFS).forEach(function (k) { o[k] = DEFS[k].name; });
      Object.keys(DRUMS).forEach(function (k) { o[k] = DRUMS[k].name; });
      return o;
    })(),
    playVoice: playVoice,
    playDrum: playDrum,
    audition: audition,
    noiseBuffer: noiseBuffer
  };
})(typeof window !== 'undefined' ? window : globalThis);
