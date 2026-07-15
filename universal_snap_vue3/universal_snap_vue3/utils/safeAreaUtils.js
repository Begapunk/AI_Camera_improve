/**
 * safeAreaUtils - 全局安全区域适配工具
 *
 * 【PRD Phase 1 合规】
 * 统一处理 iPhone 6 (16:9) / iPhone X~14 (刘海屏) / iPhone 15+ (灵动岛)
 * 以及 Android 水滴屏/挖孔屏/全面屏的安全区域计算。
 *
 * 使用方式：
 *   Vue 页面：CSS 变量 var(--safe-area-inset-bottom)（已在 App.vue 定义）
 *   nvue 页面：JS 动态绑定 :style="{ paddingBottom: safeBottom + 'px' }"
 *
 * @version 1.0.0
 */

// ============================================================
// 缓存机制（避免重复调用 getSystemInfoSync）
// ============================================================
let _cachedInsets = null;
let _lastSystemInfo = null;

/**
 * 获取系统信息（带缓存）
 * @returns {object} uni.getSystemInfoSync() 结果
 */
function _getSystemInfo() {
  if (!_lastSystemInfo) {
    try {
      _lastSystemInfo = uni.getSystemInfoSync();
    } catch (e) {
      console.error('[safeAreaUtils] 获取系统信息失败:', e);
      _lastSystemInfo = {};
    }
  }
  return _lastSystemInfo;
}

/**
 * 获取安全区域信息（带缓存）
 * @returns {{ top: number, bottom: number, left: number, right: number }}
 */
export function getSafeAreaInsets() {
  if (_cachedInsets) return _cachedInsets;

  const info = _getSystemInfo();
  let top = 0, bottom = 0, left = 0, right = 0;

  // 优先使用 safeAreaInsets（iOS 11+ / Android 较新版本）
  if (info.safeAreaInsets) {
    const insets = info.safeAreaInsets;
    top = insets.top || 0;
    bottom = insets.bottom || 0;
    left = insets.left || 0;
    right = insets.right || 0;
  }
  // 降级方案：通过 safeArea 计算
  else if (info.safeArea && info.screenHeight) {
    const safeArea = info.safeArea;
    top = safeArea.top || 0;
    bottom = info.screenHeight - (safeArea.bottom || info.screenHeight);
    left = safeArea.left || 0;
    right = info.screenWidth - (safeArea.right || info.screenWidth);
  }

  // 特殊处理：Android 底部导航栏
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined') {
    try {
      // 部分安卓设备需要额外检测虚拟导航栏高度
      const navHeight = plus.navigator.getStatusbarHeight ? plus.navigator.getStatusbarHeight() : 0;
      if (navHeight > 0 && bottom === 0) {
        bottom = Math.max(bottom, navHeight > 50 ? navHeight : 0);
      }
    } catch (_) {}
  }
  // #endif

  _cachedInsets = { top, bottom, left, right };
  return _cachedInsets;
}

/**
 * 获取顶部安全区域高度（状态栏 + 刘海/灵动岛）
 * @returns {number} px 值
 */
export function getSafeTop() {
  return getSafeAreaInsets().top;
}

/**
 * 获取底部安全区域高度（Home Indicator / 导航栏）
 * @returns {number} px 值
 */
export function getSafeBottom() {
  return getSafeAreaInsets().bottom;
}

/**
 * 获取左侧安全区域宽度（极少用到，预留）
 * @returns {number} px 值
 */
export function getSafeLeft() {
  return getSafeAreaInsets().left;
}

/**
 * 获取右侧安全区域宽度（极少用到，预留）
 * @returns {number} px 值
 */
export function getSafeRight() {
  return getSafeAreaInsets().right;
}

/**
 * 判断是否为刘海屏/灵动岛设备
 * @returns {boolean}
 */
export function hasNotch() {
  const insets = getSafeAreaInsets();
  return insets.top > 20; // iOS 状态栏通常 20px，超过说明有刘海/灵动岛
}

/**
 * 判断是否有底部 Home Indicator / 小黑条
 * @returns {boolean}
 */
export function hasHomeIndicator() {
  return getSafeAreaInsets().bottom > 0;
}

/**
 * 获取完整的样式对象（用于 nvue 页面动态绑定）
 *
 * @param {'top' | 'bottom' | 'all'} position - 需要适配的位置
 * @param {object} extraStyles - 额外的样式属性
 * @returns {object} 可直接用于 :style 的对象
 *
 * @example
 * // nvue 页面用法：
 * <div :style="safeAreaStyle('bottom')">内容</div>
 *
 * // 或带额外样式：
 * <div :style="safeAreaStyle('bottom', { backgroundColor: '#fff' })">内容</div>
 */
export function safeAreaStyle(position = 'bottom', extraStyles = {}) {
  const insets = getSafeAreaInsets();
  const styles = { ...extraStyles };

  switch (position) {
    case 'top':
      styles.paddingTop = `${insets.top}px`;
      break;
    case 'bottom':
      styles.paddingBottom = `${insets.bottom}px`;
      break;
    case 'all':
      styles.paddingTop = `${insets.top}px`;
      styles.paddingBottom = `${insets.bottom}px`;
      styles.paddingLeft = `${insets.left}px`;
      styles.paddingRight = `${insets.right}px`;
      break;
    default:
      break;
  }

  return styles;
}

/**
 * 清除缓存（在屏幕旋转或系统设置变更时调用）
 */
export function clearCache() {
  _cachedInsets = null;
  _lastSystemInfo = null;
}

/**
 * Vue Composition API / Options API 混入（mixin）
 * 提供 this.safeTop / this.safeBottom / this.safeAreaStyle 计算属性
 *
 * @example
 * // 在 .vue 文件中使用：
 * import { safeAreaMixin } from '@/utils/safeAreaUtils.js';
 * export default {
 *   mixins: [safeAreaMixin],
 *   // ...其他选项
 * }
 *
 * // 模板中直接用：
 * <view :style="{ paddingTop: safeTop + 'px' }">顶部内容</view>
 */
export const safeAreaMixin = {
  data() {
    return {
      _safeTop: 0,
      _safeBottom: 0,
      _safeLeft: 0,
      _safeRight: 0,
    };
  },
  created() {
    this._updateSafeArea();
  },
  methods: {
    _updateSafeArea() {
      const insets = getSafeAreaInsets();
      this._safeTop = insets.top;
      this._safeBottom = insets.bottom;
      this._safeLeft = insets.left;
      this._safeRight = insets.right;
    },
  },
  computed: {
    safeTop() {
      return this._safeTop;
    },
    safeBottom() {
      return this._safeBottom;
    },
    safeLeft() {
      return this._safeLeft;
    },
    safeRight() {
      return this._safeRight;
    },
  },
};

// ============================================================
// 默认导出
// ============================================================
const SafeAreaUtils = {
  getSafeAreaInsets,
  getSafeTop,
  getSafeBottom,
  getSafeLeft,
  getSafeRight,
  hasNotch,
  hasHomeIndicator,
  safeAreaStyle,
  clearCache,
  safeAreaMixin,
};

export default SafeAreaUtils;