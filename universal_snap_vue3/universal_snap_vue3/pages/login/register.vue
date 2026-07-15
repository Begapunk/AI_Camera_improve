<template>
  <view class="container">
    <!-- Logo 区：更柔的光晕与圆润表现 -->
    <view class="logo-area">
      <view class="logo-icon">
        <text class="logo-camera">📷</text>
      </view>
      <text class="logo-text">{{ $t('register.appName') }}</text>
    </view>

    <!-- 主卡片：磨砂温润白 -->
    <view class="form-card">
      <view class="card-header">
        <text class="card-title">{{ $t('register.createAccount') }}</text>
        <text class="card-subtitle">{{ $t('register.subtitle') }}</text>
      </view>

      <!-- 用户名 -->
      <view class="form-group">
        <view class="input-wrapper">
          <text class="input-icon">👤</text>
          <input
            type="text"
            :placeholder="$t('register.usernamePlaceholder')"
            v-model="username"
            class="input"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <!-- 密码 -->
      <view class="form-group">
        <view class="input-wrapper">
          <text class="input-icon">🔒</text>
          <input
            type="password"
            :placeholder="$t('register.passwordPlaceholder')"
            v-model="password"
            class="input"
            @input="passwordErrors = []"
            placeholder-class="input-placeholder"
          />
        </view>
        <view class="password-hint" v-if="password">
          <text class="hint-text">{{ $t('register.passwordHint') }}</text>
        </view>
      </view>

      <!-- 确认密码 -->
      <view class="form-group">
        <view class="input-wrapper">
          <text class="input-icon">✓</text>
          <input
            type="password"
            :placeholder="$t('register.confirmPasswordPlaceholder')"
            v-model="confirmPassword"
            class="input"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <!-- 图形验证码组：柔和视觉区 -->
      <view class="form-group captcha-group">
        <view class="input-wrapper captcha-input-wrapper">
          <text class="input-icon">📷</text>
          <input
            type="text"
            :placeholder="$t('register.captchaPlaceholder')"
            v-model="captchaAnswer"
            class="input captcha-input"
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

      <!-- 面部识别（可选） 柔化卡片区 -->
      <view class="face-section">
        <view class="section-label">
          <text class="label-icon">😊</text>
          <text>{{ $t('register.faceRecognitionOptional') }}</text>
        </view>
        <view v-if="showCamera" class="camera-container">
          <camera device-position="front" flash="off" class="mini-camera"></camera>
          <button @click="captureFace" class="mini-btn">{{ $t('register.confirmCapture') }}</button>
        </view>
        <view v-else class="face-preview-box">
          <image v-if="facePreview" :src="facePreview" class="preview-img"></image>
          <view v-else class="placeholder-text">{{ $t('register.noFaceCaptured') }}</view>
          <button @click="openFaceCamera" class="mini-btn pulse">{{ $t('register.clickToCapture') }}</button>
        </view>
      </view>

      <!-- 密码强度错误提示（温和香槟色） -->
      <view v-if="passwordErrors.length > 0" class="error-box">
        <text v-for="(error, index) in passwordErrors" :key="index" class="error-item">
          ⚡ {{ error }}
        </text>
      </view>
    </view>

    <!-- 主按钮：柔润渐变 -->
    <button @click="onRegister" class="btn-primary">{{ $t('register.registerNow') }}</button>

    <!-- 已有账号跳转 -->
    <view class="to-login">
      <text class="login-text">{{ $t('register.alreadyHaveAccount') }}</text>
      <navigator url="/pages/login/index" class="login-link">{{ $t('register.goLogin') }}</navigator>
    </view>

    <!-- 轻提示吐司 -->
    <view v-if="message" class="message-toast">{{ message }}</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useI18n } from '@/utils/i18nCore.js'
import { fetchCaptchaApi, registerApi } from '@/utils/request.js'
import { requestPermission } from '@/utils/permission.js'
import { readFileAsBase64 } from '@/utils/fileBase64.js'

const { t } = useI18n({ useScope: 'global' })

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const message = ref('')
const passwordErrors = ref([])

// 验证码相关
const captchaId = ref('')
const captchaImage = ref('')
const captchaAnswer = ref('')

// 获取验证码
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
      uni.showToast({ title: t('register.captchaLoadFailed'), icon: 'none' })
    })
}

onLoad(() => {
  fetchCaptcha()
})

// 人脸数据
const showCamera = ref(false)
const facePreview = ref('') 
const faceBase64 = ref(null) 

