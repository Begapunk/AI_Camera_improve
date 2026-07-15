/**
 * AR LiDAR 测距——ar-lidar-ranging 原生插件的 JS 调用层。
 *
 * 只在 iOS App 端存在意义（LiDAR 是 iPhone 12 Pro+/iPad Pro 2020+ 的专属硬件，
 * 小程序和 Android 都没有这个能力），所以模块级直接判断平台，非 iOS App 环境下
 * 所有方法都返回 unsupported，调用方不需要自己写一堆平台判断，正常 try 调用即可。
 *
 * 用法：
 *   import { isLidarSupported, startRanging, stopRanging } from '@/utils/arLidar.js'
 *   const { supported } = await isLidarSupported()
 *   if (supported) {
 *     startRanging(
 *       (res) => console.log('距离(米):', res.distanceMeters, '置信度:', res.confidence),
 *       (err) => console.error('AR测距出错:', err.message)
 *     )
 *   }
 */

let _plugin = null;

function getPlugin() {
  // #ifdef APP-PLUS
  if (!_plugin) {
    try {
      _plugin = uni.requireNativePlugin('ar-lidar-ranging');
    } catch (e) {
      console.error('[arLidar] 插件加载失败，请确认已按 UTS 插件流程打包', e);
    }
  }
  return _plugin;
  // #endif

  // #ifndef APP-PLUS
  return null;
  // #endif
}

/** @returns {Promise<{ supported: boolean }>} */
export function isLidarSupported() {
  const plugin = getPlugin();
  if (!plugin) return Promise.resolve({ supported: false });
  try {
    return Promise.resolve(plugin.isLidarSupported());
  } catch (e) {
    console.error('[arLidar] isLidarSupported 调用失败', e);
    return Promise.resolve({ supported: false });
  }
}

/**
 * @param {(result: { distanceMeters: number, confidence: number, timestamp: number }) => void} onResult
 * @param {(error: { code: string, message: string }) => void} [onError]
 */
export function startRanging(onResult, onError) {
  const plugin = getPlugin();
  if (!plugin) {
    if (onError) onError({ code: 'PLATFORM_UNSUPPORTED', message: '当前平台不支持 AR LiDAR 测距' });
    return;
  }
  plugin.startRanging(onResult, onError || (() => {}));
}

export function stopRanging() {
  const plugin = getPlugin();
  if (!plugin) return;
  plugin.stopRanging();
}

export default { isLidarSupported, startRanging, stopRanging };
