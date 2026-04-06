<template>
  <view class="container">
    <camera v-if="isAuth" :device-position="cameraPosition" :flash="flashMode" class="camera-view" @error="onCameraError">
      
      <cover-view v-if="isPerfect" class="perfect-border"></cover-view>

      <cover-view class="hud-panel" v-if="smartMode || isLevelEnabled">
        <cover-view class="hud-text">↔️ 左右倾角: {{ displayRoll }}°</cover-view>
        <cover-view class="hud-text">↕️ 前后俯仰: {{ displayPitch }}°</cover-view>
        <cover-view class="hud-text">📏 估算距离: {{ estimatedDistanceDisplay }}</cover-view>
      </cover-view>

      <block v-if="gridType === 'nine'">
        <cover-view class="grid-v v1"></cover-view>
        <cover-view class="grid-v v2"></cover-view>
        <cover-view class="grid-h h1"></cover-view>
        <cover-view class="grid-h h2"></cover-view>
      </block>

      <block v-if="gridType === 'third'">
        <cover-view class="grid-v" style="left: 25%; background: rgba(255,255,255,0.4);"></cover-view>
        <cover-view class="grid-v" style="left: 50%; background: rgba(255,255,255,0.4);"></cover-view>
        <cover-view class="grid-v" style="left: 75%; background: rgba(255,255,255,0.4);"></cover-view>
        <cover-view class="grid-h" style="top: 25%; background: rgba(255,255,255,0.4);"></cover-view>
        <cover-view class="grid-h" style="top: 50%; background: rgba(255,255,255,0.4);"></cover-view>
        <cover-view class="grid-h" style="top: 75%; background: rgba(255,255,255,0.4);"></cover-view>
      </block>
      
      <cover-view v-if="activeTemplate" class="template-box" :class="activeTemplate">
        <cover-view class="template-text">{{ templateName }}</cover-view>
      </cover-view>
      
      <cover-image 
        v-if="customSketchUrl" 
        :src="customSketchUrl" 
        class="custom-sketch-overlay"
      ></cover-image>

      <cover-view v-if="isLevelEnabled" class="level-container">
        <cover-view class="crosshair-v"></cover-view>
        <cover-view class="crosshair-h"></cover-view>
        <cover-view 
          class="dynamic-line" 
          :class="{ 'line-leveled': isLeveled, 'line-flat': isFlat }"
          :style="{ transform: 'rotate(' + tiltAngle + 'deg)' }"
        ></cover-view>
      </cover-view>

      <cover-view v-if="aiMessage" class="ai-bubble-wrap">
        <cover-view class="ai-bubble" :class="{'perfect-bubble': isPerfect}">
          <cover-view class="ai-text" :class="{'perfect-text': isPerfect}">
            {{ isPerfect ? '✨' : (isSpeaking ? '🔊' : (isAnalyzing ? '⌛' : (grokRunning ? '🧠' : '🤖'))) }} {{ aiMessage }}
          </cover-view>
        </cover-view>
      </cover-view>
    </camera>

    <view v-else class="permission-box">
      <text class="p-text">相机未授权</text>
      <button class="p-btn" @tap="openSettings">去设置开启权限</button>
    </view>

    <view class="footer">
      <view class="mode-selector">
        <text class="mode-item" :class="{active: smartMode === 'person'}" @tap="setSmartMode('person')">👤 拍人</text>
        <text class="mode-item" :class="{active: smartMode === 'object'}" @tap="setSmartMode('object')">🍎 拍物</text>
        <text class="mode-item" :class="{active: smartMode === 'scenery'}" @tap="setSmartMode('scenery')">🏔️ 拍景</text>
        <text class="mode-item" :class="{active: smartMode === ''}" @tap="setSmartMode('')">🚫 自由</text>
      </view>

      <scroll-view class="tools-scroll" scroll-x="true" :show-scrollbar="false">
        <view class="tools-inner">
          <view class="btn" @tap="switchCamera">
            <text class="emoji">🔄</text>
            <text class="desc">翻转</text>
          </view>
          <view class="btn" @tap="toggleFlash">
            <text class="emoji">⚡</text>
            <text class="desc">{{ flashDesc }}</text>
          </view>
          <view class="btn" @tap="showTemplates = !showTemplates">
            <text class="emoji">🖼️</text>
            <text class="desc">模板</text>
          </view>
          
          <view class="btn" @tap="toggleGrok">
            <text class="emoji">{{ grokRunning ? '🟢' : '⚪' }}</text>
            <text class="desc">Grok</text>
          </view>

          <view class="btn" @tap="toggleAudio">
            <text class="emoji">{{ isAudioEnabled ? '🔊' : '🔇' }}</text>
            <text class="desc">语音</text>
          </view>
          
          <view class="btn" @tap="toggleAI">
            <text class="emoji">{{ aiRunning ? '🟢' : '⚪' }}</text>
            <text class="desc">智能指导</text>
          </view>

          <view class="btn" @tap="toggleLevel">
            <text class="emoji">{{ isLevelEnabled ? '🟢' : '⚪' }}</text>
            <text class="desc">水平仪</text>
          </view>
          
          <view class="btn" @tap="showIpConfig">
            <text class="emoji">⚙️</text>
            <text class="desc">配置</text>
          </view>
        </view>
      </scroll-view>

      <view class="shutter-zone">
        <view class="shutter-outer" @tap="takePhoto">
          <view class="shutter-inner"></view>
        </view>
      </view>
    </view>

    <view v-if="showTemplates" class="panel-mask" @tap="showTemplates = false">
      <view class="panel" @tap.stop>
        <view class="panel-header">辅助线</view>
        <view class="grid-row">
          <view class="tag" :class="{active: gridType==='none'}" @tap="setGrid('none')">无</view>
          <view class="tag" :class="{active: gridType==='nine'}" @tap="setGrid('nine')">九宫格</view>
          <view class="tag" :class="{active: gridType==='third'}" @tap="setGrid('third')">细分网格</view>
        </view>
        <view class="panel-header">模板</view>
        <view class="template-list">
          <view class="t-item" @tap="setTemplate('portrait')">👤 人像</view>
          <view class="t-item" @tap="setTemplate('food')">🍜 美食</view>
          <view class="t-item" @tap="setTemplate('scenery')">🏔️ 风景</view>
          <view class="t-item custom" @tap="chooseAndUploadSketch">📤 自定义线稿</view>
          <view class="t-item clear" @tap="setTemplate('')">🚫 清除</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getBaseUrl, setBaseUrl } from '@/utils/request.js'; 

