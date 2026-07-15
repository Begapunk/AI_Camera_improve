<template>
  <view class="container">
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">{{ $t('profileHelp.title') }}</text>
      <view class="right-placeholder"></view>
    </view>

    <scroll-view class="content" scroll-y enhanced :show-scrollbar="false">
      <view class="faq-list">
        <view v-for="(item, index) in faqs" :key="index" class="faq-item" @click="toggle(index)">
          <view class="faq-question">
            <text class="q-text">{{ $t('profileHelp.' + item.q) }}</text>
            <text class="q-arrow" :class="{ open: item.open }">›</text>
          </view>
          <view v-if="item.open" class="faq-answer">
            <text class="a-text">{{ $t('profileHelp.' + item.a) }}</text>
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
      // 显示文案走 profileHelp.<key> 翻译键，这里只留 key
      faqs: [
        {
          q: 'faq1Q',
          a: 'faq1A',
          open: true
        },
        {
          q: 'faq2Q',
          a: 'faq2A',
          open: false
        },
        {
          q: 'faq3Q',
          a: 'faq3A',
          open: false
        },
        {
          q: 'faq4Q',
          a: 'faq4A',
          open: false
        },
        {
          q: 'faq5Q',
          a: 'faq5A',
          open: false
        },
        {
          q: 'faq6Q',
          a: 'faq6A',
          open: false
        }
      ]
    }
  },
  methods: {
    goBack() {
      uni.navigateBack()
    },
    toggle(index) {
      this.faqs[index].open = !this.faqs[index].open
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

.faq-list {
  background: rgba(255,255,255,0.95);
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
}

.faq-item {
  padding: 28rpx 28rpx;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.faq-item:last-child {
  border-bottom: none;
}

.faq-question {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.q-text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  font-weight: 600;
  color: #2D3E50;
}

.q-arrow {
  flex: 0 0 auto;
  font-size: 36rpx;
  color: #C0C9D4;
  margin-left: 16rpx;
  transform: rotate(90deg);
  transition: transform 0.2s;
}

.q-arrow.open {
  transform: rotate(-90deg);
  color: #EF6C3E;
}

.faq-answer {
  margin-top: 16rpx;
}

.a-text {
  font-size: 24rpx;
  color: #6B7A90;
  line-height: 1.6;
}
</style>
