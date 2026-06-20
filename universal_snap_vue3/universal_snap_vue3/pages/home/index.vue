<template>
  <view class="phone-container">
    <view class="status-bar"></view>

    <view class="header">
      <view class="greeting">
        <text class="today">今天</text>
        <text class="welcome">欢迎，{{ username }}</text>
      </view>
      <view class="avatar">👤</view>
    </view>

    <scroll-view class="content" scroll-y enhanced :show-scrollbar="false">
      <view class="ai-card" @tap="goToCamera">
        <view class="ai-badge">AI 拍摄</view>
        <view class="ai-title">智能构图 · 姿势指导</view>
        <view class="ai-desc">自动优化角度、光线、构图</view>
      </view>

      <view class="grid">
        <view class="grid-item" @tap="goToCamera">
          <view class="icon-box" style="background:#fff7e6; color:#ff9500;">📷</view>
          <text class="item-text">智能拍摄助手</text>
        </view>
        <view class="grid-item" @tap="showFaceCamera = true">
          <view class="icon-box face-icon-box" :class="faceRegistered ? 'face-bound' : ''">
            {{ faceRegistered ? '✅' : '🔐' }}
          </view>
          <text class="item-text">{{ faceRegistered ? '人脸已绑定' : '人脸绑定' }}</text>
        </view>
        <view class="grid-item" @tap="goToAnalyze">
          <view class="icon-box" style="background:#e1ffee; color:#34c759;">👤</view>
          <text class="item-text">自拍分析</text>
        </view>
        <view class="grid-item" @tap="goToEnvironment">
          <view class="icon-box" style="background:#e0f7ff; color:#00bcd4;">🌤️</view>
          <text class="item-text">环境分析</text>
        </view>
        <view class="grid-item" @tap="goToTemplate">
          <view class="icon-box" style="background:#ffe6f0; color:#ff2d55;">📋</view>
          <text class="item-text">模板评分</text>
        </view>
        <view class="grid-item" @tap="goToTemplateCollection">
          <view class="icon-box" style="background:#e8f0fe; color:#4f46e5;">📁</view>
          <text class="item-text">模板合集</text>
        </view>
        <view class="grid-item" @tap="goToMetro">
          <view class="icon-box" style="background:#e8f5e9; color:#2e7d32;">🚇</view>
          <text class="item-text">地铁模式</text>
        </view>
      </view>
    </scroll-view>

    <view class="tabbar">
      <view class="tab active" @tap="goHome">
        <text class="tab-icon">⌂</text>
        <text>首页</text>
      </view>
      <view class="tab" @tap="goToProfile">
        <text class="tab-icon">👤</text>
        <text>我的</text>
      </view>
    </view>

    <view v-if="showFaceCamera" class="face-mask">
      <view class="face-card">
        <camera device-position="front" flash="off" class="face-camera"></camera>
        <text class="face-hint">请正对面部进行采集</text>
        <button class="face-btn" @tap="captureAndBindFace">确认录入</button>
        <button class="face-btn cancel" @tap="showFaceCamera = false">取消</button>
      </view>
    </view>
  </view>
</template>

<script>
import { updateFaceApi, getUserInfoApi } from '@/utils/request.js'

export default {
  data() {
    return {
      username: '',
      showFaceCamera: false,
      faceRegistered: false
    }
  },
  onShow() {
    this.username = uni.getStorageSync('username') || '用户'
    if (this.username && this.username !== '用户') {
      getUserInfoApi(this.username).then((res) => {
        if (res.statusCode === 200 && res.data.user) {
          this.faceRegistered = !!res.data.user.face_registered
        }
      }).catch(() => {})
    }
  },
  methods: {
    captureAndBindFace() {
      const ctx = uni.createCameraContext();
      ctx.takePhoto({
        quality: 'high',
        success: (res) => {
          uni.showLoading({ title: '正在绑定...', mask: true });
          const filePath = res.tempImagePath || res.tempFilePath;
          const fs = uni.getFileSystemManager();
          const base64Data = fs.readFileSync(filePath, 'base64');
          updateFaceApi({
              username: this.username,
              face_data: base64Data
            })
            .then((result) => {
              uni.hideLoading();
              if (result.statusCode === 200) {
                this.faceRegistered = true;
                uni.showToast({ title: '绑定成功', icon: 'success' });
                this.showFaceCamera = false;
              } else {
                uni.showModal({
                  title: '绑定失败',
                  content: result.data.error || '请重试',
                  showCancel: false
                });
              }
            })
            .catch(() => {
              uni.hideLoading();
              uni.showToast({ title: '网络错误', icon: 'none' });
            });
        },
        fail: () => {
          uni.showToast({ title: '摄像头启动失败', icon: 'none' });
        }
      });
    },
    goHome() {},
    goToCamera() {
      uni.navigateTo({ url: '/pages/camera/index' })
    },
    goToAnalyze() {
      uni.navigateTo({ url: '/pages/analyze/index' })
    },
    goToEnvironment() {
      uni.navigateTo({ url: '/pages/environment/index' })
    },
    goToTemplate() {
      uni.navigateTo({ url: '/pages/template/index' })
    },
    goToTemplateCollection() {
      uni.navigateTo({ url: '/pages/template/templateCollection' })
    },
    goToProfile() {
      uni.navigateTo({ url: '/pages/profile/index' })
    },
    goToMetro() {
      uni.navigateTo({ url: '/pages/metro/index' })
    }
  }
}
</script>

