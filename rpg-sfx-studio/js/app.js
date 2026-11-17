/* ==========================================================================
 * app.js — 状态、渲染流程、导出、批量包、收藏
 * ========================================================================== */
(function (global) {
  'use strict';

  var SFX = global.SFX;
  var U = SFX.util, P = SFX.presets, UI = SFX.ui;
  var $ = UI.el;

  var PREVIEW_SR = 32000;
  var VARIANT_COUNT = 8;
  var FAV_KEY = 'forgefx_favorites_v1';
  var LAST_KEY = 'forgefx_last_v1';
  var CAT_EN = {
    impact: 'Impact', ui: 'UI', buff: 'Buff', skill: 'Skill',
    forge: 'Forge', world: 'World', monster: 'Monster'
  };
  var STYLE_HINTS = {
    realistic: '写实：瞬态、金属泛音与空间更自然。',
    pixel: '像素：方波/短促、几乎无混响，适合 8-bit。',
    dark: '暗黑：整体降调、更多失真与长混响。',
    bright: '明亮：升调、更亮的高频，适合魔法与奖励。'
  };
  var WAVES = [
    { id: 'auto', name: '自动' },
    { id: 'sine', name: '正弦' },
    { id: 'triangle', name: '三角' },
    { id: 'sawtooth', name: '锯齿' },
    { id: 'square', name: '方波' }
  ];
  var WAVE_HINTS = {
    auto: '自动：跟随风格选择波形。',
    sine: '正弦：柔和干净，适合魔法、治疗与 UI。',
    triangle: '三角：比正弦多一点边缘，适合提示音。',
    sawtooth: '锯齿：明亮有攻击性，适合复古与能量。',
    square: '方波：硬朗、8-bit，适合像素游戏。'
  };
  var MAX_STACK = 4;
  var STACK_KEY = 'forgefx_stack_v1';

  var state = {
    category: 'impact',
    presetId: 'blade_light',
    style: 'realistic',
    waveform: 'auto',
    macros: {},
    seed: 0,
    variants: [],
    selected: 0,
    busy: false,
    playing: false,
    stack: [],
    exportOpts: { sampleRate: 44100, bitDepth: 16, channels: 2, normalize: true },
    packCats: { impact: true, ui: true, buff: true, skill: true, forge: true, world: false, monster: false },
    packCount: 4,
    favorites: []
  };

  var player = new SFX.engine.Player();
  var renderToken = 0;
  var playToken = 0;
  var sliderTimer = null;
  var hashTimer = null;
  var resizeTimer = null;
  var toastTimer = null;

  function randomSeed() { return Math.floor(Math.random() * 1e9); }
  function pad(n, w) { return String(n).padStart(w || 2, '0'); }
  function currentRecipe() {
    var v = state.variants[state.selected];
    return {
      presetId: state.presetId,
      seed: v ? v.seed : state.seed,
      style: state.style,
      waveform: state.waveform,
      macros: state.macros
    };
  }
  function variantSeed(base, i) { return (base + i * 7919 + 13) % 1000000000; }
  function catOf(preset) { return P.CATEGORIES.filter(function (c) { return c.id === preset.cat; })[0]; }
  function presetOf() { return P.byId(state.presetId); }

  function normalizeMacros(m) {
    var out = {};
    Object.keys(P.BASE_MACROS).forEach(function (k) {
      var v = Number(m[k]);
      out[k] = isFinite(v) ? v : P.BASE_MACROS[k];
    });
    out.pitch = Math.round(U.clamp(out.pitch, -12, 12));
    ['weight', 'brightness', 'metallic', 'roughness', 'magic', 'space'].forEach(function (k) {
      out[k] = U.clamp(out[k], 0, 1);
    });
    return out;
  }

  /* ---------------- 界面构建 ---------------- */
  function populate() {
    UI.renderCategories($('categoryTabs'), state.category, P.CATEGORIES);
    UI.renderPresets($('presetGrid'), P.byCategory(state.category), state.presetId);
    UI.renderStyles($('styleSeg'), state.style, P.STYLES);
    UI.renderWaveforms($('waveSeg'), state.waveform, WAVES);
    UI.renderControls($('ctrlGrid'), state.macros, onMacro);
    $('styleHint').textContent = STYLE_HINTS[state.style] || '';
    $('waveHint').textContent = WAVE_HINTS[state.waveform] || '';
    $('presetCount').textContent = P.byCategory(state.category).length + ' 个预设';
    $('soundIcon').textContent = (catOf(presetOf()) || P.CATEGORIES[0]).name.charAt(0);
    renderStack();
  }

  function renderPackCats() {
    $('packCats').innerHTML = P.CATEGORIES.map(function (c) {
      return '<label class="check"><input type="checkbox" data-packcat="' + c.id + '"' +
        (state.packCats[c.id] ? ' checked' : '') + '> ' + c.name + '</label>';
    }).join('');
  }

  function renderFavorites() {
    UI.renderFavorites($('favorites'), state.favorites);
    $('favCount').textContent = state.favorites.length + ' 个';
  }

  /* ---------------- 选择与渲染 ---------------- */
  function selectPreset(id, opts) {
    opts = opts || {};
    var preset = P.byId(id);
    if (!preset) return;
    state.category = preset.cat;
    state.presetId = id;
    if (opts.style && P.STYLES[opts.style]) state.style = opts.style;
    if (opts.waveform && WAVES.some(function (w) { return w.id === opts.waveform; })) {
      state.waveform = opts.waveform;
    }
    state.macros = opts.macros ? normalizeMacros(opts.macros) : P.defaultMacros(preset);
    state.seed = opts.seed !== undefined && isFinite(opts.seed) ? Math.floor(opts.seed) : randomSeed();
    $('seed').value = state.seed;
    populate();
    saveHash();
    saveLast();
    renderAll(opts.play === true);
  }

  function markAllDirty() {
    state.variants.forEach(function (v, i) {
      if (i !== state.selected) v.dirty = true;
    });
    UI.renderVariants($('variants'), state.variants, state.selected);
  }

  function renderAll(play) {
    var token = ++renderToken;
    stopPlayback();
    var base = state.seed;
    state.variants = [];
    for (var i = 0; i < VARIANT_COUNT; i++) {
      state.variants.push({
        seed: variantSeed(base, i),
        channels: null, sampleRate: PREVIEW_SR, duration: 0, peak: 0,
        rendered: false, dirty: false, spec: null
      });
    }
    state.selected = 0;
    UI.renderVariants($('variants'), state.variants, 0);
    $('btnPlay').disabled = true;
    setMeta('生成 8 个变体…');
    var chain = Promise.resolve();
    state.variants.forEach(function (v, i) {
      chain = chain.then(function () { return renderVariant(i, token); });
    });
    chain.then(function () {
      if (token !== renderToken) return;
      $('btnPlay').disabled = false;
      drawMain();
      if (play) startPlayback();
      SFX._ready = true;
    }).catch(function (e) {
      console.error(e);
      setMeta('渲染失败：' + e.message);
      toast('渲染失败：' + e.message, true);
      SFX._ready = true;
    });
  }

  function renderVariant(i, token) {
    var v = state.variants[i];
    if (!v) return Promise.resolve();
    var recipe = {
      presetId: state.presetId,
      seed: v.seed,
      style: state.style,
      waveform: state.waveform,
      macros: state.macros
    };
    var spec;
    try {
      spec = P.buildSpec(recipe);
    } catch (e) {
      return Promise.reject(e);
    }
    return SFX.engine.render(spec, { sampleRate: PREVIEW_SR }).then(function (res) {
      if (token !== renderToken) return;
      v.channels = res.channels;
      v.sampleRate = res.sampleRate;
      v.duration = res.duration;
      v.peak = res.peak;
      v.spec = spec;
      v.rendered = true;
      v.dirty = false;
      UI.renderVariants($('variants'), state.variants, state.selected);
      if (i === state.selected) drawMain();
    });
  }

  function renderSelected(play) {
    var token = ++renderToken;
    var v = state.variants[state.selected];
    if (!v) return Promise.resolve();
    $('btnPlay').disabled = true;
    setMeta('渲染变体 ' + (state.selected + 1) + '…');
    return renderVariant(state.selected, token).then(function () {
      if (token !== renderToken) return;
      $('btnPlay').disabled = false;
      drawMain();
      if (play) startPlayback();
    }).catch(function (e) {
      console.error(e);
      $('btnPlay').disabled = false;
      setMeta('渲染失败：' + e.message);
    });
  }

  function selectVariant(i) {
    if (!state.variants[i]) return;
    if (i === state.selected) { startPlayback(); return; }
    state.selected = i;
    UI.renderVariants($('variants'), state.variants, i);
    var v = state.variants[i];
    if (v.dirty || !v.rendered) renderSelected(true);
    else { drawMain(); startPlayback(); }
  }

  function onMacro(key, val) {
    state.macros[key] = key === 'pitch' ? Math.round(val) : val;
    markAllDirty();
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(function () {
      renderSelected(false);
      saveHash();
      saveLast();
    }, 150);
  }

  /* ---------------- 绘制 ---------------- */
  function drawMain() {
    var v = state.variants[state.selected];
    if (!v || !v.channels) return;
    UI.drawWave($('wave'), v.channels, null);
    UI.drawSpectro($('spectro'), v.channels, v.sampleRate);
    var preset = presetOf();
    var cat = catOf(preset);
    $('soundName').textContent = preset.name;
    setMeta(cat.name + ' · ' + v.duration.toFixed(2) + 's · seed ' + v.seed + ' · ' + P.STYLES[state.style].name);
    $('soundIcon').textContent = cat.name.charAt(0);
    $('filename').textContent = fileName();
  }

  function setMeta(text) {
    $('soundMeta').textContent = text;
  }

  function fileName() {
    var preset = presetOf();
    return 'sfx_' + preset.cat + '_' + preset.id + '_' + pad(state.selected + 1) + '.wav';
  }

  /* ---------------- 播放 ---------------- */
  function setPlaying(on) {
    state.playing = on;
    var btn = $('btnPlay');
    btn.textContent = on ? '■' : '▶';
    btn.classList.toggle('playing', on);
  }

  function startPlayback() {
    var v = state.variants[state.selected];
    if (!v || !v.channels || !v.channels.length) return;
    var token = ++playToken;
    var dur = v.channels[0].length / v.sampleRate;
    setPlaying(true);
    player.play(v.channels, v.sampleRate, function () {
      if (token !== playToken) return;
      setPlaying(false);
      UI.drawWave($('wave'), v.channels, null);
    }).catch(function (e) {
      setPlaying(false);
      toast('无法播放：' + e.message, true);
    });
    var t0 = performance.now();
    function frame() {
      if (token !== playToken) return;
      var p = (performance.now() - t0) / 1000 / dur;
      if (p >= 1) {
        UI.drawWave($('wave'), v.channels, 1);
        setPlaying(false);
        return;
      }
      UI.drawWave($('wave'), v.channels, p);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function stopPlayback() {
    playToken++;
    player.stop();
    setPlaying(false);
    var v = state.variants[state.selected];
    if (v && v.channels) UI.drawWave($('wave'), v.channels, null);
  }

  function togglePlay() {
    if (state.playing) stopPlayback();
    else startPlayback();
  }

  /* ---------------- 导出 ---------------- */
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportFileName(prefix) {
    var preset = presetOf();
    return 'sfx_' + preset.cat + '_' + preset.id + '_' + (prefix || pad(state.selected + 1)) + '.wav';
  }

  function exportWav() {
    if (state.busy) return;
    var opts = state.exportOpts;
    setBusy(true, 'export', '渲染中…');
    var spec;
    try {
      spec = P.buildSpec(currentRecipe());
    } catch (e) {
      setBusy(false);
      toast('配方错误：' + e.message, true);
      return Promise.resolve();
    }
    return SFX.engine.render(spec, { sampleRate: opts.sampleRate, normalize: opts.normalize })
      .then(function (res) {
        var channels = opts.channels === 1 ? SFX.wav.downmix(res.channels) : res.channels;
        var buf = SFX.wav.encode(channels, {
          sampleRate: opts.sampleRate,
          bitDepth: opts.bitDepth,
          title: presetOf().name + ' · ForgeFX'
        });
        download(new Blob([buf], { type: 'audio/wav' }), exportFileName());
        toast('已导出 ' + exportFileName());
        setStatus('export', '完成 · ' + U.fmtBytes(buf.byteLength));
      })
      .catch(function (e) {
        console.error(e);
        toast('导出失败：' + e.message, true);
        setStatus('export', '失败');
      })
      .then(function () { setBusy(false); });
  }

  function manifestText(sounds, opts) {
    var preset = presetOf();
    return JSON.stringify({
      tool: 'ForgeFX RPG SFX Studio',
      version: '1.0',
      generatedAt: new Date().toISOString(),
      style: state.style,
      waveform: state.waveform,
      sampleRate: opts.sampleRate,
      bitDepth: opts.bitDepth,
      channels: opts.channels,
      note: 'All sounds are procedurally synthesized; no third-party samples.',
      sounds: sounds
    }, null, 2);
  }

  function packReadme() {
    return [
      'ForgeFX · RPG 音效包',
      '================================',
      '',
      '本包由 ForgeFX RPG 音效工坊程序化合成，未使用第三方采样。',
      '可直接用于商业游戏；建议在引擎中按类别建立音效库。',
      '',
      '目录：',
      '  Impact/   打击（刀刃、钝击、暴击、格挡）',
      '  UI/       交互（点击、确认、拾取、任务完成）',
      '  Buff/     强化（升级、附魔、精炼）',
      '  Skill/    技能（火焰、冰霜、雷电、治疗）',
      '  Forge/    锻造（锤击、淬火、成功失败）',
      '  World/    世界（门、宝箱、药水、脚步）',
      '  Monster/  怪物（低吼、受击、死亡）',
      '',
      'manifest.json 包含每个文件的类别、标签、种子、时长与峰值。',
      '同一 seed + 参数可在 ForgeFX 中复现同一音效。',
      '',
      '命名：sfx_<类别>_<预设>_<序号>.wav'
    ].join('\n');
  }

  function packLicenses() {
    return [
      'LICENSES',
      '================================',
      'All audio in this pack is generated by ForgeFX RPG SFX Studio',
      'using procedural synthesis (Web Audio API).',
      '',
      'No third-party samples, loops, or recordings are included.',
      'You may use these sounds in commercial and non-commercial projects',
      'without attribution.',
      '',
      'The ForgeFX tool itself is released under the MIT License.',
      'Generated audio is yours to keep.'
    ].join('\n');
  }

  function buildPack() {
    if (state.busy) return Promise.resolve();
    var cats = P.CATEGORIES.filter(function (c) { return state.packCats[c.id]; });
    if (!cats.length) { toast('至少选择一个类别', true); return Promise.resolve(); }
    var opts = state.exportOpts;
    var count = state.packCount;
    var total = cats.length * count;
    var done = 0;
    var files = [];
    var sounds = [];
    setBusy(true, 'pack', '准备打包…');
    $('packBar').style.width = '0%';

    var chain = Promise.resolve();
    cats.forEach(function (cat) {
      var presets = P.byCategory(cat.id);
      for (var i = 0; i < count; i++) {
        (function (cat, presets, i) {
          chain = chain.then(function () {
            var preset = presets[i % presets.length];
            var seed = randomSeed();
            var rng = new U.Rng(seed);
            var macros = P.randomMacros(preset, rng, 0.12);
            var recipe = P.makeRecipe(preset.id, { seed: seed, style: state.style, waveform: state.waveform, macros: macros });
            var spec = P.buildSpec(recipe);
            return SFX.engine.render(spec, { sampleRate: opts.sampleRate }).then(function (res) {
              var channels = opts.channels === 1 ? SFX.wav.downmix(res.channels) : res.channels;
              var buf = SFX.wav.encode(channels, {
                sampleRate: opts.sampleRate,
                bitDepth: opts.bitDepth,
                title: preset.name + ' · ForgeFX'
              });
              var name = 'SFX/' + CAT_EN[cat.id] + '/' + preset.id + '_' + pad(i + 1) + '.wav';
              files.push({ name: name, data: new Uint8Array(buf) });
              sounds.push({
                file: name,
                name: preset.name,
                category: cat.name,
                categoryId: cat.id,
                preset: preset.id,
                tags: preset.tags,
                seed: seed,
                style: state.style,
                waveform: state.waveform,
                duration: Number(res.duration.toFixed(3)),
                peakDb: Math.round(20 * Math.log10(res.peak + 1e-9) * 10) / 10,
                macros: macros
              });
              done++;
              $('packBar').style.width = Math.round(done / total * 100) + '%';
              setStatus('pack', '打包 ' + done + '/' + total);
              return new Promise(function (r) { setTimeout(r, 0); });
            });
          });
        })(cat, presets, i);
      }
    });

    return chain.then(function () {
      files.push({ name: 'SFX/manifest.json', data: new TextEncoder().encode(manifestText(sounds, opts)) });
      files.push({ name: 'SFX/README.txt', data: new TextEncoder().encode(packReadme()) });
      files.push({ name: 'SFX/LICENSES.txt', data: new TextEncoder().encode(packLicenses()) });
      var zipData = SFX.zip.build(files);
      var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      download(new Blob([zipData], { type: 'application/zip' }), 'forgefx_pack_' + stamp + '.zip');
      setStatus('pack', '完成 · ' + sounds.length + ' 个音效 · ' + U.fmtBytes(zipData.byteLength));
      toast('音效包已生成：' + sounds.length + ' 个音效');
      $('packBar').style.width = '100%';
    }).catch(function (e) {
      console.error(e);
      setStatus('pack', '失败：' + e.message);
      toast('打包失败：' + e.message, true);
    }).then(function () { setBusy(false); });
  }

  function setBusy(busy, which, text) {
    state.busy = busy;
    $('btnExport').disabled = busy;
    $('btnPack').disabled = busy;
    $('btnRandom').disabled = busy;
    if (which === 'export' && text) setStatus('export', text);
    if (which === 'pack' && text) setStatus('pack', text);
  }

  function setStatus(which, text) {
    var el = which === 'pack' ? $('packStatus') :
      (which === 'stack' ? $('stackStatus') : $('exportStatus'));
    if (el) el.textContent = text;
  }

  /* ---------------- 组合技能音 ---------------- */
  function findStackLayer(id) {
    return state.stack.filter(function (l) { return l.id === id; })[0] || null;
  }

  function snapshotLayer() {
    var preset = presetOf();
    var v = state.variants[state.selected];
    return {
      id: U.uid('layer'),
      presetId: preset.id,
      name: preset.name,
      label: preset.name + ' #' + (state.selected + 1),
      categoryName: catOf(preset).name,
      seed: v ? v.seed : state.seed,
      style: state.style,
      waveform: state.waveform,
      macros: JSON.parse(JSON.stringify(state.macros)),
      offset: 0,
      gain: 0.8
    };
  }

  function addToStack() {
    if (state.stack.length >= MAX_STACK) {
      toast('组合最多 ' + MAX_STACK + ' 层', true);
      return;
    }
    var layer = snapshotLayer();
    state.stack.push(layer);
    saveStack();
    renderStack();
    toast('已加入组合：' + layer.label);
  }

  function removeStackLayer(id) {
    state.stack = state.stack.filter(function (l) { return l.id !== id; });
    saveStack();
    renderStack();
  }

  function clearStack() {
    state.stack = [];
    saveStack();
    renderStack();
    setStatus('stack', '已清空组合');
  }

  function renderStack() {
    var box = $('stackList');
    if (!box) return;
    $('stackCount').textContent = state.stack.length + ' / ' + MAX_STACK;
    if (!state.stack.length) {
      box.innerHTML = '<div class="empty">把当前音效加入组合，最多 4 层；可设置延迟与音量，做技能命中 / 连击 / 蓄力。</div>';
      return;
    }
    box.innerHTML = state.stack.map(function (l) {
      return '<div class="stack-row">' +
        '<div class="stack-top"><b>' + UI.esc(l.label) + '</b>' +
        '<span>' + UI.esc(l.categoryName) + ' · #' + l.seed + '</span>' +
        '<button class="mini-btn del" data-stack-del="' + l.id + '" title="移除">✕</button></div>' +
        '<div class="stack-bottom">' +
        '<label>延迟 <input type="number" data-stack-off="' + l.id + '" min="0" max="2000" step="10" value="' + Math.round(l.offset) + '"> ms</label>' +
        '<label>音量 <input type="range" data-stack-gain="' + l.id + '" min="0" max="150" step="1" value="' + Math.round(l.gain * 100) + '" style="--p:' + Math.round(l.gain / 1.5 * 100) + '%"><b data-stack-gain-val="' + l.id + '">' + Math.round(l.gain * 100) + '%</b></label>' +
        '</div></div>';
    }).join('');
  }

  function renderStackChannels() {
    var sr = state.exportOpts.sampleRate;
    var layers = state.stack.slice();
    if (!layers.length) return Promise.reject(new Error('组合为空'));
    var rendered = [];
    var chain = Promise.resolve();
    layers.forEach(function (l) {
      chain = chain.then(function () {
        var spec = P.buildSpec({
          presetId: l.presetId,
          seed: l.seed,
          style: l.style,
          waveform: l.waveform || 'auto',
          macros: l.macros
        });
        return SFX.engine.render(spec, { sampleRate: sr, normalize: false }).then(function (res) {
          rendered.push({
            res: res,
            offset: U.clamp(Number(l.offset) || 0, 0, 2000) / 1000,
            gain: U.clamp(l.gain === undefined ? 0.8 : Number(l.gain), 0, 1.5)
          });
        });
      });
    });
    return chain.then(function () {
      var total = 0;
      rendered.forEach(function (r) {
        total = Math.max(total, Math.ceil(r.offset * sr) + r.res.channels[0].length);
      });
      total += Math.ceil(0.06 * sr);
      var ch0 = new Float32Array(total);
      var ch1 = new Float32Array(total);
      rendered.forEach(function (r) {
        var off = Math.round(r.offset * sr);
        for (var i = 0; i < r.res.channels[0].length; i++) {
          ch0[off + i] += r.res.channels[0][i] * r.gain;
          ch1[off + i] += r.res.channels[1][i] * r.gain;
        }
      });
      var channels = [ch0, ch1];
      SFX.wav.normalize(channels, -1);
      return { channels: channels, sampleRate: sr, duration: total / sr };
    });
  }

  function setStackBusy(busy, text) {
    ['btnAddStack', 'btnPlayStack', 'btnExportStack', 'btnClearStack'].forEach(function (id) {
      if ($(id)) $(id).disabled = busy;
    });
    if (text) setStatus('stack', text);
  }

  function playStack() {
    if (state.busy) return Promise.resolve();
    if (!state.stack.length) { toast('先加入至少一个音效', true); return Promise.resolve(); }
    stopPlayback();
    setStackBusy(true, '渲染组合…');
    return renderStackChannels().then(function (mix) {
      setStackBusy(false);
      player.play(mix.channels, mix.sampleRate).catch(function (e) {
        setStatus('stack', '播放失败：' + e.message);
      });
      setStatus('stack', '试听 · ' + mix.duration.toFixed(2) + 's · ' + state.stack.length + ' 层');
    }).catch(function (e) {
      setStackBusy(false);
      setStatus('stack', '失败：' + e.message);
      toast('组合试听失败：' + e.message, true);
    });
  }

  function exportStack() {
    if (state.busy) return Promise.resolve();
    if (!state.stack.length) { toast('先加入至少一个音效', true); return Promise.resolve(); }
    var opts = state.exportOpts;
    setStackBusy(true, '渲染组合…');
    return renderStackChannels().then(function (mix) {
      var channels = opts.channels === 1 ? SFX.wav.downmix(mix.channels) : mix.channels;
      var buf = SFX.wav.encode(channels, {
        sampleRate: opts.sampleRate,
        bitDepth: opts.bitDepth,
        title: 'ForgeFX Stack'
      });
      var stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      download(new Blob([buf], { type: 'audio/wav' }), 'forgefx_stack_' + stamp + '.wav');
      setStatus('stack', '已导出 · ' + state.stack.length + ' 层 · ' + U.fmtBytes(buf.byteLength));
      toast('组合 WAV 已导出');
    }).catch(function (e) {
      setStatus('stack', '失败：' + e.message);
      toast('组合导出失败：' + e.message, true);
    }).then(function () {
      setStackBusy(false);
    });
  }

  function saveStack() {
    U.Store.set(STACK_KEY, state.stack);
  }

  function loadStack() {
    var arr = U.Store.get(STACK_KEY, []);
    if (!Array.isArray(arr)) arr = [];
    state.stack = arr.slice(0, MAX_STACK).filter(function (l) {
      return l && P.byId(l.presetId);
    }).map(function (l) {
      var gain = Number(l.gain);
      return {
        id: l.id || U.uid('layer'),
        presetId: l.presetId,
        name: l.name || P.byId(l.presetId).name,
        label: l.label || ((l.name || P.byId(l.presetId).name) + ' #1'),
        categoryName: l.categoryName || P.byId(l.presetId).cat,
        seed: l.seed,
        style: l.style || 'realistic',
        waveform: l.waveform || 'auto',
        macros: l.macros || P.defaultMacros(P.byId(l.presetId)),
        offset: U.clamp(Number(l.offset) || 0, 0, 2000),
        gain: isFinite(gain) ? U.clamp(gain, 0, 1.5) : 0.8
      };
    });
  }

  /* ---------------- 收藏 ---------------- */
  function loadFavorites() {
    var list = U.Store.get(FAV_KEY, []);
    if (!Array.isArray(list)) list = [];
    state.favorites = list;
    renderFavorites();
  }

  function saveFavorite() {
    var preset = presetOf();
    var cat = catOf(preset);
    var item = {
      id: U.uid('fav'),
      presetId: preset.id,
      name: preset.name,
      categoryName: cat.name,
      style: state.style,
      styleName: P.STYLES[state.style].name,
      waveform: state.waveform,
      seed: state.seed,
      variant: state.selected,
      macros: JSON.parse(JSON.stringify(state.macros)),
      time: Date.now()
    };
    state.favorites.unshift(item);
    if (state.favorites.length > 24) state.favorites.length = 24;
    U.Store.set(FAV_KEY, state.favorites);
    renderFavorites();
    toast('已收藏：' + preset.name + (item.seed % 1000));
  }

  function loadFavorite(id) {
    var f = state.favorites.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    var idx = f.variant || 0;
    selectPreset(f.presetId, { seed: f.seed, style: f.style, waveform: f.waveform, macros: f.macros, play: false });
    var tries = 0;
    var timer = setInterval(function () {
      if (state.presetId !== f.presetId || state.seed !== f.seed) { clearInterval(timer); return; }
      if (!state.variants[idx] || !state.variants[idx].rendered) {
        if (++tries > 120) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      state.selected = idx;
      UI.renderVariants($('variants'), state.variants, idx);
      drawMain();
      startPlayback();
    }, 100);
  }

  function deleteFavorite(id) {
    state.favorites = state.favorites.filter(function (x) { return x.id !== id; });
    U.Store.set(FAV_KEY, state.favorites);
    renderFavorites();
  }

  /* ---------------- 分享与记忆 ---------------- */
  function saveLast() {
    U.Store.set(LAST_KEY, {
      presetId: state.presetId,
      style: state.style,
      waveform: state.waveform,
      seed: state.seed,
      macros: state.macros
    });
  }

  function saveHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var keys = ['weight', 'brightness', 'metallic', 'roughness', 'magic', 'space', 'pitch'];
      var m = keys.map(function (k) { return Math.round(state.macros[k] * 100) / 100; }).join(',');
      var hash = '#p=' + encodeURIComponent(state.presetId) + '&s=' + state.seed +
        '&st=' + state.style + '&w=' + state.waveform + '&m=' + m;
      try { history.replaceState(null, '', hash); } catch (e) {}
    }, 250);
  }

  function parseHash() {
    if (!location.hash || location.hash.length < 2) return null;
    try {
      var q = new URLSearchParams(location.hash.slice(1));
      var id = q.get('p');
      if (!id || !P.byId(id)) return null;
      var out = { presetId: id, seed: parseInt(q.get('s'), 10), style: q.get('st'), waveform: q.get('w') };
      var m = q.get('m');
      if (m) {
        var keys = ['weight', 'brightness', 'metallic', 'roughness', 'magic', 'space', 'pitch'];
        var arr = m.split(',').map(Number);
        var macros = {};
        keys.forEach(function (k, i) { if (isFinite(arr[i])) macros[k] = arr[i]; });
        out.macros = macros;
      }
      if (!P.STYLES[out.style]) out.style = 'realistic';
      if (!WAVES.some(function (w) { return w.id === out.waveform; })) out.waveform = 'auto';
      return out;
    } catch (e) { return null; }
  }

  /* ---------------- 交互 ---------------- */
  function bind() {
    $('categoryTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      var cat = b.getAttribute('data-cat');
      state.category = cat;
      var list = P.byCategory(cat);
      if (list.length) selectPreset(list[0].id, {});
    });

    $('presetGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-preset]');
      if (!b) return;
      selectPreset(b.getAttribute('data-preset'), { play: true });
    });

    $('styleSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-style]');
      if (!b) return;
      var st = b.getAttribute('data-style');
      if (st === state.style) return;
      state.style = st;
      UI.renderStyles($('styleSeg'), state.style, P.STYLES);
      $('styleHint').textContent = STYLE_HINTS[st] || '';
      state.variants.forEach(function (v) { v.dirty = true; });
      UI.renderVariants($('variants'), state.variants, state.selected);
      renderSelected(true);
      saveHash();
      saveLast();
    });

    $('waveSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-wave]');
      if (!b) return;
      var w = b.getAttribute('data-wave');
      if (w === state.waveform) return;
      state.waveform = w;
      UI.renderWaveforms($('waveSeg'), state.waveform, WAVES);
      $('waveHint').textContent = WAVE_HINTS[state.waveform] || '';
      state.variants.forEach(function (v) { v.dirty = true; });
      UI.renderVariants($('variants'), state.variants, state.selected);
      renderSelected(true);
      saveHash();
      saveLast();
    });

    $('variants').addEventListener('click', function (e) {
      var b = e.target.closest('[data-variant]');
      if (!b) return;
      selectVariant(parseInt(b.getAttribute('data-variant'), 10));
    });

    $('btnPlay').addEventListener('click', togglePlay);
    $('btnReroll').addEventListener('click', function () {
      state.seed = randomSeed();
      $('seed').value = state.seed;
      renderAll(true);
      saveHash();
      saveLast();
    });
    $('btnRandom').addEventListener('click', randomPreset);
    $('btnSaveFav').addEventListener('click', saveFavorite);

    $('btnAddStack').addEventListener('click', addToStack);
    $('btnPlayStack').addEventListener('click', function () { playStack(); });
    $('btnExportStack').addEventListener('click', function () { exportStack(); });
    $('btnClearStack').addEventListener('click', clearStack);
    $('stackList').addEventListener('click', function (e) {
      var del = e.target.closest('[data-stack-del]');
      if (del) removeStackLayer(del.getAttribute('data-stack-del'));
    });
    $('stackList').addEventListener('input', function (e) {
      var off = e.target.closest('[data-stack-off]');
      if (off) {
        var layer = findStackLayer(off.getAttribute('data-stack-off'));
        if (layer) {
          var v = parseInt(off.value, 10);
          layer.offset = isFinite(v) ? U.clamp(v, 0, 2000) : 0;
          saveStack();
        }
        return;
      }
      var gain = e.target.closest('[data-stack-gain]');
      if (gain) {
        var l2 = findStackLayer(gain.getAttribute('data-stack-gain'));
        if (l2) {
          var gv = U.clamp(Number(gain.value) / 100, 0, 1.5);
          l2.gain = gv;
          var b = $('stackList').querySelector('[data-stack-gain-val="' + l2.id + '"]');
          if (b) b.textContent = Math.round(gv * 100) + '%';
          saveStack();
        }
      }
    });

    $('seed').addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (!isFinite(v)) { this.value = state.seed; return; }
      state.seed = v;
      renderAll(true);
      saveHash();
      saveLast();
    });

    $('btnExport').addEventListener('click', function () { exportWav(); });
    $('btnPack').addEventListener('click', function () { buildPack(); });

    $('srSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      state.exportOpts.sampleRate = parseInt(b.getAttribute('data-v'), 10);
      segSelect('srSeg', state.exportOpts.sampleRate);
    });
    $('bitSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      state.exportOpts.bitDepth = parseInt(b.getAttribute('data-v'), 10);
      segSelect('bitSeg', state.exportOpts.bitDepth);
    });
    $('chSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      state.exportOpts.channels = parseInt(b.getAttribute('data-v'), 10);
      segSelect('chSeg', state.exportOpts.channels);
    });
    $('normalize').addEventListener('change', function () {
      state.exportOpts.normalize = this.checked;
    });

    $('packCats').addEventListener('change', function (e) {
      var cb = e.target.closest('[data-packcat]');
      if (!cb) return;
      state.packCats[cb.getAttribute('data-packcat')] = cb.checked;
    });
    $('packCount').addEventListener('input', function () {
      state.packCount = parseInt(this.value, 10);
      $('packCountOut').textContent = this.value;
      this.style.setProperty('--p', Math.round((this.value - 2) / 10 * 100) + '%');
    });

    $('favorites').addEventListener('click', function (e) {
      var load = e.target.closest('[data-load]');
      var del = e.target.closest('[data-del]');
      if (load) loadFavorite(load.getAttribute('data-load'));
      if (del) deleteFavorite(del.getAttribute('data-del'));
    });

    $('btnHelp').addEventListener('click', function () {
      $('helpModal').classList.add('on');
    });
    $('helpModal').addEventListener('click', function (e) {
      if (e.target === this || e.target.closest('.modal-close')) this.classList.remove('on');
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        $('btnReroll').click();
      } else if (/^[1-8]$/.test(e.key)) {
        selectVariant(parseInt(e.key, 10) - 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        var list = P.byCategory(state.category);
        var idx = -1;
        list.forEach(function (p, i) { if (p.id === state.presetId) idx = i; });
        if (idx < 0) idx = 0;
        var next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
        selectPreset(list[next].id, { play: true });
      } else if (e.key === 'Escape') {
        $('helpModal').classList.remove('on');
      }
    });

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { drawMain(); }, 220);
    });
  }

  function segSelect(id, value) {
    var seg = $(id);
    seg.querySelectorAll('[data-v]').forEach(function (b) {
      b.classList.toggle('on', parseInt(b.getAttribute('data-v'), 10) === value);
    });
  }

  function randomPreset() {
    // 确保「随机音效」一定换一个预设，而不是原地换种子
    var pool = P.list.filter(function (p) { return p.id !== state.presetId; });
    if (!pool.length) pool = P.list;
    var preset = pool[Math.floor(Math.random() * pool.length)];
    var rng = new U.Rng(randomSeed());
    selectPreset(preset.id, { macros: P.randomMacros(preset, rng, 0.16), play: true });
  }

  function toast(msg, bad) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    loadFavorites();
    loadStack();
    renderPackCats();
    var hash = parseHash();
    var last = U.Store.get(LAST_KEY, null);
    var opts = null;
    if (hash) opts = hash;
    else if (last && P.byId(last.presetId)) opts = last;

    if (opts) {
      selectPreset(opts.presetId, {
        seed: opts.seed,
        style: opts.style,
        waveform: opts.waveform,
        macros: opts.macros,
        play: false
      });
    } else {
      selectPreset('blade_light', { play: false });
    }
    bind();
    $('normalize').checked = state.exportOpts.normalize;
    segSelect('srSeg', state.exportOpts.sampleRate);
    segSelect('bitSeg', state.exportOpts.bitDepth);
    segSelect('chSeg', state.exportOpts.channels);
    $('packCount').value = state.packCount;
    $('packCountOut').textContent = state.packCount;
    $('packCount').style.setProperty('--p', Math.round((state.packCount - 2) / 10 * 100) + '%');
    SFX._ready = false;
  }

  SFX.app = {
    state: state,
    init: init,
    selectPreset: selectPreset,
    renderAll: renderAll,
    renderSelected: renderSelected,
    exportWav: exportWav,
    buildPack: buildPack,
    saveFavorite: saveFavorite,
    randomPreset: randomPreset,
    addToStack: addToStack,
    renderStack: renderStackChannels,
    playStack: playStack,
    exportStack: exportStack,
    ready: function () { return SFX._ready === true && state.variants.every(function (v) { return v.rendered; }); },
    play: startPlayback,
    stop: stopPlayback
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
