"use strict";
const common_vendor = require("../common/vendor.js");
let BASE_URL = "http://172.20.10.5:5001";
const DEFAULT_TIMEOUT = 3e4;
const normalizePath = (url = "") => {
  if (/^https?:\/\//i.test(url))
    return url;
  return `${BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
};
const getBaseUrl = () => BASE_URL;
const setBaseUrl = (url) => {
  BASE_URL = String(url || "").replace(/\/$/, "");
};
const requestInterceptor = (config) => {
  const token = common_vendor.index.getStorageSync("token");
  const header = {
    "Content-Type": "application/json",
    ...config.header || {}
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
    common_vendor.index.removeStorageSync("token");
    common_vendor.index.showToast({ title: "登录已过期，请重新登录", icon: "none" });
    setTimeout(() => {
      common_vendor.index.redirectTo({ url: "/pages/login/index" });
    }, 800);
  }
  if (statusCode >= 500) {
    common_vendor.index.showToast({ title: "服务器异常，请稍后重试", icon: "none" });
  }
  return response;
};
const request = (config) => {
  const finalConfig = requestInterceptor(config);
  return new Promise((resolve, reject) => {
    common_vendor.index.request({
      ...finalConfig,
      success: (res) => resolve(responseInterceptor(res)),
      fail: (err) => {
        common_vendor.index.showToast({ title: "网络请求失败", icon: "none" });
        reject(err);
      }
    });
  });
};
const get = (url, data = {}, config = {}) => request({ ...config, url, data, method: "GET" });
const post = (url, data = {}, config = {}) => request({ ...config, url, data, method: "POST" });
const del = (url, data = {}, config = {}) => request({ ...config, url, data, method: "DELETE" });
const upload = (url, filePath, options = {}) => {
  const token = common_vendor.index.getStorageSync("token");
  const header = { ...options.header || {} };
  if (token)
    header.Authorization = `Bearer ${token}`;
  const maxRetries = options.retries ?? 1;
  const attempt = (retriesLeft) => new Promise((resolve, reject) => {
    common_vendor.index.uploadFile({
      url: normalizePath(url),
      filePath,
      name: options.name || "file",
      formData: options.formData || {},
      header,
      timeout: options.timeout || 45e3,
      success: (res) => {
        let data = res.data;
        try {
          data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        } catch (error) {
          reject(new Error("解析服务器响应失败"));
          return;
        }
        resolve(responseInterceptor({ ...res, data }));
      },
      fail: (err) => {
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1).then(resolve).catch(reject), 2e3);
        } else {
          common_vendor.index.showToast({ title: "文件上传失败", icon: "none" });
          reject(err);
        }
      }
    });
  });
  return attempt(maxRetries);
};
const fetchCaptchaApi = () => get("/api/captcha");
const loginApi = (data) => post("/login", data);
const loginFaceApi = (faceData) => post("/login-face", { face_data: faceData });
const registerApi = (data) => post("/register", data);
const updateFaceApi = (data) => post("/update-face", data);
const getUserInfoApi = (username) => get("/api/user/info", { username });
const analyzeEnvApi = (filePath) => {
  return upload("/analyze-env", filePath).then((res) => res.data);
};
const analyzeTemplateApi = (filePath, saveAsTemplate = false) => {
  return upload("/analyze-template", filePath, {
    formData: { save_as_template: saveAsTemplate ? "true" : "false" }
  }).then((res) => res.data);
};
const analyzeApi = (filePath, formData = {}) => upload("/analyze", filePath, { formData });
const smartAnalyzeApi = (filePath, formData = {}) => upload("/smart-analyze", filePath, { formData });
const grokAnalyzeApi = (filePath) => upload("/analyze-grok", filePath);
const proAnalyzeApi = (filePath, formData = {}) => upload("/pro-analyze", filePath, { formData, timeout: 9e4 });
const generateSketchApi = (filePath) => upload("/generate-sketch", filePath);
const detectPoseApi = (filePath) => upload("/detect-pose", filePath, { timeout: 1e4 });
const fetchTemplateList = () => get("/api/templates");
const deleteTemplateApi = (id) => del(`/api/delete?template_id=${encodeURIComponent(id)}`);
const metroModelsApi = () => get("/metro/models");
const metroGetDeviceApi = (deviceCode) => get(`/metro/device/${encodeURIComponent(deviceCode)}`);
const metroRegisterDeviceApi = (filePath, formData = {}) => {
  return upload("/metro/devices/register", filePath, { name: "baseline", formData, timeout: 6e4 }).then((res) => res.data);
};
const metroDetectApi = (filePath, formData = {}) => upload("/metro/detect", filePath, { formData, timeout: 6e4 }).then((res) => res.data);
const metroConfirmApi = (traceId, data) => post(`/metro/inspection/${encodeURIComponent(traceId)}/confirm`, data);
exports.analyzeApi = analyzeApi;
exports.analyzeEnvApi = analyzeEnvApi;
exports.analyzeTemplateApi = analyzeTemplateApi;
exports.deleteTemplateApi = deleteTemplateApi;
exports.detectPoseApi = detectPoseApi;
exports.fetchCaptchaApi = fetchCaptchaApi;
exports.fetchTemplateList = fetchTemplateList;
exports.generateSketchApi = generateSketchApi;
exports.getBaseUrl = getBaseUrl;
exports.getUserInfoApi = getUserInfoApi;
exports.grokAnalyzeApi = grokAnalyzeApi;
exports.loginApi = loginApi;
exports.loginFaceApi = loginFaceApi;
exports.metroConfirmApi = metroConfirmApi;
exports.metroDetectApi = metroDetectApi;
exports.metroGetDeviceApi = metroGetDeviceApi;
exports.metroModelsApi = metroModelsApi;
exports.metroRegisterDeviceApi = metroRegisterDeviceApi;
exports.proAnalyzeApi = proAnalyzeApi;
exports.registerApi = registerApi;
exports.setBaseUrl = setBaseUrl;
exports.smartAnalyzeApi = smartAnalyzeApi;
exports.updateFaceApi = updateFaceApi;
//# sourceMappingURL=../../.sourcemap/mp-weixin/utils/request.js.map
