/**
 * 认证路由 - /api/auth/*
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { extractToken } = require('../middleware/auth');
const authService = require('../services/authService');

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, email, phone, password } = req.body;
  if (!username || !email || !phone || !password) {
    return res.status(400).json({ success: false, message: '请填写所有必填字段', errorCode: 'MISSING_FIELDS' });
  }
  const result = authService.register({ username, email, phone, password });
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message, errorCode: result.errorCode });
  }
  res.status(201).json({ success: true, token: result.token, user: result.user });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ success: false, message: '请输入用户名和密码', errorCode: 'MISSING_FIELDS' });
  }
  const ip = req.ip || req.connection.remoteAddress;
  const result = authService.login({ login, password, ip });
  if (!result.ok) {
    const status = result.errorCode === 'ACCOUNT_SUSPENDED' ? 403 : 401;
    return res.status(status).json({ success: false, message: result.message, errorCode: result.errorCode });
  }
  res.json({ success: true, token: result.token, user: result.user });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const token = extractToken(req);
  authService.logout(token);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = authService.getUserInfo(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在', errorCode: 'USER_NOT_FOUND' });
  }
  res.json({ success: true, data: user });
});

// PUT /api/auth/password
router.put('/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '请输入原密码和新密码', errorCode: 'MISSING_FIELDS' });
  }
  const result = authService.changePassword(req.user.id, oldPassword, newPassword);
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message, errorCode: result.errorCode });
  }
  res.json({ success: true, message: result.message });
});

module.exports = router;
