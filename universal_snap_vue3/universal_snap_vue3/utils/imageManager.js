/**
 * ImageManager - 跨端图像处理中心 (PRD Phase 2 核心模块)
 *
 * 【PRD 合规】
 * - 多端路径抹平：wxfile:// / _doc:// / file:// 统一处理
 * - 防 OOM 极致压缩：iPhone 6 (1GB) 安全保障
 * - 格式转换输出：Base64 / FormData 双模式
 * - 条件编译隔离：严格遵循 #ifdef MP-WEIXIN / #ifdef APP-PLUS
 *
 * @version 2.0.0 (PRD 跨端重构版)
 * @author 万能拍架构组
 */

// ============================================================
// 全局配置常量
// ============================================================
const CONFIG = {
  DEFAULT_QUALITY: 80,
  MAX_WIDTH_OOM_SAFE: 1920,
  MAX_HEIGHT_OOM_SAFE: 1080,
  MIN_COMPRESS_QUALITY: 50,
  RETRY_COUNT: 1,
  RETRY_DELAY_MS: 300
};

// ============================================================
// 公共工具方法（双端通用）
// ============================================================

/**
 * 获取图片信息（宽高/类型/路径）
 * @param {string} filePath
 * @returns {Promise<{width: number, height: number, path: string, type?: string}>}
 */
export function getImageInfo(filePath) {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src: filePath,
      success: (res) => resolve({
        width: res.width,
        height: res.height,
        path: res.path || filePath,
        type: res.type || 'jpg'
      }),
      fail: (err) => reject(new Error(`[ImageManager] getImageInfo 失败: ${err.errMsg || '未知错误'}`))
    });
  });
}

/**
 * 判断图片是否需要压缩（防 OOM 预检）
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
function _needsCompress(width, height) {
  return width > CONFIG.MAX_WIDTH_OOM_SAFE || height > CONFIG.MAX_HEIGHT_OOM_SAFE;
}

/**
 * 计算安全的缩放尺寸（保持宽高比）
 * @param {number} originalWidth
 * @param {number} originalHeight
 * @returns {{width: number, height: number}}
 */
function _calcSafeDimensions(originalWidth, originalHeight) {
  const ratio = Math.min(
    CONFIG.MAX_WIDTH_OOM_SAFE / originalWidth,
    CONFIG.MAX_HEIGHT_OOM_SAFE / originalHeight,
    1.0
  );
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio)
  };
}

// ============================================================
// 微信小程序端实现 (#ifdef MP-WEIXIN)
// ============================================================
// #ifdef MP-WEIXIN

/**
 * 小程序端：路径 → Base64
 * 使用 wx.getFileSystemManager().readFile()
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function _mpPathToBase64(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath: filePath,
        encoding: 'base64',
        success: (res) => {
          if (res.data && res.data.length > 0) {
            resolve(res.data);
          } else {
            reject(new Error('[ImageManager] 小程序读取文件内容为空'));
          }
        },
        fail: (err) => reject(new Error(`[ImageManager] 小程序 readFile 失败: ${err.errMsg || '未知错误'}`))
      });
    } catch (e) {
      reject(new Error(`[ImageManager] FileSystemManager 异常: ${e.message || e}`));
    }
  });
}

/**
 * 小程序端：极致防 OOM 压缩
 * 策略：
 *   1. 先检查尺寸 → 超过阈值则 Canvas 缩放 + 压缩
 *   2. 未超过阈值 → 直接 uni.compressImage
 * @param {string} filePath
 * @param {object} options
 * @returns {Promise<string>} 压缩后的临时路径
 */
