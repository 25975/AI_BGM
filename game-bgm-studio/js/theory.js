/* ==========================================================================
 * theory.js — 乐理：音阶、和弦、声部连接、调性
 * 纯逻辑模块，无 DOM 依赖。
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;

  var NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  var NOTE_NAMES_ASCII = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  /* ---------------- 音阶库 ---------------- */
  // steps: 相对主音的半音；bias: 旋律偏好度数（用于生成时的权重）
  var SCALES = {
    major:        { name: '大调',       en: 'Major',            steps: [0, 2, 4, 5, 7, 9, 11], family: 'major', mood: '明亮 · 希望 · 田园' },
    minor:        { name: '自然小调',   en: 'Natural Minor',    steps: [0, 2, 3, 5, 7, 8, 10], family: 'minor', mood: '阴暗 · 忧郁 · 宿命' },
    harmonicMinor:{ name: '和声小调',   en: 'Harmonic Minor',   steps: [0, 2, 3, 5, 7, 8, 11], family: 'minor', mood: '戏剧 · 紧张 · 异域' },
    dorian:       { name: '多利亚',     en: 'Dorian',           steps: [0, 2, 3, 5, 7, 9, 10], family: 'mode',  mood: '古风 · 苍凉 · 行进' },
    phrygian:     { name: '弗里几亚',   en: 'Phrygian',         steps: [0, 1, 3, 5, 7, 8, 10], family: 'mode',  mood: '压迫 · 异教 · 危机' },
    lydian:       { name: '利底亚',     en: 'Lydian',           steps: [0, 2, 4, 6, 7, 9, 11], family: 'mode',  mood: '梦幻 · 星海 · 奇观' },
    mixolydian:   { name: '混合利底亚', en: 'Mixolydian',       steps: [0, 2, 4, 5, 7, 9, 10], family: 'mode',  mood: '开阔 · 江湖 · 狂欢' },
    majorPent:    { name: '宫调五声',   en: 'Major Pentatonic', steps: [0, 2, 4, 7, 9],        family: 'penta', mood: '东方 · 明朗 · 写意' },
    minorPent:    { name: '羽调五声',   en: 'Minor Pentatonic', steps: [0, 3, 5, 7, 10],       family: 'penta', mood: '东方 · 幽远 · 苍茫' },
    hirajoshi:    { name: '平调子',     en: 'Hirajoshi',        steps: [0, 2, 3, 7, 8],        family: 'penta', mood: '和风 · 寂寥 · 剑客' },
    miyako:       { name: '都节音阶',   en: 'Miyako-bushi',     steps: [0, 1, 5, 7, 8],        family: 'penta', mood: '和风 · 诡异 · 能剧' },
    yo:           { name: '阳音阶',     en: 'Yo Scale',         steps: [0, 2, 5, 7, 9],        family: 'penta', mood: '和风 · 祭典 · 明快' },
    blues:        { name: '蓝调音阶',   en: 'Blues',            steps: [0, 3, 5, 6, 7, 10],    family: 'blues', mood: '街头 · 慵懒 · 苦涩' },
    wholeTone:    { name: '全音阶',     en: 'Whole Tone',       steps: [0, 2, 4, 6, 8, 10],    family: 'exotic',mood: '悬浮 · 失重 · 梦魇' },
    phrygianDom:  { name: '弗里几亚属音', en: 'Phrygian Dominant', steps: [0, 1, 4, 5, 7, 8, 10], family: 'exotic', mood: '沙漠 · 异域 · 史诗' },
    hungarian:    { name: '匈牙利小调', en: 'Hungarian Minor',  steps: [0, 2, 3, 6, 7, 8, 11], family: 'exotic', mood: '巫术 · 狂舞 · 黑暗' },
    lydianDom:    { name: '利底亚属音', en: 'Lydian Dominant',  steps: [0, 2, 4, 6, 7, 9, 10], family: 'exotic', mood: '奇幻 · 漂浮 · 诡计' }
  };

  /* ---------------- 和弦库 ---------------- */
  var CHORDS = {
    maj:   { iv: [0, 4, 7],        sfx: '',    name: '大三和弦' },
    min:   { iv: [0, 3, 7],        sfx: 'm',   name: '小三和弦' },
    dim:   { iv: [0, 3, 6],        sfx: 'dim', name: '减三和弦' },
    aug:   { iv: [0, 4, 8],        sfx: 'aug', name: '增三和弦' },
    sus2:  { iv: [0, 2, 7],        sfx: 'sus2',name: '挂二和弦' },
    sus4:  { iv: [0, 5, 7],        sfx: 'sus4',name: '挂四和弦' },
    six:   { iv: [0, 4, 7, 9],     sfx: '6',   name: '大六和弦' },
    m6:    { iv: [0, 3, 7, 9],     sfx: 'm6',  name: '小六和弦' },
    maj7:  { iv: [0, 4, 7, 11],    sfx: 'maj7',name: '大七和弦' },
    min7:  { iv: [0, 3, 7, 10],    sfx: 'm7',  name: '小七和弦' },
    dom7:  { iv: [0, 4, 7, 10],    sfx: '7',   name: '属七和弦' },
    m7b5:  { iv: [0, 3, 6, 10],    sfx: 'm7♭5',name: '半减七和弦' },
    dim7:  { iv: [0, 3, 6, 9],     sfx: 'dim7',name: '减七和弦' },
    add9:  { iv: [0, 4, 7, 14],    sfx: 'add9',name: '加九和弦' },
    madd9: { iv: [0, 3, 7, 14],    sfx: 'madd9',name: '小加九和弦' },
    maj9:  { iv: [0, 4, 7, 11, 14],sfx: 'maj9',name: '大九和弦' },
    min9:  { iv: [0, 3, 7, 10, 14],sfx: 'm9',  name: '小九和弦' },
    dom9:  { iv: [0, 4, 7, 10, 14],sfx: '9',   name: '属九和弦' },
    min11: { iv: [0, 3, 7, 10, 17],sfx: 'm11', name: '小十一和弦' },
    quart: { iv: [0, 5, 10],       sfx: 'quart',name: '四度和弦' }
  };

  var QUALITY_BY_IV = {};
  Object.keys(CHORDS).forEach(function (q) {
    QUALITY_BY_IV[CHORDS[q].iv.join(',')] = q;
  });

  function mod12(n) { return ((n % 12) + 12) % 12; }
  function pcName(pc, ascii) { return (ascii ? NOTE_NAMES_ASCII : NOTE_NAMES)[mod12(pc)]; }
  function midiToPc(m) { return mod12(Math.round(m)); }

  function scaleById(id) { return SCALES[id] || SCALES.minor; }
  function chordById(id) { return CHORDS[id] || CHORDS.maj; }

  /* 音阶内第 deg 个音（可超出八度，可为负）的绝对音级 */
  function scaleDegreePc(rootPc, scaleId, deg) {
    var steps = scaleById(scaleId).steps;
    var len = steps.length;
    var oct = Math.floor(deg / len);
    var idx = ((deg % len) + len) % len;
    return mod12(rootPc + steps[idx] + 12 * oct);
  }

  function scaleDegreeMidi(rootPc, scaleId, deg, baseOctave) {
    var steps = scaleById(scaleId).steps;
    var len = steps.length;
    var oct = Math.floor(deg / len);
    var idx = ((deg % len) + len) % len;
    return (baseOctave + 1) * 12 + rootPc + steps[idx] + 12 * oct;
  }

  function scalePcs(rootPc, scaleId) {
    return scaleById(scaleId).steps.map(function (s) { return mod12(rootPc + s); });
  }

  /* 判断音级集合的 chord quality */
  function qualityFromPcs(pcs, rootPc) {
    var ivs = [];
    for (var i = 0; i < pcs.length; i++) {
      var v = mod12(pcs[i] - rootPc);
      if (ivs.indexOf(v) === -1) ivs.push(v);
    }
    ivs.sort(function (a, b) { return a - b; });
    var key = ivs.join(',');
    return QUALITY_BY_IV[key] || null;
  }

  /* 由音阶度数构造和弦
   * opts.extension: 0=三和弦 1=七和弦 2=九和弦
   * opts.quality: 强制质量（用于 V 大调、皮卡第三度等）
   * opts.sus: 'sus2'|'sus4'
   */
  function makeChord(rootKeyPc, scaleId, deg, opts) {
    opts = opts || {};
    var scale = scaleById(scaleId);
    var len = scale.steps.length;
    var chordRootPc = scaleDegreePc(rootKeyPc, scaleId, deg);
    var ext = opts.extension || 0;
    var stack = [0, 2, 4];
    if (ext >= 1) stack.push(6);
    if (ext >= 2) stack.push(8);
    var pcs = [];
    for (var i = 0; i < stack.length; i++) {
      pcs.push(scaleDegreePc(rootKeyPc, scaleId, deg + stack[i]));
    }
    // 去重（五声音阶可能出现重复）
    var uniq = [];
    pcs.forEach(function (p) { if (uniq.indexOf(p) === -1) uniq.push(p); });

    var quality = opts.quality || qualityFromPcs(uniq, chordRootPc);
    if (opts.sus) quality = opts.sus;
    if (!quality) {
      // 五声/异域音阶无法归入传统三和弦时，按音数命名
      if (uniq.length === 3) quality = 'quart';
      else if (uniq.length === 4) quality = 'min7';
      else quality = 'min';
    }

    var iv = chordById(quality).iv.slice();
    if (ext >= 1 && iv.length === 3) {
      // 扩展和弦：按质量补七音
      if (quality === 'maj') { quality = 'maj7'; iv = CHORDS.maj7.iv.slice(); }
      else if (quality === 'min') { quality = 'min7'; iv = CHORDS.min7.iv.slice(); }
      else if (quality === 'dim') { quality = 'm7b5'; iv = CHORDS.m7b5.iv.slice(); }
    }
    if (ext >= 2) {
      if (quality === 'maj7') { quality = 'maj9'; iv = CHORDS.maj9.iv.slice(); }
      else if (quality === 'min7') { quality = 'min9'; iv = CHORDS.min9.iv.slice(); }
      else if (quality === 'dom7') { quality = 'dom9'; iv = CHORDS.dom9.iv.slice(); }
      else if (quality === 'min') { quality = 'madd9'; iv = CHORDS.madd9.iv.slice(); }
      else if (quality === 'maj') { quality = 'add9'; iv = CHORDS.add9.iv.slice(); }
    }

    var chord = {
      deg: deg,
      rootPc: chordRootPc,
      quality: quality,
      qualityName: chordById(quality).name,
      intervals: iv,
      pcs: iv.map(function (n) { return mod12(chordRootPc + n); }),
      symbol: pcName(chordRootPc, true) + chordById(quality).sfx,
      label: pcName(chordRootPc) + chordById(quality).sfx
    };
    if (opts.inversion) chord.bassPc = chord.pcs[opts.inversion % chord.pcs.length];
    return chord;
  }

  /* ---------------- 声部连接 ---------------- */
  /* 将和弦排列为 MIDI 音高，尽量靠近 prev 声部
   * opts: low/high 音域, count 音数, center 目标中心, bassRoot 低音加倍
   */
  function voiceChord(chord, prev, opts) {
    opts = opts || {};
    var low = opts.low || 48;
    var high = opts.high || 79;
    var center = opts.center || (low + high) / 2;
    var count = opts.count || chord.intervals.length;
    var pcs = chord.intervals.slice(0, Math.max(3, count)).map(function (iv) {
      return mod12(chord.rootPc + iv);
    });
    // 去掉重复音级
    var uniq = [];
    pcs.forEach(function (p) { if (uniq.indexOf(p) === -1) uniq.push(p); });
    while (uniq.length < 3) uniq.push(mod12(uniq[0] + 7));

    // 从主音附近开始向上堆叠成闭合排列
    var rootBase = low + mod12(uniq[0] - low);
    var base = [];
    var last = rootBase - 1;
    uniq.forEach(function (p) {
      var m = last + 1;
      while (mod12(m) !== p) m++;
      base.push(m);
      last = m;
    });

    // 计算候选：整体八度平移 + 单独调整声部
    var candidates = [];
    for (var shift = -12; shift <= 24; shift += 12) {
      var cand = base.map(function (m) { return m + shift; });
      // 音域压缩：超出范围就折回
      cand = cand.map(function (m) {
        while (m < low) m += 12;
        while (m > high) m -= 12;
        return m;
      });
      cand.sort(function (a, b) { return a - b; });
      var uniqCand = [];
      cand.forEach(function (m) { if (uniqCand.indexOf(m) === -1) uniqCand.push(m); });
      candidates.push(uniqCand);
    }

    var best = null, bestCost = Infinity;
    candidates.forEach(function (cand) {
      var cost = 0;
      if (prev && prev.length) {
        cand.forEach(function (m) {
          var d = Infinity;
          prev.forEach(function (p) { d = Math.min(d, Math.abs(m - p)); });
          cost += d;
        });
        var pm = 0; prev.forEach(function (p) { pm += p; }); pm /= prev.length;
        var cm = 0; cand.forEach(function (m) { cm += m; }); cm /= cand.length;
        cost += Math.abs(cm - pm) * 0.8;
      } else {
        var m0 = 0; cand.forEach(function (m) { m0 += m; }); m0 /= cand.length;
        cost += Math.abs(m0 - center) * 1.5;
      }
      var lo = cand[0], hi = cand[cand.length - 1];
      if (lo < low) cost += (low - lo) * 4;
      if (hi > high) cost += (hi - high) * 4;
      if (cost < bestCost) { bestCost = cost; best = cand; }
    });

    var notes = best.slice();
    if (opts.bassRoot) {
      var rootLow = low + mod12(chord.rootPc - low);
      if (notes.indexOf(rootLow) === -1) notes.unshift(rootLow);
    }
    // 排序去重
    notes = notes.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    return notes;
  }

  /* 音域内和弦音（用于琶音/分解和弦） */
  function chordNotesInRange(chord, low, high, scaleId, keyRootPc) {
    var out = [];
    for (var m = low; m <= high; m++) {
      var pc = mod12(m);
      if (chord.pcs.indexOf(pc) !== -1) out.push(m);
    }
    if (out.length < 3 && scaleId !== undefined) {
      // 极端音域兜底
      var pcs = scalePcs(keyRootPc, scaleId);
      for (var n = low; n <= high; n++) {
        if (pcs.indexOf(mod12(n)) !== -1 && out.indexOf(n) === -1) out.push(n);
      }
      out.sort(function (a, b) { return a - b; });
    }
    return out;
  }

  function isChordTone(midi, chord) {
    return chord.pcs.indexOf(mod12(Math.round(midi))) !== -1;
  }

  /* ---------------- 调性工具 ---------------- */
  function keyLabel(rootPc, scaleId) {
    return pcName(rootPc) + ' ' + scaleById(scaleId).name;
  }
  function keyLabelShort(rootPc, scaleId) {
    var scale = scaleById(scaleId);
    var map = { major: 'maj', minor: 'min', harmonicMinor: 'hm', dorian: 'dor', phrygian: 'phr',
      lydian: 'lyd', mixolydian: 'mix', majorPent: 'pent', minorPent: 'minPent', hirajoshi: 'hira',
      miyako: 'miyako', yo: 'yo', blues: 'blues', wholeTone: 'wt', phrygianDom: 'phrDom',
      hungarian: 'hun', lydianDom: 'lydDom' };
    return pcName(rootPc) + ' ' + (map[scaleId] || scale.en);
  }

  /* 从文本解析调性，例如 "C minor" / "F# 小调" */
  function parseKey(text) {
    if (!text) return null;
    var t = String(text).trim();
    var m = t.match(/^([A-Ga-g])([#♯b♭]?)\s*(.*)$/);
    if (!m) return null;
    var pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    if (m[2] === '#' || m[2] === '♯') pc++;
    if (m[2] === 'b' || m[2] === '♭') pc--;
    pc = mod12(pc);
    var rest = (m[3] || '').toLowerCase();
    var scaleId = 'minor';
    if (/大调|major|maj\b/.test(rest) && !/minor/.test(rest)) scaleId = 'major';
    else if (/和声|harmonic/.test(rest)) scaleId = 'harmonicMinor';
    else if (/多利亚|dorian/.test(rest)) scaleId = 'dorian';
    else if (/五声|pentatonic|宫/.test(rest)) scaleId = 'majorPent';
    else if (/羽/.test(rest)) scaleId = 'minorPent';
    else if (/都节|miyako/.test(rest)) scaleId = 'miyako';
    else if (/平调|hirajoshi/.test(rest)) scaleId = 'hirajoshi';
    else if (/蓝调|blues/.test(rest)) scaleId = 'blues';
    else if (/利底亚|lydian/.test(rest)) scaleId = 'lydian';
    else if (/混合利底亚|mixolydian/.test(rest)) scaleId = 'mixolydian';
    else if (/弗里几亚属|phrygian.?dom/.test(rest)) scaleId = 'phrygianDom';
    else if (/小调|minor|min\b/.test(rest)) scaleId = 'minor';
    return { rootPc: pc, scaleId: scaleId };
  }

  /* ---------------- 常用和声进行（级数） ---------------- */
  // 每个条目为音阶级数（0 = 主和弦），可带质量覆盖
  var PROGRESSIONS = {
    // 小调 / 史诗
    i_Vi_III_VII:  { name: 'i–VI–III–VII',  degs: [0, 5, 2, 6], mode: 'minor', vibe: '史诗 · 循环' },
    i_VII_VI_VII:  { name: 'i–VII–VI–VII',  degs: [0, 6, 5, 6], mode: 'minor', vibe: '悲壮 · 行进' },
    i_VI_iv_V:     { name: 'i–VI–iv–V',     degs: [0, 5, 3, 4], mode: 'minor', vibe: '抒情 · 转折' },
    i_iv_VII_III:  { name: 'i–iv–VII–III',  degs: [0, 3, 6, 2], mode: 'minor', vibe: '神秘 · 漂浮' },
    i_V_VI_iv:     { name: 'i–V–VI–iv',     degs: [0, 4, 5, 3], mode: 'minor', vibe: '战斗 · 推进' },
    i_III_VII_VI:  { name: 'i–III–VII–VI',  degs: [0, 2, 6, 5], mode: 'minor', vibe: '凯旋 · 苍凉' },
    i_VII_VII_i:   { name: 'i–VII–VII–i',   degs: [0, 6, 6, 0], mode: 'minor', vibe: '压迫 · 极简' },
    // 大调
    I_V_vi_IV:     { name: 'I–V–vi–IV',     degs: [0, 4, 5, 3], mode: 'major', vibe: '流行 · 明亮' },
    I_vi_IV_V:     { name: 'I–vi–IV–V',     degs: [0, 5, 3, 4], mode: 'major', vibe: '怀旧 · 温暖' },
    I_IV_vi_V:     { name: 'I–IV–vi–V',     degs: [0, 3, 5, 4], mode: 'major', vibe: '旅程 · 开阔' },
    I_iii_IV_V:    { name: 'I–iii–IV–V',    degs: [0, 2, 3, 4], mode: 'major', vibe: '复古 · 宫廷' },
    vi_IV_I_V:     { name: 'vi–IV–I–V',     degs: [5, 3, 0, 4], mode: 'major', vibe: '情感 · 电影' },
    I_V_IV_I:      { name: 'I–V–IV–I',      degs: [0, 4, 3, 0], mode: 'major', vibe: '号角 · 庆典' },
    I_IV_V_IV:     { name: 'I–IV–V–IV',     degs: [0, 3, 4, 3], mode: 'major', vibe: '民间 · 舞曲' },
    // 调式
    i_II:          { name: 'i–II (弗里几亚)', degs: [0, 1, 0, 1], mode: 'mode', vibe: '黑暗 · 压迫' },
    i_VII_IV_iv:   { name: 'i–VII–IV–iv',   degs: [0, 6, 3, 3], mode: 'mode', vibe: '诡异 · 循环' },
    I_II_I_II:     { name: 'I–II (利底亚)', degs: [0, 1, 0, 1], mode: 'mode', vibe: '漂浮 · 奇观' },
    // 爵士
    ii_V_I_VI:     { name: 'ii–V–I–VI',     degs: [1, 4, 0, 5], mode: 'jazz', vibe: '爵士 · 转调' },
    I_vi_ii_V:     { name: 'I–vi–ii–V',     degs: [0, 5, 1, 4], mode: 'jazz', vibe: '爵士 · 行走' },
    i_iv_VII_III7: { name: 'i–iv–VII–III',  degs: [0, 3, 6, 2], mode: 'jazz', vibe: '黑色电影' },
    // 五声 / 东方
    pent_1_5_6_3:  { name: '宫–徵–羽–角',    degs: [0, 3, 4, 2], mode: 'penta', vibe: '东方 · 流转' },
    pent_1_4_5_1:  { name: '宫–商–徵–宫',    degs: [0, 1, 3, 0], mode: 'penta', vibe: '东方 · 家园' },
    pent_6_1_5_3:  { name: '羽–宫–徵–角',    degs: [4, 0, 3, 2], mode: 'penta', vibe: '东方 · 苍茫' },
    pent_1_3_6_5:  { name: '宫–角–羽–徵',    degs: [0, 2, 4, 3], mode: 'penta', vibe: '东方 · 空灵' }
  };

  function progressionById(id) { return PROGRESSIONS[id] || PROGRESSIONS.i_Vi_III_VII; }

  GBG.theory = {
    NOTE_NAMES: NOTE_NAMES,
    NOTE_NAMES_ASCII: NOTE_NAMES_ASCII,
    SCALES: SCALES,
    CHORDS: CHORDS,
    PROGRESSIONS: PROGRESSIONS,
    mod12: mod12,
    pcName: pcName,
    midiToPc: midiToPc,
    scaleById: scaleById,
    chordById: chordById,
    scaleDegreePc: scaleDegreePc,
    scaleDegreeMidi: scaleDegreeMidi,
    scalePcs: scalePcs,
    makeChord: makeChord,
    voiceChord: voiceChord,
    chordNotesInRange: chordNotesInRange,
    isChordTone: isChordTone,
    keyLabel: keyLabel,
    keyLabelShort: keyLabelShort,
    parseKey: parseKey,
    progressionById: progressionById,
    qualityFromPcs: qualityFromPcs
  };
})(typeof window !== 'undefined' ? window : globalThis);
