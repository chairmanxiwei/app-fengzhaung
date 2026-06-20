/**
 * 操作日志服务
 */
const crypto = require('crypto');
const { getDB } = require('../db/database');

function logAction({ userId, taskId, action, detail, ip }) {
  const db = getDB();
  const id = crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO operation_logs (id, user_id, task_id, action, detail, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId || null, taskId || null, action, detail ? JSON.stringify(detail) : null, ip || null, now);
}

function getLogs(userId, { page = 1, limit = 50, action, startDate, endDate } = {}) {
  const db = getDB();
  const offset = (page - 1) * limit;

  let where = 'WHERE user_id = ?';
  const params = [userId];

  if (action) { where += ' AND action = ?'; params.push(action); }
  if (startDate) { where += ' AND created_at >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND created_at <= ?'; params.push(endDate + 'T23:59:59'); }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM operation_logs ${where}`).get(...params).cnt;
  const logs = db.prepare(`
    SELECT * FROM operation_logs ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    logs: logs.map(l => ({
      id: l.id,
      taskId: l.task_id,
      action: l.action,
      detail: l.detail ? JSON.parse(l.detail) : null,
      ipAddress: l.ip_address,
      createdAt: l.created_at,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

module.exports = { logAction, getLogs };
