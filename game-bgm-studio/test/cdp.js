/* 通过 Chrome DevTools Protocol 加载页面、收集错误、截图、执行断言 */
const fs = require('fs');
const http = require('http');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const port = process.argv[2] || '9222';
  const pageUrl = process.argv[3];
  let shotPath = process.argv[4] || '';
  if (shotPath === '-') shotPath = '';
  let script = process.argv[5] || 'window.__SMOKE__';
  if (script.startsWith('@')) script = fs.readFileSync(script.slice(1), 'utf8');

  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const logs = [];

  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const p = msg.params;
      const text = p.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      logs.push(p.type + ': ' + text);
      if (p.type === 'error') errors.push(text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(msg.params.entry.text);
    }
  };

  const send = (method, params = {}) => new Promise(resolve => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  const dlDir = process.env.DL_DIR;
  if (dlDir) {
    await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir });
  }
  const vp = (process.env.VP || '1600x1150').split('x').map(Number);
  await send('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 1, mobile: vp[0] < 700 });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(250);
  await send('Page.navigate', { url: pageUrl });
  await sleep(5500);

  const evalRes = await send('Runtime.evaluate', {
    expression: script,
    returnByValue: true,
    awaitPromise: true
  });
  const value = evalRes.result && evalRes.result.result ? evalRes.result.result.value : null;
  const evalError = evalRes.result && evalRes.result.exceptionDetails ? evalRes.result.exceptionDetails.text : null;

  let shotOk = false;
  if (shotPath) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (shot.result && shot.result.data) {
      fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
      shotOk = true;
    }
  }

  console.log(JSON.stringify({ value, evalError, errors, logs, shotOk }, null, 2));
  ws.close();
  process.exit(errors.length ? 2 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
