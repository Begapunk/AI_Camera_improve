<template>
  <view class="env-container">
    <!-- 上传并预览环境照片 -->
    <view class="upload-area">
      <button @tap="chooseImage" class="btn-primary">上传环境图片</button>
      <image v-if="imageUrl" :src="imageUrl" mode="widthFix" class="preview" />
    </view>

    <!-- AI 建议 -->
    <view v-if="suggestion" class="suggestion-box">
      <text class="suggestion-title">📸 AI 构图与姿势建议：</text>
      <text class="suggestion-text">{{ suggestion }}</text>
    </view>

    <!-- 重放按钮：只有拿到音频后才出现 -->
    <button v-if="audioUrl" @tap="replayAudio" class="btn-primary replay-btn">
      🔊 重放语音
    </button>
  </view>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { analyzeEnvApi } from '@/utils/request.js'   

const imageUrl   = ref('')
const suggestion = ref('')
const audioUrl   = ref('')
let audioCtx     = null     // 组件外的可变引用

function chooseImage () {
  uni.chooseImage({
    count: 1,
    success: ({ tempFilePaths }) => {
      imageUrl.value  = tempFilePaths[0]
      suggestion.value = 'AI 分析中...'
      audioUrl.value   = ''
      doAnalyze()
    }
  })
}

async function doAnalyze () {
  uni.showLoading({ title: '分析中...', mask: true })
  try {
    const res = await analyzeEnvApi(imageUrl.value)
    uni.hideLoading()

    if (res.advice) {
      suggestion.value = res.advice
      audioUrl.value   = res.audioUrl || ''
      playAudio()
    } else {
      suggestion.value = 'AI 未返回建议'
    }
  } catch (err) {
    uni.hideLoading()
    suggestion.value = typeof err === 'string' ? err : '上传失败'
  }
}

function playAudio () {
  if (!audioUrl.value) return
  if (audioCtx) {
    audioCtx.stop()
    audioCtx.destroy()
  }
  audioCtx = uni.createInnerAudioContext()
  audioCtx.src = audioUrl.value
  audioCtx.obeyMuteSwitch = false
  audioCtx.play()
}

function replayAudio () {
  playAudio()
}

onUnmounted(() => {
  if (audioCtx) {
    audioCtx.stop()
    audioCtx.destroy()
  }
})
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
  margin-top:100rpx;
}

.btn-primary:hover,
.btn-primary:active {
  background: var(--primary-dark);
  box-shadow: 0 4rpx 12rpx rgba(22, 109, 255, 0.4);
}

.preview {
  margin-top: 30rpx;
  width: 100%;
  max-width: 680rpx; /* 放大最大宽度 */
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
