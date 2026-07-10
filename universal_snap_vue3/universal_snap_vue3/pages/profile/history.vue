<template>
  <view class="container">
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">{{ type === 'environment' ? '环境记录' : '分析记录' }}</text>
      <view class="right-placeholder"></view>
    </view>

    <scroll-view class="content" scroll-y enhanced :show-scrollbar="false">
      <view v-if="records.length > 0" class="list">
        <view v-for="item in records" :key="item.id" class="record-card">
          <image :src="item.imageUrl" mode="aspectFill" class="thumb" @click="previewImage(item)" />
          <view class="record-body">
            <text class="advice">{{ item.advice }}</text>
            <view class="record-footer">
              <text class="time">{{ formatTime(item.create_time) }}</text>
              <text v-if="item.audioUrl" class="play-btn" @click="playAudio(item.audioUrl)">🔊 语音</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="empty-state">
        <text class="empty-icon">{{ type === 'environment' ? '🌤️' : '📊' }}</text>
        <text class="empty-text">暂无记录</text>
        <text class="empty-hint">{{ type === 'environment' ? '去环境分析页面拍一张试试吧' : '去自拍分析页面拍一张试试吧' }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { fetchHistoryApi } from '@/utils/request.js'

export default {
  data() {
    return {
      type: 'selfie',
      records: [],
      innerAudioContext: null
    }
  },
  onLoad(options) {
    this.type = options.type === 'environment' ? 'environment' : 'selfie'
    this.loadHistory()
  },
  onUnload() {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop()
      this.innerAudioContext.destroy()
    }
  },
  methods: {
    goBack() {
      uni.navigateBack()
    },
    loadHistory() {
      uni.showLoading({ title: '加载中...', mask: true })
      fetchHistoryApi(this.type)
        .then((res) => {
          uni.hideLoading()
          if (res.statusCode === 200 && res.data.records) {
            this.records = res.data.records
          } else {
            uni.showToast({ title: '加载失败', icon: 'none' })
          }
        })
        .catch(() => {
          uni.hideLoading()
          uni.showToast({ title: '请求出错', icon: 'none' })
        })
    },
    previewImage(item) {
      uni.previewImage({ current: item.imageUrl, urls: [item.imageUrl] })
    },
    playAudio(url) {
      if (this.innerAudioContext) {
        this.innerAudioContext.stop()
        this.innerAudioContext.destroy()
      }
      this.innerAudioContext = uni.createInnerAudioContext()
      this.innerAudioContext.obeyMuteSwitch = false
      this.innerAudioContext.onError((err) => {
        uni.showToast({ title: '语音播放失败', icon: 'none' })
      })
      // 网络 http mp3 先下载到本地再播，规避微信 innerAudioContext 播放网络音频失败
      uni.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            this.innerAudioContext.src = res.tempFilePath
            this.innerAudioContext.play()
          }
        },
        fail: () => {
          uni.showToast({ title: '语音下载失败', icon: 'none' })
        }
      })
    },
    formatTime(value) {
      if (!value) return ''
      const d = new Date(String(value).replace(' ', 'T'))
      if (isNaN(d.getTime())) return String(value)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.record-card {
  display: flex;
  background: rgba(255,255,255,0.95);
  border-radius: 24rpx;
  padding: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
  box-sizing: border-box;
}

.thumb {
  flex: 0 0 160rpx;
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  background: #fff5eb;
  margin-right: 20rpx;
}

.record-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.advice {
  font-size: 26rpx;
  color: #2D3E50;
  line-height: 1.5;
}

.record-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12rpx;
}

.time {
  font-size: 22rpx;
  color: #8E9AAB;
}

.play-btn {
  font-size: 22rpx;
  color: #EF6C3E;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
}

.empty-icon {
  font-size: 96rpx;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 32rpx;
  font-weight: 600;
  color: #2D3E50;
  margin-bottom: 12rpx;
}

.empty-hint {
  font-size: 24rpx;
  color: #8E9AAB;
}
</style>
