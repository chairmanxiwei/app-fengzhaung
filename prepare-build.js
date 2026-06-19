const fs = require('fs');
const path = require('path');

const tmp = 'd:/网站封装app/build-temp';
const pkg = 'com.web2app.test';
const url = 'https://www.example.com';
const name = 'TestApp';

// 替换文件中的占位符
function replaceInFile(fp) {
  if (!fs.existsSync(fp)) return;
  let c = fs.readFileSync(fp, 'utf-8');
  if (!c.includes('{{')) return;
  c = c.replace(/\{\{PACKAGE_NAME\}\}/g, pkg);
  c = c.replace(/\{\{TARGET_URL\}\}/g, url);
  c = c.replace(/\{\{APP_NAME\}\}/g, name);
  fs.writeFileSync(fp, c);
}

function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.(xml|gradle|java|properties)$/.test(e.name)) replaceInFile(fp);
  });
}

walk(tmp);

// 重命名包目录
const oldDir = path.join(tmp, 'app/src/main/java/com/web2app/template');
const newDir = path.join(tmp, 'app/src/main/java/com/web2app/test');
if (fs.existsSync(oldDir)) {
  fs.mkdirSync(path.join(tmp, 'app/src/main/java/com/web2app'), { recursive: true });
  fs.renameSync(oldDir, newDir);
  console.log('包目录已重命名: template -> test');
}

// 更新AndroidManifest中的Activity路径
const manifest = path.join(tmp, 'app/src/main/AndroidManifest.xml');
let mc = fs.readFileSync(manifest, 'utf-8');
mc = mc.replace('com.web2app.template.MainActivity', 'com.web2app.test.MainActivity');
fs.writeFileSync(manifest, mc);

// 更新MainActivity.java中的package声明
const mainActivity = path.join(tmp, 'app/src/main/java/com/web2app/test/MainActivity.java');
if (fs.existsSync(mainActivity)) {
  let mac = fs.readFileSync(mainActivity, 'utf-8');
  mac = mac.replace('package com.web2app.template', 'package com.web2app.test');
  fs.writeFileSync(mainActivity, mac);
  console.log('MainActivity.java包名已更新');
}

console.log('临时构建目录已准备完成');
