const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { buildAPK } = require('./build-apk');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 目录初始化 ==========
const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
const dataDir = path.join(__dirname, 'data');
[uploadDir, outputDir, dataDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========== 简易数据库（SQLite风格JSON文件） ==========
const DB_PATH = path.join(dataDir, 'tasks.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { tasks: [] };
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { return { tasks: [] }; }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function getTask(taskId) {
  return loadDB().tasks.find(t => t.id === taskId);
}

function upsertTask(task) {
  const db = loadDB();
  const idx = db.tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) db.tasks[idx] = task;
  else db.tasks.push(task);
  saveDB(db);
}

// ========== Multer 文件上传配置 ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `icon_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ========== 中间件 ==========
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 简易限流
const rateLimitMap = new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
    record.count++;
    rateLimitMap.set(key, record);
    if (record.count > maxRequests) {
      return res.status(429).json({ success: false, errorCode: 'RATE_LIMIT_EXCEEDED', message: '请求频率超限，请稍后重试' });
    }
    next();
  };
}

// ========== 页面路由 ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== API-001: 网址验证 ==========
app.post('/api/validate-url', rateLimit(60, 60000), async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.json({ valid: false, message: '请输入网站地址', errorCode: 'MISSING_PARAMETER' });
  }

  const trimmed = url.trim();
  let resolvedUrl = trimmed;

  // 自动补全协议
  if (!/^https?:\/\//i.test(resolvedUrl)) {
    resolvedUrl = 'https://' + resolvedUrl;
  }

  // 格式校验
  const urlPattern = /^https?:\/\/([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
  if (!urlPattern.test(resolvedUrl)) {
    return res.json({ valid: false, message: '网址格式不正确，请输入完整的URL', errorCode: 'INVALID_URL_FORMAT' });
  }

  // 安全检查：禁止内网地址
  try {
    const hostname = new URL(resolvedUrl).hostname;
    const blocked = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0)/;
    if (blocked.test(hostname)) {
      return res.json({ valid: false, message: '不支持内网地址', errorCode: 'URL_SECURITY_RISK' });
    }
  } catch {
    return res.json({ valid: false, message: '网址解析失败', errorCode: 'INVALID_URL_FORMAT' });
  }

  // 可达性检测
  try {
    const parsedUrl = new URL(resolvedUrl);
    const requestModule = parsedUrl.protocol === 'https:' ? require('https') : require('http');
    await new Promise((resolve, reject) => {
      const req = requestModule.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname || '/',
        method: 'HEAD',
        timeout: 3000,
      }, (response) => {
        if (response.statusCode < 400) resolve();
        else reject(new Error(`HTTP ${response.statusCode}`));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    // HTTP协议警告
    if (resolvedUrl.startsWith('http://')) {
      return res.json({
        valid: true,
        message: '网址格式正确（建议使用 HTTPS 协议）',
        warning: true,
        resolvedUrl
      });
    }

    res.json({ valid: true, message: '网址验证通过', resolvedUrl });
  } catch (e) {
    // 可达性失败但格式正确，仍允许（网站可能临时不可用）
    if (resolvedUrl.startsWith('http://')) {
      return res.json({
        valid: true,
        message: '网址格式正确，但无法访问（建议使用 HTTPS）',
        warning: true,
        resolvedUrl
      });
    }
    res.json({ valid: true, message: '网址格式正确，但暂时无法访问', resolvedUrl, warning: true });
  }
});

// ========== API-002: 图标上传 ==========
app.post('/api/upload-icon', rateLimit(30, 60000), upload.single('icon'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '请选择文件', errorCode: 'FILE_MISSING' });
  }

  res.json({
    success: true,
    message: '图标上传成功',
    file: {
      originalName: req.file.originalname,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      format: path.extname(req.file.originalname).toLowerCase().replace('.', '')
    }
  });
});

