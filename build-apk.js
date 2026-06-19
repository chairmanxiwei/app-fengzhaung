/**
 * APK 构建脚本
 * 接收任务参数，替换模板中的占位符，调用Gradle构建真实APK
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const https = require('https');
const sharp = require('sharp');

const TEMPLATE_DIR = path.join(__dirname, 'android-template');
const BUILD_DIR = path.join(__dirname, 'build-workspace');
const OUTPUT_DIR = path.join(__dirname, 'output');

// 中文路径Junction映射：aapt2等Windows原生工具不支持非ASCII路径
// 优先使用项目内的b目录（纯ASCII路径），避免aapt2中文路径问题
const JUNCTION_BUILD = path.join('d:', 'web2app-build');
const JUNCTION_SDK = 'd:\\web2app-sdk';

/**
 * 确保Junction链接存在，将中文路径映射到纯ASCII路径
 */
function ensureJunctions() {
  // 确保Junction构建根目录存在（使用普通目录，不需要Junction）
  if (!fs.existsSync(JUNCTION_BUILD)) {
    try {
      fs.mkdirSync(JUNCTION_BUILD, { recursive: true });
      console.log(`[Build] 创建构建目录: ${JUNCTION_BUILD}`);
    } catch (e) {
      // D盘根目录可能需要权限，尝试使用其他路径
      console.warn(`[Build] 构建目录创建失败(${e.message})，将使用原始路径`);
    }
  }

  const junctions = [
    { link: JUNCTION_SDK, target: path.join(__dirname, 'android-sdk', 'android-sdk') },
  ];
  for (const { link, target } of junctions) {
    if (!fs.existsSync(link) && fs.existsSync(target)) {
      try {
        execSync(`cmd /c mklink /J "${link}" "${target}"`, { stdio: 'pipe' });
        console.log(`[Build] 创建Junction: ${link} -> ${target}`);
      } catch (e) {
        console.warn(`[Build] Junction创建失败: ${e.message}`);
      }
    }
  }
}

ensureJunctions();

// 加载环境变量
function loadEnv() {
  const envFile = path.join(__dirname, '.env.android');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
}

loadEnv();

const JAVA_HOME = process.env.JAVA_HOME;
const ANDROID_HOME = process.env.ANDROID_HOME;
const KEYSTORE_PATH = process.env.KEYSTORE_PATH;
const KEYSTORE_PASSWORD = process.env.KEYSTORE_PASSWORD || 'web2app123';
const KEY_ALIAS = process.env.KEY_ALIAS || 'web2app';
const KEY_PASSWORD = process.env.KEY_PASSWORD || 'web2app123';

/**
 * 构建APK
 * @param {Object} options
 * @param {string} options.url - 目标网址
 * @param {string} options.appName - 应用名称
 * @param {string} options.packageName - 包名
 * @param {string} options.iconPath - 图标文件路径
 * @param {string} options.taskId - 任务ID
 * @param {Function} options.onProgress - 进度回调
 * @returns {Promise<{apkPath: string, apkSize: number}>}
 */
