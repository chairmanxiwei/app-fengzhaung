/**
 * 清理服务 - 过期任务、过期会话、旧日志
 */
const fs = require('fs');
const { getDB } = require('../db/database');

function cleanExpiredTasks() {
  const db = getDB();
  const now = new Date().toISOString();

  const expired = db.prepare('SELECT * FROM tasks WHERE expires_at IS NOT NULL AND expires_at < ?').all(now);

  for (const task of expired) {
    // 删除APK文件
    if (task.apk_path) {
      try { if (fs.existsSync(task.apk_path)) fs.unlinkSync(task.apk_path); } catch {}
    }
    // 删除图标文件
    if (task.icon_path) {
      try { if (fs.existsSync(task.icon_path)) fs.unlinkSync(task.icon_path); } catch {}
    }
  }

  if (expired.length > 0) {
    db.prepare('DELETE FROM tasks WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);
    console.log(`[Cleanup] 已清理 ${expired.length} 个过期任务`);
  }

  return expired.length;
}

function cleanExpiredSessions() {
  const db = getDB();
  const now = new Date().toISOString();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  if (result.changes > 0) {
    console.log(`[Cleanup] 已清理 ${result.changes} 个过期会话`);
  }
  return result.changes;
}

function cleanOldQuotaRecords() {
  const db = getDB();
  // 清理7天前的配额记录
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM quota_usage WHERE used_at < ?').run(cutoff);
  if (result.changes > 0) {
    console.log(`[Cleanup] 已清理 ${result.changes} 条旧配额记录`);
  }
  return result.changes;
}

function cleanOldLogs() {
  const db = getDB();
  // 清理30天前的操作日志
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM operation_logs WHERE created_at < ?').run(cutoff);
  if (result.changes > 0) {
    console.log(`[Cleanup] 已清理 ${result.changes} 条旧操作日志`);
  }
  return result.changes;
}

function runAllCleanups() {
  const tasks = cleanExpiredTasks();
  const sessions = cleanExpiredSessions();
  const quotas = cleanOldQuotaRecords();
  const logs = cleanOldLogs();
  return { tasks, sessions, quotas, logs };
}

module.exports = { cleanExpiredTasks, cleanExpiredSessions, cleanOldQuotaRecords, cleanOldLogs, runAllCleanups };
