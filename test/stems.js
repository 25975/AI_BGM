(async function () {
  var LF = window.LoopForge;
  LF.state.titleDirty = false;
  LF.state.styleId = 'jazz';
  LF.state.bars = 16;
  LF.state.form = 'loop';
  LF.state.intensity = 2;
  document.getElementById('exportLoopOnly').checked = true;
  document.getElementById('seamless').checked = true;
  LF.regenerate({ silent: true });

  var song = LF.state.song;
  LF.exportStemsZip();

  var waited = 0;
  while (LF.state.exporting && waited < 180000) {
    await new Promise(function (r) { setTimeout(r, 500); });
    waited += 500;
  }
  return {
    ms: waited,
    status: document.getElementById('exportStatus').textContent,
    title: song.meta.title,
    parts: song.parts.filter(function (p) { return p.notes.length; }).map(function (p) { return p.id; }),
    loop: song.loop
  };
})();
