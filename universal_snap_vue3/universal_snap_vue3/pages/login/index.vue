<template>
  <view class="container">
    <view class="logo-area">
      <view class="logo-icon">
        <text class="logo-camera">📷</text>
      </view>
      <text class="logo-text">万能拍</text>
    </view>

    <view v-if="showCamera" class="face-card">
      <view class="card-title">面部识别</view>
      <view class="camera-wrapper">
        <camera device-position="front" flash="off" class="camera-view"></camera>
        <view class="scan-line"></view>
      </view>
      <button @click="takePhotoAndLogin" class="btn-primary">立即识别</button>
      <view class="cancel-link" @click="showCamera = false">返回账号登录</view>
    </view>
    <view v-else class="form-card">
      <view class="card-header">
        <text class="card-title">账号登录</text>
        <text class="card-subtitle">欢迎回来，请填写信息</text>
      </view>

      <view class="form-group">
        <view class="input-wrapper">
          <text class="input-icon">👤</text>
          <input
            type="text"
            placeholder="请输入用户名"
            v-model="username"
            class="input"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <view class="form-group">
        <view class="input-wrapper">
          <text class="input-icon">🔒</text>
          <input
            type="text"
            password
            placeholder="请输入密码"
            v-model="password"
            class="input"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <view class="form-group captcha-group">
        <view class="input-wrapper captcha-input-wrapper">
          <text class="input-icon">📷</text>
          <input
            type="text"
            placeholder="请输入计算结果"
            v-model="captchaAnswer"
            class="input"
            placeholder-class="input-placeholder"
          />
        </view>
        <image
          v-if="captchaImage"
          :src="captchaImage"
          class="captcha-img"
          @click="fetchCaptcha"
          mode="aspectFit"
        ></image>
      </view>

      <button @click="onLogin" class="btn-primary">登录</button>
      <button @click="showCamera = true" class="btn-secondary">人脸识别登录</button>
    </view>

    <view v-if="!showCamera" class="to-register">
      <text class="register-text">还没有账号？</text>
      <navigator url="/pages/login/register" class="register-link">去注册</navigator>
    </view>

    <view v-if="message" class="message-toast">{{ message }}</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { fetchCaptchaApi, loginApi, loginFaceApi } from '@/utils/request.js'

const username = ref('')
const password = ref('')
const message = ref('')
const showCamera = ref(false)

// 验证码状态
const captchaId = ref('')
const captchaImage = ref('')
const captchaAnswer = ref('')

const fetchCaptcha = () => {
  fetchCaptchaApi()
    .then((res) => {
      if (res.statusCode === 200 && res.data) {
        captchaId.value = res.data.captcha_id
        captchaImage.value = res.data.captcha_image
        captchaAnswer.value = ''
      }
    })
    .catch(() => {
      uni.showToast({ title: '验证码加载失败', icon: 'none' })
    })
}

// 【重要修复】将 onMounted 替换为 onLoad，确保在小程序中百分百渲染
onLoad(() => {
  fetchCaptcha()
})

// 账号登录
async function onLogin () {
  if (!username.value || !password.value) {
    message.value = '请完整填写信息'
    return
  }
  if (!captchaAnswer.value) {
    message.value = '请填写计算结果'
    return
  }
  
  message.value = ''
  uni.showLoading({ title: '登录中...', mask: true })
  
  loginApi({
      username: username.value,
      password: password.value,
      captcha_id: captchaId.value,
      captcha_answer: captchaAnswer.value
    })
    .then((res) => {
      uni.hideLoading()
      if (res.statusCode === 200 && res.data.token) {
        uni.showToast({ title: '登录成功', icon: 'success' })
        uni.setStorageSync('username', username.value)
        uni.setStorageSync('token', res.data.token)
        setTimeout(() => {
          uni.redirectTo({ url: '/pages/home/index' })
        }, 1000)
      } else {
        fetchCaptcha()
        message.value = res.data.error || res.data.message || '登录失败'
      }
    })
    .catch(() => {
      uni.hideLoading()
      fetchCaptcha()
      message.value = '请求失败，请稍后重试'
    })
}

