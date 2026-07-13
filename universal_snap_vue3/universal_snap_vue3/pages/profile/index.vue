<template>
  <view class="phone-container">
    <view class="status-bar"></view>

    <view class="profile-header">
      <view class="header-bg"></view>
      <view class="profile-info">
        <view class="avatar-wrapper" @tap="goToSettings">
          <image v-if="avatar" :src="avatar" class="avatar avatar-img" mode="aspectFill" />
          <view v-else class="avatar">👤</view>
          <view class="edit-badge">
            <text class="edit-icon">✏️</text>
          </view>
        </view>
        <text class="username">{{ username }}</text>
        <text class="user-id">ID: {{ userId }}</text>
      </view>
      <view class="stats-row">
        <view class="stat-item">
          <text class="stat-value">{{ photoCount }}</text>
          <text class="stat-label">照片</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat-item">
          <text class="stat-value">{{ score }}</text>
          <text class="stat-label">评分</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat-item">
          <text class="stat-value">{{ days }}</text>
          <text class="stat-label">连续天数</text>
        </view>
      </view>
    </view>

    <view class="content">
      <view class="menu-section">
        <view class="menu-title">我的功能</view>
        <view class="menu-list">
          <view class="menu-item" @tap="goToTemplateCollection">
            <view class="menu-icon" style="background:#ffe6f0;">📁</view>
            <view class="menu-content">
              <text class="menu-text">我的模板</text>
              <text class="menu-desc">查看保存的模板</text>
            </view>
            <text class="menu-arrow">›</text>
          </view>
          <view class="menu-item" @tap="goToAnalyzeHistory">
            <view class="menu-icon" style="background:#e1ffee;">📊</view>
            <view class="menu-content">
              <text class="menu-text">分析记录</text>
              <text class="menu-desc">查看历史分析</text>
            </view>
            <text class="menu-arrow">›</text>
          </view>
          <view class="menu-item" @tap="goToEnvironmentHistory">
            <view class="menu-icon" style="background:#e0f7ff;">🌤️</view>
            <view class="menu-content">
              <text class="menu-text">环境记录</text>
              <text class="menu-desc">查看环境分析</text>
            </view>
            <text class="menu-arrow">›</text>
          </view>
        </view>
      </view>

      <view class="menu-section">
        <view class="menu-title">设置与帮助</view>
        <view class="menu-list">
          <view class="menu-item" @tap="goToSettings">
            <view class="menu-icon" style="background:#fff7e6;">⚙️</view>
            <view class="menu-content">
              <text class="menu-text">设置</text>
              <text class="menu-desc">账号、隐私设置</text>
            </view>
            <text class="menu-arrow">›</text>
          </view>
          <view class="menu-item" @tap="goToHelp">
            <view class="menu-icon" style="background:#e8f0fe;">❓</view>
            <view class="menu-content">
              <text class="menu-text">帮助中心</text>
              <text class="menu-desc">使用帮助与常见问题</text>
            </view>
            <text class="menu-arrow">›</text>
          </view>
          <view class="menu-item" @tap="goToAbout">
            <view class="menu-icon" style="background:#f5efff;">ℹ️</view>
            <view class="menu-content">
              <text class="menu-text">关于我们</text>
              <text class="menu-desc">版本信息与反馈</text>
            </view>
            <text class="menu-arrow">›</text>
          </view>
        </view>
      </view>

      <view class="logout-section">
        <button class="logout-btn" @tap="handleLogout">退出登录</button>
      </view>
    </view>

    <view class="tabbar">
      <view class="tab" @tap="goHome">
        <span class="iconify" data-icon="solar:home-2-bold-duotone"></span>
        <text>首页</text>
      </view>
      <view class="tab active" @tap="goToProfile">
        <span class="iconify" data-icon="solar:user-bold-duotone"></span>
        <text>我的</text>
      </view>
    </view>
  </view>
</template>

