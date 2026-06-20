<template>
  <view class="container">
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">自拍建议分析</text>
      <view class="right-placeholder"></view>
    </view>

    <scroll-view class="content" scroll-y enhanced :show-scrollbar="false">
      <view class="image-section" v-if="imgSrc">
        <view class="image-container">
          <image :src="imgSrc" mode="aspectFill" class="uploaded-image" />
          <view class="image-overlay">
            <view class="status-info">
              <view class="status-dot" :class="statusClass"></view>
              <text class="analysis-status">{{ analysisStatus }}</text>
            </view>
            <view class="image-badge">AI 分析</view>
          </view>
        </view>
      </view>

      <view class="placeholder-section" v-else>
        <view class="camera-icon-wrap">
          <view class="camera-icon">
            <text class="icon-text">📷</text>
          </view>
          <view class="camera-ring"></view>
        </view>
        <text class="placeholder-text">点击按钮拍摄或从相册选择</text>
        <text class="placeholder-hint">支持1080P高清分析</text>
      </view>

      <view class="advice-section" v-if="advice && advice !== initialAdvice">
        <view class="advice-card">
          <view class="advice-header">
            <view class="advice-icon-wrap">
              <text class="advice-icon">✨</text>
            </view>
            <text class="advice-title">AI 专业建议</text>
          </view>
          <text class="advice-content">{{ advice }}</text>
          
          <view class="audio-controls" v-if="audioUrl">
            <button class="play-button" @click="playAudio">
              <text class="play-text">🔊 语音解读建议</text>
            </button>
          </view>
        </view>
      </view>

      <view class="button-section">
        <button class="capture-button" @click="chooseImage">
          <view class="button-icon">
            <text v-if="imgSrc">🔄</text>
            <text v-else>📷</text>
          </view>
          <text class="button-text">{{ imgSrc ? '重新拍摄' : '开始拍摄' }}</text>
        </button>
        <text class="button-hint">支持相机/相册 · 1080P高清分析</text>
      </view>
    </scroll-view>

    <view class="loading-modal" v-if="isLoading">
      <view class="loading-content">
        <view class="loading-icon">🔍</view>
        <text class="loading-text">正在智能分析中...</text>
        <view class="spinner-wrap">
          <view class="spinner"></view>
          <view class="spinner-ring"></view>
        </view>
        <text class="loading-subtext">约需2秒</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      imgSrc: "",
      advice: "上传照片后，AI将为您提供专业自拍建议",
      audioUrl: "",
      innerAudioContext: null,
      isLoading: false,
      initialAdvice: "上传照片后，AI将为您提供专业自拍建议",
      analysisStatus: "等待分析",
      statusClass: "status-waiting"
    };
  },
  
  methods: {
    // 返回上一页
    goBack() {
      uni.navigateBack();
    },
    
    chooseImage() {
      this.isLoading = true;
      this.analysisStatus = "处理中";
      this.statusClass = "status-processing";
      
      uni.chooseImage({
        count: 1,
        sourceType: ["camera", "album"],
        success: (res) => {
          const path = res.tempFilePaths[0];
          this.imgSrc = path;
          this.advice = "AI正在分析您的自拍...";
          this.audioUrl = "";
          this.analysisStatus = "分析中";
          this.statusClass = "status-analyzing";
          
          setTimeout(() => {
            this.simulateAnalysis().then((result) => {
              this.advice = result.advice;
              this.audioUrl = result.audioUrl;
              this.analysisStatus = "分析完成";
              this.statusClass = "status-completed";
              this.isLoading = false;
              
              if (this.audioUrl) {
                this.playAudio();
              }
            });
          }, 2200);
        },
        fail: () => {
          this.isLoading = false;
          uni.showToast({ title: '选择图片失败', icon: 'none' });
        }
      });
    },
    
    simulateAnalysis() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            advice: "构图完美！建议调整角度至45°，使用自然光增强面部轮廓。背景简洁突出主体，美颜参数建议降低至30%。",
            audioUrl: "" // 实际项目替换为真实音频URL
          });
        }, 1800);
      });
    },
    
    playAudio() {
      if (!this.audioUrl) return;
      
      if (this.innerAudioContext) {
        this.innerAudioContext.stop();
        this.innerAudioContext.destroy();
      }
      
      this.innerAudioContext = uni.createInnerAudioContext();
      this.innerAudioContext.src = this.audioUrl;
      this.innerAudioContext.play();
      this.innerAudioContext.onError(() => {
        uni.showToast({ title: '语音播放失败', icon: 'none' });
      });
    }
  },
  
  onUnload() {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
    }
  }
};
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.nav-bar {
  padding: 60rpx 32rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, transparent 100%);
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

.content {
  flex: 1;
  padding: 0 32rpx 48rpx;
}

.image-section {
  margin-bottom: 48rpx;
}

.image-container {
  position: relative;
  width: 100%;
  height: 480rpx;
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 24rpx 48rpx -16rpx rgba(255, 140, 66, 0.12), 0 8rpx 20rpx rgba(0,0,0,0.06);
  border: 2px solid rgba(255, 245, 230, 0.9);
  background: linear-gradient(135deg, #fff8f0 0%, #ffffff 100%);
}

.uploaded-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 60%, transparent 100%);
  padding: 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.analysis-status {
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.status-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 12rpx currentColor;
}

.status-waiting {
  background: #FFD93D;
  color: #FFD93D;
}

.status-processing {
  background: #FF8C42;
  color: #FF8C42;
}

.status-analyzing {
  background: #FF7E5F;
  color: #FF7E5F;
}

.status-completed {
  background: #34C759;
  color: #34C759;
}

