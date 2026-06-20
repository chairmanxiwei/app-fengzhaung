/**
 * 认证中间件 - requireAuth / optionalAuth
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { getDB } = require('../db/database');

// JWT_SECRET 持久化：保存到文件，重启不丢失
const SECRET_FILE = path.join(__dirname, '..', 'data', '.jwt_secret');
let JWT_SECRET = process.env.JWT_SECRET || null;

if (!JWT_SECRET) {
  try {
    if (fs.existsSync(SECRET_FILE)) {
      JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    }
  } catch {}
  if (!JWT_SECRET) {
    JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
    try {
      const dir = path.dirname(SECRET_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SECRET_FILE, JWT_SECRET, 'utf8');
    } catch {}
  }
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: '请先登录', errorCode: 'UNAUTHORIZED' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录', errorCode: 'TOKEN_EXPIRED' });
  }

  // 检查 session 是否仍有效
  const db = getDB();
  const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
  const session = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND token_hash = ? AND expires_at > ?')
    .get(decoded.userId, tokenHash, new Date().toISOString());

  if (!session) {
    return res.status(401).json({ success: false, message: '会话已失效，请重新登录', errorCode: 'SESSION_INVALID' });
  }

  // 检查用户状态
  const user = db.prepare('SELECT id, username, email, role, status FROM users WHERE id = ?').get(decoded.userId);
  if (!user || user.status === 'suspended') {
    return res.status(403).json({ success: false, message: '账户已被停用', errorCode: 'ACCOUNT_SUSPENDED' });
  }

  req.user = { id: user.id, username: user.username, email: user.email, role: user.role };
  next();
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    req.user = null;
    return next();
  }

  const db = getDB();
  const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
  const session = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND token_hash = ? AND expires_at > ?')
    .get(decoded.userId, tokenHash, new Date().toISOString());

  if (!session) {
    req.user = null;
    return next();
  }

  const user = db.prepare('SELECT id, username, email, role, status FROM users WHERE id = ?').get(decoded.userId);
  if (!user || user.status === 'suspended') {
    req.user = null;
    return next();
  }

  req.user = { id: user.id, username: user.username, email: user.email, role: user.role };
  next();
}

module.exports = { requireAuth, optionalAuth, JWT_SECRET, extractToken, verifyToken };