<script>
import { getUserInfoApi } from '@/utils/request.js'

export default {
  data() {
    return {
      username: '用户昵称',
      userId: '88888888',
      photoCount: 0,
      score: 0,
      days: 0,
      avatar: ''
    }
  },
  onShow() {
    this.loadUserInfo()
  },
  methods: {
    loadUserInfo() {
      const token = uni.getStorageSync('token')
      if (!token) {
        uni.redirectTo({ url: '/pages/login/index' })
        return
      }

      uni.showLoading({ title: '加载中...', mask: true })
      getUserInfoApi()
        .then((res) => {
          uni.hideLoading()
          if (res.statusCode === 200 && res.data.user) {
            const user = res.data.user
            this.username = user.nickname || user.username || '用户昵称'
            this.userId = user.id || '88888888'
            this.avatar = user.avatar || ''
            this.photoCount = user.photoCount || 0
            this.score = user.score || 0
            this.days = user.days || 0
          }
        })
        .catch(() => {
          uni.hideLoading()
          uni.showToast({ title: '获取用户信息失败', icon: 'none' })
        })
    },
    goHome() {
      uni.navigateBack({ delta: 1 })
    },
    goToProfile() {
    },
    goToTemplateCollection() {
      uni.navigateTo({ url: '/pages/template/templateCollection' })
    },
    goToAnalyzeHistory() {
      uni.navigateTo({ url: '/pages/profile/history?type=selfie' })
    },
    goToEnvironmentHistory() {
      uni.navigateTo({ url: '/pages/profile/history?type=environment' })
    },
    goToSettings() {
      uni.navigateTo({ url: '/pages/profile/settings' })
    },
    goToHelp() {
      uni.navigateTo({ url: '/pages/profile/help' })
    },
    goToAbout() {
      uni.navigateTo({ url: '/pages/profile/about' })
    },
    handleLogout() {
      uni.showModal({
        title: '退出登录',
        content: '确定要退出当前账号吗？',
        success: (res) => {
          if (res.confirm) {
            uni.removeStorageSync('username')
            uni.removeStorageSync('token')
            uni.redirectTo({ url: '/pages/login/index' })
          }
        }
      })
    }
  }
}
</script>

<style scoped>
.phone-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.status-bar {
  height: 44px;
  background: linear-gradient(135deg, #FFB347 0%, #FF8C42 50%, #EF6C3E 100%);
}

.profile-header {
  position: relative;
  padding: 40px 32px 32px;
  overflow: hidden;
}

.header-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* 需要盖住 profile-info 里 头像+昵称+ID 三行内容，留够余量避免 ID 文字掉出橙色背景 */
  height: 260px;
  background: linear-gradient(135deg, #FFB347 0%, #FF8C42 50%, #EF6C3E 100%);
  border-radius: 0 0 48px 48px;
}

.profile-info {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}

.avatar-wrapper {
  position: relative;
  margin-bottom: 16px;
}

.avatar {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255,255,255,0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  border: 4px solid rgba(255,255,255,0.8);
}

.edit-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 32px;
  height: 32px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.edit-icon {
  font-size: 16px;
}

.username {
  font-size: 32px;
  font-weight: 700;
  color: white;
  margin-bottom: 6px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.user-id {
  font-size: 24px;
  color: rgba(255,255,255,0.85);
  /* 防止 header-bg 高度和内容高度对不齐时，白字掉到浅色背景上看不清 */
  text-shadow: 0 2px 6px rgba(0,0,0,0.2);
}

.stats-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.95);
  border-radius: 24px;
  padding: 24px 32px;
  margin-top: 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
  z-index: 1;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
  color: #EF6C3E;
}

.stat-label {
  font-size: 24px;
  color: #8E9AAB;
  margin-top: 4px;
}

.stat-divider {
  width: 1px;
  height: 48px;
  background: rgba(0,0,0,0.06);
}

.content {
  flex: 1;
  padding: 0 24px;
  margin-top: 16px;
}