function _mpCompress(filePath, options = {}) {
  const quality = Math.max(CONFIG.MIN_COMPRESS_QUALITY, Math.min(100, options.quality || CONFIG.DEFAULT_QUALITY));

  return new Promise(async (resolve, reject) => {
    try {
      let info;
      try {
        info = await getImageInfo(filePath);
      } catch (_) {
        info = null;
      }

      if (info && _needsCompress(info.width, info.height)) {
        console.warn(`[ImageManager] 检测到大图 (${info.width}x${info.height})，启动 OOM 安全压缩`);
        const safeSize = _calcSafeDimensions(info.width, info.height);
        _mpCanvasCompress(filePath, safeSize.width, safeSize.height, quality)
          .then(resolve)
          .catch(reject);
      } else {
        uni.compressImage({
          src: filePath,
          quality: quality,
          success: (res) => resolve(res.tempFilePath),
          fail: (err) => reject(new Error(`[ImageManager] compressImage 失败: ${err.errMsg || '未知错误'}`))
        });
      }
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 小程序端：Canvas 缩放压缩（用于大图 OOM 防护）
 * @param {string} filePath
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @param {number} quality
 * @returns {Promise<string>}
 */
function _mpCanvasCompress(filePath, targetWidth, targetHeight, quality) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: targetWidth, height: targetHeight });
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();

      img.onload = () => {
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        wx.canvasToTempFilePath({
          canvas: canvas,
          fileType: 'jpg',
          quality: quality / 100,
          success: (res) => {
            console.log(`[ImageManager] Canvas 压缩完成: ${targetWidth}x${targetHeight}, 质量 ${quality}%`);
            resolve(res.tempFilePath);
          },
          fail: (err) => {
            console.error('[ImageManager] canvasToTempFilePath 失败:', err);
            reject(new Error(`[ImageManager] Canvas 导出失败: ${err.errMsg || '未知错误'}`));
          }
        }, this);
      };

      img.onerror = () => reject(new Error('[ImageManager] 图片加载失败'));
      img.src = filePath;
    } catch (e) {
      console.warn('[ImageManager] Canvas 压缩不可用，降级至普通压缩:', e.message || e);
      uni.compressImage({
        src: filePath,
        quality: quality,
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err)
      });
    }
  });
}

/**
 * 小程序端：保存文件到持久化目录
 * 替代 wx.saveFile
 * @param {string} tempFilePath
 * @returns {Promise<string>}
 */
function _mpSaveFile(tempFilePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.saveFile({
      tempFilePath: tempFilePath,
      success: (res) => resolve(res.savedFilePath),
      fail: (err) => reject(new Error(`[ImageManager] saveFile 失败: ${err.errMsg || '未知错误'}`))
    });
  });
}

/**
 * 小程序端：删除持久化文件
 * 替代 wx.removeSavedFile
 * @param {string} filePath
 * @returns {Promise<void>}
 */
function _mpRemoveFile(filePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.removeSavedFile({
      filePath: filePath,
      success: () => resolve(),
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.includes('not exist')) {
          resolve();
        } else {
          reject(err);
        }
      }
    });
  });
}

/**
 * 小程序端：CameraFrame → JPEG
 * 用于骨架追踪等需要从原始帧数据转 JPEG 的场景
 * @param {object} frame - { width, height, data: ArrayBuffer }
 * @param {number} quality - 0~1
 * @returns {Promise<string|null>}
 */
function _mpFrameToJpeg(frame, quality) {
  if (!frame || !frame.data || !frame.width || !frame.height) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: frame.width, height: frame.height });
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(frame.width, frame.height);
      imgData.data.set(new Uint8ClampedArray(frame.data));
      ctx.putImageData(imgData, 0, 0);
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: 'jpg',
        quality: quality,
        success: (r) => resolve(r.tempFilePath),
        fail: () => resolve(null)
      });
    } catch (e) {
      console.error('[ImageManager] frameToJpeg 失败:', e);
      resolve(null);
    }
  });
}

// #endif

// ============================================================
// App 端实现 (#ifdef APP-PLUS)
// ============================================================
// #ifdef APP-PLUS

/**
 * App 端：路径 → Base64
 * 使用 plus.io.FileReader.readAsDataURL（HTML5+ 稳定 API）
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function _appPathToBase64(filePath) {
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(
      filePath,
      (entry) => {
        entry.file(
          (file) => {
            const reader = new plus.io.FileReader();
            reader.onloadend = (evt) => {
              const result = (evt.target && evt.target.result) || '';
              const idx = result.indexOf('base64,');
              if (idx >= 0) {
                resolve(result.slice(idx + 'base64,'.length));
              } else if (result) {
                resolve(result);
              } else {
                reject(new Error('[ImageManager] App 读取文件内容为空'));
              }
            };
            reader.onerror = () => reject(new Error('[ImageManager] FileReader 读取失败'));
            reader.readAsDataURL(file);
          },
          (err) => reject(new Error(`[ImageManager] App 获取文件对象失败: ${JSON.stringify(err)}`))
        );
      },
      (err) => reject(new Error(`[ImageManager] App 解析文件路径失败: ${JSON.stringify(err)}`))
    );
  });
}

/**
 * App 端：极致防 OOM 压缩
 * 使用 plus.zip.compressImage（原生引擎，性能最优）
 * 自动检测大图并降分辨率，防止 iPhone 6 等 1GB 设备闪退
 * @param {string} filePath
 * @param {object} options
 * @returns {Promise<string>}
 */