export default {
  data() {
    return {
      cameraPosition: 'back',
      isAuth: false,
      flashMode: 'off',
      gridType: 'none',
      activeTemplate: '',
      templateName: '',
      customSketchUrl: '',
      showTemplates: false,
      
      smartMode: '',
      isPerfect: false,
      aiRunning: false,
      aiTimer: null,
      
      aiEstimatedDistance: null, 
      
      grokRunning: false,
      grokTimer: null,
      isAudioEnabled: false,
      isAnalyzing: false, 
      isSpeaking: false,
      aiMessage: '',
      
      isLevelEnabled: false, 
      tiltAngle: 0,          
      smoothedAngle: 0,      
      lastRawAngle: 0, 

      pitchAngle: 0,         
      smoothedPitch: 0,
      lastRawPitch: 0,
            
      isLeveled: false, 
      isFlat: false,         
      lastVibrateTime: 0,    
      
      serverUrl: getBaseUrl(), 
      audioContext: null
    };
  },
  computed: {
    flashDesc() {
      const map = { 'off': '关', 'on': '开', 'torch': '常亮' };
      return map[this.flashMode];
    },
    displayRoll() {
      return Math.round(this.tiltAngle || 0);
    },
    displayPitch() {
      return Math.round(this.pitchAngle || 0);
    },
    estimatedDistanceDisplay() {
      if (this.aiEstimatedDistance) return this.aiEstimatedDistance;
      
      const p = this.pitchAngle;
      
      if (p < -2) return "仰角 (高处物体)";
      if (p >= -2 && p <= 2) return "> 10m (平视)";
      
      const HAND_HEIGHT = 1.4; 
      const theta = p * (Math.PI / 180);
      
      // 【修复】防御极端情况下的除以零报错
      if (theta === 0) return "> 10m (平视)";
      
      // 【修复】加上绝对值，确保求出的距离是正数
      let dist = Math.abs(HAND_HEIGHT / Math.tan(theta));
      
      if (dist > 15) return "> 15m"; 
      return dist.toFixed(2) + "m";
    }
  },
  onLoad() {
    this.initCamera();
    this.initAudioContext();
  },
  onShow() {
    if (this.isLevelEnabled) {
      this.startLevelSensor();
    }
  },
  onHide() {
    // 【修复】切后台时关闭传感器和所有轮询定时器，防止导致微信崩溃或内存泄露
    this.stopLevelSensor();
    if (this.aiRunning) this.stopAI();
    if (this.grokRunning) this.stopGrok();
  },
  onUnload() {
    this.stopAI();
    this.stopGrok();
    this.stopLevelSensor();
    
    // 【修复】页面卸载时彻底销毁音频上下文，释放内存
    if (this.audioContext) {
      this.audioContext.stop();
      this.audioContext.destroy();
      this.audioContext = null;
    }
  },
  methods: {
    setSmartMode(mode) {
      if (this.smartMode === mode) return; 
      this.smartMode = mode;
      this.aiEstimatedDistance = null; 
      
      if (mode === '') {
        uni.showToast({ title: '自由拍摄模式', icon: 'none' });
        this.isPerfect = false;
        if (this.aiRunning) {
          this.aiMessage = "切换自由模式，不再强制调整动作。";
        }
      } else {
        const modeNames = { 'person': '人像', 'object': '静物', 'scenery': '风光' };
        uni.showToast({ title: `切换至${modeNames[mode]}智能指导模式`, icon: 'none' });
        if (this.aiRunning) {
          this.aiMessage = "切换模式，重新评估中...";
          this.isPerfect = false;
        }
      }
    },

    toggleLevel() {
      this.isLevelEnabled = !this.isLevelEnabled;
      if (this.isLevelEnabled) {
        this.startLevelSensor();
      } else {
        this.stopLevelSensor();
        this.isLeveled = false;
        this.isFlat = false;
        this.tiltAngle = 0;
        this.smoothedAngle = 0;
        this.lastRawAngle = 0;
        this.pitchAngle = 0;
        this.smoothedPitch = 0;
        this.lastRawPitch = 0;
      }
    },
    
    startLevelSensor() {
      uni.startAccelerometer({
        interval: 'ui', 
        success: () => {
          uni.onAccelerometerChange((res) => {
            if (Math.abs(res.z) > 0.85) {
              this.isFlat = true;
              this.isLeveled = false;
              return; 
            } else {
              this.isFlat = false;
            }

            let rawAngle = Math.atan2(res.x, -res.y) * (180 / Math.PI);
            let rawPitch = Math.atan2(res.z, -res.y) * (180 / Math.PI);

            let delta = rawAngle - this.lastRawAngle;
            if (delta > 180) rawAngle -= 360;
            else if (delta < -180) rawAngle += 360;
            this.lastRawAngle = rawAngle;
            this.smoothedAngle = this.smoothedAngle + (rawAngle - this.smoothedAngle) * 0.08;

            let deltaPitch = rawPitch - this.lastRawPitch;
            if (deltaPitch > 180) rawPitch -= 360;
            else if (deltaPitch < -180) rawPitch += 360;
            this.lastRawPitch = rawPitch;
            this.smoothedPitch = this.smoothedPitch + (rawPitch - this.smoothedPitch) * 0.08;
            this.pitchAngle = this.smoothedPitch;

            const targetAngle = Math.round(this.smoothedAngle / 90) * 90;
            const diff = Math.abs(this.smoothedAngle - targetAngle);

            if (diff < 3.5) {
              if (!this.isLeveled) {
                this.isLeveled = true;
                const now = Date.now();
                if (now - this.lastVibrateTime > 1000) {
                  uni.vibrateShort();
                  this.lastVibrateTime = now;
                }
              }
              this.tiltAngle = -targetAngle; 
            } else {
              this.isLeveled = false;
              this.tiltAngle = -this.smoothedAngle;
            }
          });
        },
        fail: (err) => { console.log("传感器启动失败", err); }
      });
    },
    stopLevelSensor() {
      uni.stopAccelerometer();
    },

    chooseAndUploadSketch() {
      uni.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'], 
        success: (res) => {
          const filePath = res.tempFiles[0].tempFilePath;
          uni.showLoading({ title: '生成线稿中...' });
          
          uni.uploadFile({
            url: `${this.serverUrl}/generate-sketch`, 
            filePath: filePath,
            name: 'file',
            success: (uploadRes) => {
              uni.hideLoading();
              if (uploadRes.statusCode === 200) {
                try {
                  const data = JSON.parse(uploadRes.data);
                  if (data.sketchUrl) {
                    this.customSketchUrl = data.sketchUrl;
                    this.activeTemplate = ''; 
                    this.templateName = '';
                    this.showTemplates = false; 
                    uni.showToast({ title: '线稿已加载', icon: 'success' });
                  }
                } catch (e) {
                  uni.showToast({ title: '解析失败', icon: 'none' });
                }
              } else {
                uni.showToast({ title: '生成失败', icon: 'none' });
              }
            },
            fail: () => {
              uni.hideLoading();
              uni.showToast({ title: '上传失败', icon: 'none' });
            }
          });
        }
      });
    },

    toggleGrok() {
      this.grokRunning = !this.grokRunning;
      if (this.grokRunning) {
        if (this.aiRunning) this.stopAI();
        this.aiMessage = 'Grok 模式已启动...';
        this.isAnalyzing = false;
        this.analyzeGrokScene();
        this.grokTimer = setInterval(this.analyzeGrokScene, 5000);
      } else {
        this.stopGrok();
      }
    },
    stopGrok() {
      if (this.grokTimer) {
        clearInterval(this.grokTimer);
        this.grokTimer = null;
      }
      this.grokRunning = false;
      if (!this.aiRunning) {
        this.aiMessage = '';
        this.isAnalyzing = false;
      }
    },
    analyzeGrokScene() {
      if (!this.grokRunning || this.isAnalyzing || this.isSpeaking) return;
      const ctx = uni.createCameraContext();
      ctx.takePhoto({
        quality: 'normal',
        success: (res) => {
          const path = res.tempFilePath || res.tempImagePath;
          if (path) {
            this.isAnalyzing = true;
            this.uploadForGrok(path);
          }
        }
      });
    },
    uploadForGrok(filePath) {
      uni.uploadFile({
        url: `${this.serverUrl}/analyze-grok`,
        filePath: filePath,
        name: 'file',
        success: (res) => {
          if (this.grokRunning && res.statusCode === 200) {
            try {
              const data = JSON.parse(res.data);
              if (data.advice) this.aiMessage = `[Grok] ${data.advice}`;
            } catch (e) { console.error("解析失败", e); }
          }
          this.isAnalyzing = false;
        },
        fail: () => {
          if (this.grokRunning) this.aiMessage = "Grok 连接失败";
          this.isAnalyzing = false;
        }
      });
    },

    toggleAI() {
      this.aiRunning = !this.aiRunning;
      if (this.aiRunning) {
        if (this.grokRunning) this.stopGrok();
        this.aiMessage = this.smartMode ? '智能构图指导已启动...' : '全能 AI 助手已启动...';
        this.isPerfect = false;
        this.isAnalyzing = false;
        this.isSpeaking = false;
        this.analyzeScene();
        this.aiTimer = setInterval(this.analyzeScene, 5000); 
      } else {
        this.stopAI();
      }
    },
    stopAI() {
      if (this.aiTimer) {
        clearInterval(this.aiTimer);
        this.aiTimer = null;
      }
      this.aiRunning = false;
      this.isPerfect = false;
      this.aiEstimatedDistance = null; 
      if (!this.grokRunning) {
          this.aiMessage = '';
          this.isAnalyzing = false;
          this.isSpeaking = false;
      }
      if (this.audioContext) this.audioContext.stop();
    },
    analyzeScene() {
      if (!this.aiRunning || this.isAnalyzing || this.isSpeaking || this.isPerfect) return;
      const ctx = uni.createCameraContext();
      ctx.takePhoto({
        quality: 'low',
        success: (res) => {
          const path = res.tempFilePath || res.tempImagePath;
          if (path) {
            this.isAnalyzing = true; 
            this.uploadForAI(path);
          }
        }
      });
    },
    
    uploadForAI(filePath) {
      if (!this.smartMode) {
        uni.uploadFile({
          url: `${this.serverUrl}/analyze`,
          filePath: filePath,
          name: 'file',
          formData: { 'need_audio': this.isAudioEnabled ? 'true' : 'false' },
          success: (res) => {
            if (this.aiRunning && res.statusCode === 200) {
              try {
                const data = JSON.parse(res.data);
                if (data.advice) {
                  this.aiMessage = data.advice;
                  if (this.isAudioEnabled && data.audioUrl) {
                    this.playAudio(data.audioUrl);
                  }
                }
              } catch (e) { console.error(e); }
            }
            this.isAnalyzing = false;
          },
          fail: () => {
            if (this.aiRunning) this.aiMessage = "网络异常";
            this.isAnalyzing = false;
          }
        });
        return;
      }

      uni.uploadFile({
        // 注意：如果你后端的路由严格要求带斜杠，这里可能需要改为 /smart-analyze/ 以避免 308 重定向
        url: `${this.serverUrl}/smart-analyze`,
        filePath: filePath,
        name: 'file',
        formData: { 
          'mode': this.smartMode,                           
          'tilt_angle': Math.round(this.tiltAngle).toString() 
        },
        success: (res) => {
          if (this.aiRunning && res.statusCode === 200) {
            try {
              const response = JSON.parse(res.data);
              if (response.code === 200 && response.data) {
                const aiData = response.data;
                
                if (aiData.is_perfect) {
                  this.isPerfect = true;
                  this.aiMessage = "完美构图！自动抓拍中...";
                  uni.vibrateLong(); 
                  this.takePhoto(); 
                  
                  setTimeout(() => {
                    this.isPerfect = false;
                    this.aiMessage = "抓拍完成！";
                  }, 3000);
                } else {
                  this.aiMessage = aiData.advice;
                  if (this.isAudioEnabled && response.audioUrl) {
                     this.playAudio(response.audioUrl);
                  }
                }

                if (aiData.subject_ratio) {
                  this.aiEstimatedDistance = this.calculateDistance(aiData.subject_ratio);
                }

              }
            } catch (e) { console.error(e); }
          }
          this.isAnalyzing = false;
        },
        fail: () => {
          if (this.aiRunning) this.aiMessage = "网络异常";
          this.isAnalyzing = false;
        }
      });
    },

    switchCamera() {
      this.cameraPosition = this.cameraPosition === 'back' ? 'front' : 'back';
      uni.vibrateShort();
    },
    initCamera() {
      uni.authorize({
        scope: 'scope.camera',
        success: () => {
          this.isAuth = true;
          uni.authorize({ scope: 'scope.writePhotosAlbum', fail: () => {} });
        },
        fail: () => { this.isAuth = false; }
      });
    },
    initAudioContext() {
      this.audioContext = uni.createInnerAudioContext();
      this.audioContext.onEnded(() => this.onAudioFinished());
      this.audioContext.onError(() => this.onAudioFinished());
    },
    onAudioFinished() {
      this.isSpeaking = false;
      this.isAnalyzing = false; 
    },
    showIpConfig() {
      uni.showModal({
        title: '配置',
        editable: true,
        content: this.serverUrl,
        success: (res) => {
          if (res.confirm && res.content) {
            this.serverUrl = res.content;
            setBaseUrl(res.content); 
          }
        }
      });
    },
    toggleAudio() {
      this.isAudioEnabled = !this.isAudioEnabled;
      if (!this.isAudioEnabled && this.isSpeaking) {
        if(this.audioContext) this.audioContext.stop();
        this.onAudioFinished();
      }
      uni.showToast({ title: this.isAudioEnabled ? '语音开启' : '语音关闭', icon: 'none' });
    },
    playAudio(url) {
      if (!this.audioContext) return;
      this.isSpeaking = true;
      this.audioContext.src = url;
      this.audioContext.play();
    },
    takePhoto() {
      if (!this.isAuth) return;
      const ctx = uni.createCameraContext();
      uni.vibrateShort();
      ctx.takePhoto({
        quality: 'high',
        success: (res) => {
          const path = res.tempFilePath || res.tempImagePath;
          if (path) this.savePhotoSafe(path);
        }
      });
    },
    savePhotoSafe(path) {
      uni.saveImageToPhotosAlbum({
        filePath: path,
        success: () => uni.showToast({ title: '已存入相册' }),
        fail: () => uni.showToast({ title: '保存失败', icon: 'none' })
      });
    },
    toggleFlash() {
      const modes = ['off', 'on', 'torch'];
      this.flashMode = modes[(modes.indexOf(this.flashMode) + 1) % 3];
    },

    calculateDistance(ratio) {
      if (!ratio || ratio <= 0) return '--';
      let dist = (0.2 / ratio) * 1.5; 
      if (dist > 10) return '> 10m';
      if (dist < 0.2) return '< 0.2m';
      return dist.toFixed(2) + 'm';
    },

    setGrid(t) { this.gridType = t; },
    
    setTemplate(t) {
      this.activeTemplate = t;
      this.templateName = t === 'portrait' ? '人像' : t === 'food' ? '美食' : t === 'scenery' ? '风景' : '';
      this.customSketchUrl = '';
      this.showTemplates = false;
    },
    openSettings() { uni.openSetting(); },
    onCameraError() { uni.showToast({ title: '相机异常', icon: 'none' }); }
  }
};
</script>

