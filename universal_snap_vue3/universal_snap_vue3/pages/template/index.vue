<template>
  <view class="container">
    <!-- 顶部导航栏（模拟联立风格） -->
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">{{ $t('template.navTitle') }}</text>
      <view class="right-placeholder"></view>
    </view>

    <!-- 图片预览区 -->
    <view class="image-section" v-if="imgSrc">
      <view class="image-card">
        <image :src="imgSrc" mode="aspectFill" class="preview-img" />
        <view class="image-badge">{{ $t('template.pendingScore') }}</view>
      </view>
    </view>
    <view v-else class="placeholder-section">
      <view class="camera-icon">📷</view>
      <text class="placeholder-text">{{ $t('template.placeholderText') }}</text>
      <text class="placeholder-hint">{{ $t('template.placeholderHint') }}</text>
    </view>

    <!-- 评分结果卡片 -->
    <view v-if="score" class="score-card">
      <text class="score-label">{{ $t('template.scoreLabel') }}</text>
      <view class="score-value-wrap">
        <text class="score-value">{{ formattedScore }}</text>
        <text class="score-total">/ 1</text>
      </view>
    </view>

    <!-- AI 建议卡片 -->
    <view v-if="advice" class="advice-card">
      <view class="advice-header">
        <text class="advice-icon">✨</text>
        <text class="advice-title">{{ $t('template.adviceTitle') }}</text>
      </view>
      <text class="advice-text">{{ advice }}</text>
    </view>

    <!-- 按钮组 -->
    <view class="button-group">
      <button class="btn-outline" @tap="chooseImage">
        <text class="btn-icon">📷</text>
        {{ $t('template.chooseImage') }}
      </button>
      <button v-if="imgSrc" class="btn-primary" @tap="submitTemplate(false)">
        🧠 {{ $t('template.getAiScore') }}
      </button>
      <button v-if="imgSrc && score" class="btn-secondary" @tap="submitTemplate(true)">
        💾 {{ $t('template.saveAsTemplate') }}
      </button>
    </view>

    <!-- 底部安全区提示（无实际功能） -->
    <view class="bottom-safe"></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { analyzeTemplateApi } from '@/utils/request.js'

const imgSrc  = ref('')
const score   = ref('')
const advice  = ref('')

const formattedScore = computed(() => {
  if (score.value === '' || score.value == null) return ''
  const num = parseFloat(score.value)
  return isNaN(num) ? '' : num.toFixed(3)
})

function goBack() {
  uni.navigateBack()
}

function chooseImage() {
  uni.chooseImage({
    count: 1,
    sourceType: ['camera', 'album'],
    success: ({ tempFilePaths }) => {
      imgSrc.value = tempFilePaths[0]
      score.value  = ''
      advice.value = ''
    }
  })
}

async function submitTemplate(saveAsTemplate) {
  if (!imgSrc.value) return
  uni.showLoading({ title: uni.$t('template.analyzing'), mask: true })
  try {
    const res = await analyzeTemplateApi(imgSrc.value, saveAsTemplate)
    uni.hideLoading()
    if (res.error) {
      uni.showToast({ title: uni.$t('template.analyzeFailed'), icon: 'none' })
      return
    }
    score.value  = res.score
    advice.value = res.advice || res.suggestion
    if (saveAsTemplate) {
      uni.showToast({ title: uni.$t('template.savedAsTemplate'), icon: 'success' })
    }
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: typeof err === 'string' ? err : uni.$t('template.uploadFailed'), icon: 'none' })
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30rpx 32rpx 60rpx;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.nav-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 36rpx;
  padding-top: 60rpx;
}

.back-btn {
  width: 72rpx;
  height: 72rpx;
  background: linear-gradient(135deg, #ffffff 0%, #fff8f0 100%);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(255, 140, 66, 0.1), 0 2rpx 8rpx rgba(0,0,0,0.04);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.back-btn:active {
  transform: scale(0.92);
  box-shadow: 0 4rpx 12rpx rgba(255, 140, 66, 0.15);
}

.back-icon {
  font-size: 44rpx;
  color: #FF8C42;
  font-weight: 600;
}

.nav-title {
  font-size: 38rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #EF6C3E 0%, #F5A65B 50%, #FFB347 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.5px;
}

.right-placeholder {
  width: 72rpx;
}

.image-section {
  width: 100%;
  margin-bottom: 40rpx;
}

.image-card {
  position: relative;
  width: 100%;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 24rpx 48rpx -16rpx rgba(255, 140, 66, 0.12), 0 8rpx 20rpx rgba(0,0,0,0.06);
  border: 2px solid rgba(255, 245, 230, 0.9);
}

.preview-img {
  width: 100%;
  height: 420rpx;
  object-fit: cover;
  display: block;
}

.image-badge {
  position: absolute;
  bottom: 24rpx;
  right: 24rpx;
  background: linear-gradient(135deg, rgba(255, 140, 66, 0.95) 0%, rgba(255, 110, 97, 0.95) 100%);
  backdrop-filter: blur(8px);
  padding: 12rpx 24rpx;
  border-radius: 48rpx;
  color: white;
  font-size: 26rpx;
  font-weight: 600;
  box-shadow: 0 4rpx 12rpx rgba(255, 110, 97, 0.3);
}

.placeholder-section {
  width: 100%;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  border-radius: 32rpx;
  padding: 80rpx 32rpx;
  margin-bottom: 40rpx;
  text-align: center;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 245, 230, 0.6);
  box-shadow: 0 12rpx 28rpx -8rpx rgba(0,0,0,0.04);
}

