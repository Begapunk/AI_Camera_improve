"use strict";
const common_vendor = require("../common/vendor.js");
const STORAGE_KEY = "base_url";
const DEFAULT_URL = "http://10.60.35.126:5001";
function getBaseUrl() {
  const stored = common_vendor.index.getStorageSync(STORAGE_KEY);
  if (stored && typeof stored === "string" && stored.trim()) {
    return stored;
  }
  return DEFAULT_URL;
}
function setBaseUrl(url) {
  if (!url || typeof url !== "string")
    return;
  common_vendor.index.setStorageSync(STORAGE_KEY, url);
}
function uploadImageToServer(filePath) {
  return new Promise((resolve, reject) => {
    common_vendor.index.uploadFile({
      url: getBaseUrl() + "/analyze",
      filePath,
      name: "file",
      success: ({ data }) => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject("解析服务器响应失败");
        }
      },
      fail: () => reject("上传失败，请检查网络或服务器")
    });
  });
}
function analyzeEnvApi(filePath) {
  return new Promise((resolve, reject) => {
    common_vendor.index.uploadFile({
      url: getBaseUrl() + "/analyze-env",
      filePath,
      name: "file",
      success: ({ data }) => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject("解析服务器响应失败");
        }
      },
      fail: () => reject("上传失败，请检查网络或服务器")
    });
  });
}
function analyzeTemplateApi(filePath, saveAsTemplate = false) {
  return new Promise((resolve, reject) => {
    common_vendor.index.uploadFile({
      url: getBaseUrl() + "/analyze-template",
      filePath,
      name: "file",
      formData: { save_as_template: saveAsTemplate ? "true" : "false" },
      success: ({ data }) => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject("解析服务器响应失败");
        }
      },
      fail: () => reject("上传失败，请检查网络或服务器")
    });
  });
}
function fetchTemplateList() {
  return common_vendor.index.request({
    url: getBaseUrl() + "/api/templates",
    method: "GET"
  }).then((res) => res[1] ?? res);
}
function deleteTemplateApi(id) {
  return common_vendor.index.request({
    url: `${getBaseUrl()}/api/delete?template_id=${id}`,
    method: "DELETE"
  }).then((res) => res[1] ?? res);
}
exports.analyzeEnvApi = analyzeEnvApi;
exports.analyzeTemplateApi = analyzeTemplateApi;
exports.deleteTemplateApi = deleteTemplateApi;
exports.fetchTemplateList = fetchTemplateList;
exports.getBaseUrl = getBaseUrl;
exports.setBaseUrl = setBaseUrl;
exports.uploadImageToServer = uploadImageToServer;
//# sourceMappingURL=../../.sourcemap/mp-weixin/utils/request.js.map
