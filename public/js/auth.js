/**
 * Web-Package - 认证与包管理前端模块
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'wp_token';
  const GUEST_TASKS_KEY = 'wp_guest_tasks';

  // ========== Token 管理 ==========
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || null;
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  // ========== API 请求 ==========
  async function apiRequest(url, options = {}) {
    const token = getToken();
    const headers = options.headers || {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const response = await fetch(url, { ...options, headers });
    let data;
    try { data = await response.json(); } catch { data = { success: false, message: '服务器响应异常' }; }

    // 401 自动清除过期token
    if (response.status === 401 && token) {
      clearToken();
      updateNavbar();
      showQuotaBar();
      showToast('登录已过期，请重新登录', 'warning');
    }

    return data;
  }

  // ========== Toast 提示系统 ==========
  function showToast(message, type) {
    type = type || 'success';
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const colors = {
      success: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', icon: '#10B981' },
      error:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: '#EF4444' },
      warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', icon: '#F59E0B' },
      info:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', icon: '#3B82F6' },
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      display:flex;align-items:center;gap:10px;padding:12px 20px;margin-bottom:8px;
      background:${c.bg};border:1px solid ${c.border};border-radius:8px;
      color:${c.text};font-size:14px;font-family:inherit;box-shadow:0 4px 12px rgba(0,0,0,0.08);
      animation:pkg-toast-in .3s ease;min-width:200px;max-width:400px;
    `;
    toast.innerHTML = `<span style="font-weight:700;color:${c.icon};font-size:16px">${icons[type] || ''}</span><span>${escHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all .3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ========== 认证 API ==========
  async function login(login, password) {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    if (data.success) {
      setToken(data.token);
      return data;
    }
    throw data;
  }

  async function register(username, email, password, phone) {
    const body = { username, email, phone, password };
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (data.success) {
      setToken(data.token);
      return data;
    }
    throw data;
  }

  async function logout() {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); } catch {}
    clearToken();
    updateNavbar();
    showQuotaBar();
  }

  async function checkAuth() {
    if (!isLoggedIn()) return null;
    const data = await apiRequest('/api/auth/me');
    return data.success ? data.data : null;
  }

  async function changePassword(oldPassword, newPassword) {
    const data = await apiRequest('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if (!data.success) throw data;
    clearToken();
    return data;
  }

  // ========== 配额 ==========
  async function getQuota() {
    const data = await apiRequest('/api/quota');
    return data.success ? data.data : { used: 0, limit: 3, remaining: 3, isLoggedIn: false };
  }

  async function showQuotaBar() {
    const bar = document.getElementById('quotaBar');
    const text = document.getElementById('quotaText');
    const link = document.getElementById('quotaLoginLink');
    if (!bar || !text) return;

    const quota = await getQuota();
    text.textContent = `今日剩余: ${quota.remaining}/${quota.limit} 次`;

    if (link) {
      link.style.display = quota.isLoggedIn ? 'none' : 'inline';
    }
    bar.style.display = 'flex';
  }

  // ========== 导航栏更新 ==========
  function updateNavbar() {
    const authDiv = document.getElementById('navAuth');
    const userDiv = document.getElementById('navUser');
    const usernameEl = document.getElementById('navUsername');
    const avatarEl = document.getElementById('navAvatar');

    if (isLoggedIn()) {
      if (authDiv) authDiv.style.display = 'none';
      if (userDiv) userDiv.style.display = 'flex';
      checkAuth().then(user => {
        if (user && usernameEl) usernameEl.textContent = user.username;
        if (user && avatarEl) avatarEl.textContent = (user.username || 'U')[0].toUpperCase();
      });
    } else {
      if (authDiv) authDiv.style.display = 'flex';
      if (userDiv) userDiv.style.display = 'none';
    }
  }

  // ========== 登录/注册弹窗 ==========
  function openAuthModal(tab) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    switchAuthTab(tab || 'login');
  }

  function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
    clearAuthErrors();
  }

  function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('authTabLogin');
    const tabRegister = document.getElementById('authTabRegister');

    if (tab === 'login') {
      if (loginForm) loginForm.style.display = 'block';
      if (registerForm) registerForm.style.display = 'none';
      if (tabLogin) tabLogin.classList.add('active');
      if (tabRegister) tabRegister.classList.remove('active');
    } else {
      if (loginForm) loginForm.style.display = 'none';
      if (registerForm) registerForm.style.display = 'block';
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabRegister) tabRegister.classList.add('active');
    }
    clearAuthErrors();
  }

  function clearAuthErrors() {
    ['loginError', 'registerError', 'passwordError'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
  }

  function showAuthError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  // ========== 我的构建面板 ==========
  let currentPackagesPage = 1;
  let currentPackagesFilters = {};
  let currentFolder = 'all'; // 'all' | 'deleted' | 'uncategorized' | 自定义夹子ID
  let taskNoteMap = {}; // taskId → note 缓存，避免HTML属性转义问题
  let _operationLock = false; // 操作锁，防止重复点击

  async function openMyPackages() {
    // 严格登录检查
    if (!isLoggedIn()) {
      showToast('请先登录后查看构建记录', 'warning');
      openAuthModal('login');
      return;
    }
    // 验证token有效性
    const user = await checkAuth();
    if (!user) {
      showToast('登录已过期，请重新登录', 'warning');
      openAuthModal('login');
      return;
    }
    const panel = document.getElementById('packagesPanel');
    if (panel) { panel.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    await loadCategories();
    await loadMyTasks(1);
  }

  function closeMyPackages() {
    const panel = document.getElementById('packagesPanel');
    if (panel) { panel.style.display = 'none'; document.body.style.overflow = ''; }
  }

  function switchFolder(folderId) {
    currentFolder = folderId;
    // 更新侧边栏高亮
    const listEl = document.getElementById('categoryList');
    if (listEl) {
      listEl.querySelectorAll('.category-item').forEach(i => {
        i.classList.toggle('active', i.dataset.id === folderId);
      });
    }
    loadMyTasks(1);
  }

  async function loadMyTasks(page, filters) {
    page = page || 1;
    currentPackagesPage = page;
    Object.assign(currentPackagesFilters, filters || {});

    const params = new URLSearchParams();
    params.set('page', page);
    params.set('limit', 20);
    if (currentPackagesFilters.status) {
      if (currentPackagesFilters.status === 'FAVORITE') {
        params.set('favorite', '1');
      } else {
        params.set('status', currentPackagesFilters.status);
      }
    }
    if (currentPackagesFilters.search) params.set('search', currentPackagesFilters.search);
    if (currentPackagesFilters.sortOrder) params.set('order', currentPackagesFilters.sortOrder);

    // 根据当前夹子决定查询参数
    if (currentFolder === 'all') {
      params.set('show_deleted', '1');
    } else if (currentFolder === 'deleted') {
      params.set('deleted_only', '1');
    } else if (currentFolder === 'uncategorized') {
      params.set('category_id', 'null');
    } else {
      // 自定义夹子
      params.set('category_id', currentFolder);
    }

    const listEl = document.getElementById('packagesList');
    const paginationEl = document.getElementById('packagesPagination');

    // 加载中状态
    if (listEl) listEl.innerHTML = '<div class="packages-empty" style="color:var(--blue-500)">加载中...</div>';

    const data = await apiRequest(`/api/tasks?${params}`);

    if (!data.success || !listEl) {
      if (listEl) listEl.innerHTML = '<div class="packages-empty">加载失败，请重试</div>';
      return;
    }

    const { tasks, pagination } = data.data;

    if (tasks.length === 0) {
      listEl.innerHTML = `<div class="packages-empty">${currentFolder === 'deleted' ? '暂无已删除记录' : currentFolder === 'uncategorized' ? '暂无未分类记录' : '暂无构建记录'}</div>`;
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = tasks.map(t => {
      const name = t.displayName || t.appName;
      const statusIcon = t.status === 'COMPLETED' ? '<span class="pkg-status-success">成功</span>'
        : t.status === 'FAILED' ? '<span class="pkg-status-fail">失败</span>'
        : '<span class="pkg-status-building">构建中</span>';
      const size = t.apkSize ? formatSize(t.apkSize) : '';
      const date = t.createdAt ? formatDateTime(t.createdAt) : '';
      const catName = t.categoryName || '';
      const deletedTag = t.apkDeleted ? '<span class="pkg-status-deleted">已删除</span>' : '';
      const favIcon = t.isFavorite ? '★' : '☆';
      const notePreview = t.note ? `<div class="pkg-card-note">${escHtml(t.note.slice(0, 50))}${t.note.length > 50 ? '...' : ''}</div>` : '';

      // 缓存备注和名称到Map，避免HTML属性转义问题
      taskNoteMap[t.id] = t.note || '';
      taskNoteMap['_name_' + t.id] = name;

      return `<div class="pkg-card${t.apkDeleted ? ' pkg-card-deleted' : ''}" data-id="${t.id}">
        <div class="pkg-card-icon">${escHtml(name[0] || '?')}</div>
        <div class="pkg-card-info">
          <div class="pkg-card-name">${escHtml(name)} ${deletedTag}</div>
          <div class="pkg-card-meta">${escHtml(t.appName)}</div>
          <div class="pkg-card-detail">${statusIcon} ${size} ${date} ${catName ? '| ' + escHtml(catName) : ''}</div>
          ${notePreview}
        </div>
        <div class="pkg-card-actions">
          ${!t.apkDeleted ? `<button class="pkg-btn pkg-btn-fav${t.isFavorite ? ' fav-active' : ''}" data-id="${t.id}" title="${t.isFavorite ? '取消收藏' : '收藏'}">${favIcon}</button>` : ''}
          ${!t.apkDeleted && t.status === 'COMPLETED' ? `<button class="pkg-btn pkg-btn-download" data-id="${t.id}">下载</button>` : ''}
          ${!t.apkDeleted && t.status === 'FAILED' ? `<button class="pkg-btn pkg-btn-retry" data-id="${t.id}">重试</button>` : ''}
          ${!t.apkDeleted ? `<button class="pkg-btn pkg-btn-rename" data-id="${t.id}">重命名</button>` : ''}
          ${!t.apkDeleted ? `<button class="pkg-btn pkg-btn-move" data-id="${t.id}">移动</button>` : ''}
          ${!t.apkDeleted ? `<button class="pkg-btn pkg-btn-delete" data-id="${t.id}">删除</button>` : ''}
          ${!t.apkDeleted ? `<button class="pkg-btn pkg-btn-note" data-id="${t.id}" title="备注">备注</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // 分页
    if (paginationEl && pagination.totalPages > 1) {
      paginationEl.innerHTML = `<span class="pkg-page-info">第 ${pagination.page}/${pagination.totalPages} 页</span>
        <button class="pkg-page-btn" id="pkgPrevPage" ${pagination.page <= 1 ? 'disabled' : ''}>上一页</button>
        <button class="pkg-page-btn" id="pkgNextPage" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>下一页</button>`;
    } else if (paginationEl) {
      paginationEl.innerHTML = '';
    }
  }

  // ========== 按钮状态管理 ==========
  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.classList.add('pkg-btn-loading');
      btn.textContent = '...';
    } else {
      btn.disabled = false;
      btn.classList.remove('pkg-btn-loading');
      if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
    }
  }

  // ========== 事件委托绑定（更可靠，不受 innerHTML 替换影响）==========
  let _delegationBound = false;

  function setupPackageListDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;

    const listEl = document.getElementById('packagesList');
    if (!listEl) return;

    // 列表按钮事件委托
    listEl.addEventListener('click', async function(e) {
      const btn = e.target.closest('.pkg-btn');
      if (!btn) return;

      const taskId = btn.dataset.id;
      if (!taskId) return;

      // 防止重复点击
      if (btn.disabled || _operationLock) return;

      e.stopPropagation();

      // 收藏 - 即时反馈
      if (btn.classList.contains('pkg-btn-fav')) {
        _operationLock = true;
        const wasActive = btn.classList.contains('fav-active');
        // 即时切换视觉状态
        btn.classList.toggle('fav-active', !wasActive);
        btn.textContent = wasActive ? '☆' : '★';
        btn.title = wasActive ? '收藏' : '取消收藏';

        const result = await apiRequest(`/api/tasks/${taskId}/favorite`, { method: 'PUT' });
        if (result.success) {
          showToast(wasActive ? '已取消收藏' : '已收藏', 'success');
          loadMyTasks(currentPackagesPage);
        } else {
          // 回滚视觉状态
          btn.classList.toggle('fav-active', wasActive);
          btn.textContent = wasActive ? '★' : '☆';
          showToast('操作失败，请重试', 'error');
        }
        _operationLock = false;
      }
      // 下载
      else if (btn.classList.contains('pkg-btn-download')) {
        _operationLock = true;
        setBtnLoading(btn, true);
        const taskData = await apiRequest(`/api/tasks/${taskId}`);
        if (taskData.success && taskData.data.downloadToken) {
          const a = document.createElement('a');
          a.href = `/api/download/${taskId}?token=${taskData.data.downloadToken}`;
          a.download = 'app.apk';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showToast('下载已开始', 'success');
        } else {
          showToast('获取下载链接失败', 'error');
        }
        setBtnLoading(btn, false);
        _operationLock = false;
      }
      // 删除
      else if (btn.classList.contains('pkg-btn-delete')) {
        const name = taskNoteMap['_name_' + taskId] || '';
        openDeleteConfirm(taskId, name);
      }
      // 重命名
      else if (btn.classList.contains('pkg-btn-rename')) {
        const name = taskNoteMap['_name_' + taskId] || '';
        openRenameModal(taskId, name);
      }
      // 移动
      else if (btn.classList.contains('pkg-btn-move')) {
        openMoveCategoryModal(taskId);
      }
      // 备注
      else if (btn.classList.contains('pkg-btn-note')) {
        const note = taskNoteMap[taskId] || '';
        openNoteModal(taskId, note);
      }
      // 重试
      else if (btn.classList.contains('pkg-btn-retry')) {
        showToast('重试功能开发中', 'info');
      }
    });

    // 分页按钮事件委托
    const paginationEl = document.getElementById('packagesPagination');
    if (paginationEl) {
      paginationEl.addEventListener('click', function(e) {
        const btn = e.target.closest('.pkg-page-btn');
        if (!btn || btn.disabled) return;
        if (btn.id === 'pkgPrevPage') loadMyTasks(currentPackagesPage - 1);
        else if (btn.id === 'pkgNextPage') loadMyTasks(currentPackagesPage + 1);
      });
    }
  }

  // ========== 夹子管理 ==========
  async function loadCategories() {
    const data = await apiRequest('/api/categories');
    const listEl = document.getElementById('categoryList');
    if (!data.success || !listEl) return;

    const cats = data.data;
    // 找到"未分类"的计数（cats中最后一项）
    const uncategorizedCount = cats.find(c => c.id === null)?.taskCount || 0;
    // 自定义夹子
    const customCats = cats.filter(c => c.id !== null);

    // 计算全部数量（所有未删除 + 已删除）
    const allCount = await apiRequest('/api/tasks?page=1&limit=1&show_deleted=1');
    const deletedCount = await apiRequest('/api/tasks?page=1&limit=1&deleted_only=1');

    const totalCount = allCount.success ? allCount.data.pagination.total : 0;
    const delCount = deletedCount.success ? deletedCount.data.pagination.total : 0;

    // 渲染：系统夹子 + 分隔线 + 自定义夹子
    let html = '';

    // 系统夹子
    html += `<div class="category-item ${currentFolder === 'all' ? 'active' : ''}" data-id="all">
      <span class="category-name">全部</span>
      <span class="category-count">${totalCount}</span>
    </div>`;
    html += `<div class="category-item ${currentFolder === 'deleted' ? 'active' : ''}" data-id="deleted">
      <span class="category-name">已删除</span>
      <span class="category-count">${delCount}</span>
    </div>`;
    html += `<div class="category-item ${currentFolder === 'uncategorized' ? 'active' : ''}" data-id="uncategorized">
      <span class="category-name">未分类</span>
      <span class="category-count">${uncategorizedCount}</span>
    </div>`;

    // 分隔线 + 自定义夹子
    if (customCats.length > 0) {
      html += '<div class="category-divider"></div>';
      customCats.forEach(c => {
        html += `<div class="category-item ${currentFolder === c.id ? 'active' : ''}" data-id="${c.id}">
          <span class="category-name">${escHtml(c.name)}</span>
          <span class="category-count">${c.taskCount}</span>
          <button class="category-delete" data-id="${c.id}" title="删除夹子">&times;</button>
        </div>`;
      });
    }

    listEl.innerHTML = html;

    // 事件委托处理夹子点击
    listEl.querySelectorAll('.category-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-delete')) return;
        switchFolder(item.dataset.id);
      });
    });

    // 删除自定义夹子
    listEl.querySelectorAll('.category-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('确定删除此夹子？该夹子下任务将移至"未分类"')) return;
        const result = await apiRequest(`/api/categories/${btn.dataset.id}`, { method: 'DELETE' });
        if (result.success) {
          showToast('夹子已删除', 'success');
          if (currentFolder === btn.dataset.id) switchFolder('all');
          else { await loadCategories(); }
          await loadMyTasks(1);
        } else {
          showToast(result.message || '删除夹子失败', 'error');
        }
      });
    });
  }

  async function createCategory(name) {
    const data = await apiRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (data.success) {
      showToast('分类创建成功', 'success');
      await loadCategories();
    } else {
      showToast(data.message || '创建失败', 'error');
    }
  }

  // ========== 删除确认 ==========
  let deleteTaskId = null;

  function openDeleteConfirm(taskId, name) {
    deleteTaskId = taskId;
    const modal = document.getElementById('deleteConfirmModal');
    const nameEl = document.getElementById('deleteTaskName');
    const confirmBtn = document.getElementById('deleteConfirmBtn');
    if (modal) modal.style.display = 'flex';
    if (nameEl) nameEl.textContent = name;
    // 重置确认按钮状态
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '确认删除'; }
  }

  function closeDeleteConfirm() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'none';
    deleteTaskId = null;
  }

  async function confirmDelete() {
    if (!deleteTaskId) return;
    const confirmBtn = document.getElementById('deleteConfirmBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '删除中...'; }

    const data = await apiRequest(`/api/tasks/${deleteTaskId}`, { method: 'DELETE' });
    closeDeleteConfirm();
    if (data.success) {
      showToast('已删除，历史记录保留', 'success');
      loadMyTasks(currentPackagesPage);
      loadCategories();
    } else {
      showToast(data.message || '删除失败', 'error');
    }
  }

  // ========== 重命名 ==========
  let renameTaskId = null;

  function openRenameModal(taskId, name) {
    renameTaskId = taskId;
    const modal = document.getElementById('renameModal');
    const currentEl = document.getElementById('renameCurrentName');
    const inputEl = document.getElementById('renameInput');
    const submitBtn = document.getElementById('renameSubmit');
    if (modal) modal.style.display = 'flex';
    if (currentEl) currentEl.textContent = name;
    if (inputEl) { inputEl.value = name; inputEl.focus(); }
    // 重置提交按钮状态
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '确认'; }
  }

  function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    if (modal) modal.style.display = 'none';
    renameTaskId = null;
  }

  async function submitRename() {
    if (!renameTaskId) return;
    const inputEl = document.getElementById('renameInput');
    const submitBtn = document.getElementById('renameSubmit');
    const name = inputEl ? inputEl.value.trim() : '';
    if (!name) { showToast('请输入名称', 'warning'); return; }

    // 按钮loading状态
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '保存中...'; }
    if (inputEl) inputEl.disabled = true;

    const data = await apiRequest(`/api/tasks/${renameTaskId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ displayName: name }),
    });
    closeRenameModal();
    if (data.success) {
      showToast('重命名成功', 'success');
      loadMyTasks(currentPackagesPage);
    } else {
      showToast(data.message || '重命名失败', 'error');
    }
  }

  // ========== 移动分类 ==========
  let moveTaskId = null;

  async function openMoveCategoryModal(taskId) {
    moveTaskId = taskId;
    const data = await apiRequest('/api/categories');
    if (!data.success) { showToast('获取夹子列表失败', 'error'); return; }

    const categories = data.data;
    let modal = document.getElementById('moveCategoryModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'moveCategoryModal';
      modal.className = 'modal-overlay';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="modal-content modal-sm">
          <div class="modal-header">
            <h3>移动到夹子</h3>
            <button class="modal-close" id="moveCatClose">&times;</button>
          </div>
          <div class="auth-form" style="display:block">
            <div class="auth-field">
              <label>选择目标夹子</label>
              <select id="moveCatSelect" class="auth-input"></select>
            </div>
            <button class="btn-auth-submit" id="moveCatSubmit">确认移动</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('moveCatClose').addEventListener('click', () => { modal.style.display = 'none'; });
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
      document.getElementById('moveCatSubmit').addEventListener('click', async () => {
        const submitBtn = document.getElementById('moveCatSubmit');
        const select = document.getElementById('moveCatSelect');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '移动中...'; }
        if (select) select.disabled = true;

        const catId = select.value;
        const result = await apiRequest(`/api/tasks/${moveTaskId}/move`, {
          method: 'PUT',
          body: JSON.stringify({ categoryId: catId || null }),
        });
        modal.style.display = 'none';
        if (result.success) {
          showToast('移动成功', 'success');
          loadMyTasks(currentPackagesPage);
          loadCategories();
        } else {
          showToast(result.message || '移动失败', 'error');
        }
      });
    } else {
      const submitBtn = document.getElementById('moveCatSubmit');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '确认移动'; }
    }

    const select = document.getElementById('moveCatSelect');
    if (select) {
      select.disabled = false;
      select.innerHTML = '<option value="">未分类</option>' +
        categories.filter(c => c.id).map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    }

    modal.style.display = 'flex';
  }

  // ========== 备注 ==========
  let noteTaskId = null;

  function openNoteModal(taskId, currentNote) {
    noteTaskId = taskId;
    const modal = document.getElementById('noteModal');
    const inputEl = document.getElementById('noteInput');
    const countEl = document.getElementById('noteCharCount');
    const submitBtn = document.getElementById('noteSubmit');
    if (modal) modal.style.display = 'flex';
    if (inputEl) { inputEl.value = currentNote || ''; inputEl.disabled = false; inputEl.focus(); }
    if (countEl) countEl.textContent = (currentNote || '').length;
    // 重置提交按钮状态
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '保存备注'; }
  }

  function closeNoteModal() {
    const modal = document.getElementById('noteModal');
    if (modal) modal.style.display = 'none';
    noteTaskId = null;
  }

  async function submitNote() {
    if (!noteTaskId) return;
    const inputEl = document.getElementById('noteInput');
    const submitBtn = document.getElementById('noteSubmit');
    const note = inputEl ? inputEl.value.trim() : '';

    // 按钮loading状态
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '保存中...'; }
    if (inputEl) inputEl.disabled = true;

    const data = await apiRequest(`/api/tasks/${noteTaskId}/note`, {
      method: 'PUT',
      body: JSON.stringify({ note }),
    });
    closeNoteModal();
    if (data.success) {
      showToast('备注已保存', 'success');
      loadMyTasks(currentPackagesPage);
    } else {
      showToast(data.message || '保存备注失败', 'error');
    }
  }

  // ========== 迁移临时任务 ==========
  function saveGuestTask(task) {
    const tasks = getGuestTasks();
    tasks.push(task);
    sessionStorage.setItem(GUEST_TASKS_KEY, JSON.stringify(tasks));
  }

  function getGuestTasks() {
    try { return JSON.parse(sessionStorage.getItem(GUEST_TASKS_KEY) || '[]'); } catch { return []; }
  }

  function clearGuestTasks() {
    sessionStorage.removeItem(GUEST_TASKS_KEY);
  }

  async function migrateGuestTasks() {
    const tasks = getGuestTasks();
    if (tasks.length === 0) return;

    const modal = document.getElementById('migrateModal');
    const countEl = document.getElementById('migrateCount');
    if (modal) modal.style.display = 'flex';
    if (countEl) countEl.textContent = tasks.length;
  }

  function closeMigrateModal() {
    const modal = document.getElementById('migrateModal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmMigrate() {
    const tasks = getGuestTasks();
    const taskIds = tasks.map(t => t.taskId).filter(Boolean);
    if (taskIds.length > 0) {
      await apiRequest('/api/tasks/migrate', {
        method: 'POST',
        body: JSON.stringify({ taskIds }),
      });
    }
    clearGuestTasks();
    closeMigrateModal();
    showToast('迁移完成', 'success');
  }

  // ========== 修改密码弹窗 ==========
  function openPasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.style.display = 'flex';
  }

  function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) modal.style.display = 'none';
    clearAuthErrors();
  }

  async function submitPassword() {
    const oldPwd = document.getElementById('oldPassword')?.value;
    const newPwd = document.getElementById('newPassword')?.value;
    if (!oldPwd || !newPwd) return;

    try {
      await changePassword(oldPwd, newPwd);
      closePasswordModal();
      showToast('密码修改成功，请重新登录', 'success');
      logout();
      openAuthModal('login');
    } catch (err) {
      showAuthError('passwordError', err.message || '修改失败');
    }
  }

  // ========== 工具函数 ==========
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escAttr(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;');
  }

  // ========== 事件绑定 ==========
  function bindEvents() {
    // 导航栏
    document.getElementById('navLoginBtn')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('navRegisterBtn')?.addEventListener('click', () => openAuthModal('register'));
    document.getElementById('navMyPackages')?.addEventListener('click', (e) => { e.preventDefault(); openMyPackages(); });
    document.getElementById('navMyPackages2')?.addEventListener('click', (e) => { e.preventDefault(); openMyPackages(); });
    document.getElementById('navLogout')?.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    document.getElementById('navChangePassword')?.addEventListener('click', (e) => { e.preventDefault(); openPasswordModal(); });
    document.getElementById('navAvatar')?.addEventListener('click', () => {
      const dd = document.getElementById('navDropdown');
      if (dd) dd.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-user')) {
        document.getElementById('navDropdown')?.classList.remove('show');
      }
    });

    // 配额登录链接
    document.getElementById('quotaLoginLink')?.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });

    // 认证弹窗
    document.getElementById('authModalClose')?.addEventListener('click', closeAuthModal);
    document.getElementById('authModal')?.addEventListener('click', (e) => { if (e.target.id === 'authModal') closeAuthModal(); });
    document.getElementById('authTabLogin')?.addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('authTabRegister')?.addEventListener('click', () => switchAuthTab('register'));
    document.getElementById('switchToRegister')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('register'); });
    document.getElementById('switchToLogin')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('login'); });

    // 登录提交
    document.getElementById('loginSubmit')?.addEventListener('click', async () => {
      const loginVal = document.getElementById('loginInput')?.value.trim();
      const pwd = document.getElementById('loginPassword')?.value;
      if (!loginVal || !pwd) { showAuthError('loginError', '请填写用户名和密码'); return; }
      try {
        await login(loginVal, pwd);
        closeAuthModal();
        showToast('登录成功', 'success');
        updateNavbar();
        showQuotaBar();
        const guestTasks = getGuestTasks();
        if (guestTasks.length > 0) migrateGuestTasks();
      } catch (err) {
        showAuthError('loginError', err.message || '登录失败');
      }
    });

    // 注册提交
    document.getElementById('registerSubmit')?.addEventListener('click', async () => {
      const username = document.getElementById('registerUsername')?.value.trim();
      const email = document.getElementById('registerEmail')?.value.trim();
      const phone = document.getElementById('registerPhone')?.value.trim();
      const pwd = document.getElementById('registerPassword')?.value;
      const confirm = document.getElementById('registerConfirm')?.value;
      if (!username || !email || !phone || !pwd) { showAuthError('registerError', '请填写所有必填字段'); return; }
      if (!/^1[3-9]\d{9}$/.test(phone)) { showAuthError('registerError', '请输入正确的11位手机号'); return; }
      if (pwd !== confirm) { showAuthError('registerError', '两次密码输入不一致'); return; }
      try {
        await register(username, email, pwd, phone);
        closeAuthModal();
        showToast('注册成功', 'success');
        updateNavbar();
        showQuotaBar();
      } catch (err) {
        showAuthError('registerError', err.message || '注册失败');
      }
    });

    // 回车提交
    ['loginInput', 'loginPassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('loginSubmit')?.click();
      });
    });
    ['registerUsername', 'registerEmail', 'registerPhone', 'registerPassword', 'registerConfirm'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('registerSubmit')?.click();
      });
    });

    // 修改密码
    document.getElementById('passwordModalClose')?.addEventListener('click', closePasswordModal);
    document.getElementById('passwordSubmit')?.addEventListener('click', submitPassword);

    // 我的构建面板
    document.getElementById('packagesClose')?.addEventListener('click', closeMyPackages);

    // 搜索功能 - 防抖输入 + 搜索按钮
    const searchInput = document.getElementById('packagesSearchInput');
    const searchDebounced = debounce(() => {
      const keyword = searchInput?.value.trim();
      currentPackagesFilters.search = keyword;
      loadMyTasks(1);
    }, 500);
    searchInput?.addEventListener('input', searchDebounced);
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const keyword = searchInput?.value.trim();
        currentPackagesFilters.search = keyword;
        loadMyTasks(1);
      }
    });
    document.getElementById('packagesSearchBtn')?.addEventListener('click', () => {
      const keyword = searchInput?.value.trim();
      currentPackagesFilters.search = keyword;
      loadMyTasks(1);
    });

    document.getElementById('packagesStatusFilter')?.addEventListener('change', (e) => {
      currentPackagesFilters.status = e.target.value;
      loadMyTasks(1);
    });
    document.getElementById('packagesCategoryFilter')?.addEventListener('change', (e) => {
      currentPackagesFilters.categoryId = e.target.value;
      loadMyTasks(1);
    });
    document.getElementById('packagesSortOrder')?.addEventListener('change', (e) => {
      currentPackagesFilters.sortOrder = e.target.value;
      loadMyTasks(1);
    });


    // 新建夹子
    document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
      const name = prompt('请输入新夹子名称:');
      if (name && name.trim()) createCategory(name.trim());
    });

    // 删除确认
    document.getElementById('deleteConfirmClose')?.addEventListener('click', closeDeleteConfirm);
    document.getElementById('deleteCancelBtn')?.addEventListener('click', closeDeleteConfirm);
    document.getElementById('deleteConfirmBtn')?.addEventListener('click', confirmDelete);

    // 重命名
    document.getElementById('renameModalClose')?.addEventListener('click', closeRenameModal);
    document.getElementById('renameSubmit')?.addEventListener('click', submitRename);
    document.getElementById('renameInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
    });

    // 备注
    document.getElementById('noteModalClose')?.addEventListener('click', closeNoteModal);
    document.getElementById('noteSubmit')?.addEventListener('click', submitNote);
    document.getElementById('noteInput')?.addEventListener('input', (e) => {
      const countEl = document.getElementById('noteCharCount');
      if (countEl) countEl.textContent = e.target.value.length;
    });

    // 迁移
    document.getElementById('migrateModalClose')?.addEventListener('click', closeMigrateModal);
    document.getElementById('migrateSkipBtn')?.addEventListener('click', () => { clearGuestTasks(); closeMigrateModal(); });
    document.getElementById('migrateConfirmBtn')?.addEventListener('click', confirmMigrate);
  }

  // 防抖
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ========== 刷新构建列表（供外部调用）==========
  function refreshPackages() {
    const panel = document.getElementById('packagesPanel');
    if (panel && panel.style.display !== 'none' && isLoggedIn()) {
      loadMyTasks(currentPackagesPage);
    }
  }

  // ========== 初始化 ==========
  function init() {
    bindEvents();
    setupPackageListDelegation();
    updateNavbar();
    showQuotaBar();
  }

  // 暴露到全局
  window.wpAuth = {
    getToken, setToken, clearToken, isLoggedIn,
    apiRequest, login, register, logout, checkAuth,
    getQuota, showQuotaBar, updateNavbar,
    openAuthModal, closeAuthModal,
    openMyPackages, closeMyPackages,
    loadMyTasks, loadCategories,
    saveGuestTask, getGuestTasks, clearGuestTasks,
    refreshPackages, showToast,
    init,
  };

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