// 人脸识别登录
function takePhotoAndLogin() {
  const ctx = uni.createCameraContext();
  ctx.takePhoto({
    quality: 'high',
    success: (res) => {
      const filePath = res.tempImagePath || res.tempFilePath;
      const fs = uni.getFileSystemManager();
      const base64Data = fs.readFileSync(filePath, 'base64');
      
      uni.showLoading({ title: '正在识别身份...', mask: true });
      
      loginFaceApi(base64Data)
        .then((loginRes) => {
          uni.hideLoading();
          if (loginRes.statusCode === 200 && loginRes.data.username) {
            uni.showToast({ title: '识别成功', icon: 'success' });
            uni.setStorageSync('username', loginRes.data.username);
            uni.setStorageSync('token', loginRes.data.token);
            setTimeout(() => {
              uni.redirectTo({ url: '/pages/home/index' });
            }, 1000);
          } else {
            uni.showModal({ 
              title: '识别失败', 
              content: loginRes.data.error || '未匹配到人脸信息',
              showCancel: false 
            });
          }
        })
        .catch(() => {
          uni.hideLoading();
          uni.showToast({ title: '网络请求失败', icon: 'none' });
        });
    },
    fail: () => {
      uni.showToast({ title: '摄像头调用失败', icon: 'none' });
    }
  });
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.logo-area {
  margin-bottom: 40px;
  text-align: center;
}

.logo-icon {
  background: linear-gradient(135deg, #FFB347 0%, #FF8C42 50%, #EF6C3E 100%);
  width: 100px;
  height: 100px;
  border-radius: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  box-shadow: 0 20px 40px -12px rgba(255, 140, 66, 0.35);
  animation: logoBreathe 3s ease-in-out infinite;
}

@keyframes logoBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

.logo-camera {
  font-size: 48px;
}

.logo-text {
  font-size: 32px;
  font-weight: 800;
  color: #2D3E50;
  letter-spacing: 2px;
  margin-top: 16px;
  display: block;
}

.form-card, .face-card {
  width: 100%;
  max-width: 400px;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.96) 100%);
  border-radius: 48px;
  padding: 40px 32px;
  margin-bottom: 28px;
  box-shadow: 0 24rpx 48rpx -16rpx rgba(255, 140, 66, 0.12), 0 8rpx 20rpx rgba(0,0,0,0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 245, 230, 0.8);
}

.card-header {
  text-align: center;
  margin-bottom: 40px;
}