function _appCompress(filePath, options = {}) {
  const quality = Math.max(CONFIG.MIN_COMPRESS_QUALITY, Math.min(100, options.quality || CONFIG.DEFAULT_QUALITY));
  const format = options.format || 'jpg';

  return new Promise(async (resolve, reject) => {
    try {
      let info;
      try {
        info = await getImageInfo(filePath);
      } catch (_) {
        info = null;
      }

      let widthParam = 'auto';
      let heightParam = 'auto';

      if (info && _needsCompress(info.width, info.height)) {
        console.warn(`[ImageManager] [App] 检测到大图 (${info.width}x${info.height})，启动 OOM 安全压缩`);
        const safeSize = _calcSafeDimensions(info.width, info.height);
        widthParam = `${safeSize.width}px`;
        heightParam = `${safeSize.height}px`;
      }

      const timestamp = Date.now();
      const dstPath = `_doc/compressed_${timestamp}.${format}`;

      plus.zip.compressImage(
        {
          src: filePath,
          dst: dstPath,
          quality: Math.round(quality),
          width: widthParam,
          height: heightParam,
          format: format,
          overwrite: true
        },
        (event) => {
          console.log(`[ImageManager] [App] compressImage 完成: ${event.target.size} bytes`);
          resolve(event.target.path);
        },
        (error) => {
          console.error('[ImageManager] [App] compressImage 失败:', error);
          reject(new Error(`[ImageManager] App 压缩失败: ${error.message || JSON.stringify(error)}`));
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * App 端：保存文件（App 临时文件已在 _doc 目录，直接返回原路径）
 * @param {string} tempFilePath
 * @returns {Promise<string>}
 */
function _appSaveFile(tempFilePath) {
  return Promise.resolve(tempFilePath);
}

/**
 * App 端：删除文件
 * @param {string} filePath
 * @returns {Promise<void>}
 */
function _appRemoveFile(filePath) {
  return new Promise((resolve) => {
    plus.io.resolveLocalFileSystemURL(
      filePath,
      (entry) => {
        entry.remove(
          () => resolve(),
          () => resolve()
        );
      },
      () => resolve()
    );
  });
}

// #endif

// ============================================================
// H5 端实现 (预留)
// ============================================================
// #ifdef H5

function _h5PathToBase64(filePath) {
  return new Promise((resolve, reject) => {
    if (filePath.startsWith('data:') || filePath.startsWith('blob:')) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const idx = dataUrl.indexOf('base64,');
        resolve(idx >= 0 ? dataUrl.slice(idx + 7) : dataUrl.split(',')[1]);
      };
      img.onerror = () => reject(new Error('[ImageManager] H5 图片加载失败'));
      img.src = filePath;
    } else {
      fetch(filePath)
        .then(r => r.arrayBuffer())
        .then(buffer => {
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          resolve(window.btoa(binary));
        })
        .catch(reject);
    }
  });
}

function _h5Compress(filePath, options = {}) {
  console.warn('[ImageManager] H5 端暂不支持本地压缩，返回原始路径');
  return Promise.resolve(filePath);
}

// #endif

// ============================================================
// 统一导出接口（跨端调用入口）
// ============================================================

/**
 * 将本地图片读取为 base64 字符串（不含 data:image/xxx;base64, 前缀）
 * @param {string} filePath - 本地文件路径（支持 wxfile:// / _doc:// / file:// 等）
 * @returns {Promise<string>} base64 字符串
 */
export function pathToBase64(filePath) {
  // #ifdef MP-WEIXIN
  return _mpPathToBase64(filePath);
  // #endif

  // #ifdef APP-PLUS
  return _appPathToBase64(filePath);
  // #endif

  // #ifdef H5
  return _h5PathToBase64(filePath);
  // #endif
}

/**
 * 极致防 OOM 图片压缩（核心安全功能）
 *
 * 【PRD 合规说明】
 * - 针对 iPhone 6 (1GB 内存) 等低配设备设计
 * - 自动检测图片尺寸，超过 1920x1080 则降分辨率压缩
 * - 小程序端：uni.compressImage + Canvas 降级方案
 * - App 端：plus.zip.compressImage（原生引擎，性能最优）
 *
 * @param {string} filePath - 源文件路径
 * @param {object} options - 压缩选项
 * @param {number} options.quality - 压缩质量 0-100，默认 80（建议不低于 50）
 * @param {string} options.format - 输出格式 'jpg' | 'png'，默认 'jpg'
 * @returns {Promise<string>} 压缩后的文件路径
 */
export function compress(filePath, options = {}) {
  // #ifdef MP-WEIXIN
  return _mpCompress(filePath, options);
  // #endif

  // #ifdef APP-PLUS
  return _appCompress(filePath, options);
  // #endif

  // #ifdef H5
  return _h5Compress(filePath, options);
  // #endif
}

/**
 * 一站式图像处理流水线：压缩 + 转 Base64
 * 推荐用于 AI 后端上传场景
 *
 * @param {string} filePath - 源文件路径
 * @param {object} options - 同 compress 参数
 * @returns {Promise<{base64: string, compressedPath: string}>}
 */
export async function processForAI(filePath, options = {}) {
  const compressedPath = await compress(filePath, options);
  const base64 = await pathToBase64(compressedPath);
  return { base64, compressedPath };
}

/**
 * 准备上传参数（供 uni.uploadFile 使用）
 * 双端统一接口，无需关心底层路径差异
 *
 * @param {string} filePath - 本地文件路径
 * @param {object} extraFormData - 额外的表单字段
 * @returns {{ filePath: string, formData: object }}
 */
export function prepareUpload(filePath, extraFormData = {}) {
  return {
    filePath: filePath,
    formData: extraFormData || {}
  };
}

/**
 * 保存图片到系统相册
 * @param {string} filePath
 * @returns {Promise<void>}
 */
export function saveToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    uni.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => resolve(),
      fail: (err) => {
        // #ifdef APP-PLUS
        if (err && err.errMsg && err.errMsg.includes('auth')) {
          reject(new Error('PERMISSION_DENIED'));
          return;
        }
        // #endif
        reject(new Error(`[ImageManager] 保存到相册失败: ${err.errMsg || '未知错误'}`));
      }
    });
  });
}

