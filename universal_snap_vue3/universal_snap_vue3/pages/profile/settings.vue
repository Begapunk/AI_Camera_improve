<template>
  <view class="container">
    <view class="nav-bar">
      <view class="back-btn" @click="goBack">
        <text class="back-icon">{{ backArrowIcon }}</text>
      </view>
      <text class="nav-title">{{ $t('settings.title') }}</text>
      <view class="right-placeholder"></view>
    </view>

    <scroll-view class="content" scroll-y enhanced :show-scrollbar="false">
      <view class="section">
        <view class="section-title">{{ $t('settings.avatarNickname') }}</view>
        <view class="card">
          <view class="avatar-row" @tap="chooseAvatar">
            <image v-if="avatar" :src="avatar" class="avatar-preview" mode="aspectFill" />
            <view v-else class="avatar-preview avatar-placeholder">👤</view>
            <text class="avatar-hint">{{ $t('settings.changeAvatar') }}</text>
          </view>
          <view class="field">
            <text class="field-label">{{ $t('settings.nickname') }}</text>
            <input class="field-input" v-model="nickname" :placeholder="$t('settings.nicknamePlaceholder')" placeholder-class="field-placeholder" />
          </view>
          <button class="save-btn" @tap="saveProfile" :loading="savingProfile">{{ $t('settings.saveProfile') }}</button>
        </view>
      </view>

      <view class="section">
        <view class="section-title">{{ $t('settings.changePassword') }}</view>
        <view class="card">
          <view class="field">
            <text class="field-label">{{ $t('settings.oldPassword') }}</text>
            <input class="field-input" v-model="oldPassword" password :placeholder="$t('settings.oldPasswordPlaceholder')" placeholder-class="field-placeholder" />
          </view>
          <view class="field">
            <text class="field-label">{{ $t('settings.newPassword') }}</text>
            <input class="field-input" v-model="newPassword" password :placeholder="$t('settings.newPasswordPlaceholder')" placeholder-class="field-placeholder" />
          </view>
          <view class="field">
            <text class="field-label">{{ $t('settings.confirmPassword') }}</text>
            <input class="field-input" v-model="confirmPassword" password :placeholder="$t('settings.confirmPasswordPlaceholder')" placeholder-class="field-placeholder" />
          </view>
          <button class="save-btn" @tap="savePassword" :loading="savingPassword">{{ $t('settings.changePassword') }}</button>
        </view>
      </view>

      <view class="section">
        <view class="section-title">{{ $t('settings.faceLogin') }}</view>
        <view class="card">
          <view class="face-status-row">
            <text class="face-status-label">{{ $t('settings.currentStatus') }}</text>
            <text class="face-status-value" :class="faceRegistered ? 'bound' : ''">
              {{ faceRegistered ? $t('settings.bound') : $t('settings.unbound') }}
            </text>
          </view>
          <button class="save-btn" @tap="openFaceBind">
            {{ faceRegistered ? $t('settings.rebindFace') : $t('settings.bindFace') }}
          </button>
        </view>
      </view>

      <view class="section">
        <view class="section-title">{{ $t('settings.language') }}</view>
        <view class="card">
          <picker mode="selector" :range="localeLabels" :value="currentLocaleIndex" @change="onLocaleChange">
            <view class="field language-field">
              <text class="field-label">{{ $t('settings.languagePicker') }}</text>
              <text class="language-value">{{ currentLocaleLabel }} ›</text>
            </view>
          </picker>
        </view>
      </view>
    </scroll-view>

    <view v-if="showFaceCamera" class="face-mask">
      <view class="face-card">
        <camera device-position="front" flash="off" class="face-camera"></camera>
        <text class="face-hint">{{ $t('settings.faceHint') }}</text>
        <button class="face-btn" @tap="captureAndBindFace">{{ $t('settings.confirmBind') }}</button>
        <button class="face-btn cancel" @tap="showFaceCamera = false">{{ $t('common.cancel') }}</button>
      </view>
    </view>
  </view>
</template>

<script>
import {
  getUserInfoApi, updateUserProfileApi, changePasswordApi, updateFaceApi
} from '@/utils/request.js'
import { SUPPORTED_LOCALES, getCurrentLocale, setLocale, backArrow } from '@/utils/i18n.js'
import { readFileAsBase64 } from '@/utils/fileBase64.js'