.camera-icon {
  font-size: 100rpx;
  margin-bottom: 28rpx;
  color: #FFAD7A;
  animation: breathe 2s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.placeholder-text {
  font-size: 32rpx;
  color: #5B6E8C;
  font-weight: 500;
  margin-bottom: 16rpx;
}

.placeholder-hint {
  font-size: 26rpx;
  color: #9CA8B8;
}

.score-card {
  width: 100%;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.96) 100%);
  border-radius: 32rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 28rpx;
  text-align: center;
  box-shadow: 0 20rpx 48rpx -16rpx rgba(255, 140, 66, 0.08), 0 8rpx 20rpx rgba(0,0,0,0.04);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 245, 230, 0.6);
}

.score-label {
  display: block;
  font-size: 28rpx;
  color: #9CA8B8;
  margin-bottom: 20rpx;
  letter-spacing: 1px;
}

.score-value-wrap {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8rpx;
}

.score-value {
  font-size: 80rpx;
  font-weight: 800;
  background: linear-gradient(135deg, #EF6C3E 0%, #F5A65B 50%, #FFB347 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
}

.score-total {
  font-size: 36rpx;
  font-weight: 600;
  color: #FFAD7A;
}

.advice-card {
  width: 100%;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.96) 100%);
  border-radius: 32rpx;
  padding: 40rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 20rpx 48rpx -16rpx rgba(255, 140, 66, 0.08), 0 8rpx 20rpx rgba(0,0,0,0.04);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 245, 230, 0.6);
}

.advice-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 28rpx;
}

.advice-icon-wrap {
  width: 64rpx;
  height: 64rpx;
  background: linear-gradient(135deg, #FFE4B8 0%, #FFD49A 100%);
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.advice-icon {
  font-size: 36rpx;
}

.advice-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #2D3E50;
}

.advice-text {
  font-size: 30rpx;
  line-height: 1.7;
  color: #5B6E8C;
  text-align: justify;
  background: rgba(255, 140, 66, 0.04);
  padding: 24rpx;
  border-radius: 20rpx;
  border-left: 4rpx solid #FF8C42;
}

.button-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin-top: 12rpx;
}

button {
  border: none;
  border-radius: 48rpx;
  padding: 32rpx 0;
  font-size: 32rpx;
  font-weight: 650;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

button:active {
  transform: scale(0.96);
}

.btn-icon {
  font-size: 36rpx;
}

.btn-outline {
  background: linear-gradient(135deg, #fff8f0 0%, #ffffff 100%);
  border: 2rpx solid rgba(255, 140, 66, 0.3);
  color: #FF8C42;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.02);
}

.btn-outline:active {
  background: rgba(255, 140, 66, 0.06);
}

.btn-primary {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  box-shadow: 0 16rpx 32rpx -10rpx rgba(255, 110, 97, 0.35);
}

.btn-primary:active {
  box-shadow: 0 8rpx 16rpx -6rpx rgba(255, 110, 97, 0.45);
}

.btn-secondary {
  background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%);
  color: white;
  box-shadow: 0 12rpx 24rpx -8rpx rgba(59, 130, 246, 0.3);
}

.btn-secondary:active {
  box-shadow: 0 6rpx 12rpx -4rpx rgba(59, 130, 246, 0.4);
}

.bottom-safe {
  height: 60rpx;
}

/* 布局修正：所有 100% 宽卡片包含内边距，避免右侧溢出 */
.container {
  width: 100%;
  overflow-x: hidden;
}

.nav-bar,
.image-section,
.placeholder-section,
.score-card,
.advice-card,
.button-group {
  width: 100%;
}

.back-btn,
.right-placeholder {
  flex: 0 0 72rpx;
}

.nav-title {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.placeholder-section,
.score-card,
.advice-card,
button {
  box-sizing: border-box;
}

.advice-text {
  display: block;
}
</style>