async function buildAPK({ url, appName, packageName, iconPath, taskId, onProgress }) {
  // 包名校验：确保不为空且格式合法
  if (!packageName || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(packageName)) {
    throw new Error('包名格式无效: ' + (packageName || '(空)') + '，需要至少两段如 com.example.app');
  }

  const workDir = path.join(BUILD_DIR, taskId);

  try {
    // 步骤1: 准备工作区
    onProgress && onProgress('PREPARING', 0, '准备构建环境');
    if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });

    // 复制模板到工作区
    copyDirSync(TEMPLATE_DIR, workDir);

    // 步骤2: 替换模板占位符
    onProgress && onProgress('PREPARING', 20, '注入应用配置');
    replacePlaceholders(workDir, {
      '{{TARGET_URL}}': url,
      '{{APP_NAME}}': appName,
      '{{PACKAGE_NAME}}': packageName,
    });

    // 重命名Java包目录
    renamePackageDir(workDir, packageName);

    // 步骤3: 处理图标
    onProgress && onProgress('PREPARING', 40, '处理应用图标');
    await generateIcons(iconPath, workDir);

    // 步骤4: 创建local.properties
    fs.writeFileSync(
      path.join(workDir, 'local.properties'),
      `sdk.dir=${ANDROID_HOME.replace(/\\/g, '\\\\')}`
    );

    // 步骤5: Gradle构建
    onProgress && onProgress('BUILDING', 50, '编译Android工程');

    const env = {
      ...process.env,
      JAVA_HOME,
      ANDROID_HOME,
      ANDROID_SDK_ROOT: ANDROID_HOME,
    };

    // 为工作区创建Junction链接（避免aapt2中文路径问题）
    let buildWorkDir = workDir;
    if (fs.existsSync(JUNCTION_BUILD)) {
      const taskJunction = path.join(JUNCTION_BUILD, taskId);
      try {
        if (!fs.existsSync(taskJunction)) {
          execSync(`cmd /c mklink /J "${taskJunction}" "${workDir}"`, { stdio: 'pipe' });
        }
        buildWorkDir = taskJunction;
        console.log(`[Build] 使用Junction路径: ${buildWorkDir}`);
      } catch (e) {
        console.warn(`[Build] 工作区Junction创建失败，使用原始路径: ${e.message}`);
      }
    }

    // 使用本地Gradle安装
    const localGradle = path.join(__dirname, 'android-sdk', 'gradle-8.0', 'bin', 'gradle.bat');
    let gradleCmd, gradleArgs;
    if (fs.existsSync(localGradle)) {
      gradleCmd = localGradle;
      gradleArgs = ['assembleRelease', '--no-daemon', '--stacktrace', '--console=plain', '-p', buildWorkDir];
    } else {
      // 回退到wrapper
      const gradlew = path.join(workDir, 'gradlew.bat');
      if (!fs.existsSync(gradlew)) {
        await downloadGradleWrapper(workDir);
      }
      gradleCmd = gradlew;
      gradleArgs = ['assembleRelease', '--no-daemon', '--stacktrace', '--console=plain', '-p', buildWorkDir];
    }
    console.log(`[Build] 执行: ${gradleCmd} ${gradleArgs.join(' ')}`);

    // 使用spawn执行Gradle构建，实时捕获输出并更新进度
    await new Promise((resolve, reject) => {
      const gradleProcess = spawn(gradleCmd, gradleArgs, {
        env,
        cwd: buildWorkDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      const gradleTasks = [
        { pattern: /Task :app:processReleaseResources/, progress: 55, step: '处理资源文件' },
        { pattern: /Task :app:compileReleaseJavaWithJavac/, progress: 60, step: '编译Java代码' },
        { pattern: /Task :app:dexBuilderRelease/, progress: 68, step: 'DEX编译' },
        { pattern: /Task :app:mergeReleaseGlobalSynthetics/, progress: 72, step: '合并合成项' },
        { pattern: /Task :app:optimizeReleaseResources/, progress: 75, step: '优化资源' },
        { pattern: /Task :app:mergeDexRelease/, progress: 78, step: '合并DEX' },
        { pattern: /Task :app:lintVitalAnalyzeRelease/, progress: 80, step: '代码分析' },
        { pattern: /Task :app:packageRelease/, progress: 85, step: '打包APK' },
        { pattern: /Task :app:createReleaseApkListingFileRedirect/, progress: 88, step: '生成APK清单' },
        { pattern: /Task :app:assembleRelease/, progress: 90, step: '组装完成' },
      ];
      let lastReportedProgress = 50;

      gradleProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Gradle]', output.trim());
        // 解析Gradle任务进度
        for (const task of gradleTasks) {
          if (task.pattern.test(output) && task.progress > lastReportedProgress) {
            lastReportedProgress = task.progress;
            onProgress && onProgress('BUILDING', task.progress, task.step);
          }
        }
      });

      gradleProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      gradleProcess.on('close', (code) => {
        if (code === 0) {
          console.log('[Build] Gradle构建成功');
          resolve();
        } else {
          console.error('[Build] Gradle构建失败, exit code:', code);
          console.error('[Build] stderr:', stderr.slice(-1000));
          reject(new Error('Gradle构建失败: ' + stderr.slice(-500)));
        }
      });

      gradleProcess.on('error', (err) => {
        reject(new Error('Gradle进程启动失败: ' + err.message));
      });

      // 设置超时
      setTimeout(() => {
        gradleProcess.kill();
        reject(new Error('Gradle构建超时(10分钟)'));
      }, 600000);
    });

    // 步骤6: 签名APK
    onProgress && onProgress('SIGNING', 80, 'APK签名');

    const unsignedApk = path.join(workDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
    if (!fs.existsSync(unsignedApk)) {
      throw new Error('未找到构建产物: app-release-unsigned.apk');
    }

    // 对齐（apksigner/zipalign是Java程序，支持中文路径，直接使用ANDROID_HOME）
    const zipalign = path.join(ANDROID_HOME, 'build-tools', '34.0.0', 'zipalign.exe');
    const alignedApk = path.join(OUTPUT_DIR, `${taskId}_aligned.apk`);
    if (fs.existsSync(zipalign)) {
      execSync(`"${zipalign}" -f 4 "${unsignedApk}" "${alignedApk}"`, { timeout: 30000 });
    } else {
      fs.copyFileSync(unsignedApk, alignedApk);
    }

    // 签名
    const signedApk = path.join(OUTPUT_DIR, `${taskId}.apk`);
    if (KEYSTORE_PATH && fs.existsSync(KEYSTORE_PATH)) {
      const apksigner = path.join(ANDROID_HOME, 'build-tools', '34.0.0', 'apksigner.bat');
      if (fs.existsSync(apksigner)) {
        execSync(`"${apksigner}" sign --ks "${KEYSTORE_PATH}" --ks-key-alias ${KEY_ALIAS} --ks-pass pass:${KEYSTORE_PASSWORD} --key-pass pass:${KEY_PASSWORD} --out "${signedApk}" "${alignedApk}"`, { timeout: 30000 });
      } else {
        // 使用jarsigner
        const jarsigner = path.join(JAVA_HOME, 'bin', 'jarsigner.exe');
        execSync(`"${jarsigner}" -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${KEYSTORE_PATH}" -storepass ${KEYSTORE_PASSWORD} -keypass ${KEY_PASSWORD} "${alignedApk}" ${KEY_ALIAS}`, { timeout: 30000 });
        fs.copyFileSync(alignedApk, signedApk);
      }
    } else {
      fs.copyFileSync(alignedApk, signedApk);
    }

    // 清理临时文件
    if (fs.existsSync(alignedApk) && alignedApk !== signedApk) {
      fs.unlinkSync(alignedApk);
    }

    const apkSize = fs.statSync(signedApk).size;
    onProgress && onProgress('COMPLETED', 100, '构建完成');

    return { apkPath: signedApk, apkSize };
  } catch (err) {
    console.error(`[Build] 构建失败: ${err.message}`);
    throw err;
  } finally {
    // 清理工作区（保留构建日志用于排查）
    try {
      if (fs.existsSync(workDir)) {
        // 保留最后一次构建的工作区用于调试
        // fs.rmSync(workDir, { recursive: true });
      }
    } catch {}
  }
}

