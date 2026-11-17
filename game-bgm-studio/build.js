/* 打包成单文件 HTML：dist/loopforge.html */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const htmlPath = path.join(ROOT, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

html = html.replace(/<link rel="stylesheet" href="css\/style\.css">/,
  () => '<style>\n' + fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8') + '\n</style>');

html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, file) => {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (code.includes('</script>')) throw new Error('script tag inside ' + file);
  return '<script>\n/* ==== ' + file + ' ==== */\n' + code + '\n</script>';
});

if (/<script src=|<link rel="stylesheet"/.test(html)) {
  console.error('仍有未内联的外部资源');
  process.exit(1);
}

const dist = path.join(ROOT, 'dist');
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, 'loopforge.html');
fs.writeFileSync(out, html, 'utf8');
console.log('built', out, (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
