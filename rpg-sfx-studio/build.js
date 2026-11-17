/* 把 index.html + css + js 内联成单文件 dist/forgefx.html */
const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
html = html.replace(
  /<link rel="stylesheet" href="css\/style\.css">/,
  '<style>\n' + css + '\n</style>'
);

html = html.replace(
  /<script src="(js\/[^"]+)"><\/script>/g,
  (m, src) => {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    return '<script>\n/* ' + src + ' */\n' + code.replace(/<\/script>/gi, '<\\/script>') + '\n</script>';
  }
);

const outDir = path.join(root, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'forgefx.html');
fs.writeFileSync(out, html, 'utf8');
console.log('built ' + out + '  ' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
