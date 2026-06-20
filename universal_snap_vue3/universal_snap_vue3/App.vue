<script>
	export default {
		onLaunch: function() {
			console.log('App Launch')
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
</style>