// 拿到人脸照片路径后的统一采集流程（小程序 <camera> / App 系统相机共用）
const acceptFacePhoto = (filePath) => {
  readFileAsBase64(filePath)
    .then((base64) => {
      facePreview.value = filePath;
      faceBase64.value = base64;
      showCamera.value = false;
      uni.showToast({ title: t('register.captureSuccess'), icon: 'success' });
    })
    .catch(() => {
      uni.showToast({ title: t('register.cameraCallFailed'), icon: 'none' });
    })
}

// 人脸采集入口
const openFaceCamera = () => {
  // #ifdef APP-PLUS
  // App 端不依赖 <camera> 组件（小程序系组件，App-vue 支持不稳），直接调系统相机
  uni.chooseImage({
    count: 1,
    sourceType: ['camera'],
    sizeType: ['compressed'],
    success: (res) => acceptFacePhoto(res.tempFilePaths[0]),
    fail: () => {
      // 用户取消拍照不算错误，静默返回
    }
  });
  return;
  // #endif

  // #ifndef APP-PLUS
  // 小程序端：打开摄像头前先申请权限，拒绝就留在预览态，不强行切视图
  requestPermission('camera')
    .then(() => {
      showCamera.value = true
    })
    .catch(() => {
      uni.showToast({ title: t('register.cameraCallFailed'), icon: 'none' })
    })
  // #endif
}

// 小程序端 <camera> 视图里的"确认拍照"按钮
const captureFace = () => {
  const ctx = uni.createCameraContext();
  ctx.takePhoto({
    quality: 'high',
    success: (res) => acceptFacePhoto(res.tempImagePath || res.tempFilePath),
    fail: () => {
      uni.showToast({ title: t('register.cameraCallFailed'), icon: 'none' });
    }
  });
}

async function onRegister () {
  if (!username.value || !password.value || !confirmPassword.value) {
    message.value = t('register.fillAllFields')
    return
  }
  if (password.value !== confirmPassword.value) {
    message.value = t('register.passwordMismatch')
    return
  }
  if (!captchaAnswer.value) {
    message.value = t('register.fillCaptcha')
    return
  }

  passwordErrors.value = []

  if (password.value.length < 8) {
    passwordErrors.value.push(t('register.passwordMinLength'))
  }
  const hasUpper = /[A-Z]/.test(password.value)
  const hasLower = /[a-z]/.test(password.value)
  const hasNumber = /\d/.test(password.value)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password.value)
  const complexityCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length
  if (complexityCount < 3) {
    const missing = []
    if (!hasUpper) missing.push(t('register.upperCaseLetter')); if (!hasLower) missing.push(t('register.lowerCaseLetter'));
    if (!hasNumber) missing.push(t('register.digit')); if (!hasSpecial) missing.push(t('register.specialChar'));
    passwordErrors.value.push(t('register.needAtLeast3Types', { missing: missing.join('、') }))
  }
  if (username.value && password.value.toLowerCase().includes(username.value.toLowerCase())) {
    passwordErrors.value.push(t('register.passwordContainsUsername'))
  }

  if (passwordErrors.value.length > 0) {
    message.value = t('register.passwordSuggestOptimize')
    return
  }

  message.value = ''
  uni.showLoading({ title: t('register.registering'), mask: true })

  try {
    registerApi({
        username: username.value,
        password: password.value,
        face_data: faceBase64.value,
        captcha_id: captchaId.value,
        captcha_answer: captchaAnswer.value
      })
      .then((res) => {
        uni.hideLoading()
        if (res.statusCode === 200) {
          uni.showToast({ title: t('register.registerSuccess'), icon: 'success' })
          setTimeout(() => {
            uni.redirectTo({ url: '/pages/login/index' })
          }, 1000)
        } else {
          fetchCaptcha()
          if (res.data.details && Array.isArray(res.data.details)) {
            passwordErrors.value = res.data.details
            message.value = res.data.error || t('register.verificationFailed')
          } else {
            message.value = res.data.error || res.data.message || t('register.registerFailed')
          }
        }
      })
      .catch(() => {
        uni.hideLoading()
        message.value = t('register.connectServerFailed')
        fetchCaptcha()
      })
  } catch (err) {
    uni.hideLoading()
    message.value = t('register.requestExceptionCheckNetwork')
    fetchCaptcha()
  }
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

.form-card {
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
  margin-bottom: 24px;
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

.password-hint {
  margin-top: 12px;
  padding-left: 16px;
}

.hint-text {
  font-size: 14px;
  color: #EF6C3E;
  background: rgba(255, 140, 66, 0.06);
  padding: 8px 18px;
  border-radius: 40px;
  display: inline-block;
  letter-spacing: -0.2px;
}

.face-section {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 245, 230, 0.8);
}

.section-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #5B6E8C;
  margin-bottom: 20px;
}

