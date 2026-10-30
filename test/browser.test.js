/* 浏览器内综合自测：播放、离线渲染、WAV/MIDI、提示词、风格切换、分层、作品库 */
(async function () {
  const out = { pass: 0, fail: 0, results: [], details: {} };
  const G = window.GBG;
  const LF = window.LoopForge;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function ok(cond, name, info) {
    out.results.push({ ok: !!cond, name, info: info === undefined ? null : info });
    if (cond) out.pass++; else out.fail++;
  }

  const song = LF.state.song;
  ok(!!song, '应用已生成歌曲');
  ok(document.querySelectorAll('.style-item').length === 18, '18 个风格卡片', document.querySelectorAll('.style-item').length);
  ok(!!document.getElementById('roll').width, '卷帘画布已初始化');
  out.details.initial = { title: song.meta.title, style: song.meta.styleId, notes: song.stats.notes };

  /* ---- 1. 播放 ---- */
  try {
    await LF.engine.play(0);
    await sleep(900);
    const pos = LF.engine.getPosition();
    const playing = LF.engine.playing;
    ok(playing && pos > 0, '实时播放推进', { pos: +pos.toFixed(2), playing });
    LF.engine.stop();
    await sleep(120);
    ok(!LF.engine.playing, '停止播放');
  } catch (e) {
    ok(false, '实时播放', e.message);
  }

  /* ---- 2. 离线渲染 ---- */
  try {
    const t0 = performance.now();
    const res = await G.audio.renderRange(song, { fromBar: 0, toBar: 8, tailSec: 1.4, sampleRate: 22050 });
    const peak = G.wav.peakOf(res.channels);
    const rms = G.wav.rmsOf(res.channels);
    ok(res.frames > 0, '离线渲染返回音频', { frames: res.frames, ms: Math.round(performance.now() - t0) });
    ok(isFinite(peak) && peak > 0.02 && peak <= 1.001, '峰值在合理范围', +peak.toFixed(3));
    ok(rms > 0.003, 'RMS 非静音', +rms.toFixed(4));
    out.details.render = { frames: res.frames, peak: +peak.toFixed(3), rms: +rms.toFixed(4), ms: Math.round(performance.now() - t0) };

    /* ---- 3. WAV 编码 ---- */
    const loopLen = Math.round(8 * 4 * 60 / song.meta.bpm * 22050);
    const folded = G.wav.foldTail(res.channels, Math.min(loopLen, res.frames), 4000);
    ok(folded[0].length === Math.min(loopLen, res.frames), '尾巴折叠长度正确', folded[0].length);
    const wav = G.wav.encode(folded, {
      sampleRate: 22050, bitDepth: 16,
      loop: { startFrame: 0, endFrame: folded[0].length - 1 },
      title: 'Selftest', key: song.meta.keyLabel
    });
    const dv = new DataView(wav);
    const tag = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    ok(tag(0) === 'RIFF' && tag(8) === 'WAVE', 'WAV RIFF/WAVE 头正确');
    ok(dv.getUint16(20, true) === 1 && dv.getUint16(22, true) === 2, 'WAV PCM/立体声');
    ok(dv.getUint16(34, true) === 16, 'WAV 位深 16');
    const smplPos = (() => {
      const u = new Uint8Array(wav);
      for (let i = 0; i < u.length - 4; i++) if (u[i] === 115 && u[i + 1] === 109 && u[i + 2] === 112 && u[i + 3] === 108) return i;
      return -1;
    })();
    ok(smplPos > 0, 'WAV 含 smpl 循环块', smplPos);
    if (smplPos > 0) {
      ok(dv.getUint32(smplPos + 36, true) === 1, 'smpl 循环数量 = 1', dv.getUint32(smplPos + 36, true));
      ok(dv.getUint32(smplPos + 56, true) === folded[0].length - 1, 'smpl 终点采样正确', dv.getUint32(smplPos + 56, true));
      ok(dv.getUint32(smplPos + 52, true) === 0, 'smpl 起点 = 0');
    }
    ok(tag(0) === 'RIFF' && wav.byteLength > 100000, 'WAV 字节数合理', wav.byteLength);

    /* ---- 4. MIDI ---- */
    const midi = G.midi.write(song);
    const md = new DataView(midi.buffer);
    const mtag = o => String.fromCharCode(midi[o], midi[o + 1], midi[o + 2], midi[o + 3]);
    ok(mtag(0) === 'MThd', 'MIDI 头 MThd');
    ok(md.getUint16(8, false) === 1, 'MIDI format 1');
    const ntrk = md.getUint16(10, false);
    ok(ntrk === song.parts.filter(p => p.notes.length).length + 1, 'MIDI 轨数匹配', { ntrk, parts: song.parts.length });
    const marker = 'LOOP_START';
    let markerIdx = -1;
    outer: for (let i = 0; i < midi.length - marker.length; i++) {
      for (let j = 0; j < marker.length; j++) {
        if (midi[i + j] !== marker.charCodeAt(j)) continue outer;
      }
      markerIdx = i;
      break;
    }
    ok(markerIdx > 0, 'MIDI 含 LOOP_START 标记', markerIdx);
    ok(midi[midi.length - 3] === 0xFF && midi[midi.length - 2] === 0x2F, 'MIDI 结束标记');
    out.details.midi = { bytes: midi.length, tracks: ntrk };

    /* ---- 5. ZIP ---- */
    const zip = G.zip.build([
      { name: 'a.txt', data: new Uint8Array([104, 105]) },
      { name: 'b.wav', data: new Uint8Array(wav).slice(0, 2000) }
    ]);
    ok(zip[0] === 0x50 && zip[1] === 0x4B, 'ZIP 头 PK');

    /* ---- 6. 提示词 ---- */
    const p1 = G.prompt.parse('雨夜的赛博都市，主角潜入大厦，紧张但不要鼓，BPM 100，D 小调');
    ok(['cyberpunk', 'tension', 'dnb'].indexOf(p1.styleId) >= 0, '提示词识别赛博/紧张', p1.styleId);
    ok(p1.bpm === 100, '提示词识别 BPM', p1.bpm);
    ok(p1.noDrums === true, '提示词识别无鼓');
    const p2 = G.prompt.parse('新手村的清晨，阳光、竖琴和长笛，放松治愈');
    ok(['adventure', 'casual', 'lofi'].indexOf(p2.styleId) >= 0, '提示词识别新手村', p2.styleId);
    const p3 = G.prompt.parse('8-bit 像素勇者，关卡开始');
    ok(p3.styleId === 'chiptune', '提示词识别 8-bit', p3.styleId);
    out.details.prompt = [p1.explanation, p2.explanation, p3.explanation];

    /* ---- 7. 风格切换 + 分层 ---- */
    const notesByStyle = {};
    for (const id of ['cyberpunk', 'guofeng', 'jazz', 'chiptune']) {
      LF.state.styleId = id;
      LF.regenerate({ silent: true });
      notesByStyle[id] = LF.state.song.stats.notes;
      ok(LF.state.song.meta.styleId === id, '切换到 ' + id, LF.state.song.stats.notes);
    }
    out.details.notesByStyle = notesByStyle;

    LF.state.styleId = 'epic';
    LF.state.intensity = 0;
    LF.regenerate({ silent: true });
    const drums0 = LF.state.song.parts.filter(p => p.id === 'drums')[0];
    ok(drums0.notes.length === 0, '强度 0 无鼓', drums0.notes.length);
    LF.state.intensity = 3;
    LF.regenerate({ silent: true });
    const drums3 = LF.state.song.parts.filter(p => p.id === 'drums')[0];
    ok(drums3.notes.length > 0, '强度 3 鼓组回归', drums3.notes.length);
    out.details.intensity = { drums0: 0, drums3: drums3.notes.length };

    /* ---- 8. 静音混音 ---- */
    LF.state.mix.mute.drums = true;
    LF.engine.setMix(LF.state.mix);
    await sleep(150);
    const gainVal = LF.engine.graph ? LF.engine.graph.parts.drums.input.gain.value : -1;
    ok(gainVal < 0.01, '鼓组静音生效', +gainVal.toFixed(3));
    LF.state.mix.mute.drums = false;
    LF.engine.setMix(LF.state.mix);

    /* ---- 9. 保存 / 载入 ---- */
    LF.state.song.meta.title = '自测曲目';
    LF.saveWork();
    ok(LF.state.library.length >= 1, '作品保存成功', LF.state.library.length);
    const first = LF.state.library[0];
    ok(first && first.song && !first.song.style, '作品序列化不含 style 引用');
    LF.loadWork(first.id);
    ok(LF.state.song.meta.title === '自测曲目', '作品载入成功', LF.state.song.meta.title);

    /* ---- 10. 播放位置与循环 ---- */
    await LF.engine.play(0);
    await sleep(600);
    const pos2 = LF.engine.getPosition();
    LF.engine.stop();
    ok(pos2 > 0 && pos2 < song.meta.bars * 4, '播放头位置有效', +pos2.toFixed(2));

    /* ---- 11. 循环接缝 ---- */
    const seamSrc = await G.audio.renderRange(song, {
      fromBar: song.loop.startBar, toBar: song.loop.endBar, tailSec: 2.0, sampleRate: 22050
    });
    const loopN = Math.round((song.loop.endBar - song.loop.startBar) * 4 * 60 / song.meta.bpm * 22050);
    const seamFolded = G.wav.foldTail(seamSrc.channels, loopN, 22050 * 2);
    let diffSum = 0, maxDiff = 0;
    const ch = seamFolded[0];
    for (let i = 1; i < ch.length; i++) {
      const d = Math.abs(ch[i] - ch[i - 1]);
      diffSum += d;
      if (d > maxDiff) maxDiff = d;
    }
    const seam = Math.abs(ch[0] - ch[ch.length - 1]);
    const avgDiff = diffSum / ch.length;
    ok(seam < 0.5 && seam < avgDiff * 40 + 0.02, '循环接缝无爆音', { seam: +seam.toFixed(4), avgDiff: +avgDiff.toFixed(4), maxDiff: +maxDiff.toFixed(3) });
    out.details.seam = { seam: +seam.toFixed(4), avgDiff: +avgDiff.toFixed(4) };

    /* ---- 12. 多风格电平 ---- */
    const levels = {};
    for (const id of ['battle', 'edm', 'chiptune', 'lofi', 'jazz', 'horror']) {
      LF.state.styleId = id;
      LF.state.intensity = 2;
      LF.regenerate({ silent: true });
      const s = LF.state.song;
      const r = await G.audio.renderRange(s, { fromBar: 0, toBar: 8, tailSec: 0.8, sampleRate: 22050 });
      levels[id] = { rms: +G.wav.rmsOf(r.channels).toFixed(3), peak: +G.wav.peakOf(r.channels).toFixed(3) };
    }
    out.details.levels = levels;
    const allLevels = Object.values(levels);
    ok(allLevels.every(l => l.peak > 0.05 && l.peak <= 1.001), '各风格峰值在范围内', levels);
    ok(allLevels.every(l => l.rms > 0.02), '各风格 RMS 非静音', levels);

    /* ---- 13. 清晰度（编曲精简） ---- */
    const clarityEl = document.getElementById('clarity');
    LF.state.styleId = 'epic';
    LF.state.intensity = 2;
    clarityEl.value = '0';
    LF.regenerate({ silent: true });
    const fullSong = LF.state.song;
    const fullNotes = fullSong.stats.notes;
    const leadFull = fullSong.parts.filter(p => p.role === 'lead').reduce((a, p) => a + p.notes.length, 0);
    clarityEl.value = '75';
    LF.regenerate({ silent: true });
    const cleanSong = LF.state.song;
    const cleanNotes = cleanSong.stats.notes;
    const leadClean = cleanSong.parts.filter(p => p.role === 'lead').reduce((a, p) => a + p.notes.length, 0);
    ok(cleanNotes < fullNotes * 0.85, '清晰度降低音符数', { fullNotes, cleanNotes });
    ok(leadClean === leadFull, '清晰度不裁剪主旋律', { leadFull, leadClean });
    ok(cleanSong.meta.clarity === 0.75, '清晰度写入 meta', cleanSong.meta.clarity);
    const colorCount = cleanSong.parts.filter(p => p.role === 'counter' || (p.role === 'pad' && p.minIntensity >= 1)).reduce((a, p) => a + p.notes.length, 0);
    ok(colorCount > 0, '色彩声部仍然保留（轮换登场）', colorCount);
    out.details.clarity = { fullNotes, cleanNotes, leadFull, colorCount };

    out.details.final = {
      title: LF.state.song.meta.title,
      style: LF.state.song.meta.styleId,
      notes: LF.state.song.stats.notes,
      hash: location.hash.slice(0, 80),
      mixRows: document.querySelectorAll('.mix-row').length
    };
  } catch (e) {
    ok(false, '测试异常: ' + e.message, e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : null);
  }

  document.title = (out.fail === 0 ? 'SELFTEST-PASS' : 'SELFTEST-FAIL') + ' ' + out.pass + '/' + (out.pass + out.fail);
  const pre = document.createElement('pre');
  pre.id = 'selftest';
  pre.style.cssText = 'position:fixed;left:-9999px;top:0';
  pre.textContent = JSON.stringify(out, null, 2);
  document.body.appendChild(pre);
  return out;
})();