/**
 * 从系统相册选择图片
 * @param {object} options
 * @param {number} options.count - 最多选择数量，默认 1
 * @returns {Promise<{tempFilePaths: string[], tempFiles: Array}>}
 */
export function chooseFromAlbum(options = {}) {
  const count = options.count || 1;
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: count,
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (res) => resolve(res),
      fail: (err) => reject(new Error(`[ImageManager] 选择图片失败: ${err.errMsg || '取消选择'}`))
    });
  });
}

/**
 * 保存文件到持久化目录（替代 wx.saveFile）
 * @param {string} tempFilePath
 * @returns {Promise<string>} 持久化后的文件路径
 */
export function saveFile(tempFilePath) {
  // #ifdef MP-WEIXIN
  return _mpSaveFile(tempFilePath);
  // #endif

  // #ifdef APP-PLUS
  return _appSaveFile(tempFilePath);
  // #endif

  // #ifdef H5
  return Promise.resolve(tempFilePath);
  // #endif
}

/**
 * 删除持久化文件（替代 wx.removeSavedFile）
 * @param {string} filePath
 * @returns {Promise<void>}
 */
export function removeFile(filePath) {
  // #ifdef MP-WEIXIN
  return _mpRemoveFile(filePath);
  // #endif

  // #ifdef APP-PLUS
  return _appRemoveFile(filePath);
  // #endif

  // #ifdef H5
  return Promise.resolve();
  // #endif
}

/**
 * CameraFrame → JPEG（替代 wx.createOffscreenCanvas + wx.canvasToTempFilePath）
 * 用于骨架追踪 / 手势识别等需要从 CameraFrame 原始帧转 JPEG 的场景
 *
 * 注意：App 端 live-pusher snapshot 已直接生成文件，无需此方法
 *
 * @param {object} frame - { width, height, data: ArrayBuffer }
 * @param {object} options
 * @param {number} options.quality - 压缩质量 0-1，默认 0.6
 * @returns {Promise<string|null>} JPEG 文件路径，失败返回 null
 */
export function frameToJpeg(frame, options = {}) {
  const quality = options.quality !== undefined ? options.quality : 0.6;

  // #ifdef MP-WEIXIN
  return _mpFrameToJpeg(frame, quality);
  // #endif

  // #ifdef APP-PLUS
  // App 端通过 live-pusher.snapshot() 直接生成文件
  console.log('[ImageManager] [App] frameToJpeg 不适用，请使用 live-pusher snapshot');
  return Promise.resolve(null);
  // #endif

  // #ifdef H5
  return Promise.resolve(null);
  // #endif
}

// ============================================================
// 默认导出（支持 import ImageManager from './imageManager'）
// ============================================================
const ImageManager = {
  pathToBase64,
  compress,
  processForAI,
  getImageInfo,
  prepareUpload,
  saveToAlbum,
  chooseFromAlbum,
  saveFile,
  removeFile,
  frameToJpeg
};

export default ImageManager;