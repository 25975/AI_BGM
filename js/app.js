/* ==========================================================================
 * app.js — 应用装配：状态、交互、播放、导出、作品库
 * ========================================================================== */
(function (global) {
  'use strict';

  var GBG = global.GBG;
  var U = GBG.util;
  var T = GBG.theory;
  var ui = GBG.ui;
  var $ = ui.el;
  var esc = ui.esc;

  var STORE_LIB = 'loopforge.library.v1';
  var STORE_LAST = 'loopforge.last.v1';

  var state = {
    song: null,
    styleId: 'epic',
    family: 'all',
    bars: 32,
    form: 'loop',
    intensity: 2,
    clarity: 0.55,
    bit: 16,
    titleDirty: false,
    mix: { mute: {}, solo: {}, volume: {} },
    library: [],
    exporting: false,
    lastPrompt: ''
  };

  var engine = new GBG.audio.AudioEngine();
  var roll = null;
  var regenTimer = null;
  var toastTimer = null;

  /* ---------------- 小工具 ---------------- */
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2400);
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function download(data, filename, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function safeName(s) {
    return String(s || 'loopforge').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 40);
  }

  function fileName(ext) {
    var m = state.song.meta;
    return safeName(m.title) + '_' + m.styleId + '_' + m.bpm + 'bpm_' + String(m.keyShort).replace(/\s+/g, '') + '.' + ext;
  }

  function setStatus(text, busy) {
    var el = $('exportStatus');
    el.textContent = text || '';
    el.className = 'export-status' + (busy ? ' busy' : '');
  }

  var progressTimer = null;
  function startProgress(label) {
    var t0 = Date.now();
    clearInterval(progressTimer);
    setStatus(label, true);
    progressTimer = setInterval(function () {
      var sec = ((Date.now() - t0) / 1000).toFixed(0);
      setStatus(label + ' · ' + sec + 's', true);
    }, 500);
  }
  function stopProgress() {
    clearInterval(progressTimer);
    progressTimer = null;
  }

  function busyUI(on) {
    state.exporting = on;
    ['btnWav', 'btnMidi', 'btnStems', 'btnProject', 'btnSave'].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = on;
    });
  }

  function paintSlider(input) {
    var min = parseFloat(input.min) || 0;
    var max = parseFloat(input.max) || 100;
    var v = parseFloat(input.value) || 0;
    var p = max > min ? ((v - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--p', p.toFixed(1) + '%');
  }

  function paintAllSliders() {
    var list = document.querySelectorAll('input[type="range"]');
    for (var i = 0; i < list.length; i++) paintSlider(list[i]);
  }

  function syncExportOptions() {
    var loopOnly = $('exportLoopOnly').checked;
    var seamless = $('seamless');
    seamless.disabled = !loopOnly;
    if (seamless.parentElement) seamless.parentElement.classList.toggle('disabled', !loopOnly);
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    buildSelects();
    buildTabs();
    buildIdeaChips();
    bindEvents();

    state.library = U.Store.get(STORE_LIB, []) || [];
    renderLibrary();

    roll = new ui.RollView($('roll'));
    roll.draw(0);

    var loaded = loadFromHash();
    if (!loaded) loaded = loadLastSession();

    if (!loaded) {
      applyStyleDefaults(GBG.styles.byId(state.styleId), false);
      $('seed').value = String(Math.floor(Math.random() * 90000) + 10000);
      regenerate({ silent: true });
    }
    paintAllSliders();
    syncExportOptions();
    requestAnimationFrame(frame);
  }

  function buildSelects() {
    var root = $('rootPc');
    root.innerHTML = T.NOTE_NAMES.map(function (n, i) {
      return '<option value="' + i + '">' + n + '</option>';
    }).join('');

    var groups = [
      { label: '基础', ids: ['major', 'minor', 'harmonicMinor'] },
      { label: '调式', ids: ['dorian', 'phrygian', 'lydian', 'mixolydian'] },
      { label: '五声 / 东方', ids: ['majorPent', 'minorPent', 'hirajoshi', 'miyako', 'yo'] },
      { label: '色彩', ids: ['blues', 'wholeTone', 'phrygianDom', 'hungarian', 'lydianDom'] }
    ];
    var html = '';
    groups.forEach(function (g) {
      html += '<optgroup label="' + g.label + '">';
      g.ids.forEach(function (id) {
        var sc = T.SCALES[id];
        if (!sc) return;
        html += '<option value="' + id + '" title="' + esc(sc.en + ' · ' + sc.mood) + '">' + sc.name + '</option>';
      });
      html += '</optgroup>';
    });
    $('scaleId').innerHTML = html;
  }

  function buildTabs() {
    var tabs = $('familyTabs');
    tabs.innerHTML = GBG.styles.families.map(function (f) {
      return '<button class="tab' + (f.id === state.family ? ' on' : '') + '" data-family="' + f.id + '">' + f.name + '</button>';
    }).join('');
  }

  function buildIdeaChips() {
    var chips = $('ideaChips');
    var ideas = [
      { label: '雨夜赛博潜入', text: '雨夜的赛博都市，主角潜入大厦，紧张但不要鼓' },
      { label: '新手村清晨', text: '新手村的清晨，阳光、竖琴和长笛，轻松治愈' },
      { label: '最终 Boss 二阶段', text: '最终 Boss 第二阶段，弦乐不断加速，铜管压上来' },
      { label: '像素勇者', text: '像素勇者跳过最后一块浮空平台，8-bit 风格' },
      { label: '酒馆爵士', text: '酒馆里的爵士三重奏，窗外下着雪，慵懒' },
      { label: '竹林剑客', text: '竹林深处，剑客在月下独行，和风' }
    ];
    chips.innerHTML = ideas.map(function (i) {
      return '<button class="chip" data-idea="' + esc(i.text) + '">' + esc(i.label) + '</button>';
    }).join('');
  }

  /* ---------------- 参数 ---------------- */
  function syncOutputs() {
    $('bpmOut').textContent = $('bpm').value;
    $('densityOut').textContent = $('density').value + '%';
    $('complexityOut').textContent = $('complexity').value + '%';
    $('clarityOut').textContent = $('clarity').value + '%';
    $('swingOut').textContent = $('swing').value + '%';
    $('bitHint').textContent = state.bit + '-bit';
  }

  function setSeg(containerId, value, attr) {
    var seg = $(containerId);
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      var v = b.getAttribute(attr || 'data-v');
      b.classList.toggle('on', String(v) === String(value));
    });
  }

  function applyStyleDefaults(style, keepTempo) {
    if (!keepTempo) $('bpm').value = Math.round((style.bpm[0] + style.bpm[1]) / 2);
    $('scaleId').value = style.defaultMode;
    $('density').value = Math.round(style.density * 100);
    $('complexity').value = Math.round(style.complexity * 100);
    $('swing').value = Math.round((style.swing || 0) * 100);
    state.form = state.form || 'loop';
    syncOutputs();
  }

  function readParams() {
    var seed = $('seed').value.trim();
    if (!seed) {
      seed = String(Math.floor(Math.random() * 90000) + 10000);
      $('seed').value = seed;
    }
    return {
      styleId: state.styleId,
      seed: seed,
      bpm: parseInt($('bpm').value, 10),
      rootPc: parseInt($('rootPc').value, 10),
      scaleId: $('scaleId').value,
      bars: state.bars,
      form: state.form,
      density: parseInt($('density').value, 10) / 100,
      complexity: parseInt($('complexity').value, 10) / 100,
      intensity: state.intensity,
      clarity: parseInt($('clarity').value, 10) / 100,
      swing: parseInt($('swing').value, 10) / 100,
      prompt: $('prompt').value,
      title: state.titleDirty ? $('songTitle').value : undefined
    };
  }

  function applyParamsToControls(p) {
    if (!p) return;
    if (p.styleId) state.styleId = p.styleId;
    if (isFinite(p.bpm) && p.bpm) $('bpm').value = p.bpm;
    if (isFinite(p.rootPc)) $('rootPc').value = p.rootPc;
    if (p.scaleId) $('scaleId').value = p.scaleId;
    if (isFinite(p.bars) && p.bars) state.bars = p.bars;
    if (p.form) state.form = p.form;
    if (isFinite(p.density)) $('density').value = Math.round(p.density * 100);
    if (isFinite(p.complexity)) $('complexity').value = Math.round(p.complexity * 100);
    if (isFinite(p.clarity)) $('clarity').value = Math.round(p.clarity * 100);
    if (isFinite(p.intensity)) state.intensity = p.intensity;
    if (isFinite(p.swing)) $('swing').value = Math.round(p.swing * 100);
    if (p.seed !== undefined && p.seed !== null) $('seed').value = p.seed;
    if (p.title) {
      $('songTitle').value = p.title;
      state.titleDirty = true;
    } else if (p.title === '') {
      state.titleDirty = false;
    }
    if (p.prompt !== undefined) $('prompt').value = p.prompt;
    syncOutputs();
    setSeg('intensitySeg', state.intensity);
    setSeg('formSeg', state.form);
    setSeg('barsSeg', state.bars);
  }

  /* ---------------- 生成 ---------------- */
  function regenerate(opts) {
    opts = opts || {};
    var params = readParams();
    var song;
    try {
      song = GBG.composer.generate(params);
    } catch (e) {
      console.error(e);
      toast('生成失败：' + e.message);
      return;
    }
    state.song = song;
    state.styleId = song.meta.styleId;

    // 清理已不存在的声部状态
    var ids = {};
    song.parts.forEach(function (p) { ids[p.id] = true; });
    ['mute', 'solo', 'volume'].forEach(function (kind) {
      Object.keys(state.mix[kind]).forEach(function (id) {
        if (!ids[id]) delete state.mix[kind][id];
      });
    });

    engine.setSong(song);
    engine.frozenBeat = 0;
    if (engine.playing) engine.stop();
    setPlayUI(false);
    roll.setSong(song);

    $('songTitle').value = song.meta.title;
    setSeg('intensitySeg', state.intensity);
    setSeg('formSeg', state.form);
    setSeg('barsSeg', state.bars);
    renderAll();
    autosaveLast();
    updateHash();
    if (!opts.silent) toast('已生成 · ' + song.meta.title + ' · ' + song.stats.notes + ' 音符');
  }

  function renderAll() {
    var song = state.song;
    if (!song) return;
    var m = song.meta;

    $('songEmoji').textContent = m.emoji || '🎵';
    if (document.activeElement !== $('songTitle')) $('songTitle').value = m.title;
    $('songStyle').textContent = m.styleName;
    $('songKey').textContent = m.keyLabel;
    $('songBpm').textContent = m.bpm + ' BPM';
    $('songBars').textContent = m.bars + ' 小节';
    $('songNotes').textContent = song.stats.notes + ' 音符';
    $('timeTotal').textContent = U.fmtTime(song.stats.durationSec);
    var loopBars = song.loop.endBar - song.loop.startBar;
    $('loopInfo').textContent = '循环 ' + (song.loop.startBar + 1) + '–' + song.loop.endBar + ' 小节 · ' + loopBars +
      ' 小节 · ' + (loopBars * 4 * 60 / m.bpm).toFixed(1) + 's';

    // 图例（休止的声部不占位置，避免看起来「声部很多」）
    $('legend').innerHTML = song.parts.filter(function (p) {
      return p.notes.length > 0;
    }).map(function (p) {
      return '<span><i style="background:' + p.color + '"></i>' + esc(p.name) + '</span>';
    }).join('');

    ui.renderMixer($('mixer'), song, state.mix);
    ui.renderAnalysis($('sectionList'), $('chordStrip'), $('analysisHint'), song);
    ui.renderStyleGrid($('styleGrid'), state.family, state.styleId);
    ui.renderStyleDetail($('styleDetail'), GBG.styles.byId(m.styleId));
    renderLoopMeta();
    renderMeta();
    paintAllSliders();
    $('rollEmpty').classList.remove('show');
    roll.dirty = true;
    roll.draw(engine.playing ? engine.getPosition() : 0);
  }

  function renderLoopMeta() {
    var song = state.song;
    var m = song.meta;
    var sr = 44100;
    var spb = 60 / m.bpm;
    var startSec = song.loop.startBar * 4 * spb;
    var endSec = song.loop.endBar * 4 * spb;
    var loopSec = endSec - startSec;
    var loopOnly = $('exportLoopOnly').checked;
    var totalSec = loopOnly ? loopSec : m.bars * 4 * spb;
    var frames = Math.round(totalSec * sr);
    var bytes = frames * 2 * 2 + 2048;
    $('loopMeta').innerHTML =
      '循环段 <b>' + loopSec.toFixed(2) + 's</b> · ' + (song.loop.endBar - song.loop.startBar) + ' 小节\n' +
      '起始小节 <b>' + (song.loop.startBar + 1) + '</b> → 结束 <b>' + song.loop.endBar + '</b>\n' +
      'WAV 预计 <b>' + U.fmtBytes(bytes) + '</b> · ' + sr + 'Hz / 立体声';
  }

  function renderMeta() {
    var song = state.song;
    var m = song.meta;
    var sr = 44100;
    var spb = 60 / m.bpm;
    var startSec = song.loop.startBar * 4 * spb;
    var endSec = song.loop.endBar * 4 * spb;
    var startSample = Math.round(startSec * sr);
    var endSample = Math.round(endSec * sr) - 1;
    $('metaStart').textContent = '第 ' + (song.loop.startBar + 1) + ' 小节 · ' + startSec.toFixed(2) + 's';
    $('metaEnd').textContent = '第 ' + song.loop.endBar + ' 小节 · ' + endSec.toFixed(2) + 's';
    $('metaSamples').textContent = startSample.toLocaleString() + ' – ' + endSample.toLocaleString();
    $('metaDur').textContent = (endSec - startSec).toFixed(2) + ' s';
    $('metaKey').textContent = m.keyLabel + ' · ' + m.bpm + ' BPM';
  }

  /* ---------------- 播放 ---------------- */
  function setPlayUI(playing) {
    var btn = $('btnPlay');
    btn.classList.toggle('playing', playing);
    btn.innerHTML = playing ? '<span>❚❚</span>' : '<span>▶</span>';
    btn.title = playing ? '暂停 (空格)' : '播放 (空格)';
  }

  function togglePlay() {
    if (!state.song) return;
    if (engine.playing) {
      engine.pause();
      setPlayUI(false);
      roll.draw(engine.frozenBeat);
      updateClock(engine.frozenBeat);
      return;
    }
    engine.loopEnabled = $('btnLoop').classList.contains('on');
    var fromBar = engine.frozenBeat ? Math.floor(engine.frozenBeat / 4) : 0;
    if (fromBar >= state.song.meta.bars) fromBar = 0;
    engine.onEnd = function () {
      setPlayUI(false);
      toast('播放结束');
    };
    engine.play(fromBar).then(function () {
      setPlayUI(true);
    }).catch(function (e) {
      toast('无法播放：' + e.message);
    });
  }

  function stopPlay() {
    engine.stop();
    engine.frozenBeat = 0;
    setPlayUI(false);
    roll.draw(0);
    updateClock(0);
  }

  function updateClock(beat) {
    var m = state.song.meta;
    var sec = beat * 60 / m.bpm;
    $('timeNow').textContent = U.fmtClock(sec);
  }

  var lastIdle = 0;
  function frame(t) {
    if (state.song) {
      var beat = engine.getPosition();
      if (engine.playing) {
        roll.draw(beat);
        updateClock(beat);
        ui.drawViz($('viz'), engine.getSpectrum(), true);
      } else if (t - lastIdle > 450) {
        lastIdle = t;
        ui.drawViz($('viz'), null, false);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- 提示词 ---------------- */
  function runPrompt(text) {
    var r = GBG.prompt.parse(text);
    var box = $('parseResult');
    if (!r.ok) {
      box.className = 'parse-result';
      box.innerHTML = '';
      toast('没读懂这句话，试试加入风格或场景词');
      return;
    }
    state.titleDirty = false;
    if (r.styleId && r.styleId !== state.styleId) {
      state.styleId = r.styleId;
      applyStyleDefaults(GBG.styles.byId(r.styleId), true);
    }
    if (r.bpm) $('bpm').value = U.clamp(r.bpm, 40, 200);
    if (r.scaleId) $('scaleId').value = r.scaleId;
    if (r.rootPc !== null && r.rootPc !== undefined) $('rootPc').value = r.rootPc;
    if (r.density !== null) $('density').value = Math.round(r.density * 100);
    if (r.complexity !== null) $('complexity').value = Math.round(r.complexity * 100);
    if (r.intensity !== null) state.intensity = r.intensity;
    if (r.form) state.form = r.form;
    if (r.bars) state.bars = r.bars;
    syncOutputs();
    setSeg('intensitySeg', state.intensity);
    setSeg('formSeg', state.form);
    setSeg('barsSeg', state.bars);

    if (r.noDrums) state.mix.mute.drums = true;
    else delete state.mix.mute.drums;

    // 新种子让每次解析都有新鲜结果
    if (!$('seed').value.trim()) $('seed').value = String(Math.floor(Math.random() * 90000) + 10000);

    regenerate();
    engine.setMix(state.mix);

    var cands = r.candidates.slice(0, 3).map(function (c) {
      return '<button class="chip" data-cand="' + c.styleId + '">' + esc(c.name) + ' ' + c.score.toFixed(1) + '</button>';
    }).join(' ');
    box.className = 'parse-result show';
    box.innerHTML = '<div>识别 → <b>' + esc(GBG.styles.byId(r.styleId).name) + '</b>' +
      (r.scene ? ' · 场景「' + esc(r.scene) + '」' : '') +
      ' · ' + r.bpm + ' BPM · 强度 ' + r.intensity + '</div>' +
      (r.tags.length ? '<div class="cand">关键词：' + esc(r.tags.join(' / ')) + '</div>' : '') +
      (cands ? '<div style="margin-top:6px">候选：' + cands + '</div>' : '');
    state.lastPrompt = text;
  }

  /* ---------------- 导出 ---------------- */
  function barRange() {
    var loopOnly = $('exportLoopOnly').checked;
    if (loopOnly) return { from: state.song.loop.startBar, to: state.song.loop.endBar, isLoop: true };
    return { from: 0, to: state.song.meta.bars, isLoop: false };
  }

  function canSeamless(range) {
    return $('seamless').checked && range.isLoop;
  }

  function normalize(channels, target) {
    var peak = GBG.wav.peakOf(channels);
    if (!isFinite(peak) || peak <= 0) return;
    var desired = target || 0.89;
    if (peak > 0.96 || peak < 0.8) {
      GBG.wav.applyGain(channels, Math.min(6, desired / peak));
    }
  }

  function exportWav() {
    if (!state.song || state.exporting) return;
    var song = state.song;
    var range = barRange();
    var seamless = canSeamless(range);
    var sr = 44100;
    var bit = state.bit;
    busyUI(true);
    startProgress('渲染中… ' + (range.to - range.from) + ' 小节' + (seamless ? ' · 无缝循环' : ''));

    GBG.audio.renderRange(song, {
      fromBar: range.from, toBar: range.to,
      tailSec: seamless ? 2.6 : 2.2,
      sampleRate: sr,
      mix: state.mix,
      seamlessLoop: seamless
    }).then(function (res) {
      stopProgress();
      normalize(res.channels);
      var loopSamples = Math.round((range.to - range.from) * 4 * 60 / song.meta.bpm * sr);
      var startSample, endSample;
      if (range.isLoop) {
        startSample = 0;
        endSample = (seamless ? res.frames : loopSamples) - 1;
      } else {
        startSample = Math.round(song.loop.startBar * 4 * 60 / song.meta.bpm * sr);
        endSample = Math.round(song.loop.endBar * 4 * 60 / song.meta.bpm * sr) - 1;
      }
      var buf = GBG.wav.encode(res.channels, {
        sampleRate: sr, bitDepth: bit,
        loop: { startFrame: startSample, endFrame: Math.min(endSample, res.frames - 1) },
        title: song.meta.title,
        comment: song.meta.styleName + ' · ' + song.meta.keyLabel + ' · ' + song.meta.bpm + ' BPM · seed ' + song.meta.seed,
        date: new Date().toISOString().slice(0, 10),
        key: song.meta.keyLabel
      });
      download(buf, fileName('wav'), 'audio/wav');
      setStatus('已导出 ' + U.fmtBytes(buf.byteLength) + ' · ' + res.frames.toLocaleString() + ' 帧');
      busyUI(false);
      toast('WAV 已导出（' + (seamless ? '无缝循环' : '含尾音') + '）');
    }).catch(function (e) {
      console.error(e);
      stopProgress();
      busyUI(false);
      setStatus('导出失败：' + e.message);
      toast('导出失败：' + e.message);
    });
  }

  function exportMidi() {
    if (!state.song) return;
    try {
      var bytes = GBG.midi.write(state.song, {});
      download(bytes, fileName('mid'), 'audio/midi');
      setStatus('MIDI 已导出 · ' + bytes.length + ' 字节 · ' + state.song.parts.length + ' 轨');
      toast('MIDI 已导出（多轨，含循环 Marker）');
    } catch (e) {
      console.error(e);
      setStatus('MIDI 导出失败：' + e.message);
    }
  }

  function exportProject() {
    if (!state.song) return;
    var manifest = GBG.wav.buildManifest(state.song, { sampleRate: 44100, bitDepth: state.bit });
    var payload = {
      version: 2,
      generator: 'LoopForge Game BGM Studio',
      savedAt: new Date().toISOString(),
      manifest: manifest,
      song: serializeSong(state.song)
    };
    download(JSON.stringify(payload, null, 2), fileName('json'), 'application/json');
    setStatus('工程 JSON 已导出 · 可用「载入」恢复');
    toast('工程 JSON 已导出');
  }

  function serializeSong(song) {
    return JSON.parse(JSON.stringify(song, function (k, v) {
      if (k === 'style') return undefined;
      return v;
    }));
  }

  function deserializeSong(obj) {
    var song = U.deepClone(obj);
    song.style = GBG.styles.byId(song.meta.styleId);
    return song;
  }

  function renderStem(partId, opts) {
    opts = opts || {};
    var song = state.song;
    var range = opts.range || barRange();
    var seamless = opts.seamless === undefined ? canSeamless(range) : opts.seamless;
    var solo = {};
    solo[partId] = true;
    return GBG.audio.renderRange(song, {
      fromBar: range.from, toBar: range.to,
      tailSec: seamless ? 2.6 : 2.2,
      sampleRate: 44100,
      mix: { solo: solo },
      seamlessLoop: seamless
    }).then(function (res) {
      // 分轨保持相对音量，只在接近削波时衰减
      var peak = GBG.wav.peakOf(res.channels);
      if (peak > 0.97) GBG.wav.applyGain(res.channels, 0.95 / peak);
      var sr = 44100;
      var barSec = 4 * 60 / song.meta.bpm;
      var loopStartFrame = Math.max(0, Math.round((song.loop.startBar - range.from) * barSec * sr));
      var loopEndFrame = Math.round((song.loop.endBar - range.from) * barSec * sr) - 1;
      var buf = GBG.wav.encode(res.channels, {
        sampleRate: sr, bitDepth: 16,
        loop: {
          startFrame: seamless ? 0 : loopStartFrame,
          endFrame: Math.min(seamless ? res.frames - 1 : loopEndFrame, res.frames - 1)
        },
        title: song.meta.title + ' · ' + partId,
        comment: 'stem ' + partId + ' · LoopForge'
      });
      return buf;
    });
  }

  function exportStemSingle(partId) {
    if (!state.song || state.exporting) return;
    var part = state.song.parts.filter(function (p) { return p.id === partId; })[0];
    if (!part) return;
    busyUI(true);
    setStatus('渲染分轨：' + part.name, true);
    renderStem(partId).then(function (buf) {
      download(buf, safeName(state.song.meta.title) + '_' + partId + '.wav', 'audio/wav');
      setStatus('分轨已导出：' + part.name + '（' + U.fmtBytes(buf.byteLength) + '）');
      busyUI(false);
    }).catch(function (e) {
      console.error(e);
      busyUI(false);
      setStatus('分轨导出失败：' + e.message);
    });
  }

  function exportStemsZip() {
    if (!state.song || state.exporting) return;
    var song = state.song;
    var range = barRange();
    var seamless = canSeamless(range);
    var parts = song.parts.filter(function (p) { return p.notes.length > 0; });
    var files = [];
    var idx = 0;
    busyUI(true);
    startProgress('渲染分轨 0/' + parts.length);

    function next() {
      if (idx >= parts.length) return finish();
      var part = parts[idx];
      startProgress('渲染分轨 ' + (idx + 1) + '/' + parts.length + '：' + part.name);
      renderStem(part.id, { range: range, seamless: seamless }).then(function (buf) {
        files.push({
          name: safeName(song.meta.title) + '/' + String(idx + 1).padStart(2, '0') + '_' + part.id + '.wav',
          data: new Uint8Array(buf)
        });
        idx++;
        next();
      }).catch(function (e) {
        console.error(e);
        stopProgress();
        busyUI(false);
        setStatus('分轨渲染失败：' + e.message);
      });
    }

    function finish() {
      stopProgress();
      setStatus('打包 ZIP…', true);
      var manifest = GBG.wav.buildManifest(song, {
        sampleRate: 44100, bitDepth: 16,
        offsetBar: range.from,
        toBar: range.to,
        loopOnly: range.isLoop,
        stems: parts.map(function (p) { return p.id; })
      });
      var readme = [
        'LoopForge · ' + song.meta.title,
        '风格：' + song.meta.styleName + '　调性：' + song.meta.keyLabel + '　BPM：' + song.meta.bpm,
        '循环：' + (song.loop.endBar - song.loop.startBar) + ' 小节 / ' + manifest.loop.seconds + ' 秒',
        '循环采样点：' + manifest.loop.startSample + ' – ' + manifest.loop.endSample,
        '',
        '分轨列表：',
        parts.map(function (p, i) {
          var inst = p.role === 'drums' ? '套鼓' : (GBG.instruments.names[p.instrument] || p.instrument);
          return '  ' + String(i + 1).padStart(2, '0') + ' ' + p.name + '（' + inst + '，强度门槛 ' + p.minIntensity + '）';
        }).join('\n'),
        '',
        '所有分轨等长、同起点，可直接在游戏引擎中叠加做动态混音。',
        'WAV 已写入 smpl 循环块，Unity / Unreal / Godot / FMOD 可按读取的循环点设置。'
      ].join('\n');
      files.push({ name: 'manifest.json', data: new Uint8Array(new TextEncoder().encode(JSON.stringify(manifest, null, 2))) });
      files.push({ name: 'README.txt', data: new Uint8Array(new TextEncoder().encode(readme)) });

      try {
        var zip = GBG.zip.build(files);
        download(zip, safeName(song.meta.title) + '_stems.zip', 'application/zip');
        setStatus('分轨 ZIP 已导出 · ' + parts.length + ' 轨 · ' + U.fmtBytes(zip.length));
        toast('分轨 ZIP 已导出');
      } catch (e) {
        console.error(e);
        setStatus('ZIP 打包失败：' + e.message);
      }
      busyUI(false);
    }

    next();
  }

  /* ---------------- 作品库 ---------------- */
  function renderLibrary() {
    ui.renderLibrary($('library'), state.library);
    $('libCount').textContent = state.library.length;
  }

  function saveWork() {
    if (!state.song) return;
    var song = state.song;
    var entry = {
      id: U.uid('work'),
      title: song.meta.title,
      styleName: song.meta.styleName,
      bpm: song.meta.bpm,
      savedAt: Date.now(),
      song: serializeSong(song)
    };
    state.library.unshift(entry);
    if (state.library.length > 30) state.library.length = 30;
    if (!U.Store.set(STORE_LIB, state.library)) {
      state.library.pop();
      toast('本地存储已满，请先删除一些作品');
      return;
    }
    renderLibrary();
    toast('已保存到作品库');
  }

  function loadWork(id) {
    var entry = state.library.filter(function (w) { return w.id === id; })[0];
    if (!entry) return;
    var song = deserializeSong(entry.song);
    applySong(song);
    toast('已载入：' + song.meta.title);
  }

  function applySong(song) {
    state.song = song;
    state.styleId = song.meta.styleId;
    state.bars = song.meta.bars;
    state.form = song.meta.form || 'loop';
    state.intensity = song.meta.intensity;
    state.family = 'all';
    buildTabs();
    $('seed').value = song.meta.seed;
    $('bpm').value = song.meta.bpm;
    $('rootPc').value = song.meta.rootPc;
    $('scaleId').value = song.meta.scaleId;
    $('density').value = Math.round(song.meta.density * 100);
    $('complexity').value = Math.round(song.meta.complexity * 100);
    $('clarity').value = Math.round((song.meta.clarity === undefined ? 0.55 : song.meta.clarity) * 100);
    $('swing').value = Math.round((song.meta.swing || 0) * 100);
    $('prompt').value = song.meta.prompt || '';
    $('songTitle').value = song.meta.title;
    state.titleDirty = true;
    syncOutputs();
    setSeg('intensitySeg', state.intensity);
    setSeg('formSeg', state.form);
    setSeg('barsSeg', state.bars);
    engine.setSong(song);
    engine.frozenBeat = 0;
    roll.setSong(song);
    renderAll();
    autosaveLast();
    updateHash();
  }

  /* ---------------- 本地持久化 / URL ---------------- */
  function autosaveLast() {
    if (!state.song) return;
    U.Store.set(STORE_LAST, {
      params: {
        styleId: state.song.meta.styleId,
        seed: state.song.meta.seed,
        bpm: state.song.meta.bpm,
        rootPc: state.song.meta.rootPc,
        scaleId: state.song.meta.scaleId,
        bars: state.song.meta.bars,
        form: state.song.meta.form,
        density: state.song.meta.density,
        complexity: state.song.meta.complexity,
        clarity: state.song.meta.clarity,
        intensity: state.song.meta.intensity,
        swing: state.song.meta.swing,
        title: state.song.meta.title,
        prompt: state.song.meta.prompt
      },
      mix: state.mix,
      family: state.family,
      bit: state.bit
    });
  }

  function loadLastSession() {
    var last = U.Store.get(STORE_LAST, null);
    if (!last || !last.params) return false;
    state.mix = last.mix || state.mix;
    state.family = last.family || 'all';
    state.bit = last.bit || 16;
    setSeg('bitSeg', state.bit);
    applyParamsToControls(last.params);
    buildTabs();
    ui.renderStyleGrid($('styleGrid'), state.family, state.styleId);
    ui.renderStyleDetail($('styleDetail'), GBG.styles.byId(state.styleId));
    regenerate({ silent: true });
    engine.setMix(state.mix);
    return true;
  }

  function updateHash() {
    if (!state.song) return;
    var m = state.song.meta;
    var q = new URLSearchParams();
    q.set('style', m.styleId);
    q.set('seed', m.seed);
    q.set('bpm', m.bpm);
    q.set('root', m.rootPc);
    q.set('scale', m.scaleId);
    q.set('bars', m.bars);
    q.set('form', m.form);
    q.set('density', m.density);
    q.set('complexity', m.complexity);
    q.set('clarity', m.clarity);
    q.set('intensity', m.intensity);
    q.set('swing', m.swing);
    q.set('title', m.title);
    if (m.prompt) q.set('prompt', m.prompt);
    try {
      history.replaceState(null, '', '#' + q.toString());
    } catch (e) { /* file:// 下可能受限 */ }
  }

  function loadFromHash() {
    if (!location.hash || location.hash.length < 8) return false;
    try {
      var q = new URLSearchParams(location.hash.slice(1));
      if (!q.get('style')) return false;
      applyParamsToControls({
        styleId: q.get('style'),
        seed: q.get('seed'),
        bpm: parseInt(q.get('bpm'), 10),
        rootPc: parseInt(q.get('root'), 10),
        scaleId: q.get('scale'),
        bars: parseInt(q.get('bars'), 10),
        form: q.get('form'),
        density: parseFloat(q.get('density')),
        complexity: parseFloat(q.get('complexity')),
        clarity: parseFloat(q.get('clarity')),
        intensity: parseInt(q.get('intensity'), 10),
        swing: parseFloat(q.get('swing')),
        title: q.get('title') || '',
        prompt: q.get('prompt') || ''
      });
      $('songTitle').value = q.get('title') || '';
      state.titleDirty = !!q.get('title');
      state.family = 'all';
      buildTabs();
      ui.renderStyleGrid($('styleGrid'), state.family, state.styleId);
      regenerate({ silent: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  function shareLink() {
    if (!state.song) return;
    updateHash();
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast('已复制分享链接（含全部参数与种子）');
      }).catch(function () {
        window.prompt('复制下面的链接：', url);
      });
    } else {
      window.prompt('复制下面的链接：', url);
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    $('btnPlay').addEventListener('click', togglePlay);
    $('btnStop').addEventListener('click', stopPlay);
    $('btnLoop').addEventListener('click', function () {
      var on = !this.classList.contains('on');
      this.classList.toggle('on', on);
      engine.setLoop(on);
    });

    $('roll').addEventListener('click', function (e) {
      if (!state.song) return;
      var beat = roll.beatAt(e.clientX);
      engine.seek(beat);
      roll.draw(beat);
      updateClock(beat);
    });

    $('btnGenerate').addEventListener('click', function () { regenerate(); });
    $('btnVariation').addEventListener('click', function () {
      $('seed').value = String(Math.floor(Math.random() * 90000) + 10000);
      regenerate();
      toast('已变奏 · 新种子 ' + $('seed').value);
    });
    $('btnSeed').addEventListener('click', function () {
      $('seed').value = String(Math.floor(Math.random() * 90000) + 10000);
      regenerate();
    });
    $('seed').addEventListener('change', function () { regenerate(); });
    $('songTitle').addEventListener('input', function () {
      state.titleDirty = true;
      if (state.song) {
        state.song.meta.title = this.value || '未命名';
        updateHash();
        autosaveLast();
      }
    });

    $('bpm').addEventListener('input', function () {
      $('bpmOut').textContent = this.value;
      debounceRegen(140);
    });
    $('density').addEventListener('input', function () {
      $('densityOut').textContent = this.value + '%';
      debounceRegen(150);
    });
    $('complexity').addEventListener('input', function () {
      $('complexityOut').textContent = this.value + '%';
      debounceRegen(150);
    });
    $('clarity').addEventListener('input', function () {
      $('clarityOut').textContent = this.value + '%';
      debounceRegen(120);
    });
    $('swing').addEventListener('input', function () {
      $('swingOut').textContent = this.value + '%';
      debounceRegen(150);
    });
    $('rootPc').addEventListener('change', function () { regenerate(); });
    $('scaleId').addEventListener('change', function () { regenerate(); });

    ['intensitySeg', 'formSeg', 'barsSeg'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var v = btn.getAttribute('data-v');
        if (id === 'intensitySeg') state.intensity = parseInt(v, 10);
        if (id === 'formSeg') state.form = v;
        if (id === 'barsSeg') state.bars = parseInt(v, 10);
        setSeg(id, id === 'intensitySeg' ? state.intensity : (id === 'formSeg' ? state.form : state.bars));
        regenerate();
      });
    });

    $('bitSeg').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      state.bit = parseInt(btn.getAttribute('data-v'), 10);
      setSeg('bitSeg', state.bit);
      syncOutputs();
      renderLoopMeta();
    });

    $('familyTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('[data-family]');
      if (!tab) return;
      state.family = tab.getAttribute('data-family');
      Array.prototype.forEach.call(this.querySelectorAll('.tab'), function (t) {
        t.classList.toggle('on', t === tab);
      });
      ui.renderStyleGrid($('styleGrid'), state.family, state.styleId);
      autosaveLast();
    });

    $('styleGrid').addEventListener('click', function (e) {
      var item = e.target.closest('[data-style]');
      if (!item) return;
      selectStyle(item.getAttribute('data-style'), true);
    });

    $('mixer').addEventListener('click', function (e) {
      var audition = e.target.closest('[data-audition]');
      var mute = e.target.closest('[data-mute]');
      var solo = e.target.closest('[data-solo]');
      var dl = e.target.closest('[data-dl]');
      if (audition) {
        auditionPart(audition.getAttribute('data-audition'));
      } else if (mute) {
        var mid = mute.getAttribute('data-mute');
        state.mix.mute[mid] = !state.mix.mute[mid];
        mute.classList.toggle('on', !!state.mix.mute[mid]);
        mute.closest('.mix-row').classList.toggle('muted', !!state.mix.mute[mid]);
        engine.setMix(state.mix);
      } else if (solo) {
        var sid = solo.getAttribute('data-solo');
        state.mix.solo[sid] = !state.mix.solo[sid];
        solo.classList.toggle('on', !!state.mix.solo[sid]);
        engine.setMix(state.mix);
      } else if (dl) {
        exportStemSingle(dl.getAttribute('data-dl'));
      }
    });
    $('mixer').addEventListener('input', function (e) {
      var vol = e.target.closest('[data-vol]');
      if (!vol) return;
      state.mix.volume[vol.getAttribute('data-vol')] = parseInt(vol.value, 10) / 100;
      engine.setMix(state.mix);
    });

    $('btnParse').addEventListener('click', function () {
      var text = $('prompt').value.trim();
      if (!text) {
        $('prompt').value = GBG.prompt.randomIdea();
        text = $('prompt').value;
      }
      runPrompt(text);
    });
    $('btnIdea').addEventListener('click', function () {
      $('prompt').value = GBG.prompt.randomIdea();
      runPrompt($('prompt').value);
    });
    $('ideaChips').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-idea]');
      if (!chip) return;
      $('prompt').value = chip.getAttribute('data-idea');
      runPrompt($('prompt').value);
    });
    $('parseResult').addEventListener('click', function (e) {
      var c = e.target.closest('[data-cand]');
      if (!c) return;
      selectStyle(c.getAttribute('data-cand'), false);
      runPrompt($('prompt').value);
    });

    $('btnRandom').addEventListener('click', randomSong);
    $('btnShare').addEventListener('click', shareLink);
    $('btnHelp').addEventListener('click', function () { $('modal').hidden = false; });
    $('modalClose').addEventListener('click', function () { $('modal').hidden = true; });
    $('modal').addEventListener('click', function (e) {
      if (e.target === this) this.hidden = true;
    });

    $('btnWav').addEventListener('click', exportWav);
    $('btnMidi').addEventListener('click', exportMidi);
    $('btnStems').addEventListener('click', exportStemsZip);
    $('btnProject').addEventListener('click', exportProject);
    $('exportLoopOnly').addEventListener('change', function () {
      renderLoopMeta();
      syncExportOptions();
    });
    $('seamless').addEventListener('change', renderLoopMeta);

    $('btnSave').addEventListener('click', saveWork);
    $('library').addEventListener('click', function (e) {
      var load = e.target.closest('[data-load]');
      var del = e.target.closest('[data-del]');
      if (load) loadWork(load.getAttribute('data-load'));
      if (del) {
        var id = del.getAttribute('data-del');
        state.library = state.library.filter(function (w) { return w.id !== id; });
        U.Store.set(STORE_LIB, state.library);
        renderLibrary();
        toast('已删除');
      }
    });

    global.addEventListener('hashchange', function () {
      if (loadFromHash()) toast('已载入分享链接');
    });

    document.addEventListener('input', function (e) {
      if (e.target && e.target.type === 'range') paintSlider(e.target);
    });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'g' || e.key === 'G') {
        regenerate();
      } else if (e.key === 'r' || e.key === 'R') {
        randomSong();
      } else if (e.key === 'Escape') {
        if (!$('modal').hidden) { $('modal').hidden = true; return; }
        stopPlay();
      } else if (e.key >= '1' && e.key <= '4') {
        state.intensity = parseInt(e.key, 10) - 1;
        setSeg('intensitySeg', state.intensity);
        regenerate();
        toast('强度 ' + state.intensity);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        var beat = engine.getPosition() + (e.key === 'ArrowLeft' ? -4 : 4);
        beat = Math.max(0, Math.min(state.song.meta.bars * 4, beat));
        engine.seek(beat);
        roll.draw(beat);
        updateClock(beat);
      }
    });
  }

  function debounceRegen(ms) {
    clearTimeout(regenTimer);
    regenTimer = setTimeout(function () { regenerate(); }, ms);
  }

  function selectStyle(id, applyDefaults) {
    var style = GBG.styles.byId(id);
    state.styleId = id;
    state.titleDirty = false;
    applyStyleDefaults(style, !applyDefaults);
    ui.renderStyleGrid($('styleGrid'), state.family, state.styleId);
    ui.renderStyleDetail($('styleDetail'), style);
    regenerate();
  }

  function auditionPart(partId) {
    if (!state.song) return;
    var part = state.song.parts.filter(function (p) { return p.id === partId; })[0];
    if (!part) return;
    if (part.role === 'drums') {
      var kitName = String(part.instrument).replace('kit:', '');
      var kit = GBG.instruments.kits[kitName] || {};
      var drum = kit.kick || kit.taiko || kit.snare || 'kick909';
      engine.auditionDrum(kitName, drum).catch(function () {});
    } else {
      var note = 60;
      if (part.role === 'bass') note = 40;
      else if (part.role === 'pad') note = 57;
      else if (part.role === 'lead') note = 72;
      else if (part.role === 'arp') note = 67;
      else if (part.role === 'counter') note = 64;
      engine.audition(part.instrument, note, 1.2).catch(function () {});
    }
  }

  function randomSong() {
    var styles = GBG.styles.list;
    var pick = styles[Math.floor(Math.random() * styles.length)];
    state.styleId = pick.id;
    state.titleDirty = false;
    state.family = 'all';
    state.intensity = Math.floor(Math.random() * 3) + 1;
    state.bars = [16, 32, 32, 48][Math.floor(Math.random() * 4)];
    state.form = Math.random() < 0.65 ? 'loop' : 'full';
    $('bpm').value = pick.bpm[0] + Math.floor(Math.random() * (pick.bpm[1] - pick.bpm[0]));
    $('scaleId').value = pick.defaultMode;
    $('rootPc').value = Math.floor(Math.random() * 12);
    $('density').value = Math.round((pick.density + (Math.random() - 0.5) * 0.2) * 100);
    $('complexity').value = Math.round((pick.complexity + (Math.random() - 0.5) * 0.2) * 100);
    $('swing').value = Math.round((pick.swing || 0) * 100);
    $('seed').value = String(Math.floor(Math.random() * 90000) + 10000);
    $('prompt').value = '';
    $('parseResult').className = 'parse-result';
    syncOutputs();
    buildTabs();
    setSeg('intensitySeg', state.intensity);
    setSeg('formSeg', state.form);
    setSeg('barsSeg', state.bars);
    ui.renderStyleGrid($('styleGrid'), state.family, state.styleId);
    ui.renderStyleDetail($('styleDetail'), pick);
    regenerate();
  }

  /* ---------------- 启动 ---------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* 暴露给调试 / 自测 */
  global.LoopForge = {
    state: state,
    engine: engine,
    regenerate: regenerate,
    runPrompt: runPrompt,
    exportWav: exportWav,
    exportMidi: exportMidi,
    exportProject: exportProject,
    exportStemsZip: exportStemsZip,
    loadWork: loadWork,
    saveWork: saveWork,
    serializeSong: serializeSong,
    deserializeSong: deserializeSong,
    getRoll: function () { return roll; },
    ready: function () { return !!state.song; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
