/* ==========================================================================
 * zip.js — 极简 ZIP 打包（store 模式，无压缩）
 * 用于一次性导出分轨 WAV
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function strBytes(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var arr = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) arr.push(c);
      else if (c < 0x800) arr.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else arr.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(arr);
  }

  function dosTime(d) {
    d = d || new Date();
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }

  function build(files) {
    // files: [{name, data: Uint8Array|ArrayBuffer, date}]
    var entries = files.map(function (f) {
      var data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      var nameBytes = strBytes(f.name);
      return {
        name: nameBytes,
        data: data,
        crc: crc32(data),
        offset: 0,
        time: dosTime(f.date)
      };
    });

    var localSize = 0, centralSize = 0;
    entries.forEach(function (e) {
      localSize += 30 + e.name.length + e.data.length;
      centralSize += 46 + e.name.length;
    });
    var total = localSize + centralSize + 22;
    var out = new Uint8Array(total);
    var view = new DataView(out.buffer);
    var pos = 0;

    entries.forEach(function (e) {
      e.offset = pos;
      view.setUint32(pos, 0x04034B50, true); pos += 4;
      view.setUint16(pos, 20, true); pos += 2;          // version needed
      view.setUint16(pos, 0x0800, true); pos += 2;      // UTF-8 flag
      view.setUint16(pos, 0, true); pos += 2;           // store
      view.setUint16(pos, e.time.time, true); pos += 2;
      view.setUint16(pos, e.time.date, true); pos += 2;
      view.setUint32(pos, e.crc, true); pos += 4;
      view.setUint32(pos, e.data.length, true); pos += 4;
      view.setUint32(pos, e.data.length, true); pos += 4;
      view.setUint16(pos, e.name.length, true); pos += 2;
      view.setUint16(pos, 0, true); pos += 2;
      out.set(e.name, pos); pos += e.name.length;
      out.set(e.data, pos); pos += e.data.length;
    });

    var centralStart = pos;
    entries.forEach(function (e) {
      view.setUint32(pos, 0x02014B50, true); pos += 4;
      view.setUint16(pos, 20, true); pos += 2;
      view.setUint16(pos, 20, true); pos += 2;
      view.setUint16(pos, 0x0800, true); pos += 2;
      view.setUint16(pos, 0, true); pos += 2;
      view.setUint16(pos, e.time.time, true); pos += 2;
      view.setUint16(pos, e.time.date, true); pos += 2;
      view.setUint32(pos, e.crc, true); pos += 4;
      view.setUint32(pos, e.data.length, true); pos += 4;
      view.setUint32(pos, e.data.length, true); pos += 4;
      view.setUint16(pos, e.name.length, true); pos += 2;
      view.setUint16(pos, 0, true); pos += 2;
      view.setUint16(pos, 0, true); pos += 2;
      view.setUint16(pos, 0, true); pos += 2;
      view.setUint16(pos, 0, true); pos += 2;
      view.setUint32(pos, 0, true); pos += 4;
      view.setUint32(pos, e.offset, true); pos += 4;
      out.set(e.name, pos); pos += e.name.length;
    });

    var centralEnd = pos;
    view.setUint32(pos, 0x06054B50, true); pos += 4;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, entries.length, true); pos += 2;
    view.setUint16(pos, entries.length, true); pos += 2;
    view.setUint32(pos, centralEnd - centralStart, true); pos += 4;
    view.setUint32(pos, centralStart, true); pos += 4;
    view.setUint16(pos, 0, true);
    return out;
  }

  GBG.zip = { build: build, crc32: crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
