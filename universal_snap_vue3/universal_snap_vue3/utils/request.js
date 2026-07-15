// ============================================================
// 跨端网络请求封装
// 小程序 / App / H5 统一入口，自动适配 BASE_URL
// ============================================================

/**
 * 环境配置说明：
 *
 * 【开发环境】（当前）
 * - 小程序：本地 Python Flask 服务 http://192.168.124.35:5001
 * - App 真机调试：需改为电脑当前局域网 IP（每次可能变化）
 * - H5：同上或使用代理
 *
 * 【生产环境】（部署至 Render 后）
 * - 需要修改 PROD_URL 为你的 Render 域名
 * - 小程序：需在微信公众平台 → 开发管理 → 服务器域名 添加 request 合法域名
 * - App：需在 manifest.json → app-plus → networkSecurityConfig 配置 trust-ssl
 */

// 默认开发环境地址（App 端真机调试请改为电脑局域网 IP）
const DEV_URL = 'http://192.168.124.35:5001';

// 生产环境地址（部署到 Render 后修改此处）
const PROD_URL = 'https://your-app-name.onrender.com';

// 运行时平台检测
const isApp = typeof plus !== 'undefined';

// 自动选择 BASE_URL：开发环境用局域网 IP，生产环境用正式域名
let BASE_URL = (() => {
  // #ifdef MP-WEIXIN
  // 小程序：通过编译模式判断（开发版/体验版/正式版）
  const accountInfo = uni.getAccountInfoSync ? uni.getAccountInfoSync() : {};
  const envVersion = accountInfo.miniProgram ? accountInfo.miniProgram.envVersion : 'develop';
  if (envVersion === 'release') {
    return PROD_URL;
  }
  return DEV_URL;
  // #endif

  // #ifdef APP-PLUS
  // App：通过 plus.runtime.arguments 或自定义配置判断
  try {
    // 方式1：检查是否为打包后的正式版本（无 debugger）
    if (typeof __wxConfig !== 'undefined' && __wxConfig.debug === false) {
      return PROD_URL;
    }
    // 方式2：检查是否连接调试器
    if (!isApp || !plus.webview) {
      return DEV_URL;
    }
    return DEV_URL; // 默认开发环境，发布前手动改为 PROD_URL
  } catch (_) {
    return DEV_URL;
  }
  // #endif

  // #ifdef H5
  // H5：根据 hostname 判断
  if (typeof window !== 'undefined' && window.location) {
    const isLocalhost = /^localhost|^127\.0\.0\.1|^192\.168\./.test(window.location.hostname);
    return isLocalhost ? DEV_URL : PROD_URL;
  }
  return DEV_URL;
  // #endif

  return DEV_URL;
})();

const DEFAULT_TIMEOUT = 30000;
const APP_RETRY_COUNT = 2;
const APP_RETRY_DELAY = 1500;

const normalizePath = (url = '') => {
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

export const getBaseUrl = () => BASE_URL;

export const setBaseUrl = (url) => {
  BASE_URL = String(url || '').replace(/\/$/, '');
};

const requestInterceptor = (config) => {
  const token = uni.getStorageSync('token');
  const header = {
    'Content-Type': 'application/json',
    ...(config.header || {})
  };

  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  return {
    timeout: DEFAULT_TIMEOUT,
    ...config,
    url: normalizePath(config.url),
    header
  };
};

const responseInterceptor = (response) => {
  const { statusCode, data } = response;

  if (statusCode === 401) {
    uni.removeStorageSync('token');
    uni.removeStorageSync('username');
    uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
    setTimeout(() => {
      uni.redirectTo({ url: '/pages/login/index' });
    }, 800);
  }

  if (statusCode >= 500) {
    uni.showToast({ title: '服务器异常，请稍后重试', icon: 'none' });
  }

  return response;
};

export const request = (config) => {
  const finalConfig = requestInterceptor(config);
  const maxRetries = isApp ? APP_RETRY_COUNT : 0;

  const doRequest = (retriesLeft) => new Promise((resolve, reject) => {
    uni.request({
      ...finalConfig,
      success: (res) => resolve(responseInterceptor(res)),
      fail: (err) => {
        if (retriesLeft > 0 && _isRetryableError(err)) {
          console.warn(`[Request] 请求失败，${APP_RETRY_DELAY}ms 后重试 (剩余 ${retriesLeft} 次):`, err.errMsg);
          setTimeout(() => {
            doRequest(retriesLeft - 1).then(resolve).catch(reject);
          }, APP_RETRY_DELAY);
        } else {
          if (retriesLeft === 0) {
            uni.showToast({ title: '网络请求失败，请检查网络', icon: 'none' });
          }
          reject(err);
        }
      }
    });
  });

  return doRequest(maxRetries);
};

/**
 * 判断是否为可重试的网络错误（超时、连接断开等）
 */
function _isRetryableError(err) {
  if (!err || !err.errMsg) return false;
  const msg = err.errMsg.toLowerCase();
  return msg.includes('timeout') ||
         msg.includes('fail') ||
         msg.includes('abort') ||
         msg.includes('network');
}

export const get = (url, data = {}, config = {}) => request({ ...config, url, data, method: 'GET' });
export const post = (url, data = {}, config = {}) => request({ ...config, url, data, method: 'POST' });
export const put = (url, data = {}, config = {}) => request({ ...config, url, data, method: 'PUT' });
export const del = (url, data = {}, config = {}) => request({ ...config, url, data, method: 'DELETE' });

export const upload = (url, filePath, options = {}) => {
  const token = uni.getStorageSync('token');
  const header = { ...(options.header || {}) };
  if (token) header.Authorization = `Bearer ${token}`;

  const maxRetries = options.retries ?? 1;

  const attempt = (retriesLeft) => new Promise((resolve, reject) => {
    uni.uploadFile({
      url: normalizePath(url),
      filePath,
      name: options.name || 'file',
      formData: options.formData || {},
      header,
      timeout: options.timeout || 45000,
      success: (res) => {
        let data = res.data;
        try {
          data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } catch (error) {
          reject(new Error('解析服务器响应失败'));
          return;
        }
        resolve(responseInterceptor({ ...res, data }));
      },
      fail: (err) => {
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1).then(resolve).catch(reject), 2000);
        } else {
          uni.showToast({ title: '文件上传失败', icon: 'none' });
          reject(err);
        }
      }
    });
  });

  return attempt(maxRetries);
};