export default {
  data() {
    return {
      nickname: '',
      avatar: '',
      newAvatarPath: '',
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
      faceRegistered: false,
      showFaceCamera: false,
      savingProfile: false,
      savingPassword: false,
      currentLocale: getCurrentLocale()
    }
  },
  computed: {
    backArrowIcon() {
      return backArrow()
    },
    localeLabels() {
      return SUPPORTED_LOCALES.map((l) => l.label)
    },
    currentLocaleIndex() {
      const idx = SUPPORTED_LOCALES.findIndex((l) => l.value === this.currentLocale)
      return idx === -1 ? 0 : idx
    },
    currentLocaleLabel() {
      return SUPPORTED_LOCALES[this.currentLocaleIndex].label
    }
  },
  onShow() {
    this.loadUserInfo()
  },
  methods: {
    onLocaleChange(e) {
      const picked = SUPPORTED_LOCALES[e.detail.value]
      const previousLocale = this.currentLocale
      if (!picked || picked.value === previousLocale) return
      setLocale(picked.value)
      this.currentLocale = picked.value
      // 阿拉伯语和其他语言之间切换会改变文字书写方向，重启当前页面让 RTL/LTR 判断重新生效
      if (picked.value === 'ar' || previousLocale === 'ar') {
        uni.setStorageSync('_isRTL', picked.value === 'ar')
        uni.reLaunch({ url: '/pages/profile/settings' })
      }
    },
    loadUserInfo() {
      getUserInfoApi().then((res) => {
        if (res.statusCode === 200 && res.data.user) {
          const user = res.data.user
          this.nickname = user.nickname || user.username || ''
          this.avatar = user.avatar || ''
          this.faceRegistered = !!user.face_registered
        }
      }).catch(() => {
        uni.showToast({ title: this.$t('settings.fetchUserInfoFailed'), icon: 'none' })
      })
    },
    goBack() {
      uni.navigateBack()
    },
    chooseAvatar() {
      uni.chooseImage({
        count: 1,
        sourceType: ['camera', 'album'],
        success: (res) => {
          this.newAvatarPath = res.tempFilePaths[0]
          this.avatar = this.newAvatarPath
        }
      })
    },
    saveProfile() {
      if (!this.nickname.trim()) {
        uni.showToast({ title: this.$t('settings.nicknameRequired'), icon: 'none' })
        return
      }
      this.savingProfile = true
      updateUserProfileApi(this.newAvatarPath, { nickname: this.nickname })
        .then((res) => {
          this.savingProfile = false
          if (res.statusCode === 200) {
            uni.showToast({ title: this.$t('common.saveSuccess'), icon: 'success' })
            this.newAvatarPath = ''
            this.loadUserInfo()
          } else {
            // res.data.error 来自后端，目前只有中文文案；前端 i18n 暂不覆盖后端返回的业务错误
            uni.showToast({ title: res.data.error || this.$t('common.saveFailed'), icon: 'none' })
          }
        })
        .catch(() => {
          this.savingProfile = false
          uni.showToast({ title: this.$t('common.networkError'), icon: 'none' })
        })
    },
    savePassword() {
      if (!this.oldPassword || !this.newPassword || !this.confirmPassword) {
        uni.showToast({ title: this.$t('settings.passwordFieldsRequired'), icon: 'none' })
        return
      }
      if (this.newPassword !== this.confirmPassword) {
        uni.showToast({ title: this.$t('settings.passwordMismatch'), icon: 'none' })
        return
      }
      this.savingPassword = true
      changePasswordApi(this.oldPassword, this.newPassword)
        .then((res) => {
          this.savingPassword = false
          if (res.statusCode === 200) {
            uni.showToast({ title: this.$t('settings.passwordChangeSuccess'), icon: 'success' })
            this.oldPassword = ''
            this.newPassword = ''
            this.confirmPassword = ''
          } else {
            const detail = res.data.details ? res.data.details.join('；') : ''
            uni.showToast({ title: res.data.error + (detail ? '：' + detail : '') || this.$t('settings.passwordChangeFailed'), icon: 'none' })
          }
        })
        .catch(() => {
          this.savingPassword = false
          uni.showToast({ title: this.$t('common.networkError'), icon: 'none' })
        })
    },
    // 人脸绑定入口：App 端直接调系统相机（<camera> 是小程序系组件，App-vue 支持不稳），
    // 小程序端保持原来的页内摄像头浮层
    openFaceBind() {
      // #ifdef APP-PLUS
      uni.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res) => this._bindFaceByPath(res.tempFilePaths[0]),
        fail: () => {
          // 用户取消拍照不算错误，静默返回
        }
      })
      return
      // #endif

      // #ifndef APP-PLUS
      this.showFaceCamera = true
      // #endif
    },
    // 拿到照片路径后的统一绑定流程（两端共用）
    _bindFaceByPath(filePath) {
      uni.showLoading({ title: this.$t('settings.binding'), mask: true })
      readFileAsBase64(filePath)
        .then((base64Data) => updateFaceApi(base64Data))
        .then((result) => {
          uni.hideLoading()
          if (result.statusCode === 200) {
            this.faceRegistered = true
            uni.showToast({ title: this.$t('settings.bindSuccess'), icon: 'success' })
            this.showFaceCamera = false
          } else {
            uni.showModal({
              title: this.$t('settings.bindFailed'),
              content: result.data.error || this.$t('settings.pleaseRetry'),
              showCancel: false
            })
          }
        })
        .catch(() => {
          uni.hideLoading()
          uni.showToast({ title: this.$t('common.networkError'), icon: 'none' })
        })
    },
    captureAndBindFace() {
      const ctx = uni.createCameraContext()
      ctx.takePhoto({
        quality: 'high',
        success: (res) => this._bindFaceByPath(res.tempImagePath || res.tempFilePath),
        fail: () => {
          uni.showToast({ title: this.$t('settings.cameraStartFailed'), icon: 'none' })
        }
      })
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
  padding: 0 24rpx calc(48rpx + env(safe-area-inset-bottom, 0px));
}