// ========== API-003: 创建构建任务 ==========
app.post('/api/generate', rateLimit(20, 3600000), upload.single('icon'), (req, res) => {
  // multer错误处理（文件超限等）
  if (req.fileValidationError) {
    return res.status(400).json({ success: false, message: req.fileValidationError, errorCode: 'FILE_INVALID' });
  }

  // 参数提取（multer解析multipart后，text字段在req.body）
  const url = req.body.url;
  const appName = req.body.appName || '';
  const packageName = req.body.packageName || '';
  const iconFile = req.file;

  // 参数校验
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, message: '请输入网站地址', errorCode: 'URL_INVALID' });
  }

  // URL格式校验
  let resolvedUrl = url.trim();
  if (!/^https?:\/\//i.test(resolvedUrl)) resolvedUrl = 'https://' + resolvedUrl;
  const urlPattern = /^https?:\/\/([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
  if (!urlPattern.test(resolvedUrl)) {
    return res.status(400).json({ success: false, message: '网址格式无效', errorCode: 'URL_INVALID' });
  }

  if (!iconFile) {
    return res.status(400).json({ success: false, message: '请上传应用图标', errorCode: 'ICON_MISSING' });
  }

  if (appName && appName.length > 30) {
    return res.status(400).json({ success: false, message: '应用名称不能超过30个字符', errorCode: 'APP_NAME_TOO_LONG' });
  }

  if (packageName && !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(packageName)) {
    return res.status(400).json({ success: false, message: '包名格式不正确，至少需要两段（如 com.example.app）', errorCode: 'PACKAGE_NAME_INVALID' });
  }

  // 构建环境检查
  const envFile = path.join(__dirname, '.env.android');
  let javaHome, androidHome;
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        if (key === 'JAVA_HOME') javaHome = match[2].trim();
        if (key === 'ANDROID_HOME') androidHome = match[2].trim();
      }
    });
  }
  if (!javaHome || !androidHome || !fs.existsSync(javaHome) || !fs.existsSync(androidHome)) {
    console.error('[Generate] 构建环境未就绪: JAVA_HOME=' + javaHome + ', ANDROID_HOME=' + androidHome);
    return res.status(503).json({
      success: false,
      message: '构建环境未就绪，请先运行 node setup-android-env.js 安装 Android 构建环境',
      errorCode: 'BUILD_ENV_NOT_READY'
    });
  }

  try {
    // 创建任务
    const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const downloadToken = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const task = {
      id: taskId,
      url: resolvedUrl,
      appName: appName || resolvedUrl.replace(/^https?:\/\//, '').split('.')[0],
      packageName: packageName || `com.webpackage.app${crypto.randomBytes(3).toString('hex')}`,
      iconPath: iconFile.path,
      iconOriginalName: iconFile.originalname,
      status: 'QUEUED',
      progress: 0,
      currentStep: '排队等待中',
      errorCode: null,
      errorMessage: null,
      apkPath: null,
      apkSize: null,
      downloadToken,
      downloadCount: 0,
      maxDownloads: 5,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    upsertTask(task);

    // 启动构建流程（异步）
    simulateBuild(taskId);

    res.status(201).json({
      success: true,
      taskId,
      message: '任务创建成功',
      estimatedTime: 45,
      websocketUrl: `/ws/${taskId}`
    });
  } catch (err) {
    console.error('[Generate] 任务创建异常:', err.message);
    res.status(500).json({ success: false, message: '任务创建失败: ' + err.message, errorCode: 'INTERNAL_ERROR' });
  }
});

// ========== API-004: 查询任务状态 ==========
app.get('/api/task/:taskId', (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在', errorCode: 'TASK_NOT_FOUND' });
  }

  const steps = [
    { name: 'validating', status: 'pending', progress: 0 },
    { name: 'preparing', status: 'pending', progress: 0 },
    { name: 'building', status: 'pending', progress: 0 },
    { name: 'signing', status: 'pending', progress: 0 },
    { name: 'uploading', status: 'pending', progress: 0 },
  ];

  // 根据progress映射步骤状态
  const progressMap = [
    { step: 0, maxProgress: 10 },
    { step: 1, maxProgress: 25 },
    { step: 2, maxProgress: 65 },
    { step: 3, maxProgress: 85 },
    { step: 4, maxProgress: 100 },
  ];

  for (let i = 0; i < progressMap.length; i++) {
    const { step, maxProgress } = progressMap[i];
    const prevMax = i > 0 ? progressMap[i - 1].maxProgress : 0;
    if (task.progress >= maxProgress) {
      steps[step].status = 'completed';
      steps[step].progress = 100;
    } else if (task.progress > prevMax) {
      steps[step].status = 'active';
      steps[step].progress = Math.round(((task.progress - prevMax) / (maxProgress - prevMax)) * 100);
    }
  }

  res.json({
    success: true,
    data: {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      currentStep: task.currentStep,
      steps,
      startedAt: task.createdAt,
      estimatedRemaining: task.status === 'COMPLETED' ? 0 : Math.max(0, 45 - Math.round((Date.now() - new Date(task.createdAt).getTime()) / 1000)),
      url: task.url,
      appName: task.appName,
      downloadToken: task.status === 'COMPLETED' ? task.downloadToken : null,
      apkSize: task.apkSize,
    }
  });
});

