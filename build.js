/* 构建两个子应用，并复制到统一工作台的 apps/ 目录 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
const bgmDir = path.join(root, 'game-bgm-studio');
const sfxDir = path.join(root, 'rpg-sfx-studio');
const appsDir = path.join(root, 'apps');

function build(dir, name) {
  execFileSync(process.execPath, [path.join(dir, 'build.js')], { cwd: dir, stdio: 'inherit' });
  const dist = path.join(dir, 'dist', name);
  if (!fs.existsSync(dist)) throw new Error('missing build: ' + dist);
  fs.mkdirSync(appsDir, { recursive: true });
  fs.copyFileSync(dist, path.join(appsDir, name));
  console.log('copied ' + name + '  ' + (fs.statSync(path.join(appsDir, name)).size / 1024).toFixed(1) + ' KB');
}

build(bgmDir, 'loopforge.html');
build(sfxDir, 'forgefx.html');

const total = ['loopforge.html', 'forgefx.html'].reduce(function (sum, f) {
  return sum + fs.statSync(path.join(appsDir, f)).size;
}, 0);
console.log('unified apps ready: ' + (total / 1024).toFixed(1) + ' KB');