<style scoped>
.phone-container {
  width: 100%;
  min-height: 100vh;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.status-bar {
  height: env(safe-area-inset-top, 44px);
  background: linear-gradient(180deg, rgba(255,255,255,0.9) 0%, transparent 100%);
}

.header {
  width: 100%;
  padding: 20rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.greeting {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.today {
  font-size: 26rpx;
  color: #9CA8B8;
  margin-bottom: 8rpx;
}

.welcome {
  max-width: 520rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: #2D3E50;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar {
  flex: 0 0 88rpx;
  width: 88rpx;
  height: 88rpx;
  background: linear-gradient(135deg, #FFE4B8 0%, #FFD49A 100%);
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  box-shadow: 0 8rpx 20rpx rgba(255, 140, 66, 0.15);
}

.content {
  width: 100%;
  flex: 1;
  padding: 16rpx 32rpx calc(140rpx + env(safe-area-inset-bottom, 0px));
}

.ai-card {
  width: 100%;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  border-radius: 32rpx;
  padding: 40rpx;
  margin-bottom: 32rpx;
  color: white;
  box-shadow: 0 20rpx 48rpx -16rpx rgba(255, 110, 97, 0.4);
  transition: transform 0.25s;
}

.ai-card:active {
  transform: scale(0.98);
}

.ai-badge {
  background: rgba(255,255,255,0.25);
  display: inline-block;
  padding: 10rpx 24rpx;
  border-radius: 40rpx;
  font-size: 24rpx;
  font-weight: 500;
  backdrop-filter: blur(4px);
}

.ai-title {
  font-size: 36rpx;
  font-weight: 700;
  margin-top: 20rpx;
}

.ai-desc {
  font-size: 26rpx;
  opacity: 0.9;
  margin-top: 12rpx;
  line-height: 1.5;
}

.grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24rpx;
}

.grid-item {
  min-width: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  border-radius: 28rpx;
  padding: 32rpx 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 12rpx 28rpx -8rpx rgba(0,0,0,0.04), 0 4rpx 12rpx rgba(0,0,0,0.02);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 245, 230, 0.6);
}

.grid-item:active {
  transform: scale(0.95);
  box-shadow: 0 6rpx 14rpx -4rpx rgba(0,0,0,0.06);
}

.icon-box {
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 16rpx rgba(0,0,0,0.06);
}

.item-text {
  width: 100%;
  font-size: 28rpx;
  font-weight: 600;
  color: #2D3E50;
  text-align: center;
  line-height: 1.35;
}

.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  min-height: 100rpx;
  background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  display: flex;
  justify-content: space-around;
  align-items: center;
  border-top: 1px solid rgba(255, 245, 230, 0.8);
  padding-bottom: env(safe-area-inset-bottom, 0);
  backdrop-filter: blur(16px);
  box-shadow: 0 -8rpx 24rpx rgba(0,0,0,0.02);
  z-index: 20;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 22rpx;
  color: #9CA8B8;
  transition: all 0.2s;
  padding: 8rpx 24rpx;
  border-radius: 40rpx;
}

.tab.active {
  color: #FF8C42;
  background: rgba(255, 140, 66, 0.06);
}

.tab-icon {
  font-size: 42rpx;
  line-height: 1;
  margin-bottom: 6rpx;
}

.face-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 48rpx;
}

.face-card {
  width: 100%;
  max-width: 560rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(255, 248, 240, 0.98) 100%);
  border-radius: 48rpx;
  padding: 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 32rpx 64rpx -20rpx rgba(0,0,0,0.15);
  border: 1px solid rgba(255, 245, 230, 0.8);
}

.face-camera {
  width: 320rpx;
  height: 320rpx;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 24rpx;
  border: 4px solid #FFAD7A;
  box-shadow: 0 12rpx 24rpx rgba(0,0,0,0.08);
}

.face-hint {
  font-size: 30rpx;
  color: #5B6E8C;
  margin-bottom: 32rpx;
  font-weight: 500;
}

.face-btn {
  width: 100%;
  padding: 24rpx;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  border-radius: 48rpx;
  margin-bottom: 16rpx;
  font-weight: 650;
  font-size: 30rpx;
  border: none;
  box-shadow: 0 12rpx 24rpx -8rpx rgba(255, 110, 97, 0.3);
  transition: all 0.2s;
}

.face-btn:active {
  transform: scale(0.97);
}

.face-btn.cancel {
  background: #F0F0F0;
  color: #9CA8B8;
  box-shadow: none;
}

.face-icon-box {
  background: #f5efff;
  color: #af52de;
}

.face-icon-box.face-bound {
  background: #e1ffee;
  color: #34c759;
}
</style>
