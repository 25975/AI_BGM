(async function () {
  var out = { checks: [] };
  function check(name, ok, info) {
    out.checks.push({ name: name, ok: !!ok, info: info === undefined ? null : info });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function until(fn, limit) {
    var t = 0;
    while (!fn() && t < (limit || 20000)) { await wait(120); t += 120; }
    return !!fn();
  }
  function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

  var bgm = document.getElementById('frame-bgm');
  var sfx = document.getElementById('frame-sfx');

  check('页签数量 2', document.querySelectorAll('.shell-tab').length === 2);
  check('默认 BGM 页签', document.body.getAttribute('data-tab') === 'bgm');
  check('BGM iframe 已设置 src', /loopforge\.html/.test(bgm.getAttribute('src') || ''));
  check('SFX iframe 延迟加载', !sfx.getAttribute('src'));

  var bgmReady = await until(function () {
    return safe(function () { return bgm.contentWindow.LoopForge && bgm.contentWindow.LoopForge.ready(); }, false);
  }, 20000);
  check('BGM 子应用就绪', bgmReady);
  check('BGM 嵌入模式', safe(function () {
    return bgm.contentDocument.documentElement.classList.contains('embed');
  }, false));
  check('BGM 自身品牌隐藏', safe(function () {
    return getComputedStyle(bgm.contentDocument.querySelector('.brand')).display === 'none';
  }, false));
  check('BGM 底部隐藏', safe(function () {
    return getComputedStyle(bgm.contentDocument.querySelector('.footer')).display === 'none';
  }, false));
  check('BGM 内部无横向溢出', safe(function () {
    return bgm.contentDocument.documentElement.scrollWidth - bgm.contentWindow.innerWidth <= 1;
  }, false), safe(function () {
    return bgm.contentDocument.documentElement.scrollWidth - bgm.contentWindow.innerWidth;
  }, null));

  document.getElementById('tab-sfx').click();
  check('切换到 SFX 页签', document.body.getAttribute('data-tab') === 'sfx');
  check('SFX iframe 已加载', /forgefx\.html/.test(sfx.getAttribute('src') || ''));
  check('SFX iframe 可见', sfx.classList.contains('on') && !bgm.classList.contains('on'));
  check('URL hash 为 #sfx', location.hash === '#sfx', location.hash);
  check('浏览器标题切换', document.title.indexOf('音效工坊') === 0, document.title);

  var sfxReady = await until(function () {
    return safe(function () {
      return sfx.contentWindow.SFX && sfx.contentWindow.SFX.app && sfx.contentWindow.SFX.app.ready();
    }, false);
  }, 25000);
  check('SFX 子应用就绪', sfxReady);
  check('SFX 嵌入模式', safe(function () {
    return sfx.contentDocument.documentElement.classList.contains('embed');
  }, false));
  check('SFX 自身品牌隐藏', safe(function () {
    return getComputedStyle(sfx.contentDocument.querySelector('.brand')).display === 'none';
  }, false));
  check('SFX 顶栏提示隐藏', safe(function () {
    return getComputedStyle(sfx.contentDocument.querySelector('.top-note')).display === 'none';
  }, false));
  check('SFX 内部无横向溢出', safe(function () {
    return sfx.contentDocument.documentElement.scrollWidth - sfx.contentWindow.innerWidth <= 1;
  }, false), safe(function () {
    return sfx.contentDocument.documentElement.scrollWidth - sfx.contentWindow.innerWidth;
  }, null));

  document.getElementById('tab-bgm').click();
  check('切回 BGM 页签', document.body.getAttribute('data-tab') === 'bgm');
  check('BGM 状态保留', safe(function () {
    return bgm.contentWindow.LoopForge && bgm.contentWindow.LoopForge.ready();
  }, false));
  check('URL hash 为 #bgm', location.hash === '#bgm', location.hash);
  check('BGM 显示 / SFX 隐藏', bgm.classList.contains('on') && !sfx.classList.contains('on'));

  var headerH = document.querySelector('.shell-top').getBoundingClientRect().height;
  out.headerH = Math.round(headerH);
  out.frameH = Math.round(bgm.getBoundingClientRect().height);
  check('iframe 填满剩余高度', Math.abs(out.frameH - (window.innerHeight - headerH)) <= 2, { frame: out.frameH, expected: window.innerHeight - headerH });
  check('页面无横向溢出', document.documentElement.scrollWidth - window.innerWidth <= 0, document.documentElement.scrollWidth - window.innerWidth);
  check('新窗口链接指向 BGM', /loopforge\.html$/.test(document.getElementById('openApp').getAttribute('href')));

  out.pass = out.checks.filter(function (c) { return c.ok; }).length;
  out.fail = out.checks.filter(function (c) { return !c.ok; }).length;
  return out;
})()
