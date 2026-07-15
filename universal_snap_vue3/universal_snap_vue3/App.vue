<script>
	import { bootstrapLocale, isRTL } from '@/utils/i18n.js'

	export default {
		onLaunch: function() {
			console.log('App Launch')
			// 优先用户在"设置"里手动选过的语言，否则跟随微信客户端语言，都不匹配则兜底简体中文
			const locale = bootstrapLocale()
			if (isRTL(locale)) {
				// 阿拉伯语从右到左书写：只做全局文字方向翻转，不逐页面镜像 flex 布局
				// （完整的 RTL 镜像需要真机 + 母语审阅者逐页走查，这里先给出可用的基础支持）
				uni.setStorageSync('_isRTL', true)
			} else {
				uni.setStorageSync('_isRTL', false)
			}
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/* 每个页面公共 CSS */
	/* #ifndef APP-NVUE */
	page,
	view,
	scroll-view,
	swiper,
	button,
	input,
	textarea,
	image,
	text {
		box-sizing: border-box;
	}

	page {
		width: 100%;
		min-height: 100%;
		overflow-x: hidden;
	}

	button::after {
		border: none;
	}

	/* 安全区域 CSS 变量（Vue 页面可用，nvue 不支持 env() 需用 JS 动态计算） */
	:root {
		--safe-area-inset-top: env(safe-area-inset-top, 0px);
		--safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
		--safe-area-inset-left: env(safe-area-inset-left, 0px);
		--safe-area-inset-right: env(safe-area-inset-right, 0px);
	}
	/* #endif */

	/* #ifdef APP-NVUE */
	.nvue-base {
		flex-direction: column;
	}
	/* #endif */
</style>