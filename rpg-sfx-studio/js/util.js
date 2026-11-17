/* ==========================================================================
 * ForgeFX · RPG 音效工坊
 * util.js — 可复现随机数、数学、存储、格式化
 * ========================================================================== */
(function (global) {
  'use strict';

  var SFX = global.SFX = global.SFX || {};

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
    var t = (this.state = (this.state + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.chance = function (p) { return this.next() < p; };
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

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    return sec.toFixed(2) + 's';
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

  var Store = {
    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
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

  SFX.util = {
    hashString: hashString,
    Rng: Rng,
    clamp: clamp, lerp: lerp, r2: r2,
    fmtTime: fmtTime, fmtBytes: fmtBytes,
    uid: uid, deepClone: deepClone,
    Store: Store
  };
})(typeof window !== 'undefined' ? window : globalThis);
