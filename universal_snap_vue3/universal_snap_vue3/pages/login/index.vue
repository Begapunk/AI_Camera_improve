<template>
  <view class="container">
    <view class="logo-title">万能拍</view>

    <view v-if="showCamera" class="face-box">
      <view class="title">面部识别中</view>
      <view class="camera-wrapper">
        <camera device-position="front" flash="off" class="camera-view"></camera>
        <view class="scan-line"></view>
      </view>
      <button @click="takePhotoAndLogin" class="btn">立即识别</button>
      <view class="cancel-link" @click="showCamera = false">返回账号登录</view>
    </view>

    <view v-else class="form-box">
      <view class="title">账号登录</view>

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
      <button @click="onLogin" class="btn">登录</button>
      <button @click="showCamera = true" class="btn face-btn">人脸识别登录</button>
    </view>

    <view v-if="!showCamera" class="to-register">
      还没有账号？
      <navigator url="/pages/login/register" class="link">去注册</navigator>
    </view>

    <view v-if="message" class="message">{{ message }}</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getBaseUrl } from '@/utils/request.js'  // 根据实际路径调整

const username = ref('')
const password = ref('')
const message = ref('')
const showCamera = ref(false)

// 验证码相关
const captchaId = ref('')
const captchaImage = ref('')
const captchaAnswer = ref('')

const fetchCaptcha = () => {
  uni.request({
    url: `${getBaseUrl()}/api/captcha`,
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

onMounted(() => {
  fetchCaptcha()
})

/* 传统账号登录 */
async function onLogin() {
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

  uni.request({
    url: `${getBaseUrl()}/login`,
    method: 'POST',
    data: {
      username: username.value,
      password: password.value,
      captcha_id: captchaId.value,
      captcha_answer: captchaAnswer.value
    },
    success: (res) => {
      uni.hideLoading()
      if (res.statusCode === 200 && res.data.message) {
        uni.showToast({ title: '登录成功', icon: 'success' })
        uni.setStorageSync('username', username.value)
        setTimeout(() => {
          uni.redirectTo({ url: '/pages/home/index' })
        }, 1000)
      } else {
        fetchCaptcha()  // 登录失败自动刷新验证码
        message.value = res.data.error || res.data.message || '登录失败'
      }
    },
    fail: () => {
      uni.hideLoading()
      fetchCaptcha()
      message.value = '请求失败，请稍后重试'
    }
  })
}

/* 人脸识别登录 */
function takePhotoAndLogin() {
  const ctx = uni.createCameraContext();
  ctx.takePhoto({
    quality: 'high',
    success: (res) => {
      const fs = uni.getFileSystemManager();
      const base64Data = fs.readFileSync(res.tempFilePath, 'base64');

      uni.showLoading({ title: '正在识别身份...', mask: true });

      uni.request({
        url: `${getBaseUrl()}/login-face`,
        method: 'POST',
        data: { face_data: base64Data },
        success: (loginRes) => {
          uni.hideLoading();
          if (loginRes.statusCode === 200 && loginRes.data.username) {
            uni.showToast({ title: '识别成功', icon: 'success' });
            uni.setStorageSync('username', loginRes.data.username);
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
        },
        fail: () => {
          uni.hideLoading();
          uni.showToast({ title: '网络请求失败', icon: 'none' });
        }
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
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0 24px;
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

.form-box, .face-box {
  width: 90%;
  max-width: 380px;
  padding: 24px;
  border: 1.5px solid #A9C9FF;
  border-radius: 12px;
  background-color: #ffffff;
  box-shadow: 0 4px 12px rgba(30, 128, 255, 0.1);
  margin-bottom: 20px;
  text-align: center;
}

.title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 32px;
  color: #166DFF;
}

.camera-wrapper {
  width: 220px;
  height: 220px;
  margin: 0 auto 24px;
  position: relative;
  border: 4px solid #1E80FF;
  border-radius: 50%;
  overflow: hidden;
}

.camera-view {
  width: 100%;
  height: 100%;
}

.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: #1E80FF;
  box-shadow: 0 0 10px #1E80FF;
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% { top: 0; }
  100% { top: 100%; }
}

.form-group { width: 100%; margin-bottom: 20px; }
.input {
  width: 88%;
  padding: 12px 16px;
  font-size: 16px;
  border: 1.8px solid #A9C9FF;
  border-radius: 8px;
  text-align: left;
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
  height: 48px;
  border-radius: 8px;
  border: 1.8px solid #A9C9FF;
  background-color: #fafafa;
}

.btn {
  width: 100%;
  padding: 12px 0;
  background-color: #1E80FF;
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
  margin-top: 10px;
}

.face-btn {
  background-color: #ffffff;
  color: #1E80FF;
  border: 1.5px solid #1E80FF;
}

.cancel-link {
  margin-top: 15px;
  font-size: 14px;
  color: #4d6fae;
  text-decoration: underline;
}

.to-register { margin-top: 24px; font-size: 14px; color: #4d6fae; }
.link { color: #1E80FF; margin-left: 6px; text-decoration: underline; }

.message { margin-top: 18px; color: #d97706; font-size: 15px; font-weight: bold; }
</style>