<style scoped>
.container { width: 100vw; height: 100vh; background: #000; display: flex; flex-direction: column; overflow: hidden; }
.camera-view { flex: 1; width: 100%; position: relative; }

.hud-panel {
  position: absolute;
  top: 40rpx;
  left: 40rpx;
  background: rgba(0, 0, 0, 0.6);
  padding: 15rpx 25rpx;
  border-radius: 12rpx;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  pointer-events: none;
  z-index: 20;
}
.hud-text {
  color: #00ffcc;
  font-size: 22rpx;
  font-family: monospace; 
}

.grid-v { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.4); }
.grid-h { position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.4); }
.v1 { left: 33.33%; } .v2 { left: 66.66%; }
.h1 { top: 33.33%; } .h2 { top: 66.66%; }

.ai-bubble-wrap { position: absolute; bottom: 40rpx; left: 0; right: 0; display: flex; justify-content: center; padding: 0 40rpx; pointer-events: none; }

.ai-bubble { 
  background: rgba(0,0,0,0.7); 
  border: 1px solid #00ffcc; 
  border-radius: 20rpx; 
  padding: 20rpx 30rpx; 
  display: flex; 
  flex-direction: column; 
  width: auto; 
  max-width: 90%; 
  transition: all 0.3s; 
}
.ai-text { 
  color: #00ffcc; 
  font-size: 28rpx; 
  line-height: 1.5; 
  white-space: pre-wrap; 
  word-break: break-all; 
  transition: all 0.3s;
}