// ========== API-006: 下载APK ==========
app.get('/api/download/:taskId', (req, res) => {
  const task = getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在', errorCode: 'TASK_NOT_FOUND' });
  }

  const { token } = req.query;
  if (!token || token !== task.downloadToken) {
    return res.status(403).json({ success: false, message: '下载令牌无效', errorCode: 'TOKEN_INVALID' });
  }

  if (new Date() > new Date(task.expiresAt)) {
    return res.status(410).json({ success: false, message: '下载链接已过期', errorCode: 'TOKEN_EXPIRED' });
  }

  if (task.downloadCount >= task.maxDownloads) {
    return res.status(429).json({ success: false, message: '下载次数已达上限', errorCode: 'DOWNLOAD_LIMIT' });
  }

  if (!task.apkPath || !fs.existsSync(task.apkPath)) {
    return res.status(404).json({ success: false, message: 'APK文件不存在', errorCode: 'FILE_NOT_FOUND' });
  }

  // 记录下载次数
  task.downloadCount++;
  upsertTask(task);

  const filename = `${task.appName || 'app'}.apk`;
  const actualSize = fs.statSync(task.apkPath).size;
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', actualSize);

  const fileStream = fs.createReadStream(task.apkPath);
  fileStream.pipe(res);
});

// ========== 静态文件 ==========
app.use('/uploads', express.static(uploadDir));

// ========== Multer 错误处理中间件 ==========
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: '文件大小超过 5MB 限制', errorCode: 'FILE_TOO_LARGE' });
    }
    return res.status(400).json({ success: false, message: '文件上传错误: ' + err.message, errorCode: 'UPLOAD_ERROR' });
  }
  if (err) {
    console.error('[Server] 未捕获错误:', err.message);
    return res.status(500).json({ success: false, message: '服务器内部错误', errorCode: 'INTERNAL_ERROR' });
  }
  next();
});

// ========== 真实Gradle构建流程 ==========
const BUILD_STEPS = [
  { name: 'validating', label: '验证网址和图标', progress: 10 },
  { name: 'preparing', label: '准备构建环境', progress: 25 },
  { name: 'building', label: '编译Android工程', progress: 65 },
  { name: 'signing', label: 'APK签名', progress: 85 },
  { name: 'completed', label: '构建完成', progress: 100 },
];

