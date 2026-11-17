/* ==========================================================================
 * ui.js — 预设卡片、波形、频谱、参数、变体、收藏
 * ========================================================================== */
(function (global) {
  'use strict';

  var SFX = global.SFX = global.SFX || {};
  var U = SFX.util;
  var clamp = U.clamp;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 预设 ---------------- */
  function renderCategories(container, active, categories) {
    container.innerHTML = categories.map(function (c) {
      return '<button class="tab' + (c.id === active ? ' on' : '') + '" data-cat="' + c.id + '">' +
        esc(c.name) + '</button>';
    }).join('');
  }

  function renderPresets(container, presets, activeId) {
    container.innerHTML = presets.map(function (p) {
      return '<button class="preset' + (p.id === activeId ? ' on' : '') + '" data-preset="' + p.id + '" title="' + esc(p.tags.join(' / ')) + '">' +
        '<div class="p-name">' + esc(p.name) + '</div>' +
        '<div class="p-tags">' + p.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
        '</button>';
    }).join('');
  }

  function renderStyles(container, active, styles) {
    container.innerHTML = Object.keys(styles).map(function (k) {
      var s = styles[k];
      return '<button data-style="' + k + '" class="' + (k === active ? 'on' : '') + '">' + esc(s.name) + '</button>';
    }).join('');
  }

  function renderWaveforms(container, active, options) {
    container.innerHTML = options.map(function (o) {
      return '<button data-wave="' + o.id + '" class="' + (o.id === active ? 'on' : '') + '">' + esc(o.name) + '</button>';
    }).join('');
  }

  /* ---------------- 参数 ---------------- */
  var CONTROL_DEFS = [
    { key: 'weight', name: '重量', min: 0, max: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    { key: 'brightness', name: '亮度', min: 0, max: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    { key: 'metallic', name: '金属感', min: 0, max: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    { key: 'roughness', name: '粗糙度', min: 0, max: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    { key: 'magic', name: '魔法感', min: 0, max: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    { key: 'space', name: '空间', min: 0, max: 100, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    { key: 'pitch', name: '音高', min: -12, max: 12, fmt: function (v) { return (v > 0 ? '+' : '') + Math.round(v) + ' st'; } }
  ];

  function renderControls(container, macros, onChange) {
    container.innerHTML = CONTROL_DEFS.map(function (d) {
      var v = Number(macros[d.key]);
      if (!isFinite(v)) v = 0;
      var unit = d.max === 100;
      var disp = unit ? v * 100 : v;
      var pct = ((disp - d.min) / (d.max - d.min)) * 100;
      return '<div class="ctrl">' +
        '<label>' + d.name + ' <b data-val="' + d.key + '">' + d.fmt(v) + '</b></label>' +
        '<input type="range" data-macro="' + d.key + '" min="' + d.min + '" max="' + d.max + '" step="1" value="' + Math.round(disp) + '" style="--p:' + clamp(pct, 0, 100) + '%">' +
        '</div>';
    }).join('');
    container.oninput = function (e) {
      var input = e.target.closest('[data-macro]');
      if (!input) return;
      var key = input.getAttribute('data-macro');
      var def = CONTROL_DEFS.filter(function (d) { return d.key === key; })[0];
      var raw = Number(input.value);
      var val = def.max === 100 ? raw / 100 : raw;
      var b = container.querySelector('[data-val="' + key + '"]');
      if (b) b.textContent = def.fmt(val);
      var pct = ((raw - def.min) / (def.max - def.min)) * 100;
      input.style.setProperty('--p', pct + '%');
      onChange(key, val);
    };
  }

  function updateControlValues(container, macros) {
    CONTROL_DEFS.forEach(function (d) {
      var input = container.querySelector('[data-macro="' + d.key + '"]');
      if (!input) return;
      var v = Number(macros[d.key]);
      if (!isFinite(v)) v = 0;
      var unit = d.max === 100;
      var disp = unit ? v * 100 : v;
      input.value = Math.round(disp);
      var pct = ((disp - d.min) / (d.max - d.min)) * 100;
      input.style.setProperty('--p', clamp(pct, 0, 100) + '%');
      var b = container.querySelector('[data-val="' + d.key + '"]');
      if (b) b.textContent = d.fmt(v);
    });
  }

  /* ---------------- 波形 ---------------- */
  function computePeaks(channels, width) {
    var n = channels[0].length;
    var peaks = new Float32Array(width * 2);
    var step = n / width;
    for (var x = 0; x < width; x++) {
      var start = Math.floor(x * step);
      var end = Math.min(n, Math.floor((x + 1) * step));
      var mn = 0, mx = 0;
      for (var ch = 0; ch < channels.length; ch++) {
        var d = channels[ch];
        for (var i = start; i < end; i++) {
          var v = d[i];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      peaks[x * 2] = mn;
      peaks[x * 2 + 1] = mx;
    }
    return peaks;
  }

  function setupCanvas(canvas, cssHeight) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(100, Math.floor(canvas.parentElement.getBoundingClientRect().width - 2));
    var h = cssHeight || Math.max(60, canvas.clientHeight || 120);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.height = h + 'px';
    }
    return { ctx: canvas.getContext('2d'), w: w, h: h, dpr: dpr };
  }

  function drawWave(canvas, channels, progress) {
    if (!channels) return;
    var s = setupCanvas(canvas, 118);
    var ctx = s.ctx, w = s.w, h = s.h;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0d0b0a');
    bg.addColorStop(1, '#080707');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    var peaks = computePeaks(channels, w);
    var mid = h / 2;
    var grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#f5a623');
    grad.addColorStop(0.5, '#ff7a2f');
    grad.addColorStop(1, '#ffb347');
    ctx.fillStyle = grad;
    for (var x = 0; x < w; x++) {
      var mn = peaks[x * 2], mx = peaks[x * 2 + 1];
      var y1 = mid - mx * (h * 0.44);
      var y2 = mid - mn * (h * 0.44);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(245,166,35,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, mid + 0.5);
    ctx.lineTo(w, mid + 0.5);
    ctx.stroke();

    if (progress !== undefined && progress !== null && progress >= 0) {
      var px = clamp(progress, 0, 1) * w;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 0, px, h);
      ctx.strokeStyle = 'rgba(255,240,210,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    return s;
  }

  /* ---------------- 频谱 ---------------- */
  function fft(re, im) {
    var n = re.length;
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wc = Math.cos(ang), ws = Math.sin(ang);
      for (var i2 = 0; i2 < n; i2 += len) {
        var wr = 1, wi = 0;
        for (var k = 0; k < len / 2; k++) {
          var ur = re[i2 + k], ui = im[i2 + k];
          var vr = re[i2 + k + len / 2] * wr - im[i2 + k + len / 2] * wi;
          var vi = re[i2 + k + len / 2] * wi + im[i2 + k + len / 2] * wr;
          re[i2 + k] = ur + vr;
          im[i2 + k] = ui + vi;
          re[i2 + k + len / 2] = ur - vr;
          im[i2 + k + len / 2] = ui - vi;
          var nwr = wr * wc - wi * ws;
          wi = wr * ws + wi * wc;
          wr = nwr;
        }
      }
    }
  }

  function computeSpectrogram(channels, sampleRate, cols, bins) {
    cols = cols || 220;
    bins = bins || 96;
    var n = channels[0].length;
    var mono = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var ch = 0; ch < channels.length; ch++) s += channels[ch][i];
      mono[i] = s / channels.length;
    }
    var fftSize = 1024;
    var out = new Float32Array(cols * bins);
    var re = new Float32Array(fftSize);
    var im = new Float32Array(fftSize);
    var win = new Float32Array(fftSize);
    for (var k = 0; k < fftSize; k++) win[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / (fftSize - 1));
    var fMin = 40, fMax = Math.min(16000, sampleRate / 2 - 100);

    for (var x = 0; x < cols; x++) {
      var center = Math.floor((x + 0.5) / cols * n);
      var start = clamp(center - fftSize / 2, 0, Math.max(0, n - fftSize));
      for (var j = 0; j < fftSize; j++) {
        re[j] = (mono[start + j] || 0) * win[j];
        im[j] = 0;
      }
      fft(re, im);
      for (var b = 0; b < bins; b++) {
        var f0 = fMin * Math.pow(fMax / fMin, b / bins);
        var f1 = fMin * Math.pow(fMax / fMin, (b + 1) / bins);
        var k0 = Math.max(1, Math.floor(f0 / sampleRate * fftSize));
        var k1 = Math.max(k0 + 1, Math.ceil(f1 / sampleRate * fftSize));
        var mag = 0;
        for (var kk = k0; kk < k1 && kk < fftSize / 2; kk++) {
          var m = Math.sqrt(re[kk] * re[kk] + im[kk] * im[kk]);
          if (m > mag) mag = m;
        }
        var db = 20 * Math.log10(mag + 1e-7);
        out[x * bins + b] = clamp((db + 85) / 75, 0, 1);
      }
    }
    return { data: out, cols: cols, bins: bins };
  }

  function colorFor(v) {
    // 黑 → 暗红 → 橙 → 金 → 白
    var stops = [
      [8, 7, 7], [45, 20, 14], [128, 40, 18], [222, 105, 26], [245, 166, 35], [255, 240, 200]
    ];
    var t = clamp(v, 0, 1) * (stops.length - 1);
    var i = Math.floor(t), f = t - i;
    var a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f)
    ];
  }

  function drawSpectro(canvas, channels, sampleRate) {
    if (!channels) return;
    var s = setupCanvas(canvas, 138);
    var ctx = s.ctx, w = s.w, h = s.h;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var spec = computeSpectrogram(channels, sampleRate, 240, 96);
    var off = document.createElement('canvas');
    off.width = spec.cols;
    off.height = spec.bins;
    var octx = off.getContext('2d');
    var img = octx.createImageData(spec.cols, spec.bins);
    for (var x = 0; x < spec.cols; x++) {
      for (var b = 0; b < spec.bins; b++) {
        var v = spec.data[x * spec.bins + b];
        var c = colorFor(v);
        var idx = ((spec.bins - 1 - b) * spec.cols + x) * 4;
        img.data[idx] = c[0];
        img.data[idx + 1] = c[1];
        img.data[idx + 2] = c[2];
        img.data[idx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, w, h);

    // 频段刻度
    ctx.fillStyle = 'rgba(255,235,200,0.45)';
    ctx.font = '9px ' + getComputedStyle(document.body).fontFamily;
    [100, 1000, 10000].forEach(function (f) {
      var y = h - (Math.log(f / 40) / Math.log(16000 / 40)) * h;
      ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : f + '', 4, clamp(y, 10, h - 2));
    });
  }

  /* ---------------- 变体 ---------------- */
  function renderVariants(container, variants, selected, dirty) {
    container.innerHTML = variants.map(function (v, i) {
      return '<button class="variant' + (i === selected ? ' on' : '') + (v.dirty ? ' dirty' : '') + '" data-variant="' + i + '">' +
        '<canvas class="v-canvas" data-canvas="' + i + '"></canvas>' +
        '<div class="v-meta"><b>#' + (i + 1) + '</b><span>' + (v.rendered ? v.duration.toFixed(2) + 's' : '…') + '</span></div>' +
        '</button>';
    }).join('');
    variants.forEach(function (v, i) {
      var c = container.querySelector('[data-canvas="' + i + '"]');
      if (c && v.channels) drawMini(c, v.channels);
    });
  }

  function drawMini(canvas, channels) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = 74, h = 30;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var peaks = computePeaks(channels, w);
    var mid = h / 2;
    ctx.fillStyle = 'rgba(245,166,35,0.75)';
    for (var x = 0; x < w; x++) {
      var mx = peaks[x * 2 + 1], mn = peaks[x * 2];
      ctx.fillRect(x, mid - mx * (h * 0.44), 1, Math.max(1, (mx - mn) * h * 0.44));
    }
  }

  /* ---------------- 收藏 ---------------- */
  function renderFavorites(container, list) {
    if (!list.length) {
      container.innerHTML = '<div class="empty">还没有收藏。调好一版后点「☆ 收藏」。</div>';
      return;
    }
    container.innerHTML = list.map(function (f) {
      return '<div class="fav" data-fav="' + f.id + '">' +
        '<div class="fav-info"><b>' + esc(f.name) + '</b><span>' + esc(f.categoryName) + ' · ' + esc(f.styleName) + ' · #' + f.seed + '</span></div>' +
        '<div class="fav-actions"><button class="mini-btn" data-load="' + f.id + '" title="载入">▶</button>' +
        '<button class="mini-btn del" data-del="' + f.id + '" title="删除">✕</button></div>' +
        '</div>';
    }).join('');
  }

  SFX.ui = {
    el: el,
    esc: esc,
    renderCategories: renderCategories,
    renderPresets: renderPresets,
    renderStyles: renderStyles,
    renderWaveforms: renderWaveforms,
    renderControls: renderControls,
    updateControlValues: updateControlValues,
    drawWave: drawWave,
    drawSpectro: drawSpectro,
    renderVariants: renderVariants,
    drawMini: drawMini,
    renderFavorites: renderFavorites,
    computePeaks: computePeaks,
    computeSpectrogram: computeSpectrogram
  };
})(typeof window !== 'undefined' ? window : globalThis);
