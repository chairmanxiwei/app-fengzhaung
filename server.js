const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const { buildAPK } = require('./build-apk');

// 初始化数据库
const { getDB } = require('./db/database');
const db = getDB(); // 确保表已创建

// 服务
const taskService = require('./services/taskService');
const logService = require('./services/logService');
const cleanService = require('./services/cleanService');

// 路由
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const categoryRoutes = require('./routes/categories');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 目录初始化 ==========
const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
const dataDir = path.join(__dirname, 'data');
[uploadDir, outputDir, dataDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

// ========== 挂载API路由 ==========
app.use('/api/auth', authRoutes);
app.use('/api', taskRoutes);       // /api/generate, /api/tasks, /api/download, /api/quota
app.use('/api/categories', categoryRoutes);

// ========== API-001: 网址验证 ==========
app.post('/api/validate-url', rateLimit(60, 60000), async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.json({ valid: false, message: '请输入网站地址', errorCode: 'MISSING_PARAMETER' });
  }

  const trimmed = url.trim();
  let resolvedUrl = trimmed;

  if (!/^https?:\/\//i.test(resolvedUrl)) {
    resolvedUrl = 'https://' + resolvedUrl;
  }

  const urlPattern = /^https?:\/\/([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
  if (!urlPattern.test(resolvedUrl)) {
    return res.json({ valid: false, message: '网址格式不正确，请输入完整的URL', errorCode: 'INVALID_URL_FORMAT' });
  }

  try {
    const hostname = new URL(resolvedUrl).hostname;
    const blocked = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0)/;
    if (blocked.test(hostname)) {
      return res.json({ valid: false, message: '不支持内网地址', errorCode: 'URL_SECURITY_RISK' });
    }
  } catch {
    return res.json({ valid: false, message: '网址解析失败', errorCode: 'INVALID_URL_FORMAT' });
  }

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

    if (resolvedUrl.startsWith('http://')) {
      return res.json({ valid: true, message: '网址格式正确（建议使用 HTTPS 协议）', warning: true, resolvedUrl });
    }
    res.json({ valid: true, message: '网址验证通过', resolvedUrl });
  } catch (e) {
    if (resolvedUrl.startsWith('http://')) {
      return res.json({ valid: true, message: '网址格式正确，但无法访问（建议使用 HTTPS）', warning: true, resolvedUrl });
    }
    res.json({ valid: true, message: '网址格式正确，但暂时无法访问', resolvedUrl, warning: true });
  }
});