// 复制目录
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 替换占位符
function replacePlaceholders(dir, replacements) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      replacePlaceholders(fullPath, replacements);
    } else if (/\.(java|xml|gradle|properties|pro)$/.test(entry.name)) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      let modified = false;
      for (const [placeholder, value] of Object.entries(replacements)) {
        if (content.includes(placeholder)) {
          content = content.split(placeholder).join(value);
          modified = true;
        }
      }
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf-8');
      }
    }
  }
}

// 重命名Java包目录结构
function renamePackageDir(workDir, packageName) {
  const parts = packageName.split('.');
  const javaBase = path.join(workDir, 'app', 'src', 'main', 'java');
  const oldDir = path.join(javaBase, 'com', 'web2app', 'template');
  const newDir = path.join(javaBase, ...parts);

  if (!fs.existsSync(oldDir)) {
    console.warn('[Build] 旧包目录不存在，跳过重命名:', oldDir);
    return;
  }

  // 读取旧目录中的所有源文件内容
  const files = fs.readdirSync(oldDir).filter(f => fs.statSync(path.join(oldDir, f)).isFile());
  const fileContents = [];
  for (const file of files) {
    const srcFile = path.join(oldDir, file);
    let content = fs.readFileSync(srcFile, 'utf-8');
    content = content.replace(/com\.web2app\.template/g, packageName);
    fileContents.push({ name: file, content });
  }

  // 先删除旧目录及其所有内容（在创建新目录之前）
  fs.rmSync(oldDir, { recursive: true, force: true });

  // 清理可能残留的空父目录（com/web2app 可能还有其他子目录）
  // 逐级向上检查，只删除空目录
  const oldParentChain = [path.join(javaBase, 'com', 'web2app'), path.join(javaBase, 'com')];
  for (const dir of oldParentChain) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {}
  }

  // 创建新目录并写入文件
  fs.mkdirSync(newDir, { recursive: true });
  for (const { name, content } of fileContents) {
    fs.writeFileSync(path.join(newDir, name), content, 'utf-8');
  }

  console.log(`[Build] 包目录重命名: com.web2app.template -> ${packageName} (${files.length} files)`);
}

