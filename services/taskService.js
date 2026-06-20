/**
 * 任务服务 - CRUD、配额检查、状态管理、收藏、备注
 */
const crypto = require('crypto');
const { getDB } = require('../db/database');

// 配额常量
const QUOTA_LOGGED_IN = 20;   // 登录用户每日配额
const QUOTA_GUEST = 3;        // 未登录用户每日配额
const DOWNLOAD_LIMIT_GUEST = 5;
const DOWNLOAD_LIMIT_LOGGED = -1; // -1 = 无限

function getQuota(userId, ip) {
  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  if (userId) {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM quota_usage WHERE user_id = ? AND date(used_at) = ?"
    ).get(userId, today);
    const used = row.cnt;
    return { used, limit: QUOTA_LOGGED_IN, remaining: Math.max(0, QUOTA_LOGGED_IN - used), isLoggedIn: true };
  } else {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM quota_usage WHERE ip_address = ? AND date(used_at) = ?"
    ).get(ip, today);
    const used = row.cnt;
    return { used, limit: QUOTA_GUEST, remaining: Math.max(0, QUOTA_GUEST - used), isLoggedIn: false };
  }
}

function checkQuota(userId, ip) {
  const quota = getQuota(userId, ip);
  if (quota.remaining <= 0) {
    return { ok: false, quota, errorCode: 'QUOTA_EXCEEDED', message: `今日构建次数已用完（${quota.limit}次/天）` };
  }
  return { ok: true, quota };
}

function recordQuotaUsage(userId, ip, taskId) {
  const db = getDB();
  const id = crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO quota_usage (id, user_id, ip_address, task_id, used_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId || null, userId ? null : ip, taskId, now);
}

function createTask({ userId, url, appName, packageName, iconPath, iconOriginalName, ip }) {
  const db = getDB();
  const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const downloadToken = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  const isLoggedIn = !!userId;
  const expiresAt = isLoggedIn ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const maxDownloads = isLoggedIn ? DOWNLOAD_LIMIT_LOGGED : DOWNLOAD_LIMIT_GUEST;

  db.prepare(`
    INSERT INTO tasks (id, user_id, url, app_name, package_name, icon_path, icon_original_name,
      status, progress, current_step, download_token, max_downloads, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', 0, '排队等待中', ?, ?, ?, ?, ?)
  `).run(taskId, userId || null, url, appName, packageName, iconPath, iconOriginalName,
    downloadToken, maxDownloads, expiresAt, now, now);

  recordQuotaUsage(userId, ip, taskId);
  return { taskId, downloadToken, expiresAt };
}

