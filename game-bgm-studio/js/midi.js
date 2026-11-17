/* ==========================================================================
 * midi.js — 标准 MIDI 文件导出（format 1, PPQ 480）
 * 多轨、速度、拍号、调号、段落 Marker、循环点 Marker
 * 文本字段使用 ASCII，避免不同 DAW 的中文编码差异。
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;

  var PPQ = 480;

  var GM_PROGRAM = {
    piano: 0, ePiano: 4, celesta: 8, musicBox: 10, vibes: 11, marimba: 12,
    glassBell: 9, fmBell: 14,
    harp: 46, guzheng: 107, pipa: 107, koto: 107, shamisen: 106, lute: 24,
    pizzStrings: 45, strings: 48, stringsStacc: 48, stringPad: 49, soloViolin: 40, fiddle: 110,
    cello: 42, brassSection: 61, brassStab: 62, frenchHorn: 60,
    flute: 73, recorder: 74, whistle: 72, dizi: 72, shakuhachi: 77, erhu: 110,
    warmPad: 89, glassPad: 91, choirPad: 52, sopranoSolo: 53, organPad: 16,
    supersaw: 81, sawLead: 81, squareLead: 80, pulse25: 80, pulse12: 80,
    pluckSynth: 84, triangleBass: 38, sineSub: 38, sawBass: 38, reeseBass: 39,
    acidBass: 87, fm808: 38, uprightBass: 32,
    airTexture: 99, vinylNoise: 99, noiseRiser: 99
  };

  var GM_DRUM = {
    timpani: 47, bassDrum: 35, orchSnare: 38, taiko: 41, tom: 45, crash: 49,
    kick909: 36, snare909: 38, clap: 39, hat909: 42, openHat: 46, ride909: 51, rimshot: 37,
    kickSoft: 36, snap: 39, hatSoft: 42, brush: 38,
    kickPunch: 36, breakSnare: 38, ghostSnare: 38,
    chipKick: 36, chipSnare: 38, chipHat: 42, chipTom: 45,
    woodblock: 76, gong: 52, djembe: 41, shaker: 70, tambourine: 54,
    rideJazz: 51, hatPedal: 44, heartbeat: 35, metalHit: 56, tick: 76, subBoom: 36
  };

  var INSTRUMENT_EN = {
    piano: 'Piano', ePiano: 'E.Piano', celesta: 'Celesta', musicBox: 'Music Box',
    vibes: 'Vibes', marimba: 'Marimba', glassBell: 'Glass Bell', fmBell: 'FM Bell',
    harp: 'Harp', guzheng: 'Guzheng', pipa: 'Pipa', koto: 'Koto', shamisen: 'Shamisen',
    lute: 'Lute', pizzStrings: 'Pizzicato', strings: 'Strings', stringsStacc: 'Strings Stacc', stringPad: 'String Pad',
    soloViolin: 'Violin', fiddle: 'Fiddle', cello: 'Cello', brassSection: 'Brass',
    brassStab: 'Brass Stab', frenchHorn: 'Horn', flute: 'Flute', recorder: 'Recorder',
    whistle: 'Tin Whistle', dizi: 'Dizi', shakuhachi: 'Shakuhachi', erhu: 'Erhu',
    warmPad: 'Warm Pad', glassPad: 'Glass Pad', choirPad: 'Choir', sopranoSolo: 'Soprano', organPad: 'Organ',
    supersaw: 'Supersaw', sawLead: 'Saw Lead', squareLead: 'Square Lead',
    pulse25: 'Pulse 25', pulse12: 'Pulse 12', pluckSynth: 'Pluck',
    triangleBass: 'Triangle Bass', sineSub: 'Sub Bass', sawBass: 'Saw Bass',
    reeseBass: 'Reese', acidBass: 'Acid Bass', fm808: '808 Bass', uprightBass: 'Upright Bass',
    airTexture: 'Air', vinylNoise: 'Vinyl', noiseRiser: 'Riser'
  };

  var ROLE_EN = {
    drums: 'Drums', bass: 'Bass', pad: 'Pad', arp: 'Arp',
    lead: 'Lead', counter: 'Counter', stab: 'Stab', texture: 'FX'
  };

  var KEY_SF = [0, 7, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

  function vlq(value) {
    var buf = [value & 0x7F];
    value >>= 7;
    while (value > 0) {
      buf.unshift((value & 0x7F) | 0x80);
      value >>= 7;
    }
    return buf;
  }

  function str(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out.push(c < 0x80 ? c : 0x3F); // 非 ASCII 用 '?'
    }
    return out;
  }

  function trackChunk(events) {
    var bytes = [];
    var lastTick = 0;
    events.sort(function (a, b) {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.order - b.order;
    });
    events.forEach(function (ev) {
      bytes = bytes.concat(vlq(Math.max(0, ev.tick - lastTick)));
      bytes = bytes.concat(ev.data);
      lastTick = ev.tick;
    });
    bytes = bytes.concat([0x00, 0xFF, 0x2F, 0x00]);
    var out = [];
    out = out.concat([0x4D, 0x54, 0x72, 0x6B]); // MTrk
    out = out.concat(u32(bytes.length));
    return out.concat(bytes);
  }

  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >> 8) & 255, n & 255]; }

  function metaText(type, text) {
    var s = str(text);
    return [0xFF, type].concat(vlq(s.length)).concat(s);
  }

  function asciiKey(meta) {
    var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    var scale = GBG.theory.SCALES[meta.scaleId] || { en: 'Minor' };
    return names[U.clamp(meta.rootPc, 0, 11)] + ' ' + scale.en;
  }

  function writeMidi(song, opts) {
    opts = opts || {};
    var meta = song.meta;
    var tracks = [];

    /* --- Track 0: global --- */
    var t0 = [];
    var globalName = 'LoopForge - ' + (meta.styleEn || meta.styleId) + ' - ' + meta.bpm + ' BPM';
    t0.push({ tick: 0, order: 0, data: metaText(0x03, globalName) });
    t0.push({ tick: 0, order: 1, data: metaText(0x02, 'LoopForge Game BGM Studio') });
    var usec = Math.round(60000000 / meta.bpm);
    t0.push({ tick: 0, order: 2, data: [0xFF, 0x51, 0x03, (usec >> 16) & 255, (usec >> 8) & 255, usec & 255] });
    t0.push({ tick: 0, order: 3, data: [0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] });
    var sf = KEY_SF[U.clamp(meta.rootPc, 0, 11)];
    if (meta.scaleId === 'minor' || meta.scaleId === 'harmonicMinor' || meta.scaleId === 'minorPent') {
      sf = KEY_SF[(meta.rootPc + 3) % 12];
    }
    t0.push({ tick: 0, order: 4, data: [0xFF, 0x59, 0x02, sf & 255, (meta.scaleId === 'major' ? 0 : 1)] });
    t0.push({
      tick: 0, order: 5,
      data: metaText(0x01, asciiKey(meta) + ' - ' + meta.bpm + ' BPM - ' + meta.bars + ' bars - seed ' + meta.seed)
    });

    song.sections.forEach(function (sec) {
      t0.push({
        tick: sec.startBar * 4 * PPQ, order: 6,
        data: metaText(0x06, sec.kind + ' [I' + U.clamp(meta.intensity + sec.boost, 0, 3) + ']')
      });
    });
    t0.push({ tick: song.loop.startBar * 4 * PPQ, order: 7, data: metaText(0x06, 'LOOP_START') });
    t0.push({ tick: song.loop.endBar * 4 * PPQ, order: 7, data: metaText(0x06, 'LOOP_END') });
    tracks.push(t0);

    /* --- 声部轨 --- */
    var channel = 0;
    song.parts.forEach(function (part) {
      if (!part.notes.length) return;
      if (opts.muteIds && opts.muteIds.indexOf(part.id) !== -1) return;
      var isDrum = part.role === 'drums';
      var ch = isDrum ? 9 : channel;
      if (!isDrum) {
        channel++;
        if (channel === 9) channel = 10;
      }
      var ev = [];
      var trackName = (ROLE_EN[part.role] || part.role) + ' - ' +
        (isDrum ? String(part.instrument).replace('kit:', '') : (INSTRUMENT_EN[part.instrument] || part.instrument));
      ev.push({ tick: 0, order: 0, data: metaText(0x03, trackName) });
      if (!isDrum) {
        var prog = GM_PROGRAM[part.instrument] !== undefined ? GM_PROGRAM[part.instrument] : 0;
        ev.push({ tick: 0, order: 1, data: [0xC0 | ch, prog] });
        ev.push({ tick: 0, order: 2, data: [0xB0 | ch, 7, Math.round(U.clamp(part.gain, 0, 1.5) / 1.5 * 127)] });
        ev.push({ tick: 0, order: 3, data: [0xB0 | ch, 10, Math.round((part.pan * 0.5 + 0.5) * 127)] });
        ev.push({ tick: 0, order: 4, data: [0xB0 | ch, 91, 96] });
      }
      part.notes.forEach(function (n) {
        var pitch = isDrum
          ? (GM_DRUM[n.drum] !== undefined ? GM_DRUM[n.drum] : 36) + (n.midi > 40 ? Math.min(2, n.midi - 45) : 0)
          : Math.round(n.midi);
        pitch = U.clamp(pitch, 0, 127);
        var start = Math.round(Math.max(0, n.t) * PPQ);
        var end = Math.round(Math.max(0.02, n.d) * PPQ) + start;
        var vel = U.clamp(Math.round(n.vel * 127), 1, 127);
        ev.push({ tick: start, order: 4, data: [0x90 | ch, pitch, vel] });
        ev.push({ tick: end, order: 3, data: [0x80 | ch, pitch, 0] });
      });
      tracks.push(ev);
    });

    /* --- 组装 --- */
    var header = [0x4D, 0x54, 0x68, 0x64].concat(u32(6)).concat(u16(1)).concat(u16(tracks.length)).concat(u16(PPQ));
    var out = header;
    tracks.forEach(function (ev) {
      var chunk = trackChunk(ev);
      for (var i = 0; i < chunk.length; i++) out.push(chunk[i]);
    });
    return new Uint8Array(out);
  }

  function describeMidi(song) {
    return [
      'SMF format 1 - ' + song.parts.length + ' tracks - PPQ ' + PPQ,
      'BPM ' + song.meta.bpm + ' - ' + song.meta.keyLabel
    ];
  }

  GBG.midi = {
    write: writeMidi,
    PPQ: PPQ,
    GM_PROGRAM: GM_PROGRAM,
    GM_DRUM: GM_DRUM,
    INSTRUMENT_EN: INSTRUMENT_EN,
    describe: describeMidi
  };
})(typeof window !== 'undefined' ? window : globalThis);