.card-title {
  font-size: 36px;
  font-weight: 700;
  color: #2D3E50;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}

.card-subtitle {
  font-size: 16px;
  color: #9CA8B8;
  font-weight: 400;
}

.form-group {
  width: 100%;
  margin-bottom: 24px;
}

.input-wrapper {
  background: linear-gradient(135deg, #ffffff 0%, #fffbf7 100%);
  border-radius: 32px;
  border: 2px solid rgba(255, 245, 230, 0.8);
  display: flex;
  align-items: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 6px 20px;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.02);
}

.input-wrapper:focus-within {
  border-color: #FF8C42;
  box-shadow: 0 8rpx 24rpx rgba(255, 140, 66, 0.15);
  background: #ffffff;
  transform: translateY(-2rpx);
}

.input-icon {
  font-size: 24px;
  margin-right: 16px;
  color: #CCB79E;
  opacity: 0.85;
}

.input {
  flex: 1;
  height: 56px;
  font-size: 17px;
  background: transparent;
  color: #2D3E50;
  padding: 0;
  border: none;
  outline: none;
  font-weight: 500;
}

.input-placeholder {
  color: #9CA8B8;
  font-size: 16px;
  font-weight: 400;
}

.captcha-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.captcha-input-wrapper {
  flex: 1;
  min-width: 0;
}

.captcha-img {
  width: 120px;
  height: 56px;
  border-radius: 28px;
  background: linear-gradient(135deg, #fff8f0 0%, #fff5eb 100%);
  border: 2px solid rgba(255, 245, 230, 0.8);
  object-fit: contain;
  cursor: pointer;
  transition: all 0.25s;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.04);
}

.captcha-img:active {
  transform: scale(0.94);
  box-shadow: 0 8rpx 20rpx rgba(0,0,0,0.06);
}

.btn-primary {
  width: 100%;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  font-size: 18px;
  font-weight: 650;
  padding: 20px 0;
  border-radius: 48px;
  border: none;
  box-shadow: 0 16rpx 32rpx -10rpx rgba(255, 110, 97, 0.35);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  margin-top: 12px;
  letter-spacing: 0.5px;
}

.btn-primary:active {
  transform: scale(0.96);
  box-shadow: 0 8rpx 16rpx -6rpx rgba(255, 110, 97, 0.45);
}

.btn-secondary {
  width: 100%;
  background: linear-gradient(135deg, #fff8f0 0%, #ffffff 100%);
  color: #FF8C42;
  font-size: 16px;
  font-weight: 600;
  padding: 18px 0;
  border-radius: 48px;
  border: 2px solid rgba(255, 140, 66, 0.3);
  margin-top: 16px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-secondary:active {
  transform: scale(0.96);
  background: rgba(255, 140, 66, 0.06);
  border-color: #FF8C42;
}

.camera-wrapper {
  width: 220px;
  height: 220px;
  margin: 0 auto 32px;
  position: relative;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid #FFAD7A;
  box-shadow: 0 16rpx 32rpx rgba(255, 140, 66, 0.15);
}

.camera-view {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, transparent, #FF8C42, transparent);
  box-shadow: 0 0 12rpx rgba(255, 140, 66, 0.6);
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% { top: 0; }
  100% { top: 100%; }
}

.cancel-link {
  margin-top: 24px;
  text-align: center;
  font-size: 16px;
  color: #FF8C42;
  font-weight: 500;
  cursor: pointer;
  padding: 12px 24px;
  border-radius: 48px;
  transition: all 0.25s;
  display: inline-block;
}

.cancel-link:active {
  background: rgba(255, 140, 66, 0.08);
  transform: scale(0.98);
}

.to-register {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  margin-top: 12px;
}

.register-text {
  color: #9CA8B8;
}

.register-link {
  color: #FF8C42;
  font-weight: 600;
  text-decoration: none;
  padding-bottom: 2px;
  border-bottom: 2px solid rgba(255, 140, 66, 0.4);
  transition: all 0.2s;
}

.register-link:active {
  color: #EF6C3E;
  border-color: #EF6C3E;
}

.message-toast {
  margin-top: 24px;
  background: linear-gradient(135deg, rgba(255, 247, 235, 0.95) 0%, rgba(255, 240, 220, 0.9) 100%);
  backdrop-filter: blur(16px);
  color: #EF6C3E;
  padding: 16px 32px;
  border-radius: 48px;
  font-size: 15px;
  font-weight: 500;
  max-width: 85%;
  text-align: center;
  box-shadow: 0 8rpx 24rpx rgba(255, 140, 66, 0.1);
  border: 1px solid rgba(255, 140, 66, 0.2);
}

/* 布局修正：限制卡片和输入组宽度，避免验证码行把表单挤歪 */
.container {
  width: 100%;
  overflow-x: hidden;
  padding: 48rpx 32rpx;
}

.logo-area,
.form-card,
.face-card,
.to-register,
.message-toast {
  flex-shrink: 0;
}

.logo-area {
  margin-bottom: 48rpx;
}

.logo-icon {
  width: 160rpx;
  height: 160rpx;
  border-radius: 36rpx;
  margin-bottom: 20rpx;
}

.logo-camera {
  font-size: 72rpx;
}

.logo-text {
  font-size: 48rpx;
}

.form-card,
.face-card {
  width: 100%;
  max-width: 680rpx;
  padding: 48rpx 40rpx;
  border-radius: 40rpx;
}

.card-header {
  margin-bottom: 40rpx;
}

.card-title {
  font-size: 44rpx;
}

.card-subtitle {
  font-size: 28rpx;
}

.form-group {
  margin-bottom: 24rpx;
}

.input-wrapper {
  min-width: 0;
  padding: 8rpx 24rpx;
  border-radius: 32rpx;
}

.input-icon {
  flex: 0 0 auto;
  font-size: 34rpx;
  margin-right: 18rpx;
}

.input {
  min-width: 0;
  height: 88rpx;
  font-size: 30rpx;
}

.captcha-group {
  gap: 16rpx;
}

.captcha-img {
  flex: 0 0 220rpx;
  width: 220rpx;
  height: 88rpx;
  border-radius: 28rpx;
}

.btn-primary,
.btn-secondary {
  min-height: 88rpx;
  padding: 0;
  font-size: 32rpx;
  line-height: 88rpx;
}

.camera-wrapper {
  width: 320rpx;
  height: 320rpx;
}

.to-register {
  font-size: 28rpx;
}

.message-toast {
  font-size: 26rpx;
}
</style>