.label-icon {
  font-size: 24px;
}

.camera-container, .face-preview-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #fff8f0 0%, #fffbf7 100%);
  border-radius: 32px;
  padding: 28px 16px;
  border: 2px solid rgba(255, 245, 230, 0.6);
  transition: all 0.25s;
}

.mini-camera, .preview-img {
  width: 140px;
  height: 140px;
  border-radius: 70px;
  background: linear-gradient(135deg, #fff5eb 0%, #fff0e6 100%);
  border: 4px solid white;
  box-shadow: 0 12rpx 24rpx rgba(0,0,0,0.06);
  object-fit: cover;
  margin-bottom: 20px;
}

.placeholder-text {
  font-size: 15px;
  color: #9CA8B8;
  margin-bottom: 20px;
  background: rgba(255, 255, 255, 0.8);
  padding: 10px 24px;
  border-radius: 48px;
}

.mini-btn {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  font-size: 16px;
  font-weight: 600;
  padding: 14px 36px;
  border-radius: 48px;
  border: none;
  box-shadow: 0 12rpx 24rpx -8rpx rgba(255, 110, 97, 0.3);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.mini-btn:active {
  transform: scale(0.96);
  box-shadow: 0 6rpx 12rpx -4rpx rgba(255, 110, 97, 0.4);
}

.pulse {
  animation: soft-pulse 2s infinite;
}

@keyframes soft-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 140, 66, 0.4); }
  70% { box-shadow: 0 0 0 12rpx rgba(255, 140, 66, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 140, 66, 0); }
}

.error-box {
  margin-top: 20px;
  background: linear-gradient(135deg, rgba(255, 247, 235, 0.95) 0%, rgba(255, 240, 220, 0.9) 100%);
  border-radius: 24px;
  padding: 16px 20px;
  border-left: 4px solid #FF8C42;
}

.error-item {
  display: block;
  font-size: 14px;
  color: #EF6C3E;
  margin-bottom: 8px;
  line-height: 1.4;
}

.error-item:last-child {
  margin-bottom: 0;
}

.btn-primary {
  width: 100%;
  max-width: 400px;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  font-size: 18px;
  font-weight: 650;
  padding: 20px 0;
  border-radius: 48px;
  border: none;
  box-shadow: 0 16rpx 32rpx -10rpx rgba(255, 110, 97, 0.35);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 20px;
  letter-spacing: 0.5px;
}

.btn-primary:active {
  transform: scale(0.96);
  box-shadow: 0 8rpx 16rpx -6rpx rgba(255, 110, 97, 0.45);
}

.to-login {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}

.login-text {
  color: #9CA8B8;
}

.login-link {
  color: #FF8C42;
  font-weight: 600;
  text-decoration: none;
  padding-bottom: 2px;
  border-bottom: 2px solid rgba(255, 140, 66, 0.4);
  transition: all 0.2s;
}

.login-link:active {
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

/* 布局修正：注册页内容较长，改为自然滚动并限制内部宽度 */
.container {
  width: 100%;
  min-height: 100vh;
  justify-content: flex-start;
  overflow-x: hidden;
  padding: 48rpx 32rpx 72rpx;
}

.logo-area,
.form-card,
.btn-primary,
.to-login,
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

.form-card {
  width: 100%;
  max-width: 680rpx;
  padding: 48rpx 40rpx;
  border-radius: 40rpx;
}

.card-header {
  margin-bottom: 40rpx;
}

.card-title {
  font-size: 42rpx;
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

.password-hint {
  margin-top: 12rpx;
  padding-left: 0;
}

.hint-text,
.error-item {
  font-size: 24rpx;
}

.face-section {
  margin-top: 28rpx;
  padding-top: 20rpx;
}

.section-label {
  gap: 12rpx;
  font-size: 28rpx;
  margin-bottom: 20rpx;
}

.camera-container,
.face-preview-box {
  padding: 28rpx 16rpx;
  border-radius: 32rpx;
}

.mini-camera,
.preview-img {
  width: 220rpx;
  height: 220rpx;
  border-radius: 110rpx;
  margin-bottom: 20rpx;
}

.placeholder-text {
  font-size: 26rpx;
}

.mini-btn {
  min-height: 72rpx;
  padding: 0 48rpx;
  font-size: 28rpx;
  line-height: 72rpx;
}

.btn-primary {
  width: 100%;
  max-width: 680rpx;
  min-height: 88rpx;
  padding: 0;
  font-size: 32rpx;
  line-height: 88rpx;
}

.to-login {
  font-size: 28rpx;
}

.message-toast {
  font-size: 26rpx;
}
</style>