async function runRealBuild(taskId) {
  const task = getTask(taskId);
  if (!task) return;

  // 更新状态：准备中
  task.status = 'PREPARING';
  task.progress = 10;
  task.currentStep = '准备构建环境';
  task.updatedAt = new Date().toISOString();
  upsertTask(task);
  broadcastProgress(taskId, {
    type: 'progress',
    taskId,
    status: task.status,
    progress: task.progress,
    currentStep: task.currentStep,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await buildAPK({
      url: task.url,
      appName: task.appName,
      packageName: task.packageName,
      iconPath: task.iconPath,
      taskId: taskId,
      onProgress: (status, progress, step) => {
        const t = getTask(taskId);
        if (t) {
          t.status = status;
          t.progress = progress;
          t.currentStep = step;
          t.updatedAt = new Date().toISOString();
          upsertTask(t);
          broadcastProgress(taskId, {
            type: 'progress',
            taskId,
            status: status,
            progress: progress,
            currentStep: step,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // 构建成功
    const t = getTask(taskId);
    if (t) {
      t.status = 'COMPLETED';
      t.progress = 100;
      t.currentStep = '构建完成';
      t.apkPath = result.apkPath;
      // 验证APK大小：真实APK应大于100KB，否则可能为无效文件
      t.apkSize = (result.apkSize && result.apkSize > 102400) ? result.apkSize : 0;
      t.updatedAt = new Date().toISOString();
      upsertTask(t);
      broadcastProgress(taskId, {
        type: 'completed',
        taskId,
        status: 'COMPLETED',
        progress: 100,
        downloadUrl: `/api/download/${taskId}?token=${t.downloadToken}`,
        fileSize: result.apkSize,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`[Build] 任务 ${taskId} 构建失败:`, err.message);
    const t = getTask(taskId);
    if (t) {
      t.status = 'FAILED';
      t.currentStep = '构建失败';
      t.errorMessage = err.message;
      t.updatedAt = new Date().toISOString();
      upsertTask(t);
      broadcastProgress(taskId, {
        type: 'error',
        taskId,
        status: 'FAILED',
        progress: t.progress,
        currentStep: '构建失败',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

function simulateBuild(taskId) {
  // 延迟启动，模拟排队
  setTimeout(() => {
    runRealBuild(taskId);
  }, 1000);
}

// ========== WebSocket 进度推送 ==========
const server = http.createServer(app);
// 注意：不使用 path 选项，因为 ws 库的 path 是精确匹配（/ws != /ws/taskId）
// 改为在 connection 事件中手动校验路径前缀
const wss = new WebSocketServer({
  server,
  // 客户端空闲超过120秒未响应ping则断开
  clientTracking: true,
  maxPayload: 1024, // 限制消息大小1KB，防止大包攻击
});

const wsClients = new Map(); // taskId -> Set<WebSocket>

// 心跳检测：每30秒向所有客户端发送ping
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000; // 10秒内未收到pong视为断开

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    // 如果上次ping还没收到pong，说明连接已死
    if (!ws.isAlive) {
      console.log(`[WS] 心跳超时，终止连接: ${ws.taskId || 'unknown'}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

wss.on('connection', (ws, req) => {
  // 初始化心跳标记
  ws.isAlive = true;
  ws.connectedAt = Date.now();

  // 监听pong响应
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // req.url 形如: /ws/task_xxx 或 /ws/task_xxx?token=yyy
  const urlPath = req.url.split('?')[0]; // 去掉查询参数
  const pathPrefix = '/ws/';

  if (!urlPath.startsWith(pathPrefix)) {
    ws.close(4002, 'Invalid path');
    return;
  }

  // 从URL路径提取taskId: /ws/task_xxx → task_xxx
  const taskId = urlPath.slice(pathPrefix.length);

  if (!taskId) {
    ws.close(4001, 'Missing taskId');
    return;
  }

  // 记录taskId到ws对象上，方便日志排查
  ws.taskId = taskId;

  // 注册客户端
  if (!wsClients.has(taskId)) wsClients.set(taskId, new Set());
  wsClients.get(taskId).add(ws);

  console.log(`[WS] 客户端连接: taskId=${taskId}, 当前连接数=${wsClients.get(taskId).size}`);

  // 立即发送当前状态
  const task = getTask(taskId);
  if (task) {
    safeSend(ws, {
      type: 'progress',
      taskId,
      status: task.status,
      progress: task.progress,
      currentStep: task.currentStep,
      timestamp: new Date().toISOString(),
    });
  }

  ws.on('close', (code, reason) => {
    console.log(`[WS] 连接关闭: taskId=${taskId}, code=${code}, reason=${reason || '无'}`);
    const clients = wsClients.get(taskId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) wsClients.delete(taskId);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] 连接错误: taskId=${taskId}, error=${err.message}`);
    // 不主动关闭，让close事件处理清理
  });
});

// 安全发送消息：捕获发送异常，防止向半关闭socket发送时崩溃
function safeSend(ws, data) {
  if (ws.readyState !== 1) return; // 非OPEN状态跳过
  try {
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  } catch (err) {
    console.error(`[WS] 发送失败: taskId=${ws.taskId}, error=${err.message}`);
  }
}

function broadcastProgress(taskId, data) {
  const clients = wsClients.get(taskId);
  if (!clients) return;
  const message = JSON.stringify(data);
  const deadSockets = [];

  clients.forEach(ws => {
    if (ws.readyState === 1) { // OPEN
      try {
        ws.send(message);
      } catch (err) {
        console.error(`[WS] 广播发送失败: taskId=${taskId}, error=${err.message}`);
        deadSockets.push(ws);
      }
    } else if (ws.readyState >= 2) { // CLOSING or CLOSED
      deadSockets.push(ws);
    }
  });

  // 清理已死亡的socket
  deadSockets.forEach(ws => {
    clients.delete(ws);
    try { ws.terminate(); } catch {}
  });

  if (clients.size === 0) wsClients.delete(taskId);
}

// ========== 过期文件清理（每小时执行） ==========
setInterval(() => {
  const db = loadDB();
  const now = new Date();
  let cleaned = 0;

  db.tasks = db.tasks.filter(task => {
    if (task.expiresAt && new Date(task.expiresAt) < now) {
      // 删除APK文件
      if (task.apkPath && fs.existsSync(task.apkPath)) {
        fs.unlinkSync(task.apkPath);
      }
      // 删除图标文件
      if (task.iconPath && fs.existsSync(task.iconPath)) {
        fs.unlinkSync(task.iconPath);
      }
      cleaned++;
      return false;
    }
    return true;
  });

  if (cleaned > 0) {
    saveDB(db);
    console.log(`[Cleanup] 已清理 ${cleaned} 个过期任务`);
  }
}, 60 * 60 * 1000);

// ========== 启动服务器 ==========
server.listen(PORT, () => {
  console.log(`Web-Package 服务器运行在 http://localhost:${PORT}`);
  console.log(`WebSocket 服务路径: ws://localhost:${PORT}/ws/:taskId`);
});
