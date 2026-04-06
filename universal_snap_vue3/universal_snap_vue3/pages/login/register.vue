<template>
  <view class="container">
    <view class="logo-title">万能拍</view>

    <view class="form-box">
      <view class="title">注册新账号</view>

      <view class="form-group">
        <input
          type="text"
          placeholder="请输入用户名"
          v-model="username"
          class="input"
        />
      </view>

      <view class="form-group">
        <input
          type="password"
          placeholder="请输入密码"
          v-model="password"
          class="input"
          @input="passwordErrors = []"
        />
        <view class="password-hint" v-if="password">
          <text class="hint-text">密码要求：至少8位，包含大小写字母、数字和特殊字符</text>
        </view>
      </view>

      <view class="form-group">
        <input
          type="password"
          placeholder="请确认密码"
          v-model="confirmPassword"
          class="input"
        />
      </view>

      <view class="form-group captcha-group">
        <input
          type="text"
          placeholder="请输入计算结果"
          v-model="captchaAnswer"
          class="input captcha-input"
        />
        <image
          v-if="captchaImage"
          :src="captchaImage"
          class="captcha-img"
          @click="fetchCaptcha"
          mode="aspectFit"
        ></image>
      </view>
      <view class="face-section">
        <view class="section-label">面部识别 (可选)</view>
        <view v-if="showCamera" class="camera-container">
          <camera device-position="front" flash="off" class="mini-camera"></camera>
          <button @click="captureFace" class="mini-btn">确认采集</button>
        </view>
        <view v-else class="face-preview-box">
          <image v-if="facePreview" :src="facePreview" class="preview-img"></image>
          <view v-else class="placeholder-text">未采集面部信息</view>
          <button @click="showCamera = true" class="mini-btn pulse">点击录入</button>
        </view>
      </view>
      <view v-if="passwordErrors.length > 0" class="error-box">
        <text v-for="(error, index) in passwordErrors" :key="index" class="error-item">
          • {{ error }}
        </text>
      </view>
    </view>

    <button @click="onRegister" class="btn">注册</button>

    <view class="to-login">
      已有账号？
      <navigator url="/pages/login/index" class="link">去登录</navigator>
    </view>

    <view v-if="message" class="message">{{ message }}</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getBaseUrl } from '@/utils/request.js'  // 根据实际路径调整

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
  uni.request({
    url: `${getBaseUrl()}/api/captcha`, // 动态地址
    method: 'GET',
    success: (res) => {
      if (res.statusCode === 200 && res.data) {
        captchaId.value = res.data.captcha_id
        captchaImage.value = res.data.captcha_image
        captchaAnswer.value = ''
      }
    },
    fail: () => {
      uni.showToast({ title: '验证码加载失败', icon: 'none' })
    }
  })
}

// 页面加载时自动获取一次验证码
onMounted(() => {
  fetchCaptcha()
})

// 人脸采集相关
const showCamera = ref(false)
const facePreview = ref('')
const faceBase64 = ref(null)

// 拍照采集面部
const captureFace = () => {
  const ctx = uni.createCameraContext();
  ctx.takePhoto({
    quality: 'high',
    success: (res) => {
      facePreview.value = res.tempFilePath;
      const fs = uni.getFileSystemManager();
      faceBase64.value = fs.readFileSync(res.tempFilePath, 'base64');
      showCamera.value = false;
      uni.showToast({ title: '采集成功', icon: 'success' });
    },
    fail: () => {
      uni.showToast({ title: '调用相机失败', icon: 'none' });
    }
  });
}