function getTask(taskId) {
  const db = getDB();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

function updateTask(taskId, updates) {
  const db = getDB();
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  if (fields.length === 0) return;
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(taskId);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function getTasksByUser(userId, { page = 1, limit = 20, status, categoryId, search, favorite, showDeleted, deletedOnly, sort = 'created_at', order = 'desc' } = {}) {
  const db = getDB();
  const offset = (page - 1) * limit;

  // 历史标签页显示全部（含已删除），已删除标签页只显示已删除，其他视图只显示未删除
  let where = 'WHERE t.user_id = ?';
  const params = [userId];
  if (deletedOnly) {
    where += ' AND t.apk_deleted = 1';
  } else if (!showDeleted) {
    where += ' AND t.apk_deleted = 0';
  }

  if (status) { where += ' AND t.status = ?'; params.push(status); }
  if (categoryId === 'null' || categoryId === '') {
    where += ' AND t.category_id IS NULL AND t.apk_deleted = 0';
  } else if (categoryId) {
    where += ' AND t.category_id = ? AND t.apk_deleted = 0';
    params.push(categoryId);
  }
  if (search) {
    where += ' AND (t.app_name LIKE ? OR t.display_name LIKE ? OR t.note LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (favorite === '1' || favorite === 1 || favorite === true) {
    where += ' AND t.is_favorite = 1';
  }

  const allowedSort = ['created_at', 'app_name', 'status', 'updated_at'];
  const sortField = allowedSort.includes(sort) ? sort : 'created_at';
  const orderDir = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM tasks t ${where}`).get(...params).cnt;

  const tasks = db.prepare(`
    SELECT t.*, c.name as category_name
    FROM tasks t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    ORDER BY t.${sortField} ${orderDir}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    tasks: tasks.map(t => ({
      id: t.id,
      url: t.url,
      appName: t.app_name,
      displayName: t.display_name,
      packageName: t.package_name,
      status: t.status,
      progress: t.progress,
      currentStep: t.current_step,
      errorMessage: t.error_message,
      apkSize: t.apk_size,
      apkDeleted: t.apk_deleted,
      versionName: t.version_name,
      categoryId: t.category_id,
      categoryName: t.category_name,
      downloadCount: t.download_count,
      maxDownloads: t.max_downloads,
      isFavorite: t.is_favorite,
      note: t.note,
      expiresAt: t.expires_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  };
}

function renameTask(taskId, userId, displayName) {
  const db = getDB();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) return { ok: false, errorCode: 'TASK_NOT_FOUND' };

  if (displayName) {
    const existing = db.prepare(
      'SELECT id FROM tasks WHERE user_id = ? AND category_id IS ? AND id != ? AND (display_name = ? OR (display_name IS NULL AND app_name = ?))'
    ).get(userId, task.category_id || null, taskId, displayName, displayName);
    if (existing) {
      return { ok: false, errorCode: 'NAME_DUPLICATE', message: '同分类下已存在同名安装包' };
    }
  }

  db.prepare('UPDATE tasks SET display_name = ?, updated_at = ? WHERE id = ?')
    .run(displayName || null, new Date().toISOString(), taskId);
  return { ok: true };
}

function moveTask(taskId, userId, categoryId) {
  const db = getDB();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) return { ok: false, errorCode: 'TASK_NOT_FOUND' };

  if (categoryId) {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(categoryId, userId);
    if (!cat) return { ok: false, errorCode: 'CATEGORY_NOT_FOUND' };
  }

  db.prepare('UPDATE tasks SET category_id = ?, updated_at = ? WHERE id = ?')
    .run(categoryId || null, new Date().toISOString(), taskId);
  return { ok: true };
}

/**
 * 软删除：标记 apk_deleted=1，删除APK文件，保留历史记录
 */
function deleteTask(taskId, userId) {
  const db = getDB();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) return { ok: false, errorCode: 'TASK_NOT_FOUND' };

  const now = new Date().toISOString();
  // 标记APK已删除，同时取消收藏
  db.prepare('UPDATE tasks SET apk_deleted = 1, is_favorite = 0, apk_path = NULL, updated_at = ? WHERE id = ?')
    .run(now, taskId);

  // 删除实际APK文件
  const fs = require('fs');
  const path = require('path');
  if (task.apk_path) {
    try {
      const apkFullPath = path.resolve(task.apk_path);
      if (fs.existsSync(apkFullPath)) fs.unlinkSync(apkFullPath);
    } catch (_) { /* 忽略文件删除失败 */ }
  }
  if (task.icon_path) {
    try {
      const iconFullPath = path.resolve(task.icon_path);
      if (fs.existsSync(iconFullPath)) fs.unlinkSync(iconFullPath);
    } catch (_) { /* 忽略 */ }
  }

  return { ok: true, task };
}

/**
 * 切换收藏状态
 */
function toggleFavorite(taskId, userId) {
  const db = getDB();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) return { ok: false, errorCode: 'TASK_NOT_FOUND' };

  const newVal = task.is_favorite ? 0 : 1;
  db.prepare('UPDATE tasks SET is_favorite = ?, updated_at = ? WHERE id = ?')
    .run(newVal, new Date().toISOString(), taskId);
  return { ok: true, isFavorite: newVal };
}

/**
 * 更新备注
 */
function updateNote(taskId, userId, note) {
  const db = getDB();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!task) return { ok: false, errorCode: 'TASK_NOT_FOUND' };

  db.prepare('UPDATE tasks SET note = ?, updated_at = ? WHERE id = ?')
    .run(note || null, new Date().toISOString(), taskId);
  return { ok: true };
}

function migrateTasks(taskIds, userId) {
  const db = getDB();
  const now = new Date().toISOString();
  let migrated = 0;

  const stmt = db.prepare('UPDATE tasks SET user_id = ?, max_downloads = ?, expires_at = NULL, updated_at = ? WHERE id = ? AND user_id IS NULL');
  for (const taskId of taskIds) {
    const result = stmt.run(userId, DOWNLOAD_LIMIT_LOGGED, now, taskId);
    if (result.changes > 0) migrated++;
  }
  return { ok: true, migratedCount: migrated };
}

module.exports = {
  getQuota, checkQuota, recordQuotaUsage, createTask, getTask, updateTask,
  getTasksByUser, renameTask, moveTask, deleteTask, toggleFavorite, updateNote,
  migrateTasks, QUOTA_LOGGED_IN, QUOTA_GUEST
};