export const fetchCaptchaApi = () => get('/api/captcha');
export const loginApi = (data) => post('/login', data);
export const loginFaceApi = (faceData) => post('/login-face', { face_data: faceData });
export const registerApi = (data) => post('/register', data);
export const updateFaceApi = (faceData) => post('/update-face', { face_data: faceData });
export const getUserInfoApi = () => get('/api/user/info');
export const updateUserProfileApi = (filePath, formData = {}) => {
  if (!filePath) {
    // 后端用 request.form 解析，无文件时也要走 x-www-form-urlencoded 而非 JSON
    return request({
      url: '/api/user/update',
      method: 'POST',
      data: formData,
      header: { 'content-type': 'application/x-www-form-urlencoded' }
    });
  }
  return upload('/api/user/update', filePath, { name: 'avatar', formData });
};
export const changePasswordApi = (oldPassword, newPassword) =>
  post('/api/user/change-password', { old_password: oldPassword, new_password: newPassword });
export const fetchHistoryApi = (type) => get('/api/history', { type });

export const uploadImageToServer = (filePath) => {
  return upload('/analyze', filePath).then((res) => res.data);
};

export const analyzeEnvApi = (filePath) => {
  return upload('/analyze-env', filePath).then((res) => res.data);
};

export const analyzeTemplateApi = (filePath, saveAsTemplate = false) => {
  return upload('/analyze-template', filePath, {
    formData: { save_as_template: saveAsTemplate ? 'true' : 'false' }
  }).then((res) => res.data);
};

export const analyzeApi = (filePath, formData = {}) => upload('/analyze', filePath, { formData });
export const smartAnalyzeApi = (filePath, formData = {}) => upload('/smart-analyze', filePath, { formData });
export const grokAnalyzeApi = (filePath) => upload('/analyze-grok', filePath);
// 专业模式：PaliGemma + Qwen-VL 三段流水，超时 90s（含本地模型推理时间）
export const proAnalyzeApi = (filePath, formData = {}) => upload('/pro-analyze', filePath, { formData, timeout: 90000 });
export const generateSketchApi = (filePath) => upload('/generate-sketch', filePath);
export const detectPoseApi = (filePath) => upload('/detect-pose', filePath, { timeout: 10000 });
// 手势识别：剪刀手拍照触发，走独立数据流，超时对齐骨骼追踪帧率节奏
export const detectGestureApi = (filePath) => upload('/detect-gesture', filePath, { timeout: 8000 });

export const fetchTemplateList = () => get('/api/templates');
export const deleteTemplateApi = (id) => del(`/api/delete?template_id=${encodeURIComponent(id)}`);

// --- 地铁模式：转辙机遗留物(FOD)检测 ---
export const metroModelsApi = () => get('/metro/models');
export const metroGetDeviceApi = (deviceCode) => get(`/metro/device/${encodeURIComponent(deviceCode)}`);
export const metroRegisterDeviceApi = (filePath, formData = {}) => {
  // 含基准图时用 upload；纯登记也走 upload(无 file 字段亦可, 这里要求传基准图)
  return upload('/metro/devices/register', filePath, { name: 'baseline', formData, timeout: 60000 })
    .then((res) => res.data);
};
// 核心检测：含 OpenCV 配准, 超时放宽到 60s
export const metroDetectApi = (filePath, formData = {}) =>
  upload('/metro/detect', filePath, { formData, timeout: 60000 }).then((res) => res.data);
export const metroConfirmApi = (traceId, data) =>
  post(`/metro/inspection/${encodeURIComponent(traceId)}/confirm`, data);
export const metroListApi = (params = {}) => get('/metro/inspections', params);

export default {
  request,
  get,
  post,
  put,
  delete: del,
  upload,
  getBaseUrl,
  setBaseUrl
};