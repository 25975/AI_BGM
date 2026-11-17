(async function () {
  var SFX = window.SFX;
  var out = { checks: [], bad: [], errors: [] };
  function check(name, ok, info) {
    out.checks.push({ name: name, ok: !!ok, info: info === undefined ? null : info });
    if (!ok && info !== undefined) out.bad.push({ name: name, info: info });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitReady(limit) {
    var t = 0;
    while (!(SFX.app && SFX.app.ready()) && t < (limit || 20000)) { await wait(120); t += 120; }
    return !!(SFX.app && SFX.app.ready());
  }
  function nonBlank(canvas, threshold) {
    try {
      var ctx = canvas.getContext('2d');
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var n = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i] + d[i + 1] + d[i + 2] > (threshold || 90) && d[i + 3] > 20) n++;
      }
      return n;
    } catch (e) { return -1; }
  }

  check('页面与 SFX 全局', !!SFX && !!SFX.app && !!SFX.presets && !!SFX.engine);
  check('初始 8 变体渲染完成', await waitReady(20000));
  check('类别数 7', SFX.presets.CATEGORIES.length === 7);
  check('预设数 >= 60', SFX.presets.list.length >= 60, SFX.presets.list.length);
  check('变体数 8', SFX.app.state.variants.length === 8);
  check('8 个变体均已渲染', SFX.app.state.variants.every(function (v) { return v.rendered; }));

  var v0 = SFX.app.state.variants[0];
  check('当前音效有 PCM', v0.channels && v0.channels.length === 2 && v0.channels[0].length > 1000, v0.channels ? v0.channels[0].length : 0);
  check('峰值在 -2..0 dBFS', v0.peak > 0.75 && v0.peak <= 1.0, v0.peak);
  check('时长合理', v0.duration > 0.05 && v0.duration < 5, v0.duration);

  check('波形已绘制', nonBlank(document.getElementById('wave'), 90) > 800, nonBlank(document.getElementById('wave'), 90));
  check('频谱已绘制', nonBlank(document.getElementById('spectro'), 90) > 1500, nonBlank(document.getElementById('spectro'), 90));

  /* 同种子必须复现到 PCM（含噪声底与混响 IR） */
  var dspec = SFX.presets.buildSpec(SFX.presets.makeRecipe('skill_fire_impact', { seed: 321, style: 'dark' }));
  var da = await SFX.engine.render(dspec, { sampleRate: 16000 });
  var db = await SFX.engine.render(dspec, { sampleRate: 16000 });
  var maxD = 0;
  for (var dch = 0; dch < da.channels.length; dch++) {
    var A = da.channels[dch], B = db.channels[dch];
    for (var di = 0; di < A.length; di++) {
      var diff = Math.abs(A[di] - B[di]);
      if (diff > maxD) maxD = diff;
    }
  }
  check('同种子 PCM 一致（< -80 dB）', maxD < 1e-4, maxD);
  var dspec2 = SFX.presets.buildSpec(SFX.presets.makeRecipe('skill_fire_impact', { seed: 322, style: 'dark' }));
  var dc = await SFX.engine.render(dspec2, { sampleRate: 16000 });
  var diffAB = 0;
  for (var k2 = 0; k2 < da.channels[0].length; k2++) {
    var dd = Math.abs(da.channels[0][k2] - dc.channels[0][k2]);
    if (dd > diffAB) diffAB = dd;
  }
  check('不同种子产生不同 PCM', diffAB > 0.01, diffAB);

  /* 打击类 8 个变体必须在 PCM 层面明显不同 */
  var impactPcm = [];
  for (var iv = 0; iv < 8; iv++) {
    var isp = SFX.presets.buildSpec(SFX.presets.makeRecipe('blade_light', { seed: 777 + iv * 7919, style: 'realistic' }));
    var ir = await SFX.engine.render(isp, { sampleRate: 16000 });
    impactPcm.push(ir.channels[0]);
  }
  var distinctVariants = 0;
  for (var iv2 = 1; iv2 < 8; iv2++) {
    var A0 = impactPcm[0], B0 = impactPcm[iv2];
    var n0 = Math.min(A0.length, B0.length);
    var md0 = 0;
    for (var k0 = 0; k0 < n0; k0 += 7) {
      var d0 = Math.abs(A0[k0] - B0[k0]);
      if (d0 > md0) md0 = d0;
    }
    if (md0 > 0.05) distinctVariants++;
  }
  check('打击 8 变体听感不同', distinctVariants >= 6, distinctVariants);

  /* 刃类必须比钝击更“亮”、低频更少，避免又退化成敲击感 */
  function bandRatios(channels, sr) {
    var d = channels[0];
    var aHi = Math.exp(-2 * Math.PI * 2000 / sr);
    var aLo = Math.exp(-2 * Math.PI * 300 / sr);
    var px = 0, py = 0, hi = 0, all = 0, ly = 0, lo = 0;
    for (var bi = 0; bi < d.length; bi++) {
      var bx = d[bi];
      var by = aHi * (py + bx - px);
      px = bx; py = by;
      hi += by * by;
      var bl = aLo * ly + (1 - aLo) * bx;
      ly = bl; lo += bl * bl;
      all += bx * bx;
    }
    return { hi: Math.sqrt(hi / all), lo: Math.sqrt(lo / all) };
  }
  var slashRes = await SFX.engine.render(SFX.presets.buildSpec(SFX.presets.makeRecipe('blade_light', { seed: 4242, style: 'realistic' })), { sampleRate: 16000 });
  var clangRes = await SFX.engine.render(SFX.presets.buildSpec(SFX.presets.makeRecipe('metal_clang', { seed: 4242, style: 'realistic' })), { sampleRate: 16000 });
  var slashBand = bandRatios(slashRes.channels, 16000);
  var clangBand = bandRatios(clangRes.channels, 16000);
  check('刃类高频占比高于钝击', slashBand.hi > clangBand.hi * 1.15, { slash: slashBand, clang: clangBand });
  check('刃类低频不压过刃口', slashBand.lo < clangBand.lo * 0.75, { slash: slashBand, clang: clangBand });
  var heavyRes = await SFX.engine.render(SFX.presets.buildSpec(SFX.presets.makeRecipe('blade_heavy', { seed: 4242, style: 'realistic' })), { sampleRate: 16000 });
  var critRes = await SFX.engine.render(SFX.presets.buildSpec(SFX.presets.makeRecipe('critical', { seed: 4242, style: 'realistic' })), { sampleRate: 16000 });
  var heavyBand = bandRatios(heavyRes.channels, 16000);
  var critBand = bandRatios(critRes.channels, 16000);
  check('重刃与暴击同样保持刃口', heavyBand.hi > 0.4 && critBand.hi > 0.45, { heavy: heavyBand, crit: critBand });

  /* 全部预设 × 2 风格真实渲染 */
  var bad = [];
  var count = 0;
  var minPeak = 1, maxPeak = 0;
  var t0 = performance.now();
  for (var i = 0; i < SFX.presets.list.length; i++) {
    var p = SFX.presets.list[i];
    for (var s = 0; s < 2; s++) {
      var style = s === 0 ? 'realistic' : 'pixel';
      var spec = SFX.presets.buildSpec(SFX.presets.makeRecipe(p.id, { seed: 900 + i, style: style }));
      var res = await SFX.engine.render(spec, { sampleRate: 16000 });
      count++;
      var nan = false;
      for (var ch = 0; ch < res.channels.length; ch++) {
        var d = res.channels[ch];
        for (var k = 0; k < d.length; k += 64) { if (!isFinite(d[k])) { nan = true; break; } }
      }
      if (res.peak < 0.02 || nan) bad.push({ id: p.id, style: style, peak: res.peak, nan: nan });
      if (res.peak < minPeak) minPeak = res.peak;
      if (res.peak > maxPeak) maxPeak = res.peak;
    }
  }
  check('全部预设可渲染', count === SFX.presets.list.length * 2, count);
  check('无静音 / 无 NaN', bad.length === 0, bad.slice(0, 8));
  out.renderStats = { count: count, minPeak: minPeak, maxPeak: maxPeak, ms: Math.round(performance.now() - t0) };

  /* 切换预设与风格 */
  SFX.app.selectPreset('skill_fire_impact', { seed: 777, style: 'dark' });
  check('切换预设后渲染完成', await waitReady(20000));
  check('预设已切换', SFX.app.state.presetId === 'skill_fire_impact');
  check('风格已切换', SFX.app.state.style === 'dark');
  check('标题已更新', document.getElementById('soundName').textContent === '火焰命中', document.getElementById('soundName').textContent);

  /* 参数联动 */
  var pitch = document.querySelector('[data-macro="pitch"]');
  pitch.value = '7';
  pitch.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(1100);
  check('音高参数写入', SFX.app.state.macros.pitch === 7, SFX.app.state.macros.pitch);
  var sv = SFX.app.state.variants[SFX.app.state.selected];
  check('重渲染使用新参数', sv.spec && sv.spec.meta.macros.pitch === 7, sv.spec ? sv.spec.meta.macros.pitch : null);

  /* 变体切换 */
  var cards = document.querySelectorAll('#variants .variant');
  check('变体按钮数量 8', cards.length === 8, cards.length);
  cards[3].click();
  await wait(1000);
  check('变体切换生效', SFX.app.state.selected === 3, SFX.app.state.selected);
  check('变体卡高亮', document.querySelectorAll('#variants .variant')[3].classList.contains('on'));

  /* 播放 / 停止 */
  SFX.app.play();
  await wait(180);
  check('播放状态开启', SFX.app.state.playing === true);
  SFX.app.stop();
  check('停止后状态关闭', SFX.app.state.playing === false);

  /* 导出 */
  await SFX.app.exportWav();
  check('WAV 导出完成', document.getElementById('exportStatus').textContent.indexOf('完成') >= 0, document.getElementById('exportStatus').textContent);

  /* 批量包 */
  Object.keys(SFX.app.state.packCats).forEach(function (k) { SFX.app.state.packCats[k] = k === 'ui'; });
  SFX.app.state.packCount = 2;
  await SFX.app.buildPack();
  check('批量包完成', document.getElementById('packStatus').textContent.indexOf('完成') >= 0, document.getElementById('packStatus').textContent);
  check('批量包状态含数量', document.getElementById('packStatus').textContent.indexOf('2 个音效') >= 0, document.getElementById('packStatus').textContent);

  /* 波形选择 */
  check('波形选项 5 个', document.querySelectorAll('#waveSeg [data-wave]').length === 5);
  document.querySelector('#waveSeg [data-wave="square"]').click();
  await wait(1200);
  check('波形切换为方波', SFX.app.state.waveform === 'square', SFX.app.state.waveform);
  var waveVariant = SFX.app.state.variants[SFX.app.state.selected];
  check('渲染使用方波', waveVariant.spec && waveVariant.spec.meta.waveform === 'square', waveVariant.spec ? waveVariant.spec.meta.waveform : null);

  /* 组合技能音 */
  SFX.app.selectPreset('blade_light', { seed: 2026, waveform: 'auto', play: false });
  await waitReady(20000);
  SFX.app.addToStack();
  SFX.app.selectPreset('metal_clang', { seed: 3030, play: false });
  await waitReady(20000);
  SFX.app.addToStack();
  check('组合加入 2 层', SFX.app.state.stack.length === 2, SFX.app.state.stack.length);
  check('组合列表渲染', document.querySelectorAll('#stackList .stack-row').length === 2);
  var stackMix = await SFX.app.renderStack();
  check('组合有 PCM', stackMix.channels[0].length > 1000, stackMix.channels[0].length);
  check('组合峰值 -1 dBFS', Math.abs(SFX.wav.peakOf(stackMix.channels) - 0.891) < 0.01, SFX.wav.peakOf(stackMix.channels));
  check('组合时长合理', stackMix.duration > 0.3 && stackMix.duration < 10, stackMix.duration);
  document.getElementById('btnClearStack').click();
  check('清空组合', SFX.app.state.stack.length === 0, SFX.app.state.stack.length);

  /* 收藏 */
  SFX.app.saveFavorite();
  check('收藏写入', SFX.app.state.favorites.length > 0, SFX.app.state.favorites.length);
  check('收藏列表渲染', document.querySelectorAll('#favorites .fav').length > 0);

  /* 布局 */
  var ws = document.querySelector('.workspace');
  check('三列布局', getComputedStyle(ws).gridTemplateColumns.split(' ').length === 3, getComputedStyle(ws).gridTemplateColumns);
  check('无横向溢出', document.documentElement.scrollWidth - window.innerWidth <= 0, document.documentElement.scrollWidth - window.innerWidth);
  check('参数控件 7 个', document.querySelectorAll('#ctrlGrid [data-macro]').length === 7);
  check('导出按钮可见', document.getElementById('btnExport').getBoundingClientRect().width > 0);

  /* WAV / ZIP 结构 */
  var wav = SFX.wav.encode([v0.channels[0].slice(0, 2000)], { sampleRate: 16000, bitDepth: 16 });
  var dv = new DataView(wav);
  check('WAV RIFF/WAVE', dv.getUint32(0, true) === 0x46464952 && dv.getUint32(8, true) === 0x45564157);
  var zip = SFX.zip.build([{ name: 'x.txt', data: new TextEncoder().encode('ok') }]);
  check('ZIP 头正确', new DataView(zip.buffer).getUint32(0, true) === 0x04034B50);

  /* 收尾：给截图一个好看的状态 */
  SFX.app.selectPreset('skill_lightning_strike', { seed: 424242, style: 'bright' });
  await waitReady(20000);

  out.ok = out.checks.every(function (c) { return c.ok; });
  out.pass = out.checks.filter(function (c) { return c.ok; }).length;
  out.fail = out.checks.filter(function (c) { return !c.ok; }).length;
  return out;
})()
