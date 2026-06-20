/**
 * Web-Package - 前端交互逻辑
 * 包含：启动动画、网址验证、图标上传、操作指引、构建进度
 */

// ========== Splash Screen (runs immediately) ==========
(function() {
  var bar = document.getElementById('splashBar');
  var pct = document.getElementById('splashPct');
  var splash = document.getElementById('splash');
  if (!bar || !pct || !splash) return;

  var progress = 0;
  var done = false;

  function setProgress(v) {
    progress = Math.min(v, 100);
    bar.style.width = progress + '%';
    pct.textContent = Math.round(progress) + '%';
  }

  // Simulate progress: fast to 70, slow to 90, wait for real load
  var timer = setInterval(function() {
    if (done) return;
    if (progress < 70) setProgress(progress + Math.random() * 12 + 3);
    else if (progress < 90) setProgress(progress + Math.random() * 2 + 0.5);
  }, 200);

  function finish() {
    if (done) return;
    done = true;
    clearInterval(timer);
    setProgress(100);
    setTimeout(function() {
      splash.classList.add('hide');
      setTimeout(function() { splash.remove(); }, 700);
    }, 400);
  }

  // Finish on full page load
  window.addEventListener('load', function() {
    setTimeout(finish, 300);
  });

  // Fallback: auto-finish after 5s even if load event didn't fire
  setTimeout(finish, 5000);
})();

