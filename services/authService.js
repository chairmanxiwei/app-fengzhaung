/**
 * 认证服务 - 注册、登录、会话管理
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDB } = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRES = '7d';

// 验证规则
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(pwd) {
  if (!pwd || pwd.length < 8) return false;
  if (!/[a-zA-Z]/.test(pwd)) return false;
  if (!/[0-9]/.test(pwd)) return false;
  return true;
}

const PHONE_RE = /^1[3-9]\d{9}$/;

function register({ username, email, phone, password }) {
  // 校验
  if (!username || !EMAIL_RE.test(email) || !validatePassword(password)) {
    if (!username || username.length < 3 || username.length > 20) {
      return { ok: false, errorCode: 'INVALID_FORMAT', message: '用户名需2-20个字符，支持中英文、数字和下划线' };
    }
    if (!EMAIL_RE.test(email)) {
      return { ok: false, errorCode: 'INVALID_FORMAT', message: '邮箱格式不正确' };
    }
    if (!validatePassword(password)) {
      return { ok: false, errorCode: 'WEAK_PASSWORD', message: '密码至少8位，需包含字母和数字' };
    }
  }

  if (!USERNAME_RE.test(username)) {
    return { ok: false, errorCode: 'INVALID_FORMAT', message: '用户名仅支持中英文、数字下划线，2-20字符' };
  }

  // 手机号校验（必填）
  if (!phone || !PHONE_RE.test(phone)) {
    return { ok: false, errorCode: 'INVALID_PHONE', message: '请输入正确的11位手机号' };
  }

  const db = getDB();

  // 唯一性检查
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return { ok: false, errorCode: 'USERNAME_TAKEN', message: '用户名已被占用' };
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return { ok: false, errorCode: 'EMAIL_TAKEN', message: '邮箱已被注册' };
  }
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
    return { ok: false, errorCode: 'PHONE_TAKEN', message: '手机号已被注册' };
  }

  const id = 'u_' + crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);

  db.prepare(`
    INSERT INTO users (id, username, email, phone, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, email, phone || null, passwordHash, now, now);

  // 自动登录
  const token = createToken(id, 'user');
  return {
    ok: true,
    token,
    user: { id, username, email, phone: phone || null }
  };
}

function login({ login, password, ip }) {
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { ok: false, errorCode: 'INVALID_CREDENTIALS', message: '用户名或密码错误' };
  }

  if (user.status === 'suspended') {
    return { ok: false, errorCode: 'ACCOUNT_SUSPENDED', message: '账户已被停用' };
  }

  const token = createToken(user.id, user.role);
  return {
    ok: true,
    token,
    user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar_url }
  };
}

function createToken(userId, role) {
  const db = getDB();
  const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID().replace(/-/g, '');

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, ip_address, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, tokenHash, null, expiresAt, now);

  return token;
}

function logout(token) {
  if (!token) return;
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const db = getDB();
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  } catch {}
}

function changePassword(userId, oldPassword, newPassword) {
  if (!validatePassword(newPassword)) {
    return { ok: false, errorCode: 'WEAK_PASSWORD', message: '新密码至少8位，需包含字母和数字' };
  }

  const db = getDB();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return { ok: false, errorCode: 'WRONG_PASSWORD', message: '原密码不正确' };
  }

  const newHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, userId);

  // 强制所有设备重新登录
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

  return { ok: true, message: '密码修改成功，请重新登录' };
}

function getUserInfo(userId) {
  const db = getDB();
  const user = db.prepare('SELECT id, username, email, avatar_url, role, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  return { id: user.id, username: user.username, email: user.email, avatar: user.avatar_url, role: user.role, createdAt: user.created_at };
}

module.exports = { register, login, logout, changePassword, getUserInfo };
