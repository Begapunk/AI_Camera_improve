import App from './App'
import messages from './locale/index'

// #ifndef VUE3
import Vue from 'vue'
Vue.component('uni-icons', UniIcons)

import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
import { createSimpleI18n } from './utils/i18nCore.js'

// 自研极简 i18n（不是 vue-i18n 包）：详见 utils/i18nCore.js 顶部注释——
// vue-i18n 默认靠 new Function()/eval 运行时编译消息串，在微信小程序 JS 引擎和
// 部分 App 端 WebView 的 CSP 限制下会静默编译失败，页面上会看到 "欢迎，{name}"
// 这种没被替换的占位符。改成纯字符串替换实现后，$t()/this.$t()/useI18n() 调用方式
// 不用改，但不再依赖任何运行时代码生成，全平台行为一致。
// locale 初始值从 uni.getLocale() 读（App.vue onLaunch 的 bootstrapLocale 会先行设置），
// 后续手动切换语言走 uni.setLocale()，通过下面的 onLocaleChange 同步进来。
const i18n = createSimpleI18n({
  locale: uni.getLocale(),
  fallbackLocale: 'zh-Hans',
  messages
})

uni.onLocaleChange((e) => {
  i18n.global.locale = e.locale
})

export function createApp() {
  const app = createSSRApp(App)
  app.use(i18n)
  return {
    app
  }
}
// #endif
