/**
 * Android 构建环境搭建脚本 v2
 * 使用国内镜像加速下载
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_DIR = path.join(__dirname, 'android-sdk');
const JDK_DIR = path.join(BASE_DIR, 'jdk-11');
const SDK_DIR = path.join(BASE_DIR, 'android-sdk');

function downloadFile(url, dest, label) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      const size = fs.statSync(dest).size;
      if (size > 1024 * 1024) { // >1MB 认为已下载
        console.log(`  [跳过] ${label} 已存在 (${(size / 1024 / 1024).toFixed(1)}MB)`);
        return resolve(dest);
      }
      fs.unlinkSync(dest); // 删除不完整文件
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    console.log(`  [下载] ${label}...`);
    const file = fs.createWriteStream(dest);

    const follow = (url) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, { timeout: 120000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          return;
        }
        const total = parseInt(res.headers['content-length'], 10);
        let downloaded = 0;
        let lastPct = 0;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total) {
            const pct = Math.floor(downloaded / total * 100);
            if (pct >= lastPct + 5) {
              lastPct = pct;
              process.stdout.write(`\r  [${label}] ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}/${(total / 1024 / 1024).toFixed(1)}MB)`);
            }
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          console.log(`\r  [完成] ${label} (${(downloaded / 1024 / 1024).toFixed(1)}MB)      `);
          file.close();
          resolve(dest);
        });
      }).on('error', (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    };
    follow(url);
  });
}

function extractZip(zipPath, destDir, label) {
  console.log(`  [解压] ${label}...`);
  fs.mkdirSync(destDir, { recursive: true });
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
      stdio: 'pipe', timeout: 120000
    });
    console.log(`  [完成] ${label} 解压完成`);
  } catch (err) {
    throw new Error(`${label} 解压失败: ${err.message.slice(0, 200)}`);
  }
}

async function setup() {
  console.log('========================================');
  console.log('  Android 构建环境搭建 v2 (镜像加速)');
  console.log('========================================\n');

  fs.mkdirSync(BASE_DIR, { recursive: true });

  // ===== 步骤1: 下载 JDK 11 =====
  console.log('[1/5] 下载 JDK 11...');
  const jdkZip = path.join(BASE_DIR, 'jdk11.zip');

  // 尝试多个镜像源
  const jdkMirrors = [
    'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/11/jdk/x64/windows/OpenJDK11U-jdk_x64_windows_hotspot_11.0.21_9.zip',
    'https://api.adoptium.net/v3/binary/latest/11/ga/windows/x64/jdk/hotspot/normal/eclipse',
  ];

  let jdkDownloaded = false;
  for (const mirror of jdkMirrors) {
    try {
      await downloadFile(mirror, jdkZip, 'JDK 11');
      jdkDownloaded = true;
      break;
    } catch (err) {
      console.log(`  [失败] 镜像 ${mirror.split('/')[2]}: ${err.message.slice(0, 80)}`);
      if (fs.existsSync(jdkZip) && fs.statSync(jdkZip).size < 1024 * 1024) {
        fs.unlinkSync(jdkZip);
      }
    }
  }

  if (!jdkDownloaded) {
    console.error('  [错误] JDK 下载失败，所有镜像源均不可用');
    console.error('  请手动下载 JDK 11 并解压到: ' + JDK_DIR);
  }

  // ===== 步骤2: 解压 JDK =====
  if (jdkDownloaded && fs.existsSync(jdkZip)) {
    console.log('\n[2/5] 解压 JDK 11...');
    try {
      extractZip(jdkZip, BASE_DIR, 'JDK 11');
      // 查找并重命名JDK目录
      const dirs = fs.readdirSync(BASE_DIR).filter(d =>
        d.startsWith('jdk-11') || d.startsWith('jdk11') || d.startsWith('OpenJDK')
      );
      for (const dir of dirs) {
        const src = path.join(BASE_DIR, dir);
        if (src !== JDK_DIR && fs.statSync(src).isDirectory()) {
          if (fs.existsSync(JDK_DIR)) fs.rmSync(JDK_DIR, { recursive: true });
          fs.renameSync(src, JDK_DIR);
          console.log(`  重命名: ${dir} -> jdk-11`);
        }
      }
      // 验证
      const javaExe = path.join(JDK_DIR, 'bin', 'java.exe');
      if (fs.existsSync(javaExe)) {
        try {
          const ver = execSync(`"${javaExe}" -version 2>&1`).toString();
          console.log('  JDK 版本: ' + ver.split('\n')[0]);
        } catch {}
      } else {
        console.error('  [警告] java.exe 未找到，JDK解压可能不完整');
      }
    } catch (err) {
      console.error('  [错误] JDK解压失败:', err.message);
    }
  }

  // ===== 步骤3: 下载 Android SDK =====
  console.log('\n[3/5] 下载 Android SDK Command-line Tools...');
  const sdkZip = path.join(BASE_DIR, 'cmdline-tools.zip');
  const sdkUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';

  try {
    await downloadFile(sdkUrl, sdkZip, 'Android SDK');
  } catch (err) {
    console.error('  [错误] SDK下载失败:', err.message);
  }

  // 解压并配置SDK
  if (fs.existsSync(sdkZip)) {
    const sdkTempDir = path.join(BASE_DIR, 'sdk-temp');
    try {
      extractZip(sdkZip, sdkTempDir, 'Android SDK');

      const cmdlineToolsDir = path.join(SDK_DIR, 'cmdline-tools', 'latest');
      fs.mkdirSync(cmdlineToolsDir, { recursive: true });

      const extractedCmdline = path.join(sdkTempDir, 'cmdline-tools');
      if (fs.existsSync(extractedCmdline)) {
        for (const file of fs.readdirSync(extractedCmdline)) {
          const src = path.join(extractedCmdline, file);
          const dest = path.join(cmdlineToolsDir, file);
          if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
          fs.renameSync(src, dest);
        }
      }
      fs.rmSync(sdkTempDir, { recursive: true });
      console.log('  SDK目录已配置');
    } catch (err) {
      console.error('  [错误] SDK解压失败:', err.message);
    }
  }

  // ===== 步骤4: 安装 SDK 组件 =====
  const sdkmanager = path.join(SDK_DIR, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
  if (fs.existsSync(sdkmanager) && fs.existsSync(JDK_DIR)) {
    console.log('\n[4/5] 安装 SDK 组件...');
    const env = { ...process.env, JAVA_HOME: JDK_DIR, ANDROID_HOME: SDK_DIR };

    // 接受许可
    try {
      execSync(`echo y | "${sdkmanager}" --licenses --sdk_root="${SDK_DIR}"`, {
        env, stdio: 'pipe', timeout: 60000
      });
    } catch {}

    const packages = ['platforms;android-34', 'build-tools;34.0.0', 'platform-tools'];
    for (const pkg of packages) {
      console.log(`  安装: ${pkg}...`);
      try {
        execSync(`"${sdkmanager}" "${pkg}" --sdk_root="${SDK_DIR}"`, {
          env, stdio: 'pipe', timeout: 300000
        });
        console.log(`  [完成] ${pkg}`);
      } catch (e) {
        console.error(`  [失败] ${pkg}: ${e.message.slice(0, 100)}`);
      }
    }
  } else {
    console.log('\n[4/5] 跳过SDK组件安装 (缺少sdkmanager或JDK)');
  }

  // ===== 步骤5: 生成签名密钥 + 环境配置 =====
  console.log('\n[5/5] 生成签名密钥和环境配置...');

  const keystoreDir = path.join(__dirname, 'keystore');
  fs.mkdirSync(keystoreDir, { recursive: true });
  const keystorePath = path.join(keystoreDir, 'release.jks');

  if (!fs.existsSync(keystorePath) && fs.existsSync(JDK_DIR)) {
    const keytool = path.join(JDK_DIR, 'bin', 'keytool.exe');
    try {
      execSync(`"${keytool}" -genkeypair -v -keystore "${keystorePath}" -alias web2app -keyalg RSA -keysize 2048 -validity 10000 -storepass web2app123 -keypass web2app123 -dname "CN=Web2App, OU=Dev, O=Web2App, L=Beijing, ST=Beijing, C=CN"`, {
        stdio: 'pipe', timeout: 30000
      });
      console.log('  签名密钥已生成');
    } catch (e) {
      console.error('  签名密钥生成失败:', e.message.slice(0, 100));
    }
  } else if (fs.existsSync(keystorePath)) {
    console.log('  签名密钥已存在');
  }

  // 写入环境配置
  const envContent = [
    `JAVA_HOME=${JDK_DIR}`,
    `ANDROID_HOME=${SDK_DIR}`,
    `KEYSTORE_PATH=${keystorePath}`,
    `KEYSTORE_PASSWORD=web2app123`,
    `KEY_ALIAS=web2app`,
    `KEY_PASSWORD=web2app123`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, '.env.android'), envContent);
  console.log('  .env.android 已生成');

  // ===== 验证 =====
  console.log('\n========================================');
  console.log('  环境搭建完成!');
  console.log('========================================');
  console.log(`  JAVA_HOME     = ${JDK_DIR} (${fs.existsSync(JDK_DIR) ? 'OK' : 'MISSING'})`);
  console.log(`  ANDROID_HOME  = ${SDK_DIR} (${fs.existsSync(SDK_DIR) ? 'OK' : 'MISSING'})`);
  console.log(`  KEYSTORE      = ${keystorePath} (${fs.existsSync(keystorePath) ? 'OK' : 'MISSING'})`);

  if (fs.existsSync(SDK_DIR)) {
    try { console.log(`  build-tools   = ${fs.readdirSync(path.join(SDK_DIR, 'build-tools')).join(', ')}`); } catch {}
    try { console.log(`  platforms     = ${fs.readdirSync(path.join(SDK_DIR, 'platforms')).join(', ')}`); } catch {}
  }
}

setup().catch(err => {
  console.error('\n搭建失败:', err.message);
  process.exit(1);
});