// ========== API-002: 图标上传 ==========
const multer = require('multer');
const iconStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `icon_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const iconUpload = multer({
  storage: iconStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

app.post('/api/upload-icon', rateLimit(30, 60000), iconUpload.single('icon'), (req, res) => {
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

// ========== 构建处理函数（供路由调用） ==========
function handleBuild(taskId) {
  simulateBuild(taskId);
}

// 注册构建处理器到app，供路由使用
app.set('buildHandler', handleBuild);

// ========== 真实Gradle构建流程 ==========
const BUILD_STEPS = [
  { name: 'validating', label: '验证网址和图标', progress: 10 },
  { name: 'preparing', label: '准备构建环境', progress: 25 },
  { name: 'building', label: '编译Android工程', progress: 65 },
  { name: 'signing', label: 'APK签名', progress: 85 },
  { name: 'completed', label: '构建完成', progress: 100 },
];

async function runRealBuild(taskId) {
  const task = taskService.getTask(taskId);
  if (!task) return;

  taskService.updateTask(taskId, {
    status: 'PREPARING',
    progress: 10,
    current_step: '准备构建环境',
  });
  broadcastProgress(taskId, {
    type: 'progress',
    taskId,
    status: 'PREPARING',
    progress: 10,
    currentStep: '准备构建环境',
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await buildAPK({
      url: task.url,
      appName: task.app_name,
      packageName: task.package_name,
      iconPath: task.icon_path,
      taskId: taskId,
      onProgress: (status, progress, step) => {
        taskService.updateTask(taskId, {
          status: status,
          progress: progress,
          current_step: step,
        });
        broadcastProgress(taskId, {
          type: 'progress',
          taskId,
          status: status,
          progress: progress,
          currentStep: step,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // 构建成功
    const apkSize = (result.apkSize && result.apkSize > 102400) ? result.apkSize : 0;
    taskService.updateTask(taskId, {
      status: 'COMPLETED',
      progress: 100,
      current_step: '构建完成',
      apk_path: result.apkPath,
      apk_size: apkSize,
    });

    const t = taskService.getTask(taskId);
    broadcastProgress(taskId, {
      type: 'completed',
      taskId,
      status: 'COMPLETED',
      progress: 100,
      downloadUrl: `/api/download/${taskId}?token=${t.download_token}`,
      fileSize: result.apkSize,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Build] 任务 ${taskId} 构建失败:`, err.message);
    taskService.updateTask(taskId, {
      status: 'FAILED',
      current_step: '构建失败',
      error_message: err.message,
    });
    broadcastProgress(taskId, {
      type: 'error',
      taskId,
      status: 'FAILED',
      progress: taskService.getTask(taskId)?.progress || 0,
      currentStep: '构建失败',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

function simulateBuild(taskId) {
  setTimeout(() => {
    runRealBuild(taskId);
  }, 1000);
}

// ========== WebSocket 进度推送 ==========
const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  clientTracking: true,
  maxPayload: 1024,
});

const wsClients = new Map();

const HEARTBEAT_INTERVAL = 30000;
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
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
  ws.isAlive = true;
  ws.connectedAt = Date.now();

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const urlPath = req.url.split('?')[0];
  const pathPrefix = '/ws/';

  if (!urlPath.startsWith(pathPrefix)) {
    ws.close(4002, 'Invalid path');
    return;
  }

  const taskId = urlPath.slice(pathPrefix.length);
  if (!taskId) {
    ws.close(4001, 'Missing taskId');
    return;
  }

  ws.taskId = taskId;

  if (!wsClients.has(taskId)) wsClients.set(taskId, new Set());
  wsClients.get(taskId).add(ws);

  // 立即发送当前状态
  const task = taskService.getTask(taskId);
  if (task) {
    safeSend(ws, {
      type: 'progress',
      taskId,
      status: task.status,
      progress: task.progress,
      currentStep: task.current_step,
      timestamp: new Date().toISOString(),
    });
  }

  ws.on('close', () => {
    const clients = wsClients.get(taskId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) wsClients.delete(taskId);
    }
  });

  ws.on('error', () => {});
});

function safeSend(ws, data) {
  if (ws.readyState !== 1) return;
  try {
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  } catch {}
}

function broadcastProgress(taskId, data) {
  const clients = wsClients.get(taskId);
  if (!clients) return;
  const message = JSON.stringify(data);
  const deadSockets = [];

  clients.forEach(ws => {
    if (ws.readyState === 1) {
      try { ws.send(message); } catch { deadSockets.push(ws); }
    } else if (ws.readyState >= 2) {
      deadSockets.push(ws);
    }
  });

  deadSockets.forEach(ws => {
    clients.delete(ws);
    try { ws.terminate(); } catch {}
  });

  if (clients.size === 0) wsClients.delete(taskId);
}

// ========== 过期清理（每小时执行） ==========
setInterval(() => {
  cleanService.runAllCleanups();
}, 60 * 60 * 1000);

// 启动时也执行一次
setTimeout(() => cleanService.runAllCleanups(), 5000);

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

// ========== 启动服务器 ==========
server.listen(PORT, () => {
  console.log(`Web-Package 服务器运行在 http://localhost:${PORT}`);
  console.log(`WebSocket 服务路径: ws://localhost:${PORT}/ws/:taskId`);
  console.log(`数据库: ${path.join(dataDir, 'webpackage.db')}`);
});
