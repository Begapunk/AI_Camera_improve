let BASE_URL = 'http://172.20.10.5:5001';

const DEFAULT_TIMEOUT = 30000;

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

  return new Promise((resolve, reject) => {
    uni.request({
      ...finalConfig,
      success: (res) => resolve(responseInterceptor(res)),
      fail: (err) => {
        uni.showToast({ title: '网络请求失败', icon: 'none' });
        reject(err);
      }
    });
  });
};

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
export const updateFaceApi = (data) => post('/update-face', data);
export const getUserInfoApi = (username) => get('/api/user/info', { username });

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
