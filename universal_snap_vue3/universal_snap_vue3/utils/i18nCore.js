/**
 * 极简 i18n 插件，替代 vue-i18n 包本身。
 *
 * 起因：vue-i18n v9 默认用 new Function()/eval 在运行时把 "{name}" 这种消息串
 * JIT 编译成渲染函数。微信小程序的 JS 引擎、以及不少 App 端 WebView 的 CSP 策略
 * 都禁用 eval/new Function——编译失败时 vue-i18n 不会报错，而是静默把原始消息串
 * 原样吐出来，页面上就会看到 "欢迎，{name}" 这种未替换的占位符（正是本项目实测遇到的问题）。
 *
 * 这个项目的翻译需求很简单：只有 key 查找 + "{param}" 具名占位符替换，没用到
 * vue-i18n 的复数/日期/数字格式化等 ICU 特性（8 个语言包已核对过不含 @、| 等
 * vue-i18n 专用语法）。所以没必要依赖一整个 ICU 消息编译器，手写一个纯字符串
 * 替换的极简实现反而更可靠：不管在哪种 JS 引擎（小程序 / iOS WebView / Android
 * WebView / H5）下都是同样的行为，不存在"这个平台允许 eval、那个平台不允许"的坑。
 *
 * 对外调用方式和 vue-i18n 完全一致（$t() / this.$t() / useI18n().t()），
 * 所以全项目已经写好的几百处 $t() 调用不需要改一行。
 */
import { reactive, inject } from 'vue'

const I18N_INJECTION_KEY = 'i18nCore'

function resolvePath(messages, locale, key) {
  const dict = messages[locale]
  if (!dict) return undefined
  let node = dict
  const parts = key.split('.')
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(str, params) {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (match, paramKey) => {
    const val = params[paramKey]
    return val === undefined || val === null ? match : String(val)
  })
}

export function createSimpleI18n({ locale, fallbackLocale, messages }) {
  const state = reactive({ locale: locale || fallbackLocale })

  function t(key, params) {
    const primary = resolvePath(messages, state.locale, key)
    if (primary !== undefined) return interpolate(primary, params)
    const fallback = resolvePath(messages, fallbackLocale, key)
    if (fallback !== undefined) return interpolate(fallback, params)
    return key
  }

  const global = {
    get locale() {
      return state.locale
    },
    set locale(val) {
      state.locale = val
    },
    t
  }

  return {
    global,
    install(app) {
      app.config.globalProperties.$t = t
      app.config.globalProperties.$i18n = global
      app.provide(I18N_INJECTION_KEY, global)
    }
  }
}

/** <script setup> 里用：const { t } = useI18n()。第二参数（如 { useScope: 'global' }）目前只有全局作用域，忽略即可，仅为了和 vue-i18n 调用签名保持兼容。 */
export function useI18n() {
  const global = inject(I18N_INJECTION_KEY)
  if (!global) {
    throw new Error('[i18nCore] useI18n() 必须在 app.use(i18n) 挂载之后的组件里调用')
  }
  return { t: global.t }
}
