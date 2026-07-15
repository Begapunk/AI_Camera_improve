/**
 * 多语言支持：locale/*.json + uni-app 内置 i18n 机制（$t() 全局注入，不额外依赖 vue-i18n 包）。
 *
 * 语言判定优先级：用户在"设置"里手动选过 → 用那个；否则跟随微信客户端语言自动选一个最接近的；
 * 都不匹配时兜底简体中文（这是项目原生语言，绝大多数现有用户的微信客户端语言）。
 */

// 支持的 8 种语言，value 对应 locale/ 目录下的 json 文件名，也是 uni.setLocale() 的入参
export const SUPPORTED_LOCALES = [
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ar', label: 'العربية' },
];

const DEFAULT_LOCALE = 'zh-Hans';
const STORAGE_KEY = 'locale';

// 阿拉伯语从右到左书写，页面级 RTL 处理见 App.vue 的 isRTL 判断 + 各页面按需镜像的少量布局
export const RTL_LOCALES = ['ar'];

export function isRTL(locale) {
  return RTL_LOCALES.includes(locale);
}

/**
 * 微信 getSystemInfoSync().language 的常见取值（如 zh_CN / en / ja / ko-KR 等）
 * 映射到本项目实际支持的 8 种语言；不认识的语言一律兜底简体中文。
 */
export function mapSystemLanguageToSupported(sysLang) {
  const lang = (sysLang || '').toLowerCase().replace(/_/g, '-');
  if (lang.startsWith('zh')) return 'zh-Hans';
  if (lang.startsWith('en')) return 'en';
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('ko')) return 'ko';
  if (lang.startsWith('es')) return 'es';
  if (lang.startsWith('fr')) return 'fr';
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('ar')) return 'ar';
  return DEFAULT_LOCALE;
}

/** App.vue onLaunch 调用一次，返回实际生效的语言代码 */
export function bootstrapLocale() {
  let locale = DEFAULT_LOCALE;
  try {
    const stored = uni.getStorageSync(STORAGE_KEY);
    locale = stored || mapSystemLanguageToSupported(uni.getSystemInfoSync().language);
  } catch (e) {
    // 极端情况下取不到系统信息，兜底默认语言，不影响启动
  }
  uni.setLocale(locale);
  return locale;
}

/** 语言选择器手动切换时调用：持久化 + uni.setLocale()（会让所有页面里的 $t() 响应式刷新） */
export function setLocale(locale) {
  uni.setStorageSync(STORAGE_KEY, locale);
  uni.setLocale(locale);
}

export function getCurrentLocale() {
  return uni.getLocale();
}

export function getLocaleLabel(locale) {
  const found = SUPPORTED_LOCALES.find((l) => l.value === locale);
  return found ? found.label : locale;
}

/**
 * 当前是否阿拉伯语（RTL）。App.vue onLaunch 时把判断结果缓存进 storage，
 * 页面按需读取来做方向相关的小调整（比如返回箭头 ← 在 RTL 下应该显示成 →），
 * 不需要每个页面各自重新计算一遍。
 *
 * 注意：这只覆盖了"文字书写方向 + 箭头图标方向"这类基础适配，完整的 RTL 镜像
 * （每个页面的 flex 布局、图标位置逐一翻转）还需要真机 + 母语审阅者走查，
 * 属于后续可以继续做的工作，不是这一版就能完全覆盖的。
 */
export function isCurrentRTL() {
  try {
    return !!uni.getStorageSync('_isRTL');
  } catch (e) {
    return false;
  }
}

/** 方向感知的返回箭头：RTL 下"返回上一页"的箭头应该指向右边 */
export function backArrow() {
  return isCurrentRTL() ? '→' : '←';
}
