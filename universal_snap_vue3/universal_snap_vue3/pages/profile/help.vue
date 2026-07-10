<template>
  <view class="container">
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">帮助中心</text>
      <view class="right-placeholder"></view>
    </view>

    <scroll-view class="content" scroll-y enhanced :show-scrollbar="false">
      <view class="faq-list">
        <view v-for="(item, index) in faqs" :key="index" class="faq-item" @click="toggle(index)">
          <view class="faq-question">
            <text class="q-text">{{ item.q }}</text>
            <text class="q-arrow" :class="{ open: item.open }">›</text>
          </view>
          <view v-if="item.open" class="faq-answer">
            <text class="a-text">{{ item.a }}</text>
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
      faqs: [
        {
          q: '智能拍摄助手里的几种模式有什么区别？',
          a: '标准模式给出通用构图建议；智能构图会实时测算主体占比并语音提示前进/后退；专业模式会结合本地场景描述与云端模型生成更精细的拍摄方案，耗时略长。',
          open: true
        },
        {
          q: '“我的模板”里保存的照片别人能看到吗？',
          a: '不能。模板与您的账号绑定，只有登录后的您自己可以查看和删除，其他用户无法访问。',
          open: false
        },
        {
          q: '人脸登录如何开启？',
          a: '进入"我的 - 设置 - 人脸登录"，点击录入人脸并正对摄像头完成采集即可。之后登录页可选择"人脸识别登录"。',
          open: false
        },
        {
          q: '分析记录/环境记录里没有数据？',
          a: '只有在自拍分析或环境分析页面实际拍摄并获得 AI 建议后，才会生成一条记录，历史记录不会预先填充。',
          open: false
        },
        {
          q: '“我的”页面顶部的连续天数怎么计算？',
          a: '只要当天进行过一次自拍分析、环境分析或保存过模板，就算作一次活跃，连续天数按最近的连续活跃自然日累计，中断一天会重新计数。',
          open: false
        },
        {
          q: '地铁模式是做什么用的？',
          a: '面向轨道交通场景的转辙机异物(FOD)检测：先登记设备基准图，再通过三路并联检测与基准差分比对，生成带证据链的巡检记录。',
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
