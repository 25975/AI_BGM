/* ==========================================================================
 * composer.js — 作曲引擎
 * 段落结构 / 和声 / 鼓组 / 贝斯 / 琶音 / 旋律动机 / 垂直强度分层
 * 纯逻辑，无 DOM 依赖。
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;
  var T = GBG.theory;
  var STYLES = GBG.styles;

  var BEATS_PER_BAR = 4;
  var ROLE_COLORS = {
    drums: '#fb923c', bass: '#22d3ee', pad: '#a78bfa', arp: '#38bdf8',
    lead: '#f472b6', counter: '#fbbf24', stab: '#fb7185', texture: '#64748b'
  };

  // 全局混音比例（按声部角色平衡，避免鼓组压过旋律）
  var ROLE_MIX = { bass: 1.42, pad: 0.72, arp: 0.95, lead: 1.28, counter: 1.3, stab: 1.0, texture: 1.35 };

  var SECTION_META = {
    intro:   { name: '前奏', boost: -1, color: '#64748b' },
    A:       { name: 'A 段', boost: 0, color: '#38bdf8' },
    B:       { name: 'B 段', boost: 1, color: '#a78bfa' },
    A2:      { name: 'A′ 段', boost: 1, color: '#f472b6' },
    build:   { name: '铺陈', boost: -1, color: '#818cf8' },
    climax:  { name: '高潮', boost: 1, color: '#f43f5e' },
    release: { name: '回落', boost: -1, color: '#34d399' },
    outro:   { name: '尾声', boost: -1, color: '#94a3b8' },
    loopA:   { name: '循环 A', boost: 0, color: '#38bdf8' },
    loopB:   { name: '循环 B', boost: 1, color: '#a78bfa' }
  };

  var TITLES = {
    epic: ['王座之影', '远山号角', '破晓誓约', '龙脊之上'],
    triumph: ['胜利之冠', '加冕时刻', '破晓凯旋', '最后一面旗'],
    adventure: ['风与原野', '旅途第一站', '地平线之外', '旅人的歌'],
    battle: ['钢铁之舞', '绝境反击', '血与火', '最后一击'],
    cyberpunk: ['霓虹残响', '义体心跳', '雨夜数据流', '零号街区'],
    edm: ['全场点亮', '能量脉冲', '午夜巡游', '跃动频率'],
    space: ['星海漂流', '无声引力', '轨道之外', '尘埃与光'],
    lofi: ['午后磁带', '窗边雨声', '慢慢来', '旧唱片'],
    dnb: ['疾驰', '断线飙车', '心跳过速', '追与逃'],
    chiptune: ['像素启程', '八位勇者', '关卡开始', '最后一枚金币'],
    guofeng: ['山水行', '故人归', '竹影摇', '一盏灯'],
    japanese: ['樱落之刃', '月下独行', '风铃与雪', '无名之町'],
    celtic: ['绿野之约', '酒馆故事', '远行船歌', '石环低语'],
    tribal: ['大地脉动', '篝火祭', '远古呼唤', '战舞'],
    horror: ['裂隙回声', '无人回廊', '低语', '不要在夜里回头'],
    tension: ['倒计时', '视线之外', '线索', '静默的猎手'],
    jazz: ['蓝调午夜', '角落里的钢琴', '威士忌与烟', '慢板信笺'],
    casual: ['糖果工厂', '小确幸', '晴天集市', '拼图时间'],
    sad: ['未寄出的信', '雪落无声', '旧照片', '告别练习']
  };

  /* ---------------- 工具 ---------------- */
  function barOf(beat) { return Math.floor(beat / BEATS_PER_BAR); }
  function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

  function nearestDeg(rootPc, scaleId, midi) {
    var best = 0, bestD = Infinity;
    for (var d = -14; d <= 21; d++) {
      var m = T.scaleDegreeMidi(rootPc, scaleId, d, 4);
      var dist = Math.abs(m - midi);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  }

  function degreeMidiInRange(rootPc, scaleId, deg, low, high) {
    var m = T.scaleDegreeMidi(rootPc, scaleId, deg, 4);
    var guard = 0;
    while (m < low && guard++ < 8) m += 12;
    while (m > high && guard++ < 8) m -= 12;
    return m;
  }

  function swingBeat(beat, swing) {
    if (!swing) return beat;
    var frac = beat - Math.floor(beat);
    var eps = 1e-6;
    if (Math.abs(frac - 0.5) < eps) return beat + swing * 0.5;
    if (Math.abs(frac - 0.25) < eps) return beat + swing * 0.28;
    if (Math.abs(frac - 0.75) < eps) return beat + swing * 0.28;
    return beat;
  }

  function human(rng, amt) { return (rng.gauss() || 0) * amt; }

  function chooseRhythmTemplate(style, rng) {
    var fam = style.family;
    var templates;
    if (style.id === 'chiptune') {
      templates = [[0, 0.5, 1, 1.5, 2, 2.5, 3], [0, 0.5, 1, 2, 2.5, 3], [0, 1, 1.5, 2, 3], [0, 0.75, 1.5, 2.5, 3]];
    } else if (fam === 'electronic') {
      templates = [[0, 1, 1.5, 2, 3], [0, 0.75, 1.5, 2, 2.5, 3], [0, 0.5, 1.5, 2, 3], [0, 1, 2, 2.5, 3]];
    } else if (fam === 'orchestral') {
      templates = [[0, 1, 2, 3], [0, 1.5, 2, 3], [0, 1, 2.5, 3], [0, 0.5, 1, 2, 3], [0, 2, 3]];
    } else if (fam === 'jazz') {
      templates = [[0, 1, 2, 2.5, 3], [0, 0.5, 1.5, 2, 3], [0, 1.5, 2, 3], [0.5, 1, 2, 2.5, 3]];
    } else if (fam === 'horror') {
      templates = [[0, 2.5], [0, 3], [0, 1, 3], [0, 2]];
    } else if (fam === 'ethnic') {
      templates = [[0, 1, 2, 2.5, 3], [0, 0.75, 1.5, 2.5, 3], [0, 1, 1.5, 2, 3]];
    } else if (fam === 'casual') {
      templates = [[0, 0.5, 1, 2, 2.5, 3], [0, 1, 1.5, 2, 3], [0, 0.5, 1.5, 2, 3]];
    } else if (fam === 'cinematic') {
      templates = [[0, 2, 3], [0, 1, 2, 3], [0, 1.5, 3]];
    } else {
      templates = [[0, 1, 2, 3], [0, 0.5, 1.5, 2, 3], [0, 1, 2, 3.5]];
    }
    return rng.pick(templates);
  }

  /* ---------------- 段落 ---------------- */
  function buildSections(style, totalBars, form, rng) {
    var sections = [];
    var bar = 0;
    var intro = 0, outro = 0;

    if (form === 'full' || form === 'cinematic') {
      intro = totalBars >= 32 ? 4 : 2;
      outro = totalBars >= 32 ? 4 : 2;
    }
    var body = totalBars - intro - outro;
    if (body < 8) { intro = 0; outro = 0; body = totalBars; }

    function push(kind, bars) {
      if (bars <= 0) return;
      var meta = SECTION_META[kind];
      sections.push({
        id: 'sec' + sections.length,
        kind: kind,
        name: meta.name,
        startBar: bar,
        bars: bars,
        boost: meta.boost,
        color: meta.color
      });
      bar += bars;
    }

    if (form === 'loop') {
      if (totalBars >= 32) {
        var half = Math.round(totalBars / 2 / 4) * 4;
        push('loopA', half);
        push('loopB', totalBars - half);
      } else {
        push('loopA', totalBars);
      }
    } else if (form === 'cinematic') {
      push('intro', intro);
      var a = Math.max(4, Math.round(body * 0.3 / 4) * 4);
      var b = Math.max(4, Math.round(body * 0.4 / 4) * 4);
      var c = body - a - b;
      if (c < 4) { c = 4; b = body - a - c; }
      push('build', a);
      push('climax', b);
      push('release', c);
      push('outro', outro);
    } else if (form === 'full') {
      push('intro', intro);
      // A / B / A' 结构
      if (body >= 24) {
        var aBars = Math.round(body * 0.28 / 4) * 4;
        var bBars = Math.round(body * 0.36 / 4) * 4;
        var a2Bars = body - aBars - bBars;
        if (a2Bars < 4) { a2Bars = 4; aBars = body - bBars - a2Bars; }
        push('A', aBars);
        push('B', bBars);
        push('A2', a2Bars);
      } else {
        var ah = Math.round(body / 2 / 4) * 4;
        if (ah < 4) ah = body;
        push('A', ah);
        push('B', body - ah);
      }
      push('outro', outro);
    } else {
      // 未知结构按循环处理
      push('loopA', totalBars);
    }

    // 修正总小节（若取整溢出/不足）
    var acc = sections.reduce(function (s, x) { return s + x.bars; }, 0);
    if (acc !== totalBars) {
      if (sections.length) sections[sections.length - 1].bars += totalBars - acc;
      if (sections[sections.length - 1].bars <= 0) sections[sections.length - 1].bars = 4;
    }
    return sections;
  }

  function sectionAtBar(song, bar) {
    for (var i = 0; i < song.sections.length; i++) {
      var s = song.sections[i];
      if (bar >= s.startBar && bar < s.startBar + s.bars) return s;
    }
    return song.sections[song.sections.length - 1];
  }

  function barIntensity(song, bar) {
    var sec = sectionAtBar(song, bar);
    // 强度 0 时保持极简：段落起伏不额外加层
    var boost = sec ? sec.boost * (song.meta.intensity >= 1 ? 1 : 0) : 0;
    var v = song.meta.intensity + boost;
    return U.clamp(v, 0, 3);
  }

  /* ---------------- 和声 ---------------- */
  function buildHarmony(song, rng) {
    var style = song.style;
    var meta = song.meta;
    var barsPerChord = (style.id === 'space' || style.id === 'horror') ? 2 : 1;
    if (meta.bpm < 70 && style.family === 'cinematic') barsPerChord = 2;

    var ext = style.extension;
    if (meta.complexity > 0.72 && ext < 2) ext += 1;
    if (meta.complexity < 0.3 && ext > 0) ext -= 1;

    var pool = style.progs.slice();
    var progIndex = 0;
    var prevVoicing = null;
    song.chords = [];
    song.chordByBar = [];

    for (var si = 0; si < song.sections.length; si++) {
      var sec = song.sections[si];
      var prog = T.progressionById(pool[si % pool.length] || pool[0]);
      // 段落切换时偶尔换一个进行
      if (si > 0 && rng.chance(0.45)) {
        prog = T.progressionById(rng.pick(pool));
      }
      for (var b = sec.startBar; b < sec.startBar + sec.bars; b += barsPerChord) {
        var slot = Math.floor((b - sec.startBar) / barsPerChord) % prog.degs.length;
        var deg = prog.degs[slot];
        var opts = { extension: ext };
        // 段尾属和弦强化
        var isSectionEnd = (b + barsPerChord >= sec.startBar + sec.bars);
        var isPhraseEnd = ((b - sec.startBar) % 8 === 7) || isSectionEnd;
        if (isPhraseEnd && meta.complexity > 0.55 && rng.chance(0.22)) {
          opts.quality = 'maj';
        }
        var chord = T.makeChord(meta.rootPc, meta.scaleId, deg, opts);
        // 五声音阶偶尔用三度叠置替代
        if (style.family === 'ethnic' && rng.chance(0.15)) {
          chord = T.makeChord(meta.rootPc, meta.scaleId, deg, { extension: 0, sus: 'sus4' });
        }
        chord.bar = b;
        chord.bars = Math.min(barsPerChord, sec.startBar + sec.bars - b);
        chord.beat = b * BEATS_PER_BAR;
        chord.duration = chord.bars * BEATS_PER_BAR;
        chord.voicing = T.voiceChord(chord, prevVoicing, {
          low: 48, high: 76, count: ext >= 1 ? 4 : 3,
          center: 60
        });
        prevVoicing = chord.voicing;
        song.chords.push(chord);
        for (var k = 0; k < chord.bars; k++) song.chordByBar[b + k] = chord;
      }
    }
  }

  function chordAtBeat(song, beat) {
    var bar = barOf(beat + 0.0001);
    return song.chordByBar[bar] || song.chords[0];
  }

  /* ---------------- 鼓组 ---------------- */
  function buildDrums(song, rng) {
    var style = song.style;
    var conf = style.drums;
    var kit = GBG.instruments.kits[conf.kit] || GBG.instruments.kits.orch;
    // 管弦鼓组让位给弦乐/铜管/人声，避免低频压住整个混音
    var drumGain = style.family === 'orchestral' ? 0.3 :
      (style.family === 'chiptune' ? 0.3 : 0.35);
    var part = {
      id: 'drums', name: '鼓组', role: 'drums', instrument: 'kit:' + conf.kit,
      pattern: 'kit', gain: drumGain, pan: 0, muted: false, solo: false,
      color: ROLE_COLORS.drums, notes: [], minIntensity: 0, kind: 'drums'
    };

    var baseRoles = ['kick', 'snare'];
    var extraByIntensity = conf.intensity || {};
    var fillEvery = conf.fillEvery || 8;
    var swing = style.swing || 0;
    var density = song.meta.density;

    for (var bar = 0; bar < song.meta.bars; bar++) {
      var inten = barIntensity(song, bar);
      if (inten < 1) {
        // 强度 0：完全静音，留给铺底与旋律
        continue;
      }
      var roles = baseRoles.slice();
      Object.keys(extraByIntensity).forEach(function (lv) {
        if (inten >= Number(lv)) {
          extraByIntensity[lv].forEach(function (r) { if (roles.indexOf(r) === -1) roles.push(r); });
        }
      });
      var sectionStart = song.sections.some(function (s) { return s.startBar === bar; });

      roles.forEach(function (role) {
        var mask = conf.steps[role];
        if (!mask) return;
        var isBase = baseRoles.indexOf(role) !== -1;
        var hits = U.parseSteps(mask);
        hits.forEach(function (h) {
          // 管弦镲片只保留 4 小节一次 / 段落起点，避免高频“散声”铺满
          if (style.family === 'orchestral' && role === 'crash') {
            if (h.step !== 0) return;
            if (!sectionStart && bar % 4 !== 0) return;
          }
          if (!isBase && h.vel < 0.7 && !rng.chance(density)) return;
          if (isBase && h.vel < 0.5 && rng.chance(0.3)) return;
          var t = bar * BEATS_PER_BAR + h.step * 0.25;
          t = swingBeat(t, role === 'hat' || role === 'ride' ? swing : swing * 0.5);
          t += Math.abs(human(rng, 0.008));
          var vel = h.vel * (0.9 + rng.next() * 0.18);
          if (role === 'crash' && style.family === 'orchestral') vel *= 0.65;
          var drum = kit[role] || role;
          part.notes.push({
            t: t,
            d: 0.1,
            midi: drumPitch(drum, role, h.step),
            vel: U.clamp(vel, 0.15, 1),
            drum: drum,
            drumRole: role,
            layer: 'drums'
          });
        });
      });

      // 加花
      var isFill = (bar + 1) % fillEvery === 0 && inten >= 1 && bar < song.meta.bars - 1;
      if (isFill && conf.fillType) {
        var fillDrum = kit[conf.fillType] || conf.fillType;
        var n = inten >= 2 ? 4 : 2;
        for (var f = 0; f < n; f++) {
          var step = 16 - n + f;
          part.notes.push({
            t: bar * BEATS_PER_BAR + step * 0.25 + Math.abs(human(rng, 0.006)),
            d: 0.1,
            midi: 45 + f * 2,
            vel: 0.55 + 0.35 * (f / n),
            drum: fillDrum,
            drumRole: 'fill',
            layer: 'drums'
          });
        }
      }

      // 强度 3：非 4 小节网格的段落起点补一记冲击（避免与常规镲片叠加）
      if (inten >= 3 && bar > 0 && sectionStart && bar % 4 !== 0) {
        var boom = kit.crash || kit.ride || kit.openhat || kit.metal;
        if (boom) {
          part.notes.push({ t: bar * 4, d: 0.1, midi: 0, vel: 0.7, drum: boom, drumRole: 'crash', layer: 'drums' });
        }
      }
    }
    part.notes.sort(function (a, b) { return a.t - b.t; });
    song.parts.push(part);
  }

  function drumPitch(drum, role, step) {
    if (role === 'tom' || role === 'taiko' || role === 'djembe') return 45 + (step % 4);
    return 0;
  }

  /* ---------------- 编曲精简（Clarity） ----------------
   * 目标：同样的和声与律动，但减少「同时发声的声部数量」与音区/节奏重叠。
   * 1) 特征层（minIntensity>=2）只在高潮段出现，且不是每小节都来
   * 2) 与主旋律同音区、同时间的伴奏降低力度或直接让位
   * 3) 铺底限 3 音，去掉与贝斯打架的低音
   * 4) 鼓组只保留 kick/snare/hat 骨架，色彩打击与 16 分踩镲按清晰度抽稀
   * 5) 跨声部同音去重
   */
  function refineArrangement(song, clarity) {
    var c = U.clamp(clarity === undefined ? 0.55 : clarity, 0, 1);
    song.meta.clarity = c;
    if (c <= 0.001) return;

    var rng = new U.Rng(song.meta.seed + ':refine:' + song.meta.styleId + ':' + c.toFixed(2));
    var bars = song.meta.bars;
    var boost = new Int8Array(bars);
    song.sections.forEach(function (s) {
      for (var b = s.startBar; b < s.startBar + s.bars && b < bars; b++) boost[b] = s.boost;
    });
    // 单一循环段（如 16 小节 A 段）没有 B 段时，用后半段制造「抬起来」的对比
    var hasLift = false;
    for (var lb = 0; lb < bars; lb++) { if (boost[lb] >= 1) { hasLift = true; break; } }
    if (!hasLift) {
      var liftFrom = Math.floor(bars * 0.5);
      for (var lb2 = liftFrom; lb2 < bars; lb2++) boost[lb2] = 1;
    }

    var leadPart = null;
    song.parts.forEach(function (p) { if (!leadPart && p.role === 'lead') leadPart = p; });
    var leadGrid = {};
    if (leadPart) {
      leadPart.notes.forEach(function (n) {
        var s = Math.round(n.t * 4);
        var e = Math.round((n.t + n.d) * 4);
        for (var k = s; k <= e; k++) {
          (leadGrid[k] = leadGrid[k] || []).push(n.midi);
        }
      });
    }
    function clashesWithLead(t, d, midi) {
      var s = Math.round(t * 4);
      var e = Math.round((t + d) * 4);
      for (var k = s; k <= e; k++) {
        var arr = leadGrid[k];
        if (!arr) continue;
        for (var i = 0; i < arr.length; i++) {
          if (Math.abs(arr[i] - midi) <= 7) return true;
        }
      }
      return false;
    }

    var hasBass = song.parts.some(function (p) { return p.role === 'bass' && p.notes.length > 0; });

    /* ---- 1. 段落级出场 + 音区让位 ---- */
    song.parts.forEach(function (part) {
      if (!part.notes.length || part.role === 'drums') return;
      var minI = part.minIntensity || 0;
      var isLead = part === leadPart;
      var active = new Uint8Array(bars).fill(1);
      for (var b = 0; b < bars; b++) {
        if (part.role === 'texture') continue;
        if (minI >= 2) {
          if (boost[b] < 1) active[b] = 0;
          else if (b % 4 === 3 && rng.chance(0.3 + 0.5 * c)) active[b] = 0;
        } else if (minI === 1) {
          if (boost[b] < 0) active[b] = 0;
          else if (b % 8 === 7 && rng.chance(0.25 + 0.5 * c)) active[b] = 0;
        } else if ((part.role === 'arp' || part.role === 'counter') && b % 8 === 7 && rng.chance(0.2 + 0.55 * c)) {
          active[b] = 0;
        }
      }

      var out = [];
      part.notes.forEach(function (n) {
        var bar = Math.floor(n.t / 4);
        if (!active[bar]) return;

        if (!isLead) {
          if (clashesWithLead(n.t, n.d, n.midi)) {
            n.vel *= (1 - 0.4 * c);
            if (c > 0.4 && rng.chance(0.3 * c)) return;
          } else {
            n.vel *= (1 - 0.12 * c);
          }
        }

        if (part.role === 'arp') {
          var s16 = Math.round(n.t * 4);
          if (s16 % 2 === 1 && rng.chance(0.3 + 0.5 * c)) return;
          if (c > 0.7 && rng.chance(0.15)) return;
        } else if (part.role === 'bass') {
          var b16 = Math.round(n.t * 4);
          if (b16 % 2 === 1 && n.d <= 0.3 && rng.chance(0.25 + 0.6 * c)) return;
        } else if (part.role === 'counter') {
          if (c > 0.5 && rng.chance(0.3 * c)) return;
        } else if (part.role === 'stab') {
          if (c > 0.55 && rng.chance(0.25 * c)) return;
        }
        out.push(n);
      });
      part.notes = out;
    });

    /* ---- 2. 铺底：限 3 音，去掉与贝斯重叠的低音 ---- */
    song.parts.forEach(function (part) {
      if (part.role !== 'pad' || !part.notes.length) return;
      var groups = {};
      part.notes.forEach(function (n) {
        var k = Math.round(n.t * 4);
        (groups[k] = groups[k] || []).push(n);
      });
      var kept = [];
      Object.keys(groups).forEach(function (k) {
        var g = groups[k].sort(function (a, b) { return a.midi - b.midi; });
        if (hasBass) g = g.filter(function (n) { return n.midi >= 45; });
        var maxNotes = c > 0.55 ? 3 : 4;
        if (g.length > maxNotes) g = g.slice(0, maxNotes);
        kept = kept.concat(g);
      });
      part.notes = kept;
    });

    /* ---- 3. 鼓组：骨架优先，色彩打击与 16 分踩镲抽稀 ---- */
    song.parts.forEach(function (part) {
      if (part.role !== 'drums' || !part.notes.length) return;
      var seen = {};
      var kept = [];
      part.notes.forEach(function (n) {
        var key = n.drum + '@' + Math.round(n.t * 8);
        if (seen[key]) return;
        seen[key] = 1;
        var role = n.drumRole || '';
        var core = role === 'kick' || role === 'snare' || role === 'hat' || role === 'sub' || role === 'crash';
        if (!core) {
          if (rng.chance(0.18 + 0.55 * c)) return;
          n.vel *= (1 - 0.1 * c);
        }
        if ((role === 'hat' || /hat/i.test(n.drum)) && Math.round(n.t * 4) % 2 === 1) {
          if (rng.chance(0.25 + 0.55 * c)) return;
          n.vel *= 0.85;
        }
        kept.push(n);
      });
      part.notes = kept;
    });

    /* ---- 4. 色彩声部轮换：琶音/铺底/副旋律/色彩层按乐句轮流登场 ---- */
    var colorParts = [];
    song.parts.forEach(function (p) {
      if (p.role === 'drums' || p.role === 'lead' || p.role === 'bass' || p.role === 'texture') return;
      var minI = p.minIntensity || 0;
      var isColor = p.role === 'counter' ||
        (p.role === 'pad' && minI >= 1) ||
        (p.role === 'stab' && minI >= 1) ||
        (p.role === 'arp' && minI >= 2);
      if (isColor) colorParts.push(p);
    });
    var colorBudget = Math.max(1, Math.floor(colorParts.length * (1 - 0.6 * c)));
    var phrase = 4;
    var phraseIndex = 0;
    for (var p0 = 0; p0 < bars; p0 += phrase) {
      var p1 = Math.min(bars, p0 + phrase);
      var present = colorParts.filter(function (p) {
        return p.notes.some(function (n) {
          var b = Math.floor(n.t / 4);
          return b >= p0 && b < p1;
        });
      });
      if (present.length > colorBudget) {
        var offset = (phraseIndex * colorBudget) % present.length;
        var keep = {};
        for (var k = 0; k < colorBudget; k++) keep[present[(offset + k) % present.length].id] = 1;
        present.forEach(function (p) {
          if (keep[p.id]) return;
          p.notes = p.notes.filter(function (n) {
            var b = Math.floor(n.t / 4);
            return b < p0 || b >= p1;
          });
        });
      }
      phraseIndex++;
    }

    /* ---- 5. 跨声部同音去重（贝斯与旋律优先） ---- */
    var priority = { lead: 9, bass: 8, pad: 7, stab: 6, arp: 5, counter: 4, texture: 3 };
    var ordered = song.parts.slice().sort(function (a, b) {
      return (priority[b.role] || 0) - (priority[a.role] || 0);
    });
    var occupied = {};
    ordered.forEach(function (part) {
      if (part.role === 'drums' || !part.notes.length) return;
      var kept = [];
      part.notes.forEach(function (n) {
        var key = Math.round(n.t * 8) + ':' + n.midi;
        if (occupied[key] && c > 0.2) return;
        occupied[key] = 1;
        kept.push(n);
      });
      part.notes = kept;
    });

    /* ---- 6. 声像分离，减少同位置堆叠 ---- */
    if (c > 0.3) {
      song.parts.forEach(function (p) {
        if (p.role === 'pad') p.pan = Math.min(p.pan, -0.32);
        else if (p.role === 'arp') p.pan = Math.max(p.pan, 0.3);
        else if (p.role === 'counter') p.pan = Math.min(p.pan, -0.2);
        else if (p.role === 'texture') p.pan = Math.max(p.pan, 0.35);
      });
    }
  }

  /* ---------------- 和声层 ---------------- */
  function buildPad(song, rng, layer, opts) {
    var notes = [];
    var notesOut = notes;
    var prev = null;
    var block = opts.swell ? 2 : 1;
    var density = song.meta.density;
    for (var bar = 0; bar < song.meta.bars; bar += block) {
      var inten = barIntensity(song, bar);
      if (inten < layer.minIntensity) continue;
      var chord = song.chordByBar[bar];
      if (!chord) continue;
      // 若和弦恰好在块中间切换，缩短时值
      var dur = Math.min(block * BEATS_PER_BAR, chord.duration, song.meta.bars * BEATS_PER_BAR - bar * BEATS_PER_BAR);
      if (opts.swell) dur += 1.5;
      var count = opts.swell ? 3 : (song.meta.complexity > 0.62 ? 4 : 3);
      var voicing = T.voiceChord(chord, prev, {
        low: layer.low, high: layer.high, count: count, center: (layer.low + layer.high) / 2
      });
      prev = voicing;
      voicing.forEach(function (m, idx) {
        if (inten < 1 && idx === voicing.length - 1 && rng.chance(0.4)) return;
        notesOut.push({
          t: bar * BEATS_PER_BAR + idx * 0.012,
          d: dur,
          midi: m,
          vel: (0.55 + 0.25 * inten / 3) * (0.92 + rng.next() * 0.12),
          layer: layer.id
        });
      });
      // 低八度根音（避免与和声排列重复同音）
      if (layer.role === 'pad' && rng.chance(0.4 + 0.2 * density)) {
        var lowRoot = T.scaleDegreeMidi(song.meta.rootPc, song.meta.scaleId, 0, Math.floor(layer.low / 12) - 1);
        if (voicing.indexOf(lowRoot) === -1) {
          notesOut.push({
            t: bar * BEATS_PER_BAR,
            d: dur,
            midi: lowRoot,
            vel: 0.45,
            layer: layer.id
          });
        }
      }
    }
    return notesOut;
  }

  function buildStab(song, rng, layer, opts) {
    var notes = [];
    var patterns = {
      orchestral: [[0, 8], [0, 6, 10], [0, 4, 8, 12]],
      electronic: [[3, 6, 10, 14], [2, 6, 11, 14], [3, 7, 11, 15]],
      chiptune: [[2, 6, 10, 14], [4, 12]],
      jazz: [[0, 3], [1, 3], [0, 2.5]],
      ethnic: [[0, 8], [0, 6, 10]],
      horror: [[0, 8], [8]],
      casual: [[0, 8], [4, 12]],
      cinematic: [[0, 8], [0, 10]]
    };
    var pat = rng.pick(patterns[song.style.family] || [[0, 8]]);
    var count = song.meta.complexity > 0.6 ? 4 : 3;
    for (var bar = 0; bar < song.meta.bars; bar++) {
      var inten = barIntensity(song, bar);
      if (inten < Math.max(layer.minIntensity, 1)) continue;
      var chord = song.chordByBar[bar];
      if (!chord) continue;
      var voicing = T.voiceChord(chord, null, {
        low: layer.low, high: layer.high,
        count: count, center: (layer.low + layer.high) / 2
      });
      pat.forEach(function (step) {
        var t = bar * BEATS_PER_BAR + step * 0.25;
        t = swingBeat(t, song.style.swing);
        var dur = opts.strum ? 0.7 : (step % 4 === 0 ? 0.45 : 0.28);
        voicing.forEach(function (m, idx) {
          if (rng.chance(0.06)) return;
          notes.push({
            t: t + (opts.strum ? idx * 0.022 : 0),
            d: dur,
            midi: m,
            vel: (step % 4 === 0 ? 0.9 : 0.62) * (0.9 + rng.next() * 0.15),
            layer: layer.id
          });
        });
        // 低八度强化
        if (step % 8 === 0) {
          notes.push({
            t: t, d: dur * 0.9,
            midi: chord.rootPc + 12 * Math.floor(layer.low / 12),
            vel: 0.7, layer: layer.id
          });
        }
      });
    }
    return notes;
  }

  function buildComp(song, rng, layer) {
    var notes = [];
    var shapes = [[0, 1.5, 2.5], [0, 2, 3.5], [0.5, 1.5, 3], [0, 1, 2.5]];
    for (var bar = 0; bar < song.meta.bars; bar++) {
      var inten = barIntensity(song, bar);
      if (inten < layer.minIntensity) continue;
      var chord = song.chordByBar[bar];
      if (!chord) continue;
      var shape = rng.pick(shapes);
      var voicing = T.voiceChord(chord, null, {
        low: layer.low, high: layer.high,
        count: song.meta.complexity > 0.6 ? 4 : 3,
        center: (layer.low + layer.high) / 2 - 2
      });
      shape.forEach(function (beat, si) {
        var t = bar * BEATS_PER_BAR + beat;
        var dur = si === shape.length - 1 ? 1.2 : 0.5;
        voicing.forEach(function (m, vi) {
          notes.push({
            t: t + vi * 0.01,
            d: dur,
            midi: m,
            vel: (0.6 + rng.next() * 0.25) * (si === 0 ? 1.05 : 0.9),
            layer: layer.id
          });
        });
      });
    }
    return notes;
  }

  function buildArp(song, rng, layer) {
    var notes = [];
    var step = layer.pattern === 'arp16' || layer.pattern === 'ostinato16' ? 0.25 :
      (layer.pattern === 'arp8' ? 0.5 : 0.5);
    var density = song.meta.density;
    var prevIndex = 0;
    for (var bar = 0; bar < song.meta.bars; bar++) {
      var inten = barIntensity(song, bar);
      if (inten < layer.minIntensity) continue;
      var chord = song.chordByBar[bar];
      if (!chord) continue;
      var tones = T.chordNotesInRange(chord, layer.low, layer.high, song.meta.scaleId, song.meta.rootPc);
      if (tones.length < 3) tones = T.chordNotesInRange(chord, layer.low - 12, layer.high + 12);
      if (tones.length < 2) continue;

      var order = [];
      var n = Math.round(BEATS_PER_BAR / step);
      var i;
      if (layer.pattern === 'arp16' || layer.pattern === 'arp8') {
        for (i = 0; i < n; i++) order.push(i);
      } else if (layer.pattern === 'arpUpDown') {
        var updown = tones.concat(tones.slice(1, -1).reverse());
        for (i = 0; i < n; i++) order.push(i % updown.length);
      } else if (layer.pattern === 'ostinato16') {
        var cell = [0, 2, 1, 3, 0, 2, 3, 1];
        for (i = 0; i < n; i++) order.push(cell[i % cell.length]);
      } else {
        // broken：低音 + 上方三音交替
        for (i = 0; i < n; i++) order.push(i);
      }

      for (i = 0; i < n; i++) {
        var idx = order[i];
        var midi;
        if (layer.pattern === 'broken') {
          var upper = tones.filter(function (m) { return m > tones[0] + 6; });
          if (!upper.length) upper = tones;
          midi = i % 4 === 0 ? tones[0] : upper[(i % upper.length)];
          // 阿贝蒂式 1-5-3-5
          if (i % 4 === 1) midi = upper[Math.min(1, upper.length - 1)];
          if (i % 4 === 3) midi = upper[Math.min(2, upper.length - 1)];
        } else if (layer.pattern === 'arpUpDown') {
          var ud = tones.concat(tones.slice(1, -1).reverse());
          midi = ud[idx % ud.length];
        } else {
          midi = tones[idx % tones.length];
        }
        if (midi === undefined) continue;
        if (!rng.chance(0.94)) continue;
        var vel = (i % 4 === 0 ? 0.72 : 0.5) * (0.85 + rng.next() * 0.3);
        if (inten < 1) vel *= 0.85;
        notes.push({
          t: bar * BEATS_PER_BAR + i * step,
          d: step * (rng.chance(0.25) ? 1.6 : 0.85),
          midi: midi,
          vel: U.clamp(vel, 0.15, 1),
          layer: layer.id
        });
      }
    }
    return notes;
  }

  /* ---------------- 贝斯 ---------------- */
  function bassMidi(chord, octave, offsetSemis) {
    var base = (octave + 1) * 12 + chord.rootPc + (offsetSemis || 0);
    while (base < 24) base += 12;
    while (base > 50) base -= 12;
    return base;
  }

  function buildBass(song, rng, layer) {
    var notes = [];
    var meta = song.meta;
    var pat = layer.pattern;
    var density = meta.density;
    var nextChord;
    for (var bar = 0; bar < meta.bars; bar++) {
      var inten = barIntensity(song, bar);
      if (inten < layer.minIntensity) continue;
      var chord = song.chordByBar[bar];
      if (!chord) continue;
      nextChord = song.chordByBar[bar + 1] || chord;
      var root = bassMidi(chord, 2, 0);
      var fifth = bassMidi(chord, 2, chord.intervals[2] || 7);
      var third = bassMidi(chord, 2, chord.intervals[1] || 3);
      var octUp = root + 12;
      var t, i;

      switch (pat) {
        case 'root':
          notes.push({ t: bar * 4, d: 1.6, midi: root, vel: 0.8, layer: layer.id });
          if (rng.chance(0.55)) {
            notes.push({ t: bar * 4 + 2, d: 1.6, midi: rng.chance(0.5) ? fifth : octUp, vel: 0.62, layer: layer.id });
          }
          break;
        case 'pulse8':
          for (i = 0; i < 8; i++) {
            var accent = i % 2 === 0;
            if (!accent && !rng.chance(0.75 + density * 0.2)) continue;
            var m = root;
            if (i === 3 && rng.chance(0.25)) m = third;
            if (i === 5 && rng.chance(0.3)) m = octUp;
            notes.push({
              t: bar * 4 + i * 0.5, d: 0.42, midi: m,
              vel: (accent ? 0.8 : 0.55) * (0.9 + rng.next() * 0.2), layer: layer.id
            });
          }
          break;
        case 'pulse16':
          for (i = 0; i < 16; i++) {
            var acc = i % 4 === 0;
            if (!acc && !rng.chance(0.7 + density * 0.25)) continue;
            notes.push({
              t: bar * 4 + i * 0.25, d: 0.2, midi: acc ? root : (rng.chance(0.18) ? octUp : root),
              vel: (acc ? 0.85 : 0.5) * (0.9 + rng.next() * 0.15), layer: layer.id
            });
          }
          break;
        case 'offbeat':
          [0.5, 1.5, 2.5, 3.5].forEach(function (b, bi) {
            if (bi === 3 && rng.chance(0.3)) return;
            notes.push({
              t: bar * 4 + b, d: 0.42, midi: bi === 2 ? (rng.chance(0.4) ? octUp : root) : root,
              vel: 0.78, layer: layer.id
            });
          });
          break;
        case 'octave':
          [0, 1, 2, 3].forEach(function (b) {
            notes.push({
              t: bar * 4 + b, d: 0.9, midi: b % 2 === 0 ? root : octUp,
              vel: b % 2 === 0 ? 0.82 : 0.62, layer: layer.id
            });
          });
          break;
        case 'walk':
          var walk = [root, fifth, third, bassMidi(nextChord, 2, 0) - 1];
          if (rng.chance(0.5)) walk[3] = bassMidi(nextChord, 2, -1);
          [0, 1, 2, 3].forEach(function (b) {
            notes.push({
              t: bar * 4 + b, d: 0.85, midi: walk[b],
              vel: 0.7 + rng.next() * 0.12, layer: layer.id
            });
          });
          break;
        case 'sub':
          notes.push({ t: bar * 4, d: 3.7, midi: root, vel: 0.85, layer: layer.id });
          if (rng.chance(0.3)) {
            notes.push({ t: bar * 4 + 2.5, d: 1.2, midi: root, vel: 0.6, layer: layer.id });
          }
          break;
        case 'pedal':
          notes.push({
            t: bar * 4, d: 7.6,
            midi: bassMidi(song.chordByBar[Math.floor(bar / 2) * 2] || chord, 2, 0),
            vel: 0.55, layer: layer.id
          });
          bar += 1;
          break;
        case 'gallop':
          [0, 0.75, 1, 1.5, 2, 2.75, 3, 3.5].forEach(function (b, bi) {
            notes.push({
              t: bar * 4 + b, d: 0.22, midi: bi % 4 === 1 ? octUp : root,
              vel: bi % 4 === 1 ? 0.55 : 0.82, layer: layer.id
            });
          });
          break;
        default:
          notes.push({ t: bar * 4, d: 3.8, midi: root, vel: 0.8, layer: layer.id });
      }
    }
    return notes;
  }

  /* ---------------- 旋律 ---------------- */
  function makeMotif(bars, layer, style, rng, template) {
    var rootPc = style.meta ? 0 : 0;
    var notes = [];
    var center = (layer.low + layer.high) / 2;
    var centerDeg = nearestDeg(style.rootPc, style.scaleId, center);
    var deg = centerDeg + rng.pick([-2, -1, 0, 0, 1, 2]);
    var shape = rng.pick(['arch', 'arch', 'wave', 'descend', 'ascend', 'flat']);
    var density = style.density;
    var tpl = template;

    for (var b = 0; b < bars; b++) {
      var dir = 0;
      if (shape === 'arch') dir = b < bars / 2 ? 1 : -1;
      else if (shape === 'descend') dir = -1;
      else if (shape === 'ascend') dir = 1;
      else if (shape === 'wave') dir = b % 2 === 0 ? 1 : -1;

      for (var k = 0; k < tpl.length; k++) {
        if (k > 0 && !rng.chance(0.45 + 0.5 * density)) continue;
        var stepChoices, weights;
        if (dir > 0) { stepChoices = [1, 2, 2, 3, 0, -1]; weights = [4, 3, 2, 1, 2, 1]; }
        else if (dir < 0) { stepChoices = [-1, -2, -2, -3, 0, 1]; weights = [4, 3, 2, 1, 2, 1]; }
        else { stepChoices = [0, 1, -1, 2, -2]; weights = [2, 3, 3, 1, 1]; }
        deg += rng.weighted(stepChoices, weights);
        var midi = degreeMidiInRange(style.rootPc, style.scaleId, deg, layer.low, layer.high);
        var realDeg = nearestDeg(style.rootPc, style.scaleId, midi);
        deg = realDeg;
        notes.push({
          t: b * 4 + tpl[k],
          deg: deg,
          vel: (tpl[k] % 2 === 0 ? 0.8 : 0.65) * (0.9 + rng.next() * 0.15)
        });
      }
    }
    // 终止音：回到主音/三音
    if (notes.length) {
      var last = notes[notes.length - 1];
      var tonicDeg = nearestDeg(style.rootPc, style.scaleId,
        degreeMidiInRange(style.rootPc, style.scaleId, 0, layer.low, layer.high));
      if (rng.chance(0.7)) last.deg = tonicDeg;
      else {
        var thirdDeg = nearestDeg(style.rootPc, style.scaleId,
          degreeMidiInRange(style.rootPc, style.scaleId, 2, layer.low, layer.high));
        last.deg = thirdDeg;
      }
      last.durHint = 2;
    }
    return { notes: notes, shape: shape, template: tpl };
  }

  function varyMotif(motif, bars, rng, style, layer) {
    var out = motif.notes.map(function (n) { return { t: n.t, deg: n.deg, vel: n.vel }; });
    var trans = rng.pick([0, 0, 1, -1, 2, -2]);
    if (rng.chance(0.35)) {
      // 只重复前两小节
      out = out.filter(function (n) { return n.t < bars * 2 - 0.05; });
    }
    out.forEach(function (n) {
      n.deg += trans;
      var midi = degreeMidiInRange(style.rootPc, style.scaleId, n.deg, layer.low, layer.high);
      n.deg = nearestDeg(style.rootPc, style.scaleId, midi);
      if (rng.chance(0.1)) n.vel *= 0.85;
    });
    if (rng.chance(0.7) && out.length > 1) {
      out[out.length - 1].deg = nearestDeg(style.rootPc, style.scaleId,
        degreeMidiInRange(style.rootPc, style.scaleId, 0, layer.low, layer.high));
      out[out.length - 1].durHint = 2;
    }
    return { notes: out, shape: motif.shape, template: motif.template };
  }

  function snapToChord(deg, chord, style, layer, rng) {
    var midi = degreeMidiInRange(style.rootPc, style.scaleId, deg, layer.low, layer.high);
    if (T.isChordTone(midi, chord)) return deg;
    var tries = [1, -1, 2, -2, 3, -3];
    for (var i = 0; i < tries.length; i++) {
      var cand = deg + tries[i];
      var m2 = degreeMidiInRange(style.rootPc, style.scaleId, cand, layer.low, layer.high);
      if (T.isChordTone(m2, chord)) return cand;
    }
    return deg;
  }

  function genMelody(song, rng, layer) {
    var style = {
      rootPc: song.meta.rootPc, scaleId: song.meta.scaleId,
      density: song.meta.density, family: song.style.family
    };
    var notes = [];
    var template = chooseRhythmTemplate(song.style, rng);
    var motif = null;
    var phraseBars = song.meta.bpm < 80 ? 4 : 4;
    var prevMidi = null;

    song.sections.forEach(function (sec) {
      var total = sec.bars;
      var phraseCount = Math.max(1, Math.ceil(total / phraseBars));
      for (var p = 0; p < phraseCount; p++) {
        var startBar = sec.startBar + p * phraseBars;
        var bars = Math.min(phraseBars, sec.startBar + total - startBar);
        if (bars <= 0) continue;
        var inten = barIntensity(song, startBar);
        if (inten < layer.minIntensity) continue;
        if (!motif || rng.chance(0.3)) motif = makeMotif(bars, layer, style, rng, template);
        else motif = varyMotif(motif, bars, rng, style, layer);

        var mnotes = motif.notes.slice();
        if (inten < 1 && mnotes.length > 4) {
          mnotes = mnotes.filter(function (n, idx) { return idx % 2 === 0; });
        }
        for (var i = 0; i < mnotes.length; i++) {
          var n = mnotes[i];
          var t = startBar * 4 + n.t;
          if (t >= (sec.startBar + total) * 4) break;
          var beatInBar = ((t % 4) + 4) % 4;
          var chord = chordAtBeat(song, t);
          var deg = n.deg;
          if (beatInBar % 2 === 0) {
            deg = snapToChord(deg, chord, style, layer, rng);
          }
          var midi = degreeMidiInRange(style.rootPc, style.scaleId, deg, layer.low, layer.high);
          var dur;
          if (i + 1 < mnotes.length) {
            dur = Math.max(0.22, (mnotes[i + 1].t - n.t) * rng.range(0.72, 0.98));
          } else {
            dur = n.durHint || rng.range(1.2, 2.6);
          }
          // 同音重复时缩短
          if (prevMidi === midi) dur *= 0.8;
          if (rng.chance(0.12)) dur *= 0.55;
          var tt = t + human(rng, 0.008);
          tt = swingBeat(tt, song.style.swing * 0.6);
          notes.push({
            t: Math.max(0, tt),
            d: dur,
            midi: midi,
            vel: U.clamp(n.vel * (0.92 + rng.next() * 0.12), 0.2, 1),
            layer: layer.id
          });
          prevMidi = midi;
        }
      }
    });
    return notes;
  }

  function genSparse(song, rng, layer) {
    var notes = [];
    for (var bar = 0; bar < song.meta.bars; bar++) {
      var inten = barIntensity(song, bar);
      if (inten < layer.minIntensity) continue;
      var chord = song.chordByBar[bar];
      if (!chord) continue;
      var count = rng.int(2) + 1;
      for (var i = 0; i < count; i++) {
        if (!rng.chance(0.75)) continue;
        var beat = rng.pick([0, 1, 1.5, 2, 2.5, 3]);
        var tones = T.chordNotesInRange(chord, layer.low, layer.high);
        if (!tones.length) tones = chord.voicing;
        notes.push({
          t: bar * 4 + beat,
          d: rng.range(0.8, 2.4),
          midi: rng.pick(tones),
          vel: rng.range(0.4, 0.75),
          layer: layer.id
        });
      }
    }
    return notes;
  }

  function genCounter(song, rng, layer, leadPart) {
    var notes = [];
    var style = {
      rootPc: song.meta.rootPc, scaleId: song.meta.scaleId,
      density: song.meta.density, family: song.style.family
    };
    if (leadPart && leadPart.notes.length) {
      var src = leadPart.notes.filter(function (n, idx) {
        return idx % 2 === 0 && barIntensity(song, barOf(n.t)) >= layer.minIntensity;
      });
      var i;
      for (i = 0; i < src.length; i++) {
        var n = src[i];
        var chord = chordAtBeat(song, n.t);
        var deg = nearestDeg(song.meta.rootPc, song.meta.scaleId, n.midi) - 2;
        var midi = degreeMidiInRange(song.meta.rootPc, song.meta.scaleId, deg, layer.low, layer.high);
        if (T.isChordTone(midi, chord) === false && rng.chance(0.5)) {
          deg = snapToChord(deg, chord, style, layer, rng);
          midi = degreeMidiInRange(song.meta.rootPc, song.meta.scaleId, deg, layer.low, layer.high);
        }
        var nextT = (i + 1 < src.length) ? src[i + 1].t : n.t + 4;
        notes.push({
          t: n.t,
          d: Math.max(0.5, Math.min(3.2, (nextT - n.t) * 1.4)),
          midi: midi,
          vel: n.vel * 0.8,
          layer: layer.id
        });
      }
      return notes;
    }
    return genMelody(song, rng, layer);
  }

  /* ---------------- 纹理 ---------------- */
  function genTexture(song, rng, layer) {
    var notes = [];
    if (layer.pattern === 'air') {
      for (var bar = 0; bar < song.meta.bars; bar += 8) {
        var inten = barIntensity(song, bar);
        if (inten < layer.minIntensity) continue;
        var bars = Math.min(8, song.meta.bars - bar);
        notes.push({
          t: bar * 4, d: bars * 4 - 0.5,
          midi: 60 + rng.int(12),
          vel: 0.5 + inten * 0.08,
          layer: layer.id
        });
      }
    } else if (layer.pattern === 'vinyl') {
      for (var s = 0; s < song.sections.length; s++) {
        var sec = song.sections[s];
        if (barIntensity(song, sec.startBar) < layer.minIntensity) continue;
        notes.push({
          t: sec.startBar * 4, d: sec.bars * 4 - 0.2,
          midi: 60, vel: 0.55, layer: layer.id
        });
      }
    } else if (layer.pattern === 'sweep') {
      for (var ss = 1; ss < song.sections.length; ss++) {
        var sec2 = song.sections[ss];
        if (barIntensity(song, sec2.startBar) < layer.minIntensity) continue;
        var t = sec2.startBar * 4 - 2;
        if (t < 0) continue;
        notes.push({ t: t, d: 1.95, midi: 72, vel: 0.6, layer: layer.id });
      }
    }
    return notes;
  }

  /* ---------------- 主入口 ---------------- */
  function generate(params) {
    params = params || {};
    var style = STYLES.byId(params.styleId || 'epic');
    var seed = params.seed === undefined ? (Date.now() % 100000) : params.seed;
    var rngRoot = new U.Rng(seed + ':song');
    var bars = clampInt(params.bars || 32, 8, 128);
    bars = Math.round(bars / 4) * 4;
    var bpm = Math.round(params.bpm || (style.bpm[0] + style.bpm[1]) / 2);
    bpm = clampInt(bpm, 40, 200);
    var scaleId = params.scaleId || style.defaultMode;
    if (!T.SCALES[scaleId]) scaleId = style.defaultMode;
    var rootPc = (params.rootPc === undefined || !isFinite(params.rootPc)) ? rngRoot.int(12) : T.mod12(params.rootPc);
    var form = params.form || 'loop';
    var density = (params.density === undefined || !isFinite(params.density)) ? style.density : U.clamp(params.density, 0, 1);
    var complexity = (params.complexity === undefined || !isFinite(params.complexity)) ? style.complexity : U.clamp(params.complexity, 0, 1);
    var intensity = (params.intensity === undefined || !isFinite(params.intensity)) ? 2 : clampInt(params.intensity, 0, 3);
    var swing = (params.swing === undefined || !isFinite(params.swing)) ? (style.swing || 0) : U.clamp(params.swing, 0, 0.6);
    var clarity = (params.clarity === undefined || !isFinite(params.clarity)) ? 0.55 : U.clamp(params.clarity, 0, 1);

    var meta = {
      id: U.uid('song'),
      title: params.title || rngRoot.pick(TITLES[style.id] || ['未命名']),
      styleId: style.id,
      styleName: style.name,
      styleEn: style.en,
      emoji: style.emoji,
      bpm: bpm,
      rootPc: rootPc,
      scaleId: scaleId,
      keyLabel: T.keyLabel(rootPc, scaleId),
      keyShort: T.keyLabelShort(rootPc, scaleId),
      bars: bars,
      beatsPerBar: BEATS_PER_BAR,
      seed: seed,
      density: density,
      complexity: complexity,
      intensity: intensity,
      swing: swing,
      clarity: clarity,
      form: form,
      prompt: params.prompt || '',
      createdAt: new Date().toISOString()
    };

    var song = {
      meta: meta,
      style: style,
      sections: [],
      chords: [],
      parts: [],
      loop: { startBar: 0, endBar: bars }
    };

    var rngForm = new U.Rng(seed + ':form:' + style.id + ':' + bars + ':' + form);
    song.sections = buildSections(style, bars, form, rngForm);
    if (form !== 'loop') {
      song.loop.startBar = song.sections[0].bars;
      song.loop.endBar = bars - song.sections[song.sections.length - 1].bars;
      if (song.loop.endBar - song.loop.startBar < 4) {
        song.loop.startBar = 0;
        song.loop.endBar = bars;
      }
    } else {
      song.loop.startBar = 0;
      song.loop.endBar = bars;
    }

    buildHarmony(song, new U.Rng(seed + ':harm:' + style.id + ':' + rootPc + ':' + scaleId));

    buildDrums(song, new U.Rng(seed + ':drums:' + style.id));

    // 先旋律，再对位层
    var layerRng = {};
    style.layers.forEach(function (l) { layerRng[l.id] = new U.Rng(seed + ':layer:' + l.id + ':' + style.id); });

    var leadPart = null;
    var ordered = style.layers.slice().sort(function (a, b) {
      var ca = a.pattern === 'counter' ? 1 : 0;
      var cb = b.pattern === 'counter' ? 1 : 0;
      return ca - cb;
    });

    ordered.forEach(function (layer) {
      var rng = layerRng[layer.id];
      var notes = [];
      switch (layer.pattern) {
        case 'sustain':
        case 'swell':
          notes = buildPad(song, rng, layer, { swell: layer.pattern === 'swell' });
          break;
        case 'stab':
          notes = buildStab(song, rng, layer, { strum: false });
          break;
        case 'strum':
          notes = buildStab(song, rng, layer, { strum: true });
          break;
        case 'comp':
          notes = buildComp(song, rng, layer);
          break;
        case 'arp8':
        case 'arp16':
        case 'arpUpDown':
        case 'broken':
        case 'ostinato16':
          notes = buildArp(song, rng, layer);
          break;
        case 'root':
        case 'pulse8':
        case 'pulse16':
        case 'offbeat':
        case 'walk':
        case 'octave':
        case 'sub':
        case 'pedal':
        case 'gallop':
          notes = buildBass(song, rng, layer);
          break;
        case 'sparse':
          notes = genSparse(song, rng, layer);
          break;
        case 'melody':
          notes = genMelody(song, rng, layer);
          break;
        case 'counter':
          notes = genCounter(song, rng, layer, leadPart);
          break;
        case 'air':
        case 'vinyl':
        case 'sweep':
          notes = genTexture(song, rng, layer);
          break;
        default:
          notes = genMelody(song, rng, layer);
      }

      notes = notes.filter(function (n) {
        return n.midi >= 0 && n.midi <= 127 && isFinite(n.t) && isFinite(n.d) && n.d > 0;
      }).sort(function (a, b) { return a.t - b.t; });

      var part = {
        id: layer.id,
        name: layer.name,
        role: layer.role,
        instrument: layer.instrument,
        pattern: layer.pattern,
        gain: U.clamp(layer.gain * (ROLE_MIX[layer.role] || 1), 0.05, 1.4),
        pan: layer.pan,
        muted: false,
        solo: false,
        minIntensity: layer.minIntensity,
        color: ROLE_COLORS[layer.role] || '#94a3b8',
        notes: notes,
        kind: 'pitched'
      };
      song.parts.push(part);
      if (layer.pattern === 'melody' && !leadPart) leadPart = part;
    });

    // 编曲精简：在完整编排之上做「留白」，减少同时发声的声部与音区冲突
    refineArrangement(song, clarity);

    // 统计
    var noteCount = 0;
    song.parts.forEach(function (p) { noteCount += p.notes.length; });
    song.stats = {
      notes: noteCount,
      parts: song.parts.length,
      durationSec: bars * BEATS_PER_BAR * 60 / bpm,
      loopSec: (song.loop.endBar - song.loop.startBar) * BEATS_PER_BAR * 60 / bpm
    };
    song.durationBeats = bars * BEATS_PER_BAR;
    return song;
  }

  /* 换风格时保留和声骨架（可选） */
  function restyle(song, newStyleId, opts) {
    opts = opts || {};
    var oldMeta = song.meta;
    return generate({
      styleId: newStyleId,
      seed: opts.seed === undefined ? oldMeta.seed : opts.seed,
      bpm: opts.bpm || oldMeta.bpm,
      rootPc: oldMeta.rootPc,
      scaleId: opts.scaleId || (opts.keepKey ? oldMeta.scaleId : undefined),
      bars: oldMeta.bars,
      density: oldMeta.density,
      complexity: oldMeta.complexity,
      intensity: oldMeta.intensity,
      swing: opts.swing,
      clarity: oldMeta.clarity,
      form: oldMeta.form,
      prompt: oldMeta.prompt,
      title: opts.title || oldMeta.title
    });
  }

  GBG.composer = {
    generate: generate,
    restyle: restyle,
    sectionAtBar: sectionAtBar,
    barIntensity: barIntensity,
    chordAtBeat: chordAtBeat,
    BEATS_PER_BAR: BEATS_PER_BAR,
    ROLE_COLORS: ROLE_COLORS
  };
})(typeof window !== 'undefined' ? window : globalThis);