.image-badge {
  background: linear-gradient(135deg, rgba(255, 140, 66, 0.9) 0%, rgba(255, 110, 97, 0.9) 100%);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 600;
  padding: 12rpx 24rpx;
  border-radius: 24rpx;
  backdrop-filter: blur(4px);
}

.placeholder-section {
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  backdrop-filter: blur(12px);
  border-radius: 40rpx;
  padding: 72rpx 40rpx;
  margin-bottom: 48rpx;
  text-align: center;
  border: 1px solid rgba(255, 245, 230, 0.8);
  box-shadow: 0 16rpx 40rpx -12rpx rgba(255, 140, 66, 0.08), 0 4rpx 12rpx rgba(0,0,0,0.03);
}

.camera-icon-wrap {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  margin: 0 auto 32rpx;
}

.camera-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 160rpx;
  height: 160rpx;
  background: linear-gradient(135deg, #fff8f0 0%, #ffffff 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 32rpx rgba(255, 140, 66, 0.15);
  z-index: 1;
}

.camera-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 180rpx;
  height: 180rpx;
  border: 4rpx solid rgba(255, 140, 66, 0.2);
  border-radius: 50%;
  animation: ring-pulse 2s ease-in-out infinite;
}

.icon-text {
  font-size: 80rpx;
}

.placeholder-text {
  font-size: 34rpx;
  color: #5B6E8C;
  margin-bottom: 16rpx;
  font-weight: 600;
}

.placeholder-hint {
  font-size: 26rpx;
  color: #9CA8B8;
}

.advice-section {
  margin-bottom: 56rpx;
}

.advice-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.96) 100%);
  border-radius: 32rpx;
  padding: 40rpx;
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

.advice-content {
  font-size: 30rpx;
  line-height: 1.7;
  color: #5B6E8C;
  text-align: justify;
  background: rgba(255, 140, 66, 0.04);
  padding: 24rpx;
  border-radius: 20rpx;
  border-left: 4rpx solid #FF8C42;
}

.audio-controls {
  margin-top: 36rpx;
}

.play-button {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  border: none;
  border-radius: 32rpx;
  padding: 28rpx 0;
  color: white;
  font-size: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 16rpx 32rpx -10rpx rgba(255, 110, 97, 0.4);
}

.play-button:active {
  transform: scale(0.96);
  box-shadow: 0 8rpx 16rpx -6rpx rgba(255, 110, 97, 0.45);
}

.play-text {
  margin-left: 12rpx;
}

.button-section {
  text-align: center;
  margin-top: 24rpx;
  margin-bottom: 80rpx;
}

.capture-button {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  border: none;
  border-radius: 40rpx;
  padding: 36rpx 0;
  color: white;
  font-size: 36rpx;
  font-weight: 700;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 20rpx 40rpx -12rpx rgba(255, 110, 97, 0.38);
}

.capture-button:active {
  transform: scale(0.97);
  box-shadow: 0 10rpx 20rpx -8rpx rgba(255, 110, 97, 0.45);
}

.button-icon {
  font-size: 44rpx;
}

.button-text {
  font-size: 36rpx;
  font-weight: 700;
}

.button-hint {
  display: block;
  font-size: 26rpx;
  color: #9CA8B8;
  margin-top: 24rpx;
}

.loading-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  background: linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(255, 248, 240, 0.98) 100%);
  border-radius: 40rpx;
  padding: 64rpx 80rpx;
  text-align: center;
  min-width: 520rpx;
  box-shadow: 0 32rpx 64rpx -20rpx rgba(0,0,0,0.15);
  border: 1px solid rgba(255, 245, 230, 0.8);
}

.loading-icon {
  font-size: 80rpx;
  margin-bottom: 28rpx;
  animation: float 2s ease-in-out infinite;
}

.loading-text {
  font-size: 34rpx;
  color: #2D3E50;
  margin-bottom: 32rpx;
  font-weight: 600;
}

.spinner-wrap {
  position: relative;
  width: 80rpx;
  height: 80rpx;
  margin: 0 auto 24rpx;
}

.spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 64rpx;
  height: 64rpx;
  border: 4rpx solid rgba(255, 140, 66, 0.15);
  border-top: 4rpx solid #FF8C42;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 76rpx;
  height: 76rpx;
  border: 2rpx solid rgba(255, 140, 66, 0.1);
  border-radius: 50%;
  animation: spin 2s linear infinite reverse;
}

.loading-subtext {
  font-size: 26rpx;
  color: #9CA8B8;
}

@keyframes spin {
  0% { transform: translate(-50%, -50%) rotate(0deg); }
  100% { transform: translate(-50%, -50%) rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { 
    transform: scale(1); 
    opacity: 0.8; 
  }
  50% { 
    transform: scale(1.4); 
    opacity: 1; 
  }
}

@keyframes ring-pulse {
  0%, 100% { 
    transform: translate(-50%, -50%) scale(1); 
    opacity: 0.3; 
  }
  50% { 
    transform: translate(-50%, -50%) scale(1.15); 
    opacity: 0.6; 
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12rpx); }
}

/* 布局修正：滚动内容和弹窗保持在屏幕宽度内 */
.container {
  width: 100%;
  overflow-x: hidden;
}

.nav-bar,
.content {
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

.image-container,
.placeholder-section,
.advice-card,
.capture-button {
  width: 100%;
}

.image-overlay {
  gap: 20rpx;
}

.status-info {
  min-width: 0;
}

.analysis-status,
.image-badge,
.button-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-modal {
  padding: 48rpx;
}

.loading-content {
  width: 100%;
  max-width: 560rpx;
  min-width: 0;
  padding: 56rpx 48rpx;
}

</style>