// 生成多尺寸图标
async function generateIcons(iconPath, workDir) {
  const sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };

  for (const [dir, size] of Object.entries(sizes)) {
    const destDir = path.join(workDir, 'app', 'src', 'main', 'res', dir);
    fs.mkdirSync(destDir, { recursive: true });
    const destFile = path.join(destDir, 'ic_launcher.png');

    if (iconPath && fs.existsSync(iconPath)) {
      try {
        await sharp(iconPath)
          .resize(size, size, { fit: 'cover' })
          .png()
          .toFile(destFile);
      } catch {
        // Sharp处理失败，直接复制
        fs.copyFileSync(iconPath, destFile);
      }
    }
  }
}

// 下载Gradle Wrapper
async function downloadGradleWrapper(workDir) {
  // 创建gradlew.bat
  const gradlewContent = `@rem Gradle wrapper script
@echo off
set DEFAULT_JAVA_HOME=%JAVA_HOME%
if "%JAVA_HOME%"=="" set JAVA_HOME=%DEFAULT_JAVA_HOME%
set CLASSPATH=%~dp0gradle\\wrapper\\gradle-wrapper.jar
"%JAVA_HOME%\\bin\\java.exe" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
`;
  fs.writeFileSync(path.join(workDir, 'gradlew.bat'), gradlewContent);

  // 下载gradle-wrapper.jar
  const wrapperJarDir = path.join(workDir, 'gradle', 'wrapper');
  fs.mkdirSync(wrapperJarDir, { recursive: true });

  const jarUrl = 'https://raw.githubusercontent.com/gradle/gradle/v8.0.0/gradle/wrapper/gradle-wrapper.jar';
  const jarDest = path.join(wrapperJarDir, 'gradle-wrapper.jar');

  if (!fs.existsSync(jarDest)) {
    console.log('[Build] 下载 gradle-wrapper.jar...');
    await new Promise((resolve, reject) => {
      https.get(jarUrl, (res) => {
        if (res.statusCode === 200) {
          const file = fs.createWriteStream(jarDest);
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      }).on('error', reject);
    });
  }
}

// 独立运行测试
if (require.main === module) {
  const testOptions = {
    url: 'https://www.baidu.com',
    appName: 'TestApp',
    packageName: 'com.test.web2app',
    iconPath: process.argv[2] || null,
    taskId: 'test_' + Date.now(),
    onProgress: (status, progress, step) => {
      console.log(`[${status}] ${progress}% - ${step}`);
    }
  };

  if (!JAVA_HOME || !ANDROID_HOME) {
    console.error('错误: 请先运行 node setup-android-env.js 安装构建环境');
    console.error('JAVA_HOME:', JAVA_HOME || '未设置');
    console.error('ANDROID_HOME:', ANDROID_HOME || '未设置');
    process.exit(1);
  }

  buildAPK(testOptions)
    .then(({ apkPath, apkSize }) => {
      console.log(`\n构建成功!`);
      console.log(`APK路径: ${apkPath}`);
      console.log(`APK大小: ${(apkSize / 1024 / 1024).toFixed(2)} MB`);
    })
    .catch(err => {
      console.error(`\n构建失败: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { buildAPK };