.menu-section {
  margin-bottom: 24px;
}

.menu-title {
  font-size: 28px;
  font-weight: 600;
  color: #2D3E50;
  margin-bottom: 16px;
  padding-left: 8px;
}

.menu-list {
  background: rgba(255,255,255,0.95);
  border-radius: 24px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.04);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 24px;
  transition: background 0.2s;
}

.menu-item:active {
  background: rgba(255,140,66,0.06);
}

.menu-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-right: 20px;
}

.menu-content {
  flex: 1;
}

.menu-text {
  display: block;
  font-size: 28px;
  font-weight: 500;
  color: #2D3E50;
}

.menu-desc {
  display: block;
  font-size: 22px;
  color: #8E9AAB;
  margin-top: 4px;
}

.menu-arrow {
  font-size: 36px;
  color: #C0C9D4;
}

.logout-section {
  padding: 32px 24px 60px;
}

.logout-btn {
  width: 100%;
  height: 80px;
  background: rgba(239,108,62,0.08);
  border: 2px solid rgba(239,108,62,0.2);
  border-radius: 40px;
  font-size: 28px;
  font-weight: 500;
  color: #EF6C3E;
  transition: all 0.2s;
}

.logout-btn:active {
  background: rgba(239,108,62,0.15);
  transform: scale(0.98);
}

.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100px;
  background: rgba(255,255,255,0.98);
  backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.04);
  padding-bottom: env(safe-area-inset-bottom);
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8E9AAB;
  font-size: 22px;
  transition: all 0.2s;
}

.tab.active {
  color: #EF6C3E;
}

.tab span {
  font-size: 40px;
  margin-bottom: 4px;
}

/* 布局修正：统一用 rpx 和宽度约束，避免 px 在小程序端把页面撑偏 */
.phone-container {
  width: 100%;
  overflow-x: hidden;
}

.status-bar {
  height: env(safe-area-inset-top, 44px);
}

.profile-header {
  width: 100%;
  padding: 40rpx 32rpx 32rpx;
}

.header-bg {
  height: 320rpx;
  border-radius: 0 0 48rpx 48rpx;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  font-size: 56rpx;
}

.edit-badge {
  width: 40rpx;
  height: 40rpx;
}

.edit-icon {
  font-size: 20rpx;
}

.username {
  max-width: 100%;
  font-size: 40rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-id {
  font-size: 24rpx;
}

.stats-row {
  width: 100%;
  padding: 28rpx 24rpx;
  margin-top: 28rpx;
  border-radius: 24rpx;
}

.stat-value {
  font-size: 40rpx;
}

.stat-label {
  font-size: 24rpx;
}

.stat-divider {
  height: 56rpx;
}

.content {
  width: 100%;
  padding: 0 24rpx calc(140rpx + env(safe-area-inset-bottom, 0px));
  margin-top: 16rpx;
}

.menu-section {
  margin-bottom: 24rpx;
}

.menu-title {
  font-size: 30rpx;
  margin-bottom: 16rpx;
  padding-left: 8rpx;
}

.menu-list {
  border-radius: 24rpx;
}

.menu-item {
  width: 100%;
  padding: 24rpx;
}

.menu-icon {
  flex: 0 0 64rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  font-size: 28rpx;
  margin-right: 20rpx;
}

.menu-content {
  min-width: 0;
}

.menu-text {
  font-size: 30rpx;
}

.menu-desc {
  font-size: 24rpx;
}

.menu-arrow {
  font-size: 40rpx;
}

.logout-section {
  padding: 32rpx 24rpx 60rpx;
}

.logout-btn {
  height: 88rpx;
  border-radius: 44rpx;
  font-size: 30rpx;
}

.tabbar {
  height: auto;
  min-height: 100rpx;
}

.tab {
  font-size: 22rpx;
}

.tab span {
  font-size: 40rpx;
}
</style>
