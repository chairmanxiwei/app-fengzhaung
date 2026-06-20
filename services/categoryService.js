/**
 * 分类服务 - CRUD
 */
const crypto = require('crypto');
const { getDB } = require('../db/database');

function getCategories(userId) {
  const db = getDB();
  const cats = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM tasks WHERE category_id = c.id AND user_id = ? AND apk_deleted = 0) as task_count
    FROM categories c
    WHERE c.user_id = ?
    ORDER BY c.sort_order ASC, c.created_at ASC
  `).all(userId, userId);

  // 添加"未分类"统计（排除已删除的）
  const uncategorized = db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE user_id = ? AND category_id IS NULL AND apk_deleted = 0').get(userId);

  return [
    ...cats.map(c => ({ id: c.id, name: c.name, sortOrder: c.sort_order, taskCount: c.task_count })),
    { id: null, name: '未分类', taskCount: uncategorized.cnt }
  ];
}

function createCategory(userId, name) {
  const db = getDB();
  const existing = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?').get(userId, name);
  if (existing) {
    return { ok: false, errorCode: 'NAME_DUPLICATE', message: '分类名称已存在' };
  }

  const id = 'cat_' + crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO categories (id, user_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)')
    .run(id, userId, name, now, now);

  return { ok: true, data: { id, name, sortOrder: 0 } };
}

function updateCategory(catId, userId, { name, sortOrder }) {
  const db = getDB();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(catId, userId);
  if (!cat) return { ok: false, errorCode: 'NOT_FOUND' };

  if (name) {
    const existing = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ? AND id != ?').get(userId, name, catId);
    if (existing) return { ok: false, errorCode: 'NAME_DUPLICATE', message: '分类名称已存在' };
  }

  const now = new Date().toISOString();
  if (name) db.prepare('UPDATE categories SET name = ?, updated_at = ? WHERE id = ?').run(name, now, catId);
  if (sortOrder !== undefined) db.prepare('UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?').run(sortOrder, now, catId);

  return { ok: true };
}

function deleteCategory(catId, userId) {
  const db = getDB();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(catId, userId);
  if (!cat) return { ok: false, errorCode: 'NOT_FOUND' };

  // 该分类下任务移至未分类
  db.prepare('UPDATE tasks SET category_id = NULL WHERE category_id = ?').run(catId);
  db.prepare('DELETE FROM categories WHERE id = ?').run(catId);

  return { ok: true };
}

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