// 注册逻辑
async function onRegister() {
  if (!username.value || !password.value || !confirmPassword.value) {
    message.value = '请完整填写信息'
    return
  }
  if (password.value !== confirmPassword.value) {
    message.value = '两次密码不一致'
    return
  }

  if (!captchaAnswer.value) {
    message.value = '请填写计算结果'
    return
  }

  passwordErrors.value = []

  if (password.value.length < 8) {
    passwordErrors.value.push('密码至少需要8个字符')
  }
  const hasUpper = /[A-Z]/.test(password.value)
  const hasLower = /[a-z]/.test(password.value)
  const hasNumber = /\d/.test(password.value)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password.value)
  const complexityCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length
  if (complexityCount < 3) {
    const missing = []
    if (!hasUpper) missing.push('大写字母'); if (!hasLower) missing.push('小写字母');
    if (!hasNumber) missing.push('数字'); if (!hasSpecial) missing.push('特殊字符');
    passwordErrors.value.push(`需要至少3种字符类型，缺少：${missing.join('、')}`)
  }
  if (username.value && password.value.toLowerCase().includes(username.value.toLowerCase())) {
    passwordErrors.value.push('密码不应包含用户名')
  }

  if (passwordErrors.value.length > 0) {
    message.value = '密码不符合要求'
    return
  }

  message.value = ''
  uni.showLoading({ title: '注册中...', mask: true })

  try {
    uni.request({
      url: `${getBaseUrl()}/register`, // 动态地址
      method: 'POST',
      data: {
        username: username.value,
        password: password.value,
        face_data: faceBase64.value,
        captcha_id: captchaId.value,
        captcha_answer: captchaAnswer.value
      },
      success: (res) => {
        uni.hideLoading()
        if (res.statusCode === 200) {
          uni.showToast({ title: '注册成功', icon: 'success' })
          setTimeout(() => {
            uni.redirectTo({ url: '/pages/login/index' })
          }, 1000)
        } else {
          // 注册失败时刷新验证码
          fetchCaptcha()
          if (res.data.details && Array.isArray(res.data.details)) {
            passwordErrors.value = res.data.details
            message.value = res.data.error || '验证失败'
          } else {
            message.value = res.data.error || res.data.message || '注册失败'
          }
        }
      },
      fail: () => {
        uni.hideLoading()
        message.value = '连接服务器失败'
        fetchCaptcha()
      }
    })
  } catch (err) {
    uni.hideLoading()
    message.value = '请求异常，请检查网络'
    fetchCaptcha()
  }
}
</script>

<style scoped>
:root {
  --primary: #1E80FF;
  --primary-dark: #166DFF;
  --primary-light: #A9C9FF;
}

.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px 24px;
  box-sizing: border-box;
  background-color: #f1f6ff;
}

.logo-title {
  font-size: 40px;
  font-weight: 900;
  background: linear-gradient(45deg, #1E80FF, #74B9FF);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 24px;
}

.form-box {
  width: 90%;
  max-width: 380px;
  padding: 24px;
  border: 1.5px solid #A9C9FF;
  border-radius: 12px;
  background-color: #ffffff;
  box-shadow: 0 4px 12px rgba(30, 128, 255, 0.1);
  margin-bottom: 20px;
}

.title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #166DFF;
}

.form-group { width: 100%; margin-bottom: 15px; }
.input {
  width: 88%;
  padding: 12px 16px;
  font-size: 15px;
  border: 1.8px solid #A9C9FF;
  border-radius: 8px;
}

.captcha-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.captcha-input {
  width: 45%;
}
.captcha-img {
  width: 38%;
  height: 46px;
  border-radius: 8px;
  border: 1.8px solid #A9C9FF;
  background-color: #fafafa;
}

.face-section {
  margin-top: 20px;
  border-top: 1px dashed #A9C9FF;
  padding-top: 15px;
}

.section-label {
  font-size: 14px;
  color: #1E80FF;
  font-weight: bold;
  margin-bottom: 10px;
}

.camera-container, .face-preview-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mini-camera, .preview-img {
  width: 120px;
  height: 120px;
  border-radius: 60px;
  background-color: #f0f0f0;
  border: 2px solid #1E80FF;
  margin-bottom: 10px;
}

.placeholder-text {
  font-size: 12px;
  color: #9ab6e8;
  margin-bottom: 10px;
}

.mini-btn {
  font-size: 12px;
  padding: 0 15px;
  height: 30px;
  line-height: 30px;
  background-color: #1E80FF;
  color: white;
  border-radius: 4px;
}

.pulse {
  animation: pulse-animation 2s infinite;
}

@keyframes pulse-animation {
  0% { box-shadow: 0 0 0 0px rgba(30, 128, 255, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(30, 128, 255, 0); }
  100% { box-shadow: 0 0 0 0px rgba(30, 128, 255, 0); }
}

.btn {
  width: 100%;
  max-width: 360px;
  padding: 8px 0;
  background-color: #1E80FF;
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
}

.to-login { margin-top: 20px; font-size: 14px; color: #4d6fae; }
.link { color: #1E80FF; margin-left: 6px; text-decoration: underline; }

.message { margin-top: 15px; color: #d97706; font-size: 14px; font-weight: bold; }
.password-hint { margin-top: 5px; padding: 5px; background-color: #f0f7ff; border-radius: 4px; }
.hint-text { font-size: 11px; color: #666; }
.error-box { margin-top: 10px; padding: 10px; background-color: #fffbeb; border-radius: 6px; border: 1px solid #fde68a;}
.error-item { display: block; font-size: 12px; color: #d97706; margin-bottom: 4px; }
</style>