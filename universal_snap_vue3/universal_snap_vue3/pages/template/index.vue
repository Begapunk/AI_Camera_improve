<template>
  <view class="container">
    <button @tap="chooseImage">选择照片评分</button>
    <image v-if="imgSrc" :src="imgSrc" mode="aspectFit" style="width: 300px; height: 300px;" />

    <view v-if="score">

	<view v-if="score" class="score-card">
  <text class="score-value">{{ formattedScore }}</text>
  <text class="score-total">/ 1</text>
	</view>
    </view>
    <view v-if="advice" class="result">
      <text>AI 建议：</text>
      <text>{{ advice }}</text>
    </view>

    <view class="button-group" v-if="imgSrc">
      <button @tap="submitTemplate(false)">获取AI评分</button>
      <button @tap="submitTemplate(true)">保存为模版</button>
    </view>
  </view>
</template>


<script setup>
import { ref, computed } from 'vue'
import { analyzeTemplateApi } from '@/utils/request.js'   // ⬅️ 引入新封装

const imgSrc  = ref('')
const score   = ref('')
const advice  = ref('')

/* 显示两位小数（或任意空值处理） */
const formattedScore = computed(() => {
  if (score.value === '' || score.value == null) return ''
  const num = parseFloat(score.value)
  return isNaN(num) ? '' : num.toFixed(3)
})

function chooseImage () {
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

async function submitTemplate (saveAsTemplate) {
  if (!imgSrc.value) return
  uni.showLoading({ title: '分析中...', mask: true })
  try {
    const res = await analyzeTemplateApi(imgSrc.value, saveAsTemplate)
    uni.hideLoading()

    if (res.error) {
      uni.showToast({ title: '分析失败', icon: 'none' })
      return
    }
    score.value  = res.score
    advice.value = res.advice || res.suggestion
    if (saveAsTemplate) {
      uni.showToast({ title: '已保存为模板', icon: 'success' })
    }
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: typeof err === 'string' ? err : '上传失败', icon: 'none' })
  }
}
</script>


<style scoped>
:root {
  --primary: #1E80FF;
  --primary-dark: #166DFF;
  --primary-light: #EAF4FF;
  --bg-gradient: linear-gradient(160deg, #F0F8FF 0%, #EAF4FF 100%);
  --card-bg: #ffffff;
  --text-dark: #0D1E40;
  --shadow: 0 8rpx 20rpx rgba(30, 128, 255, 0.18);
  --shadow-light: 0 6rpx 16rpx rgba(0, 0, 0, 0.06);
}

.container {
  min-height: 100vh;
  background: radial-gradient(circle at top left, #E3F2FF 0%, #C1DCFF 30%, #A3C8FF 60%, #8AB8FF 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 30rpx;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

/* 选择按钮（主按钮） */
button {
  width: 90%;
  max-width: 460rpx;
  padding: 24rpx 0;
  margin: 20rpx 0;
  font-size: 30rpx;
  font-weight: bold;
  color: #fff;
  background: linear-gradient(to right, var(--primary), var(--primary-dark));
  border: none;
  border-radius: 40rpx;
  box-shadow: var(--shadow);
  transition: all 0.3s;
}
button:active {
  opacity: 0.9;
}

/* 图片展示 */
image {
  width: 300px;
  height: 300px;
  margin: 40rpx 0 30rpx;
  border-radius: 28rpx;
  object-fit: contain;
  box-shadow: var(--shadow-light);
  border: 3rpx solid var(--primary-light);
  background: #fff;
}

/* 分数卡片 */
view[v-if="score"] {
  width: 90%;
  max-width: 500rpx;
  background: var(--card-bg);
  border-left: 8rpx solid var(--primary);
  padding: 28rpx 30rpx;
  border-radius: 24rpx;
  box-shadow: var(--shadow);
  margin-top: 20rpx;
  font-size: 28rpx;
  color: var(--text-dark);
  display: flex;
  align-items: center;
  gap: 16rpx;
}
view[v-if="score"] text:last-child {
  font-weight: bold;
  font-size: 32rpx;
  color: var(--primary-dark);
}

/* AI 建议卡片 */
.result {
  width: 90%;
  max-width: 500rpx;
  background: var(--card-bg);
  border-left: 8rpx solid var(--primary);
  padding: 30rpx;
  margin-top: 30rpx;
  border-radius: 24rpx;
  box-shadow: var(--shadow-light);
  font-size: 28rpx;
  color: var(--text-dark);
  line-height: 1.7;
  position: relative;
}
.result text:first-child {
  font-weight: bold;
  display: block;
  margin-bottom: 16rpx;
  font-size: 30rpx;
  color: var(--primary-dark);
}

/* 按钮组样式 */
.button-group {
  width: 90%;
  max-width: 500rpx;
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  margin-top: 40rpx;
}

.button-group button {
  flex: 1;
  padding: 22rpx 0;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--primary);
  background: var(--card-bg);
  border: 2rpx solid var(--primary);
  border-radius: 28rpx;
  text-align: center;
  box-shadow: var(--shadow-light);
  transition: background 0.2s ease;
}
.button-group button:active {
  background-color: var(--primary-light);
}

/* 评分卡片 */
.score-card {
  margin-top: 20rpx;
  width: 90%;
  max-width: 500rpx;
  background: var(--card-bg);
  border-left: 8rpx solid var(--primary);
  padding: 30rpx 40rpx;
  border-radius: 24rpx;
  box-shadow: var(--shadow);
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  justify-content: center;
}

.score-value {
  font-size: 52rpx;
  font-weight: 900;
  color: var(--primary-dark);
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  line-height: 1;
}

.score-total {
  font-size: 28rpx;
  color: var(--primary);
  font-weight: 700;
  padding-bottom: 6rpx;
}

</style>

