(async function () {
  var LF = window.LoopForge, G = window.GBG;
  var out = {};
  var song = LF.state.song;

  // 16 小节、16-bit、循环区间导出（真实点击路径）
  LF.state.bars = 16;
  LF.state.form = 'loop';
  LF.state.styleId = 'cyberpunk';
  LF.regenerate({ silent: true });
  document.getElementById('exportLoopOnly').checked = true;
  document.getElementById('seamless').checked = true;
  LF.exportWav();

  // 同时导出 MIDI 与工程 JSON
  LF.exportMidi();
  LF.exportProject();

  // 等待渲染完成（观察状态栏）
  var waited = 0;
  while (LF.state.exporting && waited < 90000) {
    await new Promise(function (r) { setTimeout(r, 500); });
    waited += 500;
  }
  out.exportMs = waited;
  out.status = document.getElementById('exportStatus').textContent;
  out.notes = LF.state.song.stats.notes;
  return out;
})();
