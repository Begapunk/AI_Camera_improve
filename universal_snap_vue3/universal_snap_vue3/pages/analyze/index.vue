<template>
  <view class="container">
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">{{ $t('analyze.title') }}</text>
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
            <view class="image-badge">{{ $t('analyze.aiAnalysisBadge') }}</view>
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
        <text class="placeholder-text">{{ $t('analyze.placeholderText') }}</text>
        <text class="placeholder-hint">{{ $t('analyze.placeholderHint') }}</text>
      </view>

      <view class="advice-section" v-if="advice && advice !== initialAdvice">
        <view class="advice-card">
          <view class="advice-header">
            <view class="advice-icon-wrap">
              <text class="advice-icon">✨</text>
            </view>
            <text class="advice-title">{{ $t('analyze.aiAdviceTitle') }}</text>
          </view>
          <text class="advice-content">{{ advice }}</text>

          <view class="audio-controls" v-if="audioUrl">
            <button class="play-button" @click="playAudio">
              <text class="play-text">🔊 {{ $t('analyze.playAdviceAudio') }}</text>
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
          <text class="button-text">{{ imgSrc ? $t('analyze.retake') : $t('analyze.startCapture') }}</text>
        </button>
        <text class="button-hint">{{ $t('analyze.buttonHint') }}</text>
      </view>
    </scroll-view>

    <view class="loading-modal" v-if="isLoading">
      <view class="loading-content">
        <view class="loading-icon">🔍</view>
        <text class="loading-text">{{ $t('analyze.analyzingInProgress') }}</text>
        <view class="spinner-wrap">
          <view class="spinner"></view>
          <view class="spinner-ring"></view>
        </view>
        <text class="loading-subtext">{{ $t('analyze.estimatedTime') }}</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      imgSrc: "",
      advice: this.$t('analyze.initialAdvice'),
      audioUrl: "",
      // innerAudioContext 不放 data()：原生桥接对象进 Vue Proxy 后，App 端属性赋值会抛
      // "Proxy set trap returned falsy"。实例存 this._audioCtx（非响应式）。
      isLoading: false,
      initialAdvice: this.$t('analyze.initialAdvice'),
      analysisStatus: this.$t('analyze.statusWaiting'),
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
      this.analysisStatus = this.$t('analyze.statusProcessing');
      this.statusClass = "status-processing";
      
      uni.chooseImage({
        count: 1,
        sourceType: ["camera", "album"],
        success: (res) => {
          const path = res.tempFilePaths[0];
          this.imgSrc = path;
          this.advice = this.$t('analyze.analyzingSelfie');
          this.audioUrl = "";
          this.analysisStatus = this.$t('analyze.statusAnalyzing');
          this.statusClass = "status-analyzing";
          
          setTimeout(() => {
            this.simulateAnalysis().then((result) => {
              this.advice = result.advice;
              this.audioUrl = result.audioUrl;
              this.analysisStatus = this.$t('analyze.statusCompleted');
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
          uni.showToast({ title: this.$t('analyze.chooseImageFailed'), icon: 'none' });
        }
      });
    },
    
    simulateAnalysis() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            advice: this.$t('analyze.mockAdviceText'),
            audioUrl: "" // 实际项目替换为真实音频URL
          });
        }, 1800);
      });
    },
    
    playAudio() {
      if (!this.audioUrl) return;
      
      if (this._audioCtx) {
        this._audioCtx.stop();
        this._audioCtx.destroy();
      }
      
      this._audioCtx = uni.createInnerAudioContext();
      try { this._audioCtx.obeyMuteSwitch = false; } catch (e) {} // iOS 静音拨片下仍播报；App 端不支持时忽略
      this._audioCtx.onError((err) => {
        console.error('[audio] play error:', err, 'src=', this._audioCtx.src);
        uni.showToast({ title: this.$t('analyze.audioPlayFailed') + (err && err.errMsg || this.$t('analyze.unknown')), icon: 'none' });
      });

      const src = this.audioUrl;
      // 网络 http mp3 先下载到本地再播，规避微信 innerAudioContext 播放网络音频失败
      if (/^https?:\/\//i.test(src)) {
        uni.downloadFile({
          url: src,
          success: (res) => {
            if (res.statusCode === 200 && res.tempFilePath) {
              this._audioCtx.src = res.tempFilePath;
              this._audioCtx.play();
            } else {
              uni.showToast({ title: this.$t('analyze.audioDownloadFailed') + res.statusCode, icon: 'none' });
            }
          },
          fail: (err) => {
            console.error('[audio] downloadFile fail:', err);
            uni.showToast({ title: this.$t('analyze.audioDownloadFailed') + (err && err.errMsg || this.$t('analyze.unknown')), icon: 'none' });
          }
        });
      } else {
        this._audioCtx.src = src;
        this._audioCtx.play();
      }
    }
  },
  
  onUnload() {
    if (this._audioCtx) {
      this._audioCtx.stop();
      this._audioCtx.destroy();
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
