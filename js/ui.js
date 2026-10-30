/* ==========================================================================
 * ui.js — 渲染层：钢琴卷帘、频谱、风格卡片、调音台、作品库
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG = global.GBG || {};
  var U = GBG.util;
  var T = GBG.theory;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var DRUM_LANE = function (id) {
    if (/kick|bassDrum|timpani|heartbeat|subBoom|djembe|taiko/.test(id)) return 0;
    if (/snare|clap|snap|brush|metal|rim|wood|tick|gong/.test(id)) return 1;
    if (/hat|shaker|ride|cymbal|tamb/.test(id)) return 2;
    return 3;
  };

  /* ==================== 钢琴卷帘 ==================== */
  function RollView(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.static = document.createElement('canvas');
    this.sctx = this.static.getContext('2d');
    this.song = null;
    this.dirty = true;
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.layout = { w: 800, h: 292, gutter: 30, ruler: 20, section: 18, chord: 22, drums: 26, beats: 32, barW: 24 };
    this.lastBeat = 0;
    var self = this;
    this._onResize = function () { self.resize(); };
    if (global.ResizeObserver && canvas.parentElement) {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(canvas.parentElement);
    } else {
      global.addEventListener('resize', this._onResize);
    }
    this.resize();
  }

  RollView.prototype.setSong = function (song) {
    this.song = song;
    this.dirty = true;
    this.draw(0);
  };

  RollView.prototype.resize = function () {
    var rect = this.canvas.parentElement.getBoundingClientRect();
    var w = Math.max(320, Math.floor(rect.width - 2));
    var h = Math.max(180, Math.floor(this.canvas.clientHeight || this.canvas.parentElement.clientHeight || 292));
    if (w === this.layout.w && h === this.layout.h && this._sized) return;
    this.layout.w = w;
    this.layout.h = h;
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.height = h + 'px';
    this.static.width = this.canvas.width;
    this.static.height = this.canvas.height;
    this._sized = true;
    this.dirty = true;
  };

  RollView.prototype.computePitchRange = function () {
    var song = this.song;
    var lo = 127, hi = 0;
    song.parts.forEach(function (p) {
      if (p.role === 'drums') return;
      p.notes.forEach(function (n) {
        if (n.midi < lo) lo = n.midi;
        if (n.midi > hi) hi = n.midi;
      });
    });
    if (lo > hi) { lo = 48; hi = 76; }
    lo -= 2; hi += 2;
    var minSpan = 28;
    if (hi - lo < minSpan) {
      var mid = (hi + lo) / 2;
      lo = Math.floor(mid - minSpan / 2);
      hi = Math.ceil(mid + minSpan / 2);
    }
    lo = Math.max(12, lo); hi = Math.min(108, hi);
    return { lo: lo, hi: hi };
  };

  RollView.prototype.renderStatic = function () {
    var ctx = this.sctx;
    var L = this.layout;
    var dpr = this.dpr;
    var song = this.song;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);

    // 背景
    var bg = ctx.createLinearGradient(0, 0, 0, L.h);
    bg.addColorStop(0, '#080e18');
    bg.addColorStop(1, '#060a12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.w, L.h);

    if (!song) return;

    L.bars = song.meta.bars;
    L.barW = (L.w - L.gutter) / L.bars;
    var pr = this.computePitchRange();
    L.pitchLo = pr.lo;
    L.pitchHi = pr.hi;
    var top = L.ruler + L.section + L.chord + 4;
    var drumTop = L.h - L.drums - 6;
    var pitchH = drumTop - top - 6;
    L.top = top;
    L.pitchH = pitchH;
    L.drumTop = drumTop;
    var rowH = pitchH / (pr.hi - pr.lo + 1);
    L.rowH = rowH;
    var barW = L.barW;
    var gutter = L.gutter;

    function xOfBeat(beat) { return gutter + beat / 4 * barW; }
    this.xOfBeat = xOfBeat;

    // 小节底色
    for (var b = 0; b < L.bars; b++) {
      if (b % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.012)';
        ctx.fillRect(gutter + b * barW, top, barW, pitchH);
      }
    }

    // 音高网格
    ctx.font = '9px ' + getComputedStyle(document.body).fontFamily;
    ctx.textBaseline = 'middle';
    for (var m = pr.lo; m <= pr.hi; m++) {
      var y = top + (pr.hi - m + 0.5) * rowH;
      var pc = T.mod12(m);
      if (pc === 0) {
        ctx.strokeStyle = 'rgba(148,163,184,0.20)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gutter, y); ctx.lineTo(L.w, y); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,0.55)';
        ctx.fillText('C' + (Math.floor(m / 12) - 1), 6, y);
      } else if (pc === 5) {
        ctx.strokeStyle = 'rgba(148,163,184,0.05)';
        ctx.beginPath(); ctx.moveTo(gutter, y); ctx.lineTo(L.w, y); ctx.stroke();
      }
    }

    // 拍线 / 小节线
    for (var bb = 0; bb <= L.bars; bb++) {
      var x = gutter + bb * barW;
      ctx.strokeStyle = bb % 4 === 0 ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.13)';
      ctx.lineWidth = bb % 4 === 0 ? 1 : 1;
      ctx.beginPath(); ctx.moveTo(x, L.ruler); ctx.lineTo(x, drumTop + L.drums); ctx.stroke();
      if (barW >= 22 || bb % 4 === 0) {
        ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.font = '9px ' + getComputedStyle(document.body).fontFamily;
        ctx.fillText(String(bb + 1), x + 3, L.ruler - 7);
      }
      if (bb < L.bars) {
        for (var q = 1; q < 4; q++) {
          var xq = x + q * barW / 4;
          ctx.strokeStyle = 'rgba(148,163,184,0.055)';
          ctx.beginPath(); ctx.moveTo(xq, top); ctx.lineTo(xq, pitchH + top); ctx.stroke();
        }
      }
    }

    // 段落条
    song.sections.forEach(function (sec) {
      var sx = gutter + sec.startBar * barW;
      var sw = sec.bars * barW;
      ctx.fillStyle = hexA(sec.color, 0.16);
      ctx.fillRect(sx, L.ruler - 2, sw, L.section - 4);
      ctx.strokeStyle = hexA(sec.color, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx + 0.5, L.ruler - 2); ctx.lineTo(sx + 0.5, L.ruler + L.section - 6); ctx.stroke();
      ctx.fillStyle = hexA(sec.color, 0.95);
      ctx.font = '600 9.5px ' + getComputedStyle(document.body).fontFamily;
      if (sw > 26) ctx.fillText(sec.name, sx + 5, L.ruler + L.section / 2 - 4);
    });

    // 和弦
    ctx.font = '8.5px ' + getComputedStyle(document.body).fontFamily;
    var chordEvery = barW < 14 ? 4 : (barW < 22 ? 2 : 1);
    var twoRows = barW >= 22 && barW < 46;
    song.chords.forEach(function (ch) {
      if (ch.bar % chordEvery !== 0) return;
      var cx = gutter + ch.bar * barW + 3;
      if (cx > L.w - 22) return;
      var row = twoRows ? (Math.floor(ch.bar / chordEvery) % 2) : 0;
      var cy = L.ruler + L.section + 10 + row * 9;
      ctx.fillStyle = twoRows ? 'rgba(34,211,238,0.5)' : 'rgba(34,211,238,0.62)';
      ctx.fillText(ch.symbol, cx, cy);
    });

    // 音符
    song.parts.forEach(function (part) {
      if (part.muted) return;
      if (part.role === 'drums') return;
      ctx.fillStyle = part.color;
      part.notes.forEach(function (n) {
        var nx = xOfBeat(n.t);
        var nw = Math.max(2.5, n.d / 4 * barW - 0.8);
        var ny = top + (pr.hi - n.midi) * rowH + 0.4;
        var nh = Math.max(2, rowH - 0.8);
        ctx.globalAlpha = 0.5 + n.vel * 0.5;
        roundRect(ctx, nx, ny, nw, nh, Math.min(2.5, nh / 2));
        ctx.fill();
      });
    });
    ctx.globalAlpha = 1;

    // 鼓轨
    ctx.fillStyle = 'rgba(251,146,60,0.07)';
    ctx.fillRect(gutter, drumTop, L.w - gutter, L.drums);
    ctx.strokeStyle = 'rgba(251,146,60,0.22)';
    ctx.beginPath(); ctx.moveTo(gutter, drumTop + 0.5); ctx.lineTo(L.w, drumTop + 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(251,146,60,0.65)';
    ctx.font = '8.5px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillText('鼓组', 5, drumTop + 9);
    var drums = song.parts.filter(function (p) { return p.role === 'drums'; })[0];
    if (drums) {
      drums.notes.forEach(function (n) {
        var dx = xOfBeat(n.t);
        var lane = DRUM_LANE(n.drum);
        var dy = drumTop + 4 + lane * 6;
        ctx.globalAlpha = 0.45 + n.vel * 0.55;
        ctx.fillStyle = lane === 0 ? '#fb923c' : (lane === 1 ? '#f472b6' : (lane === 2 ? '#fbbf24' : '#94a3b8'));
        ctx.fillRect(dx, dy, Math.max(1.6, Math.min(4, n.vel * 4)), 3.4);
      });
      ctx.globalAlpha = 1;
    }

    // 循环区间遮罩
    var loop = song.loop;
    var lx1 = xOfBeat(loop.startBar * 4);
    var lx2 = xOfBeat(loop.endBar * 4);
    if (loop.startBar > 0) {
      ctx.fillStyle = 'rgba(4,8,14,0.55)';
      ctx.fillRect(gutter, L.ruler - 4, Math.max(0, lx1 - gutter), L.h - L.ruler + 4);
    }
    if (loop.endBar < L.bars) {
      ctx.fillStyle = 'rgba(4,8,14,0.55)';
      ctx.fillRect(lx2, L.ruler - 4, Math.max(0, L.w - lx2), L.h - L.ruler + 4);
    }
    // 循环括号
    ctx.strokeStyle = 'rgba(34,211,238,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx1, 4); ctx.lineTo(lx2, 4);
    ctx.moveTo(lx1, 1); ctx.lineTo(lx1, 7);
    ctx.moveTo(lx2, 1); ctx.lineTo(lx2, 7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(34,211,238,0.85)';
    ctx.font = '8px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillText('LOOP', lx1 + 4, 12);

    // 分隔线
    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, L.ruler - 4.5); ctx.lineTo(L.w, L.ruler - 4.5);
    ctx.moveTo(0, top - 2.5); ctx.lineTo(L.w, top - 2.5);
    ctx.stroke();
  };

  RollView.prototype.draw = function (beat) {
    if (!this.ctx) return;
    this.lastBeat = beat;
    if (this.dirty) {
      this.renderStatic();
      this.dirty = false;
    }
    var ctx = this.ctx;
    var L = this.layout;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.static, 0, 0);
    if (!this.song) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var x = (L.gutter || 30) + (beat / 4) * (L.barW || 24);
    if (x < L.gutter) x = L.gutter;
    if (x > L.w) x = L.w;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, L.ruler - 2); ctx.lineTo(x, L.drumTop + L.drums); ctx.stroke();
    ctx.fillStyle = 'rgba(34,211,238,0.95)';
    ctx.beginPath();
    ctx.moveTo(x - 4, L.ruler - 2); ctx.lineTo(x + 4, L.ruler - 2); ctx.lineTo(x, L.ruler + 4); ctx.closePath(); ctx.fill();
    var glow = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
    glow.addColorStop(0, 'rgba(34,211,238,0)');
    glow.addColorStop(0.5, 'rgba(34,211,238,0.10)');
    glow.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 8, L.ruler, 16, L.drumTop + L.drums - L.ruler);
  };

  RollView.prototype.beatAt = function (clientX) {
    if (!this.song) return 0;
    var rect = this.canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var L = this.layout;
    var bar = (x - L.gutter) / L.barW;
    bar = Math.max(0, Math.min(this.song.meta.bars, bar));
    return bar * 4;
  };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16),
      g = parseInt(h.slice(2, 4), 16),
      b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ==================== 频谱 ==================== */
  function drawViz(canvas, spectrum, playing) {
    if (!canvas) return;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth;
    var h = canvas.clientHeight || 52;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(34,211,238,0.55)');
    grad.addColorStop(0.6, 'rgba(129,140,248,0.45)');
    grad.addColorStop(1, 'rgba(167,139,250,0.25)');
    ctx.fillStyle = grad;

    var n = 64;
    if (spectrum && playing) {
      var step = Math.floor(spectrum.length / n);
      for (var i = 0; i < n; i++) {
        var v = 0;
        for (var j = 0; j < step; j++) v = Math.max(v, spectrum[i * step + j]);
        var bh = Math.pow(v / 255, 1.4) * (h - 8);
        var bw = w / n;
        ctx.fillRect(i * bw + 1, h - 3 - bh, Math.max(1, bw - 2), bh);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, h - 2, w, 1);
    } else {
      // 静息波形
      var ph = performance.now() / 900;
      ctx.strokeStyle = 'rgba(94,234,212,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 0; x <= w; x += 3) {
        var y = h / 2 + Math.sin(x / 34 + ph) * 4 * Math.sin(x / 200 + ph * 0.6);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(148,163,184,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.font = '9px ' + getComputedStyle(document.body).fontFamily;
      ctx.fillText('SPECTRUM', 10, 13);
    }
  }

  /* ==================== 风格卡片 ==================== */
  function renderStyleGrid(container, family, activeId, onPick) {
    var styles = GBG.styles.list.filter(function (s) {
      return family === 'all' || s.family === family;
    });
    container.innerHTML = styles.map(function (s) {
      return '<button class="style-item' + (s.id === activeId ? ' on' : '') + '" data-style="' + s.id + '" title="' + esc(s.desc) + '">' +
        '<span class="si-check"></span>' +
        '<div class="si-top"><span class="si-emoji">' + s.emoji + '</span><span class="si-name">' + esc(s.name) + '</span></div>' +
        '<div class="si-en">' + esc(s.en) + '</div>' +
        '<div class="si-bpm">' + s.bpm[0] + '–' + s.bpm[1] + ' BPM</div>' +
        '</button>';
    }).join('');
  }

  function renderStyleDetail(container, style) {
    if (!style) { container.className = 'style-detail'; return; }
    container.className = 'style-detail show';
    container.innerHTML = '<b>' + style.emoji + ' ' + esc(style.name) + '</b> · ' + esc(style.desc) +
      '<div class="sd-tags">' + style.tags.map(function (t) { return '<span class="sd-tag">' + esc(t) + '</span>'; }).join('') +
      style.usage.map(function (t) { return '<span class="sd-tag">▸ ' + esc(t) + '</span>'; }).join('') + '</div>';
  }

  /* ==================== 调音台 ==================== */
  function renderMixer(container, song, mix) {
    if (!song) { container.innerHTML = '<div class="lib-empty">生成后可单独控制每个声部</div>'; return; }
    container.innerHTML = song.parts.map(function (p) {
      var muted = !!mix.mute[p.id];
      var solo = !!mix.solo[p.id];
      var empty = p.notes.length === 0;
      var vol = mix.volume[p.id] === undefined ? 1 : mix.volume[p.id];
      var instName = p.role === 'drums' ? ('套鼓 · ' + (p.instrument || '').replace('kit:', '')) : (GBG.instruments.names[p.instrument] || p.instrument);
      return '<div class="mix-row' + (muted ? ' muted' : '') + (empty ? ' empty' : '') + '" data-part="' + p.id + '">' +
        '<span class="mix-dot" style="background:' + p.color + ';color:' + p.color + '"></span>' +
        '<div class="mix-name audition" data-audition="' + p.id + '" title="点击试听音色">' +
        '<b>' + esc(p.name) + (p.minIntensity ? '<span class="gate">≥' + p.minIntensity + '</span>' : '') + '</b>' +
        '<i>' + (empty ? '本段休止' : '♪ ' + esc(instName)) + '</i></div>' +
        '<div class="mix-vol"><input type="range" min="0" max="120" value="' + Math.round(vol * 100) + '" data-vol="' + p.id + '"></div>' +
        '<span class="mix-count">' + p.notes.length + '</span>' +
        '<button class="mbtn mute' + (muted ? ' on' : '') + '" data-mute="' + p.id + '" title="静音">M</button>' +
        '<button class="mbtn solo' + (solo ? ' on' : '') + '" data-solo="' + p.id + '" title="独奏">S</button>' +
        '<button class="mbtn dl" data-dl="' + p.id + '" title="导出该声部">⬇</button>' +
        '</div>';
    }).join('');
  }

  /* ==================== 结构 / 和声 ==================== */
  function renderAnalysis(sectionList, chordStrip, hint, song) {
    var m = song.meta;
    hint.textContent = m.keyShort + ' · ' + m.bpm + ' BPM';
    sectionList.innerHTML = song.sections.map(function (s) {
      var inten = Math.max(0, Math.min(3, m.intensity + s.boost));
      var startBar = s.startBar + 1;
      var endBar = s.startBar + s.bars;
      return '<div class="sec-row">' +
        '<span class="sec-dot" style="background:' + s.color + '"></span>' +
        '<span class="sec-name">' + esc(s.name) + '</span>' +
        '<span class="sec-bars">' + startBar + '–' + endBar + '</span>' +
        '<span class="sec-int" data-i="' + inten + '">' + (s.kind === 'intro' || s.kind === 'outro' ? '—' : 'I' + inten) + '</span>' +
        '</div>';
    }).join('');

    var chords = song.chords.slice(0, 16);
    var html = chords.map(function (ch) {
      return '<span class="chord" title="第 ' + (ch.bar + 1) + ' 小节">' + esc(ch.symbol) + '</span>';
    }).join('');
    if (song.chords.length > 16) html += '<span class="chord more">+' + (song.chords.length - 16) + '</span>';
    chordStrip.innerHTML = html;
  }

  /* ==================== 作品库 ==================== */
  function renderLibrary(container, list, onLoad, onDelete) {
    if (!list.length) {
      container.innerHTML = '<div class="lib-empty">还没有保存的作品</div>';
      return;
    }
    container.innerHTML = list.map(function (w) {
      var d = new Date(w.savedAt);
      var time = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return '<div class="lib-item" data-id="' + w.id + '">' +
        '<div class="lib-info"><b>' + esc(w.title) + '</b>' +
        '<span>' + esc(w.styleName) + ' · ' + w.bpm + 'bpm · ' + time + '</span></div>' +
        '<div class="lib-act">' +
        '<button class="lib-btn" data-load="' + w.id + '" title="载入">▶</button>' +
        '<button class="lib-btn del" data-del="' + w.id + '" title="删除">✕</button>' +
        '</div></div>';
    }).join('');
  }

  GBG.ui = {
    el: el,
    esc: esc,
    hexA: hexA,
    RollView: RollView,
    drawViz: drawViz,
    renderStyleGrid: renderStyleGrid,
    renderStyleDetail: renderStyleDetail,
    renderMixer: renderMixer,
    renderAnalysis: renderAnalysis,
    renderLibrary: renderLibrary
  };
})(typeof window !== 'undefined' ? window : globalThis);
