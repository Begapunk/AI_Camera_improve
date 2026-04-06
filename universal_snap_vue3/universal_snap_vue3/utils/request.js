// utils/request.js
const STORAGE_KEY = 'base_url';
const DEFAULT_URL = 'http://10.60.35.126:5001';  // 默认地址

/**
 * 获取当前服务器地址
 * @returns {string}
 */
export function getBaseUrl() {
  const stored = uni.getStorageSync(STORAGE_KEY);
  if (stored && typeof stored === 'string' && stored.trim()) {
    return stored;
  }
  return DEFAULT_URL;
}

/**
 * 设置服务器地址（并持久化存储）
 * @param {string} url
 */
export function setBaseUrl(url) {
  if (!url || typeof url !== 'string') return;
  uni.setStorageSync(STORAGE_KEY, url);
}

/**
 * 基础请求封装
 * @param {string} url 接口路径
 * @param {string} method 请求方法
 * @param {object} data 请求数据
 * @returns {Promise}
 */
export function http(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: getBaseUrl() + url,
      method: method,
      data: data,
      header: { 'Content-Type': 'application/json' },
      success: res => resolve(res),
      fail: err => reject(err)
    });
  });
}

// 登录
export function loginApi(username, password) {
  return http('/login', 'POST', { username, password });
}

// 注册
export function registerApi(username, password) {
  return http('/register', 'POST', { username, password });
}

// 分析自拍
export function uploadImageToServer(filePath) {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: getBaseUrl() + '/analyze',
      filePath: filePath,
      name: 'file',
      success: ({ data }) => {
        try { resolve(JSON.parse(data)); }
        catch { reject('解析服务器响应失败'); }
      },
      fail: () => reject('上传失败，请检查网络或服务器')
    });
  });
}

// 环境分析
export function analyzeEnvApi(filePath) {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: getBaseUrl() + '/analyze-env',
      filePath: filePath,
      name: 'file',
      success: ({ data }) => {
        try { resolve(JSON.parse(data)); }
        catch { reject('解析服务器响应失败'); }
      },
      fail: () => reject('上传失败，请检查网络或服务器')
    });
  });
}

// 模板评分
export function analyzeTemplateApi(filePath, saveAsTemplate = false) {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: getBaseUrl() + '/analyze-template',
      filePath: filePath,
      name: 'file',
      formData: { save_as_template: saveAsTemplate ? 'true' : 'false' },
      success: ({ data }) => {
        try { resolve(JSON.parse(data)); }
        catch { reject('解析服务器响应失败'); }
      },
      fail: () => reject('上传失败，请检查网络或服务器')
    });
  });
}

// 请求模板列表
export function fetchTemplateList() {
  return uni.request({
    url: getBaseUrl() + '/api/templates',
    method: 'GET'
  }).then(res => res[1] ?? res);
}

// 删除模板
export function deleteTemplateApi(id) {
  return uni.request({
    url: `${getBaseUrl()}/api/delete?template_id=${id}`,
    method: 'DELETE'
  }).then(res => res[1] ?? res);
}