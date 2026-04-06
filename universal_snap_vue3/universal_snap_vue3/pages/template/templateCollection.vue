<template>
  <view class="container">
    <view class="grid">
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
        <text class="score">评分：{{ item.score }}</text>
      </view>
    </view>
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
  padding: 20rpx;
  background: linear-gradient(135deg, #e6f0ff 0%, #cce0ff 100%);
  min-height: 100vh;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.grid-item {
  width: 44%;
  margin-bottom: 20rpx;
  margin-right: 4%;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  /* 轻微阴影和圆角 */
  border-radius: 16rpx;
  background: #f0f6ff;
  box-shadow: 0 6rpx 10rpx rgba(30, 110, 255, 0.15);
  padding: 12rpx;
  transition: box-shadow 0.25s ease;
}

.grid-item:hover {
  box-shadow: 0 10rpx 20rpx rgba(30, 110, 255, 0.3);
}

.grid-item:nth-child(2n) {
  margin-right: 0;
}

.photo-wrapper {
  width: 100%;
  position: relative;
  border-radius: 12rpx;
  overflow: hidden;
  box-shadow: 0 6rpx 14rpx rgba(30, 110, 255, 0.25);
}

.photo {
  width: 100%;
  height: 200rpx;
  border-radius: 12rpx;
  object-fit: cover;
  transition: transform 0.3s ease;
  cursor: pointer;
}
.photo:hover {
  transform: scale(1.05);
}

.delete-btn {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  background: #1670ff; /* 蓝色背景 */
  color: white;
  font-size: 24rpx;
  padding: 6rpx 12rpx;
  border-radius: 50rpx;
  z-index: 10;
  box-shadow: 0 2rpx 6rpx rgba(22, 112, 255, 0.6);
  user-select: none;
  transition: background-color 0.3s ease;
}

.delete-btn:hover {
  background: #0f4ecc;
}

.score {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #1e50ff; /* 蓝色字体 */
  font-weight: 600;
  text-shadow: 0 1rpx 1rpx rgba(200, 220, 255, 0.6);
  user-select: none;
}
</style>
