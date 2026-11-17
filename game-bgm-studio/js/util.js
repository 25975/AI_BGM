/* ==========================================================================
 * LoopForge · 游戏 BGM 工坊
 * util.js — 基础工具：可复现随机数、数学、时间、存储
 * 纯逻辑模块，无 DOM / AudioContext 依赖，可在 Node 中测试。
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};

  /* ---------- 可复现随机数 (mulberry32) ---------- */
  function hashString(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function Rng(seed) {
    if (seed === undefined || seed === null || seed === '') seed = Date.now();
    this.seed = typeof seed === 'number' ? (seed >>> 0) : hashString(seed);
    this.state = this.seed >>> 0;
    this._spare = null;
  }

  Rng.prototype.next = function () {
    // mulberry32
    var t = (this.state = (this.state + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };

  Rng.prototype.weighted = function (items, weights) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += Math.max(0, weights[i] || 0);
    if (total <= 0) return items[0];
    var r = this.next() * total;
    for (i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i] || 0);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  // 正态分布（Box-Muller），用于人性化
  Rng.prototype.gauss = function () {
    if (this._spare !== null) { var s = this._spare; this._spare = null; return s; }
    var u = 1 - this.next(), v = this.next();
    var mag = Math.sqrt(-2 * Math.log(u || 0.0001));
    this._spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };

  Rng.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  /* ---------- 数学 ---------- */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function sum(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s; }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function beatsToSec(beats, bpm) { return beats * 60 / bpm; }
  function barsToSec(bars, bpm, beatsPerBar) { return bars * beatsPerBar * 60 / bpm; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtClock(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    var cs = Math.floor((sec % 1) * 100);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (cs < 10 ? '0' : '') + cs;
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function deepClone(obj) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) { /* fallthrough */ }
    }
    return JSON.parse(JSON.stringify(obj));
  }

  /* ---------- 节奏工具 ---------- */
  // 欧几里得节奏：n 个格子中均匀分布 k 个击打
  function euclid(k, n, offset) {
    offset = offset || 0;
    var pattern = new Array(n).fill(0);
    if (k <= 0) return pattern;
    if (k >= n) return pattern.fill(1);
    for (var i = 0; i < n; i++) {
      pattern[(i * k) % n] = 1;
    }
    // 旋转
    if (offset) pattern = pattern.slice(n - offset % n).concat(pattern.slice(0, n - offset % n));
    return pattern;
  }

  // 解析 16 步字符串 "x...x...x.x....." → [{step, vel}]
  // 字符：x=正常，X=重音，o=轻音，.=休止
  function parseSteps(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (c === 'x') out.push({ step: i, vel: 0.82 });
      else if (c === 'X') out.push({ step: i, vel: 1 });
      else if (c === 'o') out.push({ step: i, vel: 0.5 });
      else if (c === 'g') out.push({ step: i, vel: 0.3 });
    }
    return out;
  }

  /* ---------- 存储 ---------- */
  var Store = {
    available: function () {
      try {
        var k = '__gbg_test__';
        global.localStorage.setItem(k, '1');
        global.localStorage.removeItem(k);
        return true;
      } catch (e) { return false; }
    },
    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    del: function (key) {
      try { global.localStorage.removeItem(key); return true; } catch (e) { return false; }
    }
  };

  GBG.util = {
    hashString: hashString,
    Rng: Rng,
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, sum: sum,
    midiToFreq: midiToFreq,
    beatsToSec: beatsToSec, barsToSec: barsToSec,
    r1: r1, r2: r2, fmtTime: fmtTime, fmtClock: fmtClock, fmtBytes: fmtBytes,
    uid: uid, deepClone: deepClone,
    euclid: euclid, parseSteps: parseSteps,
    Store: Store
  };
})(typeof window !== 'undefined' ? window : globalThis);
