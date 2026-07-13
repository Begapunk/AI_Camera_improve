<template>
  <view class="container">
    <!-- 顶部导航栏（联立风格） -->
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">←</text>
      </view>
      <text class="nav-title">模板合集</text>
      <view class="right-placeholder"></view>
    </view>

    <!-- 模板展示区（网格布局） -->
    <view class="grid" v-if="templates.length > 0">
      <view v-for="(item, index) in templates" :key="index" class="grid-item">
        <view class="photo-wrapper">
          <image
            :src="item.imageUrl"
            mode="aspectFill"
            class="photo"
            @click="previewImage(index)"
          />
          <view class="delete-btn" @click.stop="confirmDelete(item.id)">✕</view>
        </view>
        <text class="score">评分：{{ formatScore(item.score) }}</text>
      </view>
    </view>

    <!-- 空状态占位 -->
    <view v-else class="empty-state">
      <text class="empty-icon">📁</text>
      <text class="empty-text">暂无模板</text>
      <text class="empty-hint">去模板评分页面保存喜欢的作品吧</text>
    </view>

    <!-- 底部安全区 -->
    <view class="bottom-safe"></view>
  </view>
</template>

<script>
import { fetchTemplateList, deleteTemplateApi } from '@/utils/request.js'

export default {
  data() {
    return {
      templates: []
    }
  },
  onLoad() {
    this.loadTemplates()
  },
  methods: {
    goBack() {
      uni.navigateBack()
    },
    async loadTemplates() {
      try {
        const res = await fetchTemplateList()
        if (res.statusCode === 200 && res.data.templates) {
          this.templates = res.data.templates
        } else {
          uni.showToast({ title: '加载失败', icon: 'none' })
        }
      } catch (err) {
        console.error(err)
        uni.showToast({ title: '请求出错', icon: 'none' })
      }
    },

    // 后端存的是原始浮点评分（如 0.7327833771705627），不格式化会撑爆卡片被省略号截断
    formatScore(score) {
      const n = Number(score)
      return Number.isFinite(n) ? n.toFixed(1) : '--'
    },

    previewImage(index) {
      const urls = this.templates.map(item => item.imageUrl)
      uni.previewImage({
        current: urls[index],
        urls: urls
      })
    },

    confirmDelete(id) {
      uni.showModal({
        title: '提示',
        content: '确定要删除该模板吗？',
        success: async ({ confirm }) => {
          if (confirm) await this.handleDelete(id)
        }
      })
    },

    async handleDelete(id) {
      try {
        const res = await deleteTemplateApi(id)
        if (res.statusCode === 200) {
          uni.showToast({ title: '删除成功', icon: 'success' })
          this.loadTemplates()
        } else {
          uni.showToast({ title: '删除失败', icon: 'none' })
        }
      } catch (err) {
        console.error(err)
        uni.showToast({ title: '删除出错', icon: 'none' })
      }
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
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

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24rpx;
}

.grid-item {
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  border-radius: 28rpx;
  padding: 20rpx;
  box-shadow: 0 12rpx 28rpx -8rpx rgba(0,0,0,0.04), 0 4rpx 12rpx rgba(0,0,0,0.02);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 245, 230, 0.6);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.grid-item:active {
  transform: scale(0.96);
  box-shadow: 0 6rpx 14rpx -4rpx rgba(0,0,0,0.06);
}

.photo-wrapper {
  width: 100%;
  position: relative;
  border-radius: 24rpx;
  overflow: hidden;
  background: linear-gradient(135deg, #fff5eb 0%, #fff0e6 100%);
}

.photo {
  width: 100%;
  height: 300rpx;
  border-radius: 24rpx;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
  cursor: pointer;
}

.photo:active {
  transform: scale(1.02);
}

.delete-btn {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  font-size: 28rpx;
  font-weight: bold;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  box-shadow: 0 8rpx 16rpx rgba(255, 110, 97, 0.35);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.delete-btn:active {
  transform: scale(0.9);
  box-shadow: 0 4rpx 8rpx rgba(255, 110, 97, 0.4);
}

.score {
  display: block;
  margin-top: 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #EF6C3E;
  text-align: center;
  letter-spacing: 0.5px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 40rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  border-radius: 48rpx;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 245, 230, 0.6);
  box-shadow: 0 12rpx 28rpx -8rpx rgba(0,0,0,0.04);
}

.empty-icon {
  font-size: 100rpx;
  margin-bottom: 28rpx;
  color: #FFAD7A;
  animation: breathe 2s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.empty-text {
  font-size: 34rpx;
  font-weight: 600;
  color: #5B6E8C;
  margin-bottom: 16rpx;
}

.empty-hint {
  font-size: 28rpx;
  color: #9CA8B8;
  text-align: center;
}

.bottom-safe {
  height: 60rpx;
}

/* 布局修正：网格列可收缩，卡片不会把页面撑出屏幕 */
.container {
  width: 100%;
  overflow-x: hidden;
}

.nav-bar,
.grid,
.empty-state {
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

.grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.grid-item {
  min-width: 0;
}

.score {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
