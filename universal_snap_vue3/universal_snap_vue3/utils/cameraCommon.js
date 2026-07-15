import {
  analyzeApi,
  detectGestureApi,
  detectPoseApi,
  generateSketchApi,
  getBaseUrl,
  grokAnalyzeApi,
  proAnalyzeApi,
  setBaseUrl,
  smartAnalyzeApi
} from './request.js';
import { requestPermission } from './permission.js';

export const cameraMixin = {
  data() {
    return {
      isAuth: false,
      cameraPosition: 'back',
      flashMode: 'off',
      
      smartMode: '',
      smartModeOptions: ['person', 'object', 'scenery'],
      
      gridType: 'none',
      activeTemplate: '',
      templateName: '',
      customSketchUrl: '',
      
      showTemplates: false,
      
      aiRunning: false,
      aiMessage: '',
      isAnalyzing: false,
      isSpeaking: false,
      isPerfect: false,
      aiFailCount: 0,
      aiTimer: null,
      
      grokRunning: false,
      isAudioEnabled: true,
      
      proMode: false,
      proAnalyzing: false,
      
      skeletonMode: false,
      gestureMode: false,
      
      isLevelEnabled: false,
      tiltAngle: 0,
      pitchAngle: 0,
      isLeveled: false,
      isFlat: false,
      
      serverUrl: '',
      lastAppPhoto: null,
      
      audioContext: null,
      
      gestureProgress: 0,
      isGestureDetected: false,
      isPhotoTriggered: false,
      gestureHighlightColor: '#FFD700'
    };
  },
  
  computed: {
    flashDesc() {
      const map = { 
        'off': this.$t('camera.flashOff'), 
        'on': this.$t('camera.flashOn'), 
        'torch': this.$t('camera.flashTorch') 
      };
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
      if (p < -2) return this.$t('camera.elevationAngle');
      if (p >= -2 && p <= 2) return this.$t('camera.moreThan10mLevel');

      const HAND_HEIGHT = 1.4;
      const theta = p * (Math.PI / 180);
      let dist = HAND_HEIGHT / Math.tan(theta);

      if (dist > 15) return this.$t('camera.moreThan15m');
      return dist.toFixed(2) + "m";
    },
    
    gestureProgressPercent() {
      return Math.round(this.gestureProgress * 100);
    }
  },
  
  methods: {
    initCameraCommon() {
      this.serverUrl = getBaseUrl();
      this.initAudioContext();
    },
    
    initAudioContext() {
      try {
        if (typeof uni.createInnerAudioContext === 'function') {
          this.audioContext = uni.createInnerAudioContext();
          if (this.audioContext) {
            this.audioContext.obeyMuteSwitch = false;
          }
        }
      } catch (e) {
        console.warn('[Camera] 音频上下文初始化失败:', e);
        this.audioContext = null;
      }
    },
    
    async requestCameraPermission() {
      try {
        const result = await requestPermission('camera');
        this.isAuth = result;
        return result;
      } catch (e) {
        console.error('[Camera] 权限请求失败:', e);
        this.isAuth = false;
        return false;
      }
    },
    
    switchCamera() {
      this.cameraPosition = this.cameraPosition === 'back' ? 'front' : 'back';
    },
    
    toggleFlash() {
      const modes = ['off', 'on', 'torch'];
      const idx = modes.indexOf(this.flashMode);
      this.flashMode = modes[(idx + 1) % modes.length];
    },
    
    setSmartMode(mode) {
      this.smartMode = this.smartMode === mode ? '' : mode;
      if (this.smartMode && !this.aiRunning) {
        this.toggleAI();
      }
    },
    
    toggleProMode() {
      this.proMode = !this.proMode;
      if (!this.proMode) {
        this.stopProAnalysis();
      }
    },
    
    toggleSkeletonMode() {
      this.skeletonMode = !this.skeletonMode;
      if (!this.skeletonMode) {
        this.stopSkeletonDetection();
      }
    },
    
    toggleGestureMode() {
      this.gestureMode = !this.gestureMode;
      if (!this.gestureMode) {
        this.stopGestureDetection();
      }
    },
    
    toggleLevel() {
      this.isLevelEnabled = !this.isLevelEnabled;
      if (this.isLevelEnabled) {
        this.startLevelSensor();
      } else {
        this.stopLevelSensor();
      }
    },
    
    setGrid(type) {
      this.gridType = type;
    },
    
    setTemplate(type) {
      this.activeTemplate = type;
      switch(type) {
        case 'portrait':
          this.templateName = this.$t('camera.templatePortrait');
          break;
        case 'food':
          this.templateName = this.$t('camera.templateFood');
          break;
        case 'scenery':
          this.templateName = this.$t('camera.templateScenery');
          break;
        default:
          this.templateName = '';
      }
    },
    
    async chooseAndUploadSketch() {
      try {
        const res = await uni.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album']
        });
        
        if (res.tempFilePaths && res.tempFilePaths.length > 0) {
          this.customSketchUrl = res.tempFilePaths[0];
          this.activeTemplate = 'custom';
          this.templateName = this.$t('camera.customSketch');
        }
      } catch (e) {
        console.error('[Camera] 选择草图失败:', e);
      }
    },
    
    toggleAI() {
      if (this.aiRunning) {
        this.stopAI();
      } else {
        this.startAI();
      }
    },
    
    startAI() {
      if (!this.isAuth) {
        uni.showToast({ title: this.$t('camera.needCameraPermission'), icon: 'none' });
        return;
      }
      
      this.aiRunning = true;
      this.aiFailCount = 0;
      this.analyzeScene();
      this.aiTimer = setInterval(this.analyzeScene, 5000); 
    },
    
    stopAI() {
      if (this.aiTimer) clearInterval(this.aiTimer);
      this.aiRunning = false;
      this.isPerfect = false;
      this.aiEstimatedDistance = null;
      this.aiFailCount = 0;
      if (!this.grokRunning) {
        this.aiMessage = '';
        this.isAnalyzing = false;
        this.isSpeaking = false;
      }
      if (this.audioContext) this.audioContext.stop();
    },
    
    analyzeScene() {
      console.warn('[cameraCommon] analyzeScene 需要在子类中实现平台特定的拍照逻辑');
    },
    
    uploadForAI(filePath) {
      if (!this.smartMode) {
        analyzeApi(filePath, { need_audio: this.isAudioEnabled ? 'true' : 'false' })
          .then((res) => {
            if (this.aiRunning && res.statusCode === 200) {
              const data = res.data;
              if (data.advice) {
                this.aiMessage = data.advice;
                this.aiFailCount = 0;
                if (this.isAudioEnabled && data.audioUrl) {
                  this.playAudio(data.audioUrl);
                }
                
                if (data.perfect) {
                  this.isPerfect = true;
                  this.playPerfectSound();
                  setTimeout(() => { this.isPerfect = false; }, 3000);
                }
              }
            }
          })
          .catch((err) => {
            console.error('[Camera] AI 分析失败:', err);
            this.handleAIFail();
          });
      } else {
        smartAnalyzeApi(filePath, { mode: this.smartMode, need_audio: this.isAudioEnabled ? 'true' : 'false' })
          .then((res) => {
            if (this.aiRunning && res.statusCode === 200) {
              const data = res.data;
              if (data.advice) {
                this.aiMessage = data.advice;
                this.aiFailCount = 0;
                if (this.isAudioEnabled && data.audioUrl) {
                  this.playAudio(data.audioUrl);
                }
                
                if (data.perfect) {
                  this.isPerfect = true;
                  this.playPerfectSound();
                  setTimeout(() => { this.isPerfect = false; }, 3000);
                }
              }
            }
          })
          .catch((err) => {
            console.error('[Camera] 智能分析失败:', err);
            this.handleAIFail();
          });
      }
    },
    
    handleAIFail() {
      this.aiFailCount++;
      if (this.aiFailCount >= 3) {
        this.aiMessage = this.$t('camera.aiErrorRetry');
        if (this.aiFailCount >= 5) {
          this.stopAI();
        }
      }
    },
    
    playAudio(url) {
      if (!this.audioContext || !url) return;
      
      try {
        this.audioContext.src = url;
        this.audioContext.play();
        this.isSpeaking = true;
        this.audioContext.onEnded(() => {
          this.isSpeaking = false;
        });
      } catch (e) {
        console.error('[Camera] 音频播放失败:', e);
        this.isSpeaking = false;
      }
    },
    
    playPerfectSound() {
      if (this.audioContext) {
        try {
          this.audioContext.src = '/static/audio/perfect.mp3';
          this.audioContext.play();
        } catch (e) {
          console.warn('[Camera] 播放完美音效失败:', e);
        }
      }
    },
    
    toggleGrok() {
      this.grokRunning = !this.grokRunning;
      if (this.grokRunning) {
        uni.showToast({ title: '🟢 Grok 已启用', icon: 'none' });
      } else {
        uni.showToast({ title: '⚪ Grok 已关闭', icon: 'none' });
      }
    },
    
    toggleAudio() {
      this.isAudioEnabled = !this.isAudioEnabled;
      uni.showToast({
        title: this.isAudioEnabled ? '🔊' : '🔇',
        icon: 'none'
      });
    },
    
    goToARMeasure() {
      uni.navigateTo({ url: '/pages/ar/index' });
    },
    
    showIpConfig() {
      uni.showModal({
        title: this.$t('camera.config'),
        content: `当前服务器: ${this.serverUrl}`,
        editable: true,
        placeholderText: '输入新的服务器地址',
        success: (res) => {
          if (res.confirm && res.content) {
            setBaseUrl(res.content);
            this.serverUrl = res.content;
            uni.showToast({ title: '✅ 已更新', icon: 'none' });
          }
        }
      });
    },
    
    openSettings() {
      this._openPlatformSettings();
    },
    
    _openPlatformSettings() {
      try {
        if (typeof wx !== 'undefined' && typeof wx.openSetting === 'function') {
          wx.openSetting({
            success: (res) => {
              console.log('[Camera] 小程序设置页已打开');
            },
            fail: (err) => {
              console.warn('[Camera] 打开小程序设置失败:', err);
              this._fallbackOpenSettings();
            }
          });
        } else if (typeof uni.openAppAuthorizeSetting === 'function') {
          uni.openAppAuthorizeSetting({
            success: () => {
              console.log('[Camera] App 设置页已打开');
            },
            fail: () => {
              console.warn('[Camera] 打开 App 设置失败，尝试原生方式');
              this._fallbackOpenSettings();
            }
          });
        } else {
          this._fallbackOpenSettings();
        }
      } catch (e) {
        console.warn('[Camera] 打开设置异常:', e);
        this._fallbackOpenSettings();
      }
    },
    
    _fallbackOpenSettings() {
      try {
        if (typeof plus !== 'undefined' && plus.os) {
          if (plus.os.name === 'iOS') {
            plus.runtime.openURL('app-settings://');
            console.log('[Camera] 已跳转 iOS 系统设置');
          } else if (plus.os.name === 'Android') {
            const Intent = plus.android.importClass('android.content.Intent');
            const Uri = plus.android.importClass('android.net.Uri');
            const mainActivity = plus.android.runtimeMainActivity();
            const intent = new Intent('android.settings.APPLICATION_DETAILS_SETTINGS');
            intent.setData(Uri.fromParts('package', mainActivity.getPackageName(), null));
            mainActivity.startActivity(intent);
            console.log('[Camera] 已跳转 Android 应用详情页');
          }
        } else {
          uni.showToast({
            title: '请手动前往系统设置开启相机权限',
            icon: 'none',
            duration: 3000
          });
        }
      } catch (e) {
        console.error('[Camera] 原生方式打开设置失败:', e);
        uni.showToast({
          title: '请手动开启相机权限后重试',
          icon: 'none',
          duration: 3000
        });
      }
    },
    
    startLevelSensor() {
      console.warn('[cameraCommon] startLevelSensor 需要平台特定实现');
    },
    
    stopLevelSensor() {
      console.warn('[cameraCommon] stopLevelSensor 需要平台特定实现');
    },
    
    triggerProAnalysis() {
      console.warn('[cameraCommon] triggerProAnalysis 需要平台特定实现');
    },
    
    stopProAnalysis() {
      this.proAnalyzing = false;
    },
    
    stopSkeletonDetection() {
      console.warn('[cameraCommon] stopSkeletonDetection 需要平台特定实现');
    },
    
    stopGestureDetection() {
      console.warn('[cameraCommon] stopGestureDetection 需要平台特定实现');
    },
    
    takePhoto() {
      console.warn('[cameraCommon] takePhoto 需要平台特定实现');
    },
    
    onDestroy() {
      this.stopAI();
      this.stopLevelSensor();
      this.stopSkeletonDetection();
      this.stopGestureDetection();
      this.stopProAnalysis();
      
      if (this.audioContext) {
        this.audioContext.destroy();
        this.audioContext = null;
      }
    }
  },
  
  onUnload() {
    this.onDestroy();
  },
  
  onHide() {
    this.onDestroy();
  }
};