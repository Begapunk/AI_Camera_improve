<template>
  <view class="container">
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">{{ $t('profileAbout.title') }}</text>
      <view class="right-placeholder"></view>
    </view>

    <scroll-view class="content" scroll-y enhanced :show-scrollbar="false">
      <view class="brand-card">
        <view class="logo-icon">
          <text class="logo-camera">📷</text>
        </view>
        <text class="app-name">{{ $t('profileAbout.appName') }}</text>
        <text class="app-version">{{ $t('profileAbout.versionLabel', { version }) }}</text>
      </view>

      <view class="section">
        <view class="section-title">{{ $t('profileAbout.featuresTitle') }}</view>
        <view class="card">
          <view class="feature-item" v-for="(f, i) in features" :key="i">
            <text class="feature-icon">{{ f.icon }}</text>
            <view class="feature-text">
              <text class="feature-title">{{ $t('profileAbout.' + f.title) }}</text>
              <text class="feature-desc">{{ $t('profileAbout.' + f.desc) }}</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      version: '1.0.0',
      // 显示文案走 profileAbout.<key> 翻译键，这里只留 key
      features: [
        { icon: '📷', title: 'feature1Title', desc: 'feature1Desc' },
        { icon: '👤', title: 'feature2Title', desc: 'feature2Desc' },
        { icon: '🌤️', title: 'feature3Title', desc: 'feature3Desc' },
        { icon: '📋', title: 'feature4Title', desc: 'feature4Desc' },
        { icon: '🚇', title: 'feature5Title', desc: 'feature5Desc' }
      ]
    }
  },
  methods: {
    goBack() {
      uni.navigateBack()
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  width: 100%;
  overflow-x: hidden;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.nav-bar {
  width: 100%;
  padding: 60rpx 32rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, transparent 100%);
}

.back-btn,
.right-placeholder {
  flex: 0 0 72rpx;
  width: 72rpx;
  height: 72rpx;
}

.back-btn {
  background: linear-gradient(135deg, #ffffff 0%, #fff8f0 100%);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(255, 140, 66, 0.1), 0 2rpx 8rpx rgba(0,0,0,0.04);
}

.back-btn:active {
  transform: scale(0.92);
}

.back-icon {
  font-size: 44rpx;
  color: #FF8C42;
  font-weight: 600;
}

.nav-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 34rpx;
  font-weight: 700;
  color: #2D3E50;
}

.content {
  flex: 1;
  width: 100%;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.brand-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 0;
}

.logo-icon {
  width: 128rpx;
  height: 128rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, #FFB347 0%, #FF8C42 50%, #EF6C3E 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 20rpx 40rpx -12rpx rgba(255, 140, 66, 0.35);
  margin-bottom: 20rpx;
}

.logo-camera {
  font-size: 60rpx;
}

.app-name {
  font-size: 40rpx;
  font-weight: 800;
  color: #2D3E50;
  letter-spacing: 2rpx;
}

.app-version {
  font-size: 24rpx;
  color: #8E9AAB;
  margin-top: 8rpx;
}

.section {
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #2D3E50;
  margin-bottom: 16rpx;
  padding-left: 8rpx;
}

.card {
  background: rgba(255,255,255,0.95);
  border-radius: 24rpx;
  padding: 8rpx 28rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
}

.feature-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.feature-item:last-child {
  border-bottom: none;
}

.feature-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
}

.feature-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.feature-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #2D3E50;
}

.feature-desc {
  font-size: 22rpx;
  color: #8E9AAB;
  margin-top: 4rpx;
}
</style>
