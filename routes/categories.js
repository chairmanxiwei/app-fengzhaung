/**
 * 分类路由 - /api/categories/*
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const categoryService = require('../services/categoryService');

// GET /api/categories
router.get('/', requireAuth, (req, res) => {
  const categories = categoryService.getCategories(req.user.id);
  res.json({ success: true, data: categories });
});

// POST /api/categories
router.post('/', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim().length === 0 || name.trim().length > 30) {
    return res.status(400).json({ success: false, message: '分类名称需1-30个字符', errorCode: 'INVALID_NAME' });
  }
  const result = categoryService.createCategory(req.user.id, name.trim());
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message, errorCode: result.errorCode });
  }
  res.status(201).json({ success: true, data: result.data });
});

// PUT /api/categories/:id
router.put('/:id', requireAuth, (req, res) => {
  const { name, sortOrder } = req.body;
  const result = categoryService.updateCategory(req.params.id, req.user.id, { name, sortOrder });
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.message, errorCode: result.errorCode });
  }
  res.json({ success: true });
});

// DELETE /api/categories/:id
router.delete('/:id', requireAuth, (req, res) => {
  const result = categoryService.deleteCategory(req.params.id, req.user.id);
  if (!result.ok) {
    return res.status(404).json({ success: false, message: '分类不存在', errorCode: result.errorCode });
  }
  res.json({ success: true });
});

module.exports = router;
