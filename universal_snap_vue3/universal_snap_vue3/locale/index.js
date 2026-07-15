/**
 * 汇总 8 个语言包供 main.js 创建 vue-i18n 实例用。
 * key 必须和 utils/i18n.js 里 SUPPORTED_LOCALES 的 value、uni.setLocale() 的入参完全一致。
 */
import zhHans from './zh-Hans.json'
import en from './en.json'
import ja from './ja.json'
import ko from './ko.json'
import es from './es.json'
import fr from './fr.json'
import de from './de.json'
import ar from './ar.json'

export default {
	'zh-Hans': zhHans,
	en,
	ja,
	ko,
	es,
	fr,
	de,
	ar
}
