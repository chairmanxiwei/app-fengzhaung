/**
 * 任务路由 - /api/tasks/* + /api/generate + /api/download + /api/quota
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const taskService = require('../services/taskService');
const logService = require('../services/logService');

// Multer 配置
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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

// ========== POST /api/generate ==========
router.post('/generate', optionalAuth, upload.single('icon'), (req, res) => {
  if (req.fileValidationError) {
    return res.status(400).json({ success: false, message: req.fileValidationError, errorCode: 'FILE_INVALID' });
  }

  const url = req.body.url;
  const appName = req.body.appName || '';
  const packageName = req.body.packageName || '';
  const iconFile = req.file;
  const userId = req.user ? req.user.id : null;
  const ip = req.ip || req.connection.remoteAddress;

  // 参数校验
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, message: '请输入网站地址', errorCode: 'URL_INVALID' });
  }

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
    return res.status(400).json({ success: false, message: '包名格式不正确', errorCode: 'PACKAGE_NAME_INVALID' });
  }

  // 构建环境检查
  const envFile = path.join(__dirname, '..', '.env.android');
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
    return res.status(503).json({
      success: false,
      message: '构建环境未就绪，请先运行 node setup-android-env.js 安装 Android 构建环境',
      errorCode: 'BUILD_ENV_NOT_READY'
    });
  }

  // 配额检查
  const quotaCheck = taskService.checkQuota(userId, ip);
  if (!quotaCheck.ok) {
    return res.status(429).json({ success: false, message: quotaCheck.message, errorCode: quotaCheck.errorCode });
  }

  try {
    const finalAppName = appName || resolvedUrl.replace(/^https?:\/\//, '').split('.')[0];
    const finalPackageName = packageName || `com.webpackage.app${crypto.randomBytes(3).toString('hex')}`;

    const result = taskService.createTask({
      userId,
      url: resolvedUrl,
      appName: finalAppName,
      packageName: finalPackageName,
      iconPath: iconFile.path,
      iconOriginalName: iconFile.originalname,
      ip,
    });

    // 记录操作日志
    logService.logAction({
      userId,
      taskId: result.taskId,
      action: 'CREATE',
      detail: { url: resolvedUrl, appName: finalAppName, packageName: finalPackageName },
      ip,
    });

    // 触发构建（由 server.js 中的 simulateBuild 处理）
    if (req.app.get('buildHandler')) {
      req.app.get('buildHandler')(result.taskId);
    }

    res.status(201).json({
      success: true,
      taskId: result.taskId,
      message: '任务创建成功',
      estimatedTime: 45,
      websocketUrl: `/ws/${result.taskId}`,
    });
  } catch (err) {
    console.error('[Generate] 任务创建异常:', err.message);
    res.status(500).json({ success: false, message: '任务创建失败: ' + err.message, errorCode: 'INTERNAL_ERROR' });
  }
});

// ========== GET /api/quota ==========
router.get('/quota', optionalAuth, (req, res) => {
  const userId = req.user ? req.user.id : null;
  const ip = req.ip || req.connection.remoteAddress;
  const quota = taskService.getQuota(userId, ip);
  res.json({ success: true, data: quota });
});

// ========== GET /api/tasks ==========
router.get('/tasks', requireAuth, (req, res) => {
  const { page, limit, status, category_id, search, favorite, show_deleted, deleted_only, sort, order } = req.query;
  const result = taskService.getTasksByUser(req.user.id, {
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 20, 50),
    status,
    categoryId: category_id,
    search,
    favorite,
    showDeleted: show_deleted === '1',
    deletedOnly: deleted_only === '1',
    sort,
    order,
  });
  res.json({ success: true, data: result });
});

// ========== GET /api/tasks/:id ==========
router.get('/tasks/:id', optionalAuth, (req, res) => {
  const task = taskService.getTask(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在', errorCode: 'TASK_NOT_FOUND' });
  }

  // 隐私检查：非本人任务只返回基本信息
  const isOwner = req.user && task.user_id === req.user.id;
  const steps = [
    { name: 'validating', status: 'pending', progress: 0 },
    { name: 'preparing', status: 'pending', progress: 0 },
    { name: 'building', status: 'pending', progress: 0 },
    { name: 'signing', status: 'pending', progress: 0 },
    { name: 'uploading', status: 'pending', progress: 0 },
  ];

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
      currentStep: task.current_step,
      steps,
      startedAt: task.created_at,
      estimatedRemaining: task.status === 'COMPLETED' ? 0 : Math.max(0, 45 - Math.round((Date.now() - new Date(task.created_at).getTime()) / 1000)),
      url: task.url,
      appName: task.app_name,
      downloadToken: task.status === 'COMPLETED' ? task.download_token : null,
      apkSize: task.apk_size,
    }
  });
});

// ========== PUT /api/tasks/:id/rename ==========
router.put('/tasks/:id/rename', requireAuth, (req, res) => {
  const { displayName } = req.body;
  if (!displayName || displayName.trim().length === 0 || displayName.trim().length > 30) {
    return res.status(400).json({ success: false, message: '名称需1-30个字符', errorCode: 'INVALID_NAME' });
  }
  const task = taskService.getTask(req.params.id);
  const oldName = task ? (task.display_name || task.app_name) : '';
  const result = taskService.renameTask(req.params.id, req.user.id, displayName.trim());
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message || '重命名失败', errorCode: result.errorCode });
  }
  logService.logAction({ userId: req.user.id, taskId: req.params.id, action: 'RENAME', detail: { oldName, newName: displayName.trim() }, ip: req.ip });
  res.json({ success: true });
});

// ========== PUT /api/tasks/:id/move ==========
router.put('/tasks/:id/move', requireAuth, (req, res) => {
  const { categoryId } = req.body;
  const task = taskService.getTask(req.params.id);
  const oldCatId = task ? task.category_id : null;
  const result = taskService.moveTask(req.params.id, req.user.id, categoryId);
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message || '移动失败', errorCode: result.errorCode });
  }
  logService.logAction({ userId: req.user.id, taskId: req.params.id, action: 'MOVE_CATEGORY', detail: { oldCategoryId: oldCatId, newCategoryId: categoryId }, ip: req.ip });
  res.json({ success: true });
});

// ========== DELETE /api/tasks/:id ==========
router.delete('/tasks/:id', requireAuth, (req, res) => {
  const result = taskService.deleteTask(req.params.id, req.user.id);
  if (!result.ok) {
    return res.status(404).json({ success: false, message: '任务不存在或无权删除', errorCode: result.errorCode });
  }
  logService.logAction({ userId: req.user.id, taskId: req.params.id, action: 'DELETE', detail: { appName: result.task?.app_name }, ip: req.ip });
  res.json({ success: true });
});

// ========== PUT /api/tasks/:id/favorite ==========
router.put('/tasks/:id/favorite', requireAuth, (req, res) => {
  const result = taskService.toggleFavorite(req.params.id, req.user.id);
  if (!result.ok) {
    return res.status(404).json({ success: false, message: '任务不存在', errorCode: result.errorCode });
  }
  logService.logAction({ userId: req.user.id, taskId: req.params.id, action: 'FAVORITE', detail: { isFavorite: result.isFavorite }, ip: req.ip });
  res.json({ success: true, data: { isFavorite: result.isFavorite } });
});

// ========== PUT /api/tasks/:id/note ==========
router.put('/tasks/:id/note', requireAuth, (req, res) => {
  const { note } = req.body;
  if (note && note.length > 500) {
    return res.status(400).json({ success: false, message: '备注不能超过500个字符', errorCode: 'NOTE_TOO_LONG' });
  }
  const result = taskService.updateNote(req.params.id, req.user.id, note || null);
  if (!result.ok) {
    return res.status(404).json({ success: false, message: '任务不存在', errorCode: result.errorCode });
  }
  logService.logAction({ userId: req.user.id, taskId: req.params.id, action: 'UPDATE_NOTE', detail: { noteLength: (note || '').length }, ip: req.ip });
  res.json({ success: true });
});

// ========== POST /api/tasks/migrate ==========
router.post('/tasks/migrate', requireAuth, (req, res) => {
  const { taskIds } = req.body;
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ success: false, message: '请提供要迁移的任务ID', errorCode: 'MISSING_FIELDS' });
  }
  const result = taskService.migrateTasks(taskIds, req.user.id);
  res.json({ success: true, migratedCount: result.migratedCount });
});

// ========== GET /api/download/:taskId ==========
router.get('/download/:taskId', (req, res) => {
  const task = taskService.getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ success: false, message: '任务不存在', errorCode: 'TASK_NOT_FOUND' });
  }

  const { token } = req.query;
  if (!token || token !== task.download_token) {
    return res.status(403).json({ success: false, message: '下载令牌无效', errorCode: 'TOKEN_INVALID' });
  }

  // 登录用户（user_id存在）不检查过期和下载次数
  const isLoggedIn = !!task.user_id;

  if (!isLoggedIn) {
    if (task.expires_at && new Date() > new Date(task.expires_at)) {
      return res.status(410).json({ success: false, message: '下载链接已过期', errorCode: 'TOKEN_EXPIRED' });
    }
    if (task.max_downloads > 0 && task.download_count >= task.max_downloads) {
      return res.status(429).json({ success: false, message: '下载次数已达上限', errorCode: 'DOWNLOAD_LIMIT' });
    }
  }

  if (!task.apk_path || !fs.existsSync(task.apk_path)) {
    return res.status(404).json({ success: false, message: 'APK文件不存在或已被删除', errorCode: 'FILE_NOT_FOUND' });
  }

  if (task.apk_deleted) {
    return res.status(410).json({ success: false, message: 'APK文件已被删除', errorCode: 'FILE_DELETED' });
  }

  // 更新下载次数（登录用户也记录，但不限次数）
  taskService.updateTask(task.id, { download_count: task.download_count + 1 });

  logService.logAction({ userId: task.user_id, taskId: task.id, action: 'DOWNLOAD', detail: { fileName: `${task.app_name}.apk` }, ip: req.ip });

  const filename = `${task.app_name || 'app'}.apk`;
  const actualSize = fs.statSync(task.apk_path).size;
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', actualSize);

  const fileStream = fs.createReadStream(task.apk_path);
  fileStream.pipe(res);
});

module.exports = router;
