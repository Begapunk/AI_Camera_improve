<template>
  <view class="env-container">
    <!-- 上传并预览环境照片 -->
    <view class="upload-area">
      <button @tap="chooseImage" class="btn-primary">上传自拍照片</button>
      <image v-if="imgSrc" :src="imgSrc" mode="widthFix" class="preview" />
    </view>

    <!-- AI 建议 -->
    <view v-if="advice" class="suggestion-box">
      <text class="suggestion-title">📸 AI 构图与姿势建议：</text>
      <text class="suggestion-text">{{ advice }}</text>
    </view>

    <!-- 重放按钮：只有拿到音频后才出现 -->
    <button v-if="audioUrl" @tap="playAudio" class="btn-primary replay-btn">
      🔊 重放语音
    </button>
  </view>
</template>

<script>
import { uploadImageToServer } from '@/utils/request.js'

export default {
  data() {
    return {
      imgSrc: '',
      advice: '',
      audioUrl: '',
      innerAudioContext: null,
    }
  },
  methods: {
    chooseImage() {
      uni.chooseImage({
        count: 1,
        sourceType: ['camera', 'album'],
        success: (res) => {
          const path = res.tempFilePaths[0]
          this.imgSrc = path
          this.advice = '正在分析，请稍候...'
          this.audioUrl = ''

          uploadImageToServer(path).then(res => {
            if (res && res.advice) {
              this.advice = res.advice
              this.audioUrl = res.audioUrl
              this.playAudio() // 自动播放一次
            } else if (res && res.error) {
              this.advice = '服务器错误：' + res.error
            } else {
              this.advice = '未获取到有效建议'
            }
          }).catch(err => {
            console.error(err)
            this.advice = '分析失败，请稍后重试'
          })
        }
      })
    },
    playAudio() {
      if (!this.audioUrl) return
      if (this.innerAudioContext) {
        this.innerAudioContext.stop()
        this.innerAudioContext.destroy()
      }
      this.innerAudioContext = uni.createInnerAudioContext()
      this.innerAudioContext.src = this.audioUrl
      this.innerAudioContext.obeyMuteSwitch = false
      this.innerAudioContext.play()

      this.innerAudioContext.onError((res) => {
        console.error('音频播放错误：', res)
        uni.showToast({ title: '语音播放失败', icon: 'none' })
      })
    }
  },
  onUnload() {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop()
      this.innerAudioContext.destroy()
    }
  }
}
</script>

<style scoped>
:root {
  --primary: #1E80FF;
  --primary-dark: #166DFF;
  --primary-light: #D9E7FF;
  --text-dark: #1B2F5B;
  --bg-light: #F7FAFF;
  --shadow: rgba(30, 128, 255, 0.25);
}

.env-container {
  padding: 40rpx 30rpx;
  background: var(--bg-light);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

.upload-area {
  width: 100%;
  max-width: 680rpx;
  text-align: center;
  margin-bottom: 50rpx;
}

.btn-primary {
  width: 100%;
  padding: 18rpx 0;
  font-size: 30rpx;
  font-weight: 700;
  color: white;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark));
  border: none;
  border-radius: 40rpx;
  box-shadow: 0 8rpx 16rpx var(--shadow);
  cursor: pointer;
  transition: background 0.3s ease, box-shadow 0.3s ease;
  margin-top: 100rpx;
}

.btn-primary:hover,
.btn-primary:active {
  background: var(--primary-dark);
  box-shadow: 0 4rpx 12rpx rgba(22, 109, 255, 0.4);
}

.preview {
  margin-top: 30rpx;
  width: 100%;
  max-width: 680rpx; /* 放大图片最大宽度 */
  height: auto;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 18rpx rgba(0, 0, 0, 0.12);
  object-fit: contain;
}

.suggestion-box {
  width: 100%;
  max-width: 580rpx;
  background: white;
  border-radius: 24rpx;
  padding: 36rpx 32rpx;
  box-shadow: 0 8rpx 20rpx rgba(30, 128, 255, 0.15);
  color: var(--text-dark);
  user-select: text;
  line-height: 1.6;
}

.suggestion-title {
  font-size: 34rpx;
  font-weight: 800;
  margin-bottom: 20rpx;
  color: var(--primary-dark);
  user-select: none;
}

.suggestion-text {
  font-size: 28rpx;
  white-space: pre-wrap;
}

.replay-btn {
  margin-top: 40rpx;
  width: 360rpx;
  font-size: 28rpx;
  border-radius: 36rpx;
  box-shadow: 0 6rpx 14rpx var(--shadow);
  letter-spacing: 1.2px;
}
</style>