(function () {
  'use strict';

  // ========== DOM 元素引用 ==========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // 安全获取元素，缺失时返回空代理避免 null 报错
  const $safe = (sel) => {
    const el = document.querySelector(sel);
    if (el) return el;
    console.warn('[Web-Package] DOM element not found:', sel);
    return new Proxy({}, {
      get: () => () => {},
      set: () => true,
    });
  };

  const urlInput = $safe('#urlInput');
  const urlInputWrapper = $safe('#urlInputWrapper');
  const urlValidateBtn = $safe('#urlValidateBtn');
  const urlHint = $safe('#urlHint');
  const urlError = $safe('#urlError');
  const urlSuccess = $safe('#urlSuccess');
  const urlStatus = $safe('#urlStatus');

  const uploadZone = $safe('#uploadZone');
  const uploadContent = $safe('#uploadContent');
  const uploadPreview = $safe('#uploadPreview');
  const previewImage = $safe('#previewImage');
  const previewInfo = $safe('#previewInfo');
  const replaceBtn = $safe('#replaceBtn');
  const iconFileInput = $safe('#iconFileInput');
  const uploadProgress = $safe('#uploadProgress');
  const progressFill = $safe('#progressFill');
  const progressText = $safe('#progressText');

  const appNameInput = $safe('#appName');
  const packageNameInput = $safe('#packageName');
  const appNameCount = $safe('#appNameCount');
  const packageNameCount = $safe('#packageNameCount');

  const generateBtn = $safe('#generateBtn');
  const buildModal = $safe('#buildModal');
  const successModal = $safe('#successModal');
  const progressCircle = $safe('#progressCircle');
  const progressPercent = $safe('#progressPercent');
  const elapsedTime = $safe('#elapsedTime');

  // ========== 状态管理 ==========
  const state = {
    urlValid: false,
    iconUploaded: false,
    iconFile: null,
    submitting: false,
  };

  // ========== 工具函数 ==========
  function showToast(message, type = 'success') {
    const container = $safe('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
    };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function updateGenerateBtn() {
    generateBtn.disabled = !(state.urlValid && state.iconUploaded) || state.submitting;
  }

  // ========== 网址验证 ==========
  const URL_PATTERN = /^https?:\/\/([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;

  function validateUrl(value) {
    if (!value || value.trim() === '') {
      return { valid: false, message: '请输入网站地址' };
    }

    // 自动补全协议
    let url = value.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    if (!URL_PATTERN.test(url)) {
      return { valid: false, message: '网址格式不正确，请输入完整的URL，例如: https://www.example.com' };
    }

    if (url.startsWith('http://')) {
      return { valid: true, message: '网址格式正确（建议使用 HTTPS 协议）', warning: true, url };
    }

    return { valid: true, message: '网址验证通过', url };
  }

  function showUrlResult(result) {
    urlError.style.display = 'none';
    urlSuccess.style.display = 'none';
    urlHint.style.display = 'none';

    if (result.valid) {
      urlInputWrapper.classList.remove('error');
      urlInputWrapper.classList.add('success');
      urlStatus.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

      if (result.warning) {
        urlSuccess.innerHTML = `<span>⚠</span><span>${result.message}</span>`;
        urlSuccess.style.display = 'flex';
        urlSuccess.style.background = '#FFFBEB';
        urlSuccess.style.borderColor = '#FBBF24';
        urlSuccess.style.color = '#92400E';
      } else {
        urlSuccess.innerHTML = `<span>✓</span><span>${result.message}</span>`;
        urlSuccess.style.display = 'flex';
        urlSuccess.style.background = '';
        urlSuccess.style.borderColor = '';
        urlSuccess.style.color = '';
      }

      state.urlValid = true;
      if (result.url) urlInput.value = result.url;
    } else {
      urlInputWrapper.classList.remove('success');
      urlInputWrapper.classList.add('error');
      urlStatus.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      urlError.innerHTML = `<span>✕</span><span>${result.message}</span>`;
      urlError.style.display = 'flex';
      state.urlValid = false;
    }

    updateGenerateBtn();
  }

  // 防抖
  let debounceTimer = null;
  function debounce(fn, delay) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // 输入事件
  urlInput.addEventListener('focus', () => {
    urlInputWrapper.classList.add('focused');
  });

  urlInput.addEventListener('blur', () => {
    urlInputWrapper.classList.remove('focused');
    if (urlInput.value.trim()) {
      const result = validateUrl(urlInput.value);
      showUrlResult(result);
    }
  });

  urlInput.addEventListener('input', debounce(() => {
    const val = urlInput.value.trim();
    if (!val) {
      urlInputWrapper.classList.remove('error', 'success');
      urlError.style.display = 'none';
      urlSuccess.style.display = 'none';
      urlHint.style.display = 'flex';
      urlStatus.innerHTML = '';
      state.urlValid = false;
      updateGenerateBtn();
      return;
    }
    const result = validateUrl(val);
    showUrlResult(result);
  }, 500));

  // 验证按钮
  urlValidateBtn.addEventListener('click', () => {
    const result = validateUrl(urlInput.value);
    showUrlResult(result);
    if (result.valid) {
      showToast('网址验证通过');
    }
  });

  // 回车验证
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const result = validateUrl(urlInput.value);
      showUrlResult(result);
    }
  });

  // 快捷示例
  $$('.example-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const url = chip.dataset.url;
      urlInput.value = url;
      const result = validateUrl(url);
      showUrlResult(result);
    });
  });

  // ========== 图标上传 ==========
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  // ========== 图片裁剪 ==========
  let cropper = null;
  let pendingCropFile = null;
  const cropModal = $safe('#cropModal');
  const cropImage = $safe('#cropImage');
  const cropConfirmBtn = $safe('#cropConfirmBtn');
  const cropCancelBtn = $safe('#cropCancelBtn');
  const cropModalClose = $safe('#cropModalClose');

  function openCropModal(file) {
    pendingCropFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      cropImage.src = e.target.result;
      cropModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      // Destroy previous cropper instance
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }

      // Wait for image to load before initializing cropper
      cropImage.onload = () => {
        cropper = new Cropper(cropImage, {
          aspectRatio: 1,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.9,
          responsive: true,
          restore: false,
          guides: true,
          center: true,
          highlight: true,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
          preview: [
            document.getElementById('cropPreview64'),
            document.getElementById('cropPreview48'),
            document.getElementById('cropPreview32'),
          ],
        });
      };
    };
    reader.readAsDataURL(file);
  }

  function closeCropModal() {
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    cropModal.style.display = 'none';
    document.body.style.overflow = '';
    pendingCropFile = null;
    cropImage.src = '';
  }

  // Crop modal close buttons
  cropModalClose.addEventListener('click', closeCropModal);
  cropCancelBtn.addEventListener('click', closeCropModal);
  cropModal.addEventListener('click', (e) => {
    if (e.target === cropModal) closeCropModal();
  });

  // Aspect ratio buttons
  $$('.crop-aspect-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (cropper) {
        const ratio = parseFloat(btn.dataset.ratio);
        cropper.setAspectRatio(ratio === 0 ? NaN : ratio);
      }
    });
  });

  // Tool buttons
  $safe('#cropRotateLeft').addEventListener('click', () => {
    if (cropper) cropper.rotate(-90);
  });
  $safe('#cropRotateRight').addEventListener('click', () => {
    if (cropper) cropper.rotate(90);
  });
  $safe('#cropZoomIn').addEventListener('click', () => {
    if (cropper) cropper.zoom(0.1);
  });
  $safe('#cropZoomOut').addEventListener('click', () => {
    if (cropper) cropper.zoom(-0.1);
  });
  $safe('#cropReset').addEventListener('click', () => {
    if (cropper) cropper.reset();
  });

  // Confirm crop
  cropConfirmBtn.addEventListener('click', () => {
    if (!cropper) return;

    const canvas = cropper.getCroppedCanvas({
      width: 512,
      height: 512,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    if (!canvas) {
      showToast('裁剪失败，请重试', 'error');
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('裁剪失败，请重试', 'error');
        return;
      }

      // Create a new File from the blob
      const croppedFile = new File([blob], pendingCropFile ? pendingCropFile.name.replace(/\.\w+$/, '.png') : 'icon.png', {
        type: 'image/png',
        lastModified: Date.now(),
      });

      closeCropModal();
      state.iconFile = croppedFile;
      simulateUpload(croppedFile);
    }, 'image/png');
  });

  function handleFile(file) {
    // 类型检查
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('不支持的文件格式，请上传 PNG/JPG/SVG/WebP 文件', 'error');
      return;
    }

    // 大小检查
    if (file.size > MAX_SIZE) {
      showToast('文件大小超过 5MB 限制', 'error');
      return;
    }

    // SVG files skip cropping (vector format)
    if (file.type === 'image/svg+xml') {
      state.iconFile = file;
      simulateUpload(file);
      return;
    }

    // Open crop modal for raster images
    openCropModal(file);
  }

  function simulateUpload(file) {
    // 显示进度条
    uploadProgress.style.display = 'flex';
    let progress = 0;

    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        onUploadComplete(file);
      }
      progressFill.style.width = progress + '%';
      progressText.textContent = Math.round(progress) + '%';
    }, 200);
  }

  function onUploadComplete(file) {
    // 显示预览
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;

      // 获取图片尺寸
      const img = new Image();
      img.onload = () => {
        previewInfo.innerHTML = `
          <div class="info-name">${file.name}</div>
          <div class="info-size">${formatFileSize(file.size)}</div>
          <div class="info-dimensions">${img.width} × ${img.height} px</div>
          ${img.width !== img.height ? '<div style="color:#F59E0B;font-size:12px;">⚠ 建议使用正方形图片</div>' : ''}
        `;
      };
      img.src = e.target.result;

      uploadContent.style.display = 'none';
      uploadPreview.style.display = 'flex';
      uploadZone.classList.add('has-file');
      uploadProgress.style.display = 'none';

      state.iconUploaded = true;
      updateGenerateBtn();
      showToast('图标上传成功');
    };
    reader.readAsDataURL(file);
  }

  // 点击上传
  uploadZone.addEventListener('click', (e) => {
    if (e.target === replaceBtn || e.target.closest('#replaceBtn')) return;
    iconFileInput.click();
  });

  iconFileInput.addEventListener('change', () => {
    if (iconFileInput.files.length > 0) {
      handleFile(iconFileInput.files[0]);
    }
  });

  // 拖拽上传
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // 更换图标
  replaceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    iconFileInput.click();
  });

  // ========== 配置字段 ==========
  appNameInput.addEventListener('input', () => {
    appNameCount.textContent = appNameInput.value.length;
  });

  packageNameInput.addEventListener('input', () => {
    packageNameCount.textContent = packageNameInput.value.length;
    // 自动转小写
    packageNameInput.value = packageNameInput.value.toLowerCase().replace(/[^a-z0-9.]/g, '');
    // 校验包名格式（至少两段，如 com.example.app）
    const val = packageNameInput.value;
    if (val && !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(val)) {
      packageNameInput.classList.add('error');
    } else {
      packageNameInput.classList.remove('error');
    }
  });

  // ========== 操作指引系统 ==========
  $$('.help-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.help;
      const tooltip = document.getElementById(targetId);
      const isActive = tooltip.classList.contains('visible');

      // 关闭所有其他tooltip
      $$('.help-tooltip').forEach((t) => t.classList.remove('visible'));
      $$('.help-btn').forEach((b) => b.classList.remove('active'));

      if (!isActive) {
        tooltip.classList.add('visible');
        btn.classList.add('active');
      }
    });
  });

  // 点击其他区域关闭tooltip
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.help-btn') && !e.target.closest('.help-tooltip')) {
      $$('.help-tooltip').forEach((t) => t.classList.remove('visible'));
      $$('.help-btn').forEach((b) => b.classList.remove('active'));
    }
  });

  // ========== 生成APK ==========
  generateBtn.addEventListener('click', async () => {
    if (generateBtn.disabled || state.submitting) return;

    // 最终验证
    const urlResult = validateUrl(urlInput.value);
    if (!urlResult.valid) {
      showUrlResult(urlResult);
      return;
    }

    if (!state.iconUploaded) {
      showToast('请先上传应用图标', 'warning');
      return;
    }

    state.submitting = true;
    generateBtn.disabled = true;
    generateBtn.querySelector('.btn-text').style.display = 'none';
    generateBtn.querySelector('.btn-loading').style.display = 'flex';

    try {
      // 调用API
      const formData = new FormData();
      formData.append('url', urlResult.url || urlInput.value);
      formData.append('icon', state.iconFile);
      if (appNameInput.value.trim()) formData.append('appName', appNameInput.value.trim());
      if (packageNameInput.value.trim()) formData.append('packageName', packageNameInput.value.trim());

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      let result;
      try {
        result = await response.json();
      } catch {
        showToast('服务器响应异常 (HTTP ' + response.status + ')', 'error');
        return;
      }

      if (result.success) {
        showToast('任务创建成功');
        openBuildModal(result.taskId);
        // 连接WebSocket接收真实进度
        connectBuildProgress(result.taskId);
      } else {
        const msg = result.message || '创建任务失败';
        showToast(msg, 'error');
        // 特殊处理：构建环境未就绪
        if (result.errorCode === 'BUILD_ENV_NOT_READY') {
          showToast('请先运行 node setup-android-env.js 安装构建环境', 'warning');
        }
      }
    } catch (err) {
      showToast('网络错误，请稍后重试', 'error');
    } finally {
      state.submitting = false;
      generateBtn.querySelector('.btn-text').style.display = '';
      generateBtn.querySelector('.btn-loading').style.display = 'none';
      updateGenerateBtn();
    }
  });

  // ========== 构建进度弹窗 ==========
  function openBuildModal(taskId) {
    buildModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    resetBuildSteps();
    startElapsedTimer();
  }

  function closeBuildModal() {
    buildModal.style.display = 'none';
    document.body.style.overflow = '';
    stopElapsedTimer();
  }

  $safe('#modalClose').addEventListener('click', closeBuildModal);

  buildModal.addEventListener('click', (e) => {
    if (e.target === buildModal) closeBuildModal();
  });

  function resetBuildSteps() {
    $$('.build-step').forEach((step) => {
      step.classList.remove('active', 'completed');
      step.querySelector('.build-step-icon').className = 'build-step-icon pending';
      step.querySelector('.build-step-icon').innerHTML = '';
    });
    updateProgressRing(0);
  }

  function updateProgressRing(percent) {
    const circumference = 2 * Math.PI * 54; // 339.292
    const offset = circumference - (percent / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
    progressPercent.textContent = Math.round(percent);
  }

  // ========== WebSocket 构建进度 ==========
  let buildWs = null;
  let currentTaskId = null;
  let currentDownloadUrl = null;
  let wsReconnectAttempts = 0;
  const WS_MAX_RECONNECT = 5;       // 最大重连次数
  const WS_RECONNECT_DELAY = 2000;   // 重连基础延迟(ms)
  let wsIntentionalClose = false;     // 是否主动关闭
  let wsReconnectTimer = null;

  function connectBuildProgress(taskId) {
    resetBuildSteps();
    startElapsedTimer();
    currentTaskId = taskId;
    currentDownloadUrl = null;
    wsReconnectAttempts = 0;
    wsIntentionalClose = false;
    createWebSocket(taskId);
  }

  function createWebSocket(taskId) {
    // 构建WebSocket地址
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${location.host}/ws/${taskId}`;

    buildWs = new WebSocket(wsUrl);

    buildWs.onopen = () => {
      console.log('[WS] 已连接，taskId:', taskId);
      wsReconnectAttempts = 0; // 连接成功，重置重连计数
    };

    buildWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleBuildMessage(data);
      } catch (e) {
        console.error('[WS] 消息解析失败:', e);
      }
    };

    buildWs.onerror = (err) => {
      console.error('[WS] 连接错误:', err);
      // 不在这里触发重连，让onclose统一处理
    };

    buildWs.onclose = (event) => {
      console.log(`[WS] 连接关闭: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
      buildWs = null;

      // 区分正常关闭和异常断开
      // 正常关闭码: 1000(正常), 1001(端点离开), 1005(无状态码)
      // 主动关闭: wsIntentionalClose = true
      if (wsIntentionalClose) {
        console.log('[WS] 主动关闭，不重连');
        return;
      }

      // 异常关闭码（非正常关闭）
      const abnormalCodes = [1002, 1003, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 4001, 4002];
      if (abnormalCodes.includes(event.code) || !event.wasClean) {
        console.log(`[WS] 异常关闭(code=${event.code})，尝试重连`);
        attemptReconnect(taskId);
      }
    };
  }

  function attemptReconnect(taskId) {
    if (wsReconnectAttempts >= WS_MAX_RECONNECT) {
      console.log(`[WS] 已达最大重连次数(${WS_MAX_RECONNECT})，降级为轮询`);
      fallbackToPolling(taskId);
      return;
    }

    wsReconnectAttempts++;
    // 指数退避: 2s, 4s, 8s, 16s, 32s
    const delay = WS_RECONNECT_DELAY * Math.pow(2, wsReconnectAttempts - 1);
    console.log(`[WS] ${delay}ms后第${wsReconnectAttempts}次重连...`);

    wsReconnectTimer = setTimeout(() => {
      if (wsIntentionalClose) return;
      console.log(`[WS] 正在重连... (第${wsReconnectAttempts}次)`);
      createWebSocket(taskId);
    }, delay);
  }

  function closeBuildWs() {
    wsIntentionalClose = true;
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (buildWs) {
      buildWs.close(1000, 'User initiated close');
      buildWs = null;
    }
  }

  function handleBuildMessage(data) {
    if (data.type === 'progress') {
      updateProgressRing(data.progress);
      updateBuildSteps(data.status, data.progress);
    } else if (data.type === 'completed') {
      updateProgressRing(100);
      markAllStepsCompleted();
      // 保存下载URL
      if (data.downloadUrl) {
        currentDownloadUrl = data.downloadUrl;
      }
      setTimeout(() => {
        closeBuildModal();
        openSuccessModal();
        closeBuildWs(); // 主动关闭，不触发重连
      }, 800);
    } else if (data.type === 'error' || data.type === 'failed') {
      stopElapsedTimer();
      closeBuildModal();
      // 显示错误信息
      const errorMsg = data.error || data.errorMessage || '构建过程中发生未知错误';
      const errorStep = data.currentStep || '构建失败';
      showToast(`${errorStep}: ${errorMsg}`, 'error', 8000);
      closeBuildWs(); // 主动关闭，不触发重连
    }
  }

  function updateBuildSteps(statusName, progress) {
    const stepMap = {
      'VALIDATING': 0, 'PREPARING': 1, 'BUILDING': 2, 'SIGNING': 3, 'UPLOADING': 4,
      'QUEUED': -1,
    };
    const activeIdx = stepMap[statusName] ?? -1;

    $$('.build-step').forEach((step, idx) => {
      const iconEl = step.querySelector('.build-step-icon');
      if (idx < activeIdx) {
        step.classList.remove('active');
        step.classList.add('completed');
        iconEl.className = 'build-step-icon completed';
        iconEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
      } else if (idx === activeIdx) {
        step.classList.add('active');
        step.classList.remove('completed');
        iconEl.className = 'build-step-icon active';
        iconEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/></svg>';
      } else {
        step.classList.remove('active', 'completed');
        iconEl.className = 'build-step-icon pending';
        iconEl.innerHTML = '';
      }
    });
  }

  function markAllStepsCompleted() {
    $$('.build-step').forEach((step) => {
      step.classList.remove('active');
      step.classList.add('completed');
      const iconEl = step.querySelector('.build-step-icon');
      iconEl.className = 'build-step-icon completed';
      iconEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    });
  }

  // 降级轮询方案
  function fallbackToPolling(taskId) {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/task/${taskId}`);
        const result = await res.json();
        if (result.success) {
          handleBuildMessage({
            type: result.data.status === 'COMPLETED' ? 'completed' : 'progress',
            status: result.data.status,
            progress: result.data.progress,
            currentStep: result.data.currentStep,
          });
          if (result.data.status === 'COMPLETED' || result.data.status === 'FAILED') {
            clearInterval(pollInterval);
          }
        }
      } catch {
        clearInterval(pollInterval);
      }
    }, 2000);
  }

  // 计时器
  let elapsedTimer = null;
  let elapsedStart = 0;

  function startElapsedTimer() {
    elapsedStart = Date.now();
    elapsedTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - elapsedStart) / 1000);
      const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      elapsedTime.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopElapsedTimer() {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  // ========== 成功弹窗 ==========
  function openSuccessModal() {
    successModal.style.display = 'flex';
  }

  function closeSuccessModal() {
    successModal.style.display = 'none';
  }

  $safe('#downloadBtn').addEventListener('click', () => {
    if (currentDownloadUrl) {
      // 使用真实下载URL触发下载
      const a = document.createElement('a');
      a.href = currentDownloadUrl;
      a.download = `${currentTaskId || 'app'}.apk`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('APK 文件下载已开始', 'success');
    } else if (currentTaskId) {
      // 降级：查询任务获取下载Token
      fetch(`/api/task/${currentTaskId}`)
        .then(r => r.json())
        .then(result => {
          if (result.success && result.data.downloadToken) {
            const url = `/api/download/${currentTaskId}?token=${result.data.downloadToken}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = `app.apk`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('APK 文件下载已开始', 'success');
          } else {
            showToast('下载链接获取失败，请稍后重试', 'error');
          }
        })
        .catch(() => showToast('网络错误，请稍后重试', 'error'));
    } else {
      showToast('下载链接不可用', 'error');
    }
  });

  $safe('#newBuildBtn').addEventListener('click', () => {
    closeSuccessModal();
    resetForm();
  });

  $safe('#closeSuccessBtn').addEventListener('click', closeSuccessModal);

  successModal.addEventListener('click', (e) => {
    if (e.target === successModal) closeSuccessModal();
  });

  function resetForm() {
    urlInput.value = '';
    urlInputWrapper.classList.remove('error', 'success');
    urlError.style.display = 'none';
    urlSuccess.style.display = 'none';
    urlHint.style.display = 'flex';
    urlStatus.innerHTML = '';

    uploadContent.style.display = '';
    uploadPreview.style.display = 'none';
    uploadZone.classList.remove('has-file');
    uploadProgress.style.display = 'none';
    progressFill.style.width = '0%';

    appNameInput.value = '';
    packageNameInput.value = '';
    appNameCount.textContent = '0';
    packageNameCount.textContent = '0';

    state.urlValid = false;
    state.iconUploaded = false;
    state.iconFile = null;
    updateGenerateBtn();
  }

  // ========== 引导动画：首次访问高亮 ==========
  function runOnboardingGuide() {
    const visited = localStorage.getItem('webpackage_visited');
    if (visited) return;

    localStorage.setItem('webpackage_visited', 'true');

    // 简单的脉冲高亮效果
    const sections = [
      { el: $safe('#section-url'), delay: 500 },
      { el: $safe('#section-icon'), delay: 1500 },
      { el: $safe('#section-config'), delay: 2500 },
    ];

    sections.forEach(({ el, delay }) => {
      setTimeout(() => {
        el.style.transition = 'box-shadow 0.5s ease';
        el.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.3), 0 4px 14px rgba(37,99,235,0.15)';
        setTimeout(() => {
          el.style.boxShadow = '';
        }, 1200);
      }, delay);
    });
  }

  // ========== 平滑滚动 ==========
  $$('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ========== 初始化 ==========
  updateGenerateBtn();
  runOnboardingGuide();

})();