.section {
  margin-bottom: 32rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #2D3E50;
  margin-bottom: 16rpx;
  padding-left: 8rpx;
}

.card {
  width: 100%;
  background: rgba(255,255,255,0.95);
  border-radius: 32rpx;
  padding: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
  box-sizing: border-box;
}

.avatar-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32rpx;
}

.avatar-preview {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background: #fff5eb;
  border: 4rpx solid rgba(255, 140, 66, 0.25);
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56rpx;
}

.avatar-hint {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #EF6C3E;
}

.field {
  margin-bottom: 24rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  color: #8E9AAB;
  margin-bottom: 12rpx;
}

.field-input {
  width: 100%;
  height: 80rpx;
  background: #fffbf7;
  border: 2rpx solid rgba(255, 245, 230, 0.9);
  border-radius: 24rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #2D3E50;
  box-sizing: border-box;
}

.field-placeholder {
  color: #B0BAC8;
}

.save-btn {
  width: 100%;
  height: 84rpx;
  line-height: 84rpx;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  font-size: 30rpx;
  font-weight: 650;
  border-radius: 42rpx;
  border: none;
  margin-top: 8rpx;
}

.save-btn:active {
  transform: scale(0.97);
}

.face-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.face-status-label {
  font-size: 26rpx;
  color: #8E9AAB;
}

.face-status-value {
  font-size: 28rpx;
  font-weight: 600;
  color: #9CA8B8;
}

.face-status-value.bound {
  color: #34c759;
}

.face-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 48rpx;
  box-sizing: border-box;
}

.face-card {
  width: 100%;
  max-width: 560rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(255, 248, 240, 0.98) 100%);
  border-radius: 48rpx;
  padding: 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 32rpx 64rpx -20rpx rgba(0,0,0,0.15);
  box-sizing: border-box;
}

.face-camera {
  width: 320rpx;
  height: 320rpx;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 24rpx;
  border: 4px solid #FFAD7A;
}

.face-hint {
  font-size: 30rpx;
  color: #5B6E8C;
  margin-bottom: 32rpx;
  font-weight: 500;
}

.face-btn {
  width: 100%;
  padding: 24rpx;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  border-radius: 48rpx;
  margin-bottom: 16rpx;
  font-weight: 650;
  font-size: 30rpx;
  border: none;
}

.face-btn.cancel {
  background: #F0F0F0;
  color: #9CA8B8;
  box-shadow: none;
}
</style>