.perfect-border {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  border: 10rpx solid #39FF14; box-sizing: border-box;
  box-shadow: inset 0 0 50rpx rgba(57, 255, 20, 0.5);
  pointer-events: none; z-index: 10;
}
.perfect-bubble { background: rgba(57, 255, 20, 0.2); border-color: #39FF14; transform: scale(1.05); }
.perfect-text { color: #39FF14; font-weight: bold; }

.template-box { position: absolute; top: 15%; left: 10%; width: 80%; height: 60%; border: 1px dashed #fff; pointer-events: none; display: flex; justify-content: center; }
.template-box.portrait { border-radius: 50%; border-color: #ff69b4; height: 50%; top: 10%; }
.template-box.food { border-color: #ffa500; height: 40%; top: 30%; }
.template-box.scenery { border-left: none; border-right: none; width: 100%; left: 0; top: 35%; height: 30%; }
.template-text { margin-top: -40rpx; color: #fff; background: rgba(0,0,0,0.5); font-size: 22rpx; padding: 4rpx 10rpx; border-radius: 4rpx; }

.footer { height: 380rpx; background: #000; display: flex; flex-direction: column; justify-content: flex-start; padding-bottom: 20rpx; }

.mode-selector { display: flex; justify-content: center; gap: 30rpx; padding: 20rpx 0; }
.mode-item { color: #888; font-size: 26rpx; transition: all 0.2s; padding: 10rpx 20rpx; border-radius: 30rpx;}
.mode-item.active { color: #000; background: #FFD700; font-weight: bold; transform: scale(1.1); }

.tools-scroll { width: 100%; height: 120rpx; white-space: nowrap; margin-bottom: 10rpx; }
.tools-inner { display: inline-flex; padding: 0 30rpx; gap: 40rpx; align-items: center; height: 100%; }
.btn { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; min-width: 100rpx; }
.emoji { font-size: 40rpx; }
.desc { color: #ccc; font-size: 20rpx; margin-top: 8rpx; }

.shutter-zone { display: flex; justify-content: center; align-items: center; flex: 1; }
.shutter-outer { width: 130rpx; height: 130rpx; border: 6rpx solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.shutter-inner { width: 105rpx; height: 105rpx; background: #fff; border-radius: 50%; }

.panel-mask { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99; display: flex; align-items: flex-end; }
.panel { width: 100%; background: #1a1a1a; padding: 40rpx; border-radius: 30rpx 30rpx 0 0; }
.panel-header { color: #888; font-size: 24rpx; margin-bottom: 20rpx; }
.grid-row { display: flex; gap: 20rpx; margin-bottom: 40rpx; }
.tag { background: #333; color: #fff; padding: 10rpx 30rpx; border-radius: 30rpx; font-size: 24rpx; }
.tag.active { background: #007AFF; }
.template-list { display: flex; flex-wrap: wrap; gap: 20rpx; }
.t-item { background: #333; color: #fff; padding: 20rpx 30rpx; border-radius: 10rpx; font-size: 24rpx; }
.t-item.clear { color: #ff4d4f; }
.t-item.custom { background: #007AFF; }
.custom-sketch-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0.6; pointer-events: none; }

.level-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200rpx;
  height: 200rpx;
  transform: translate(-50%, -50%);
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: center;
}
.crosshair-v {
  position: absolute;
  width: 1px;
  height: 40rpx;
  background: rgba(255, 255, 255, 0.5);
}
.crosshair-h {
  position: absolute;
  width: 40rpx;
  height: 1px;
  background: rgba(255, 255, 255, 0.5);
}
.dynamic-line {
  position: absolute;
  width: 240rpx;
  height: 2px;
  background: rgba(255, 255, 255, 0.8);
  transition: transform 0.05s linear, background-color 0.2s ease, opacity 0.2s ease;
}
.line-leveled {
  background: #FFD700;
  height: 3px;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}
.line-flat {
  opacity: 0.2;
}
</style>