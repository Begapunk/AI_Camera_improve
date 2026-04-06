<template>
  <view class="home-container">
    <text class="welcome">欢迎，{{ username }}</text>
    <text class="sub-title">  万能拍将给您带来更好的自拍建议，帮您轻松捕捉最佳姿势和光线。</text>
    <text class="sub-title">  无论是日常自拍还是重要时刻，都能让您的照片更具专业感。</text>

    <view v-if="showFaceCamera" class="face-camera-mask">
      <view class="face-camera-box">
        <camera device-position="front" flash="off" class="mini-camera"></camera>
        <view class="face-hint">请正对面部进行采集</view>
        <button class="mini-btn" @tap="captureAndBindFace">确认录入</button>
        <button class="mini-btn cancel" @tap="showFaceCamera = false">取消</button>
      </view>
    </view>

    <button @tap="goToCamera" class="btn-primary">
      <uni-icons type="camera-filled" size="20" color="#fff" class="icon" />
      智能拍摄助手
    </button>

    <!-- 【新增】AR 测距专属独立入口 -->
    <button @tap="goToARCamera" class="btn-ar">
      <uni-icons type="scan" size="20" color="#fff" class="icon" />
      AR 测距
    </button>

    <button @tap="showFaceCamera = true" class="btn-face">
      <uni-icons type="auth-filled" size="20" color="#fff" class="icon" />
      绑定人脸登录
    </button>

    <button @tap="goToAnalyze">
      <uni-icons type="person-filled" size="20" color="#fff" class="icon" />
      自拍建议分析
    </button>

    <button @tap="goToEnvironment">
      <uni-icons type="compass" size="20" color="#fff" class="icon" />
      环境分析
    </button>

    <button @tap="goToTemplate">
      <uni-icons type="list" size="20" color="#fff" class="icon" />
      模板评分分析
    </button>

    <button @tap="goToTemplateCollection" class="last-btn">
      <uni-icons type="folder" size="20" color="#fff" class="icon" />
      模板合集
    </button>
  </view>
</template>

<script>
import { getBaseUrl } from '@/utils/request.js' // 根据实际路径调整

export default {
  data() {
    return {
      username: '',
      showFaceCamera: false // 控制人脸补录相机的显示
    }
  },
  onShow() {
    this.username = uni.getStorageSync('username') || '用户'
  },
  methods: {
    // 补录人脸的核心逻辑
    captureAndBindFace() {
      const ctx = uni.createCameraContext();
      ctx.takePhoto({
        quality: 'high',
        success: (res) => {
          uni.showLoading({ title: '正在绑定...', mask: true });
          
          // 转 Base64
          const fs = uni.getFileSystemManager();
          const base64Data = fs.readFileSync(res.tempFilePath, 'base64');
          
          // 发送到后端 update-face 接口
          uni.request({
            url: `${getBaseUrl()}`, 
            method: 'POST',
            data: {
              username: this.username,
              face_data: base64Data
            },
            success: (result) => {
              uni.hideLoading();
              if (result.statusCode === 200) {
                uni.showToast({ title: '绑定成功！', icon: 'success' });
                this.showFaceCamera = false;
              } else {
                uni.showModal({ 
                  title: '绑定失败', 
                  content: result.data.error || '请重试',
                  showCancel: false 
                });
              }
            },
            fail: () => {
              uni.hideLoading();
              uni.showToast({ title: '网络错误', icon: 'none' });
            }
          });
        }
      });
    },
    goToCamera() {
      uni.navigateTo({ url: '/pages/camera/index' })
    },
    // 【新增】跳转到独立的 AR 测距页面
    goToARCamera() {
      // 提示：你需要在 pages.json 中注册这个路径，并在下面建一个 ar 文件夹存放刚才的 AR 代码
      uni.navigateTo({ url: '/pages/ar/index' })
    },
    goToAnalyze() {
      uni.navigateTo({ url: '/pages/analyze/index' })
    },
    goToEnvironment() {
      uni.navigateTo({ url: '/pages/environment/index' })
    },
    goToTemplate() {
      uni.navigateTo({ url: '/pages/template/index' })
    },
    goToTemplateCollection() {
      uni.navigateTo({ url: '/pages/template/templateCollection' })
    }
  }
}
</script>

<style scoped>
:root {
  --primary: #1E80FF;
  --primary-dark: #166DFF;
  --accent: #00C2FF;
  --face-purple: #7B61FF; 
}

.home-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px 24px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(140, 190, 255, 0.3), transparent 60%),
    radial-gradient(circle at bottom right, rgba(120, 170, 255, 0.25), transparent 70%),
    linear-gradient(135deg, #c7dbff 0%, #dcedff 50%, #f5fbff 100%);
}

.welcome {
  font-size: 24px;
  font-weight: 700;
  color: #166DFF;
  margin-bottom: 20px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.sub-title {
  font-size: 14px;
  color: #4d6fae;
  line-height: 1.6;
  text-align: center;
  margin-bottom: 5px;
}

/* 按钮基础样式 */
button {
  width: 260px;
  padding: 12px 0;
  margin: 8px 0;
  font-size: 16px;
  color: #fff;
  background: linear-gradient(90deg, var(--primary) 0%, var(--primary-dark) 100%);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(22, 109, 255, 0.2);
  font-weight: 600;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 智能拍摄助手专用高亮 */
.btn-primary {
  background: linear-gradient(90deg, #1e80ff 0%, #00c2ff 100%);
  margin-top: 30px;
}

/* 【新增】AR 测距专用样式：使用具有科技感/雷达感的青蓝渐变 */
.btn-ar {
  background: linear-gradient(90deg, #00C6FF 0%, #0072FF 100%);
  box-shadow: 0 4px 12px rgba(0, 114, 255, 0.3);
}

/* 人脸识别专用紫色 */
.btn-face {
  background: linear-gradient(90deg, #7B61FF 0%, #9747FF 100%);
  box-shadow: 0 4px 12px rgba(123, 97, 255, 0.3);
}

/* 补录相机浮层样式 */
.face-camera-mask {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.8);
  z-index: 999;
  display: flex;
  justify-content: center;
  align-items: center;
}

.face-camera-box {
  background: #fff;
  padding: 20px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mini-camera {
  width: 240px;
  height: 240px;
  border-radius: 120px;
  margin-bottom: 15px;
}

.face-hint {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
}

.mini-btn {
  width: 180px;
  margin: 5px 0;
}

.mini-btn.cancel {
  background: #999;
}

.icon { margin-right: 10px; }
button:active { transform: scale(0.98); }
</style>