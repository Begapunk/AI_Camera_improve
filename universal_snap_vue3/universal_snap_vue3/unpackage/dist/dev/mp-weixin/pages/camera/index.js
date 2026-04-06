"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  data() {
    return {
      cameraPosition: "back",
      isAuth: false,
      flashMode: "off",
      gridType: "none",
      activeTemplate: "",
      templateName: "",
      customSketchUrl: "",
      showTemplates: false,
      smartMode: "",
      isPerfect: false,
      aiRunning: false,
      aiTimer: null,
      aiEstimatedDistance: null,
      grokRunning: false,
      grokTimer: null,
      isAudioEnabled: false,
      isAnalyzing: false,
      isSpeaking: false,
      aiMessage: "",
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
      serverUrl: utils_request.getBaseUrl(),
      audioContext: null
    };
  },
  computed: {
    flashDesc() {
      const map = { "off": "关", "on": "开", "torch": "常亮" };
      return map[this.flashMode];
    },
    displayRoll() {
      return Math.round(this.tiltAngle || 0);
    },
    displayPitch() {
      return Math.round(this.pitchAngle || 0);
    },
    estimatedDistanceDisplay() {
      if (this.aiEstimatedDistance)
        return this.aiEstimatedDistance;
      const p = this.pitchAngle;
      if (p < -2)
        return "仰角 (高处物体)";
      if (p >= -2 && p <= 2)
        return "> 10m (平视)";
      const HAND_HEIGHT = 1.4;
      const theta = p * (Math.PI / 180);
      if (theta === 0)
        return "> 10m (平视)";
      let dist = Math.abs(HAND_HEIGHT / Math.tan(theta));
      if (dist > 15)
        return "> 15m";
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
    this.stopLevelSensor();
    if (this.aiRunning)
      this.stopAI();
    if (this.grokRunning)
      this.stopGrok();
  },
  onUnload() {
    this.stopAI();
    this.stopGrok();
    this.stopLevelSensor();
    if (this.audioContext) {
      this.audioContext.stop();
      this.audioContext.destroy();
      this.audioContext = null;
    }
  },
  methods: {
    setSmartMode(mode) {
      if (this.smartMode === mode)
        return;
      this.smartMode = mode;
      this.aiEstimatedDistance = null;
      if (mode === "") {
        common_vendor.index.showToast({ title: "自由拍摄模式", icon: "none" });
        this.isPerfect = false;
        if (this.aiRunning) {
          this.aiMessage = "切换自由模式，不再强制调整动作。";
        }
      } else {
        const modeNames = { "person": "人像", "object": "静物", "scenery": "风光" };
        common_vendor.index.showToast({ title: `切换至${modeNames[mode]}智能指导模式`, icon: "none" });
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
      common_vendor.index.startAccelerometer({
        interval: "ui",
        success: () => {
          common_vendor.index.onAccelerometerChange((res) => {
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
            if (delta > 180)
              rawAngle -= 360;
            else if (delta < -180)
              rawAngle += 360;
            this.lastRawAngle = rawAngle;
            this.smoothedAngle = this.smoothedAngle + (rawAngle - this.smoothedAngle) * 0.08;
            let deltaPitch = rawPitch - this.lastRawPitch;
            if (deltaPitch > 180)
              rawPitch -= 360;
            else if (deltaPitch < -180)
              rawPitch += 360;
            this.lastRawPitch = rawPitch;
            this.smoothedPitch = this.smoothedPitch + (rawPitch - this.smoothedPitch) * 0.08;
            this.pitchAngle = this.smoothedPitch;
            const targetAngle = Math.round(this.smoothedAngle / 90) * 90;
            const diff = Math.abs(this.smoothedAngle - targetAngle);
            if (diff < 3.5) {
              if (!this.isLeveled) {
                this.isLeveled = true;
                const now = Date.now();
                if (now - this.lastVibrateTime > 1e3) {
                  common_vendor.index.vibrateShort();
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
        fail: (err) => {
          common_vendor.index.__f__("log", "at pages/camera/index.vue:333", "传感器启动失败", err);
        }
      });
    },
    stopLevelSensor() {
      common_vendor.index.stopAccelerometer();
    },
    chooseAndUploadSketch() {
      common_vendor.index.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album"],
        success: (res) => {
          const filePath = res.tempFiles[0].tempFilePath;
          common_vendor.index.showLoading({ title: "生成线稿中..." });
          common_vendor.index.uploadFile({
            url: `${this.serverUrl}/generate-sketch`,
            filePath,
            name: "file",
            success: (uploadRes) => {
              common_vendor.index.hideLoading();
              if (uploadRes.statusCode === 200) {
                try {
                  const data = JSON.parse(uploadRes.data);
                  if (data.sketchUrl) {
                    this.customSketchUrl = data.sketchUrl;
                    this.activeTemplate = "";
                    this.templateName = "";
                    this.showTemplates = false;
                    common_vendor.index.showToast({ title: "线稿已加载", icon: "success" });
                  }
                } catch (e) {
                  common_vendor.index.showToast({ title: "解析失败", icon: "none" });
                }
              } else {
                common_vendor.index.showToast({ title: "生成失败", icon: "none" });
              }
            },
            fail: () => {
              common_vendor.index.hideLoading();
              common_vendor.index.showToast({ title: "上传失败", icon: "none" });
            }
          });
        }
      });
    },
    toggleGrok() {
      this.grokRunning = !this.grokRunning;
      if (this.grokRunning) {
        if (this.aiRunning)
          this.stopAI();
        this.aiMessage = "Grok 模式已启动...";
        this.isAnalyzing = false;
        this.analyzeGrokScene();
        this.grokTimer = setInterval(this.analyzeGrokScene, 5e3);
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
        this.aiMessage = "";
        this.isAnalyzing = false;
      }
    },
    analyzeGrokScene() {
      if (!this.grokRunning || this.isAnalyzing || this.isSpeaking)
        return;
      const ctx = common_vendor.index.createCameraContext();
      ctx.takePhoto({
        quality: "normal",
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
      common_vendor.index.uploadFile({
        url: `${this.serverUrl}/analyze-grok`,
        filePath,
        name: "file",
        success: (res) => {
          if (this.grokRunning && res.statusCode === 200) {
            try {
              const data = JSON.parse(res.data);
              if (data.advice)
                this.aiMessage = `[Grok] ${data.advice}`;
            } catch (e) {
              common_vendor.index.__f__("error", "at pages/camera/index.vue:428", "解析失败", e);
            }
          }
          this.isAnalyzing = false;
        },
        fail: () => {
          if (this.grokRunning)
            this.aiMessage = "Grok 连接失败";
          this.isAnalyzing = false;
        }
      });
    },
    toggleAI() {
      this.aiRunning = !this.aiRunning;
      if (this.aiRunning) {
        if (this.grokRunning)
          this.stopGrok();
        this.aiMessage = this.smartMode ? "智能构图指导已启动..." : "全能 AI 助手已启动...";
        this.isPerfect = false;
        this.isAnalyzing = false;
        this.isSpeaking = false;
        this.analyzeScene();
        this.aiTimer = setInterval(this.analyzeScene, 5e3);
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
        this.aiMessage = "";
        this.isAnalyzing = false;
        this.isSpeaking = false;
      }
      if (this.audioContext)
        this.audioContext.stop();
    },
    analyzeScene() {
      if (!this.aiRunning || this.isAnalyzing || this.isSpeaking || this.isPerfect)
        return;
      const ctx = common_vendor.index.createCameraContext();
      ctx.takePhoto({
        quality: "low",
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
        common_vendor.index.uploadFile({
          url: `${this.serverUrl}/analyze`,
          filePath,
          name: "file",
          formData: { "need_audio": this.isAudioEnabled ? "true" : "false" },
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
              } catch (e) {
                common_vendor.index.__f__("error", "at pages/camera/index.vue:500", e);
              }
            }
            this.isAnalyzing = false;
          },
          fail: () => {
            if (this.aiRunning)
              this.aiMessage = "网络异常";
            this.isAnalyzing = false;
          }
        });
        return;
      }
      common_vendor.index.uploadFile({
        // 注意：如果你后端的路由严格要求带斜杠，这里可能需要改为 /smart-analyze/ 以避免 308 重定向
        url: `${this.serverUrl}/smart-analyze`,
        filePath,
        name: "file",
        formData: {
          "mode": this.smartMode,
          "tilt_angle": Math.round(this.tiltAngle).toString()
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
                  common_vendor.index.vibrateLong();
                  this.takePhoto();
                  setTimeout(() => {
                    this.isPerfect = false;
                    this.aiMessage = "抓拍完成！";
                  }, 3e3);
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
            } catch (e) {
              common_vendor.index.__f__("error", "at pages/camera/index.vue:550", e);
            }
          }
          this.isAnalyzing = false;
        },
        fail: () => {
          if (this.aiRunning)
            this.aiMessage = "网络异常";
          this.isAnalyzing = false;
        }
      });
    },
    switchCamera() {
      this.cameraPosition = this.cameraPosition === "back" ? "front" : "back";
      common_vendor.index.vibrateShort();
    },
    initCamera() {
      common_vendor.index.authorize({
        scope: "scope.camera",
        success: () => {
          this.isAuth = true;
          common_vendor.index.authorize({ scope: "scope.writePhotosAlbum", fail: () => {
          } });
        },
        fail: () => {
          this.isAuth = false;
        }
      });
    },
    initAudioContext() {
      this.audioContext = common_vendor.index.createInnerAudioContext();
      this.audioContext.onEnded(() => this.onAudioFinished());
      this.audioContext.onError(() => this.onAudioFinished());
    },
    onAudioFinished() {
      this.isSpeaking = false;
      this.isAnalyzing = false;
    },
    showIpConfig() {
      common_vendor.index.showModal({
        title: "配置",
        editable: true,
        content: this.serverUrl,
        success: (res) => {
          if (res.confirm && res.content) {
            this.serverUrl = res.content;
            utils_request.setBaseUrl(res.content);
          }
        }
      });
    },
    toggleAudio() {
      this.isAudioEnabled = !this.isAudioEnabled;
      if (!this.isAudioEnabled && this.isSpeaking) {
        if (this.audioContext)
          this.audioContext.stop();
        this.onAudioFinished();
      }
      common_vendor.index.showToast({ title: this.isAudioEnabled ? "语音开启" : "语音关闭", icon: "none" });
    },
    playAudio(url) {
      if (!this.audioContext)
        return;
      this.isSpeaking = true;
      this.audioContext.src = url;
      this.audioContext.play();
    },
    takePhoto() {
      if (!this.isAuth)
        return;
      const ctx = common_vendor.index.createCameraContext();
      common_vendor.index.vibrateShort();
      ctx.takePhoto({
        quality: "high",
        success: (res) => {
          const path = res.tempFilePath || res.tempImagePath;
          if (path)
            this.savePhotoSafe(path);
        }
      });
    },
    savePhotoSafe(path) {
      common_vendor.index.saveImageToPhotosAlbum({
        filePath: path,
        success: () => common_vendor.index.showToast({ title: "已存入相册" }),
        fail: () => common_vendor.index.showToast({ title: "保存失败", icon: "none" })
      });
    },
    toggleFlash() {
      const modes = ["off", "on", "torch"];
      this.flashMode = modes[(modes.indexOf(this.flashMode) + 1) % 3];
    },
    calculateDistance(ratio) {
      if (!ratio || ratio <= 0)
        return "--";
      let dist = 0.2 / ratio * 1.5;
      if (dist > 10)
        return "> 10m";
      if (dist < 0.2)
        return "< 0.2m";
      return dist.toFixed(2) + "m";
    },
    setGrid(t) {
      this.gridType = t;
    },
    setTemplate(t) {
      this.activeTemplate = t;
      this.templateName = t === "portrait" ? "人像" : t === "food" ? "美食" : t === "scenery" ? "风景" : "";
      this.customSketchUrl = "";
      this.showTemplates = false;
    },
    openSettings() {
      common_vendor.index.openSetting();
    },
    onCameraError() {
      common_vendor.index.showToast({ title: "相机异常", icon: "none" });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.isAuth
  }, $data.isAuth ? common_vendor.e({
    b: $data.isPerfect
  }, $data.isPerfect ? {} : {}, {
    c: $data.smartMode || $data.isLevelEnabled
  }, $data.smartMode || $data.isLevelEnabled ? {
    d: common_vendor.t($options.displayRoll),
    e: common_vendor.t($options.displayPitch),
    f: common_vendor.t($options.estimatedDistanceDisplay)
  } : {}, {
    g: $data.gridType === "nine"
  }, $data.gridType === "nine" ? {} : {}, {
    h: $data.gridType === "third"
  }, $data.gridType === "third" ? {} : {}, {
    i: $data.activeTemplate
  }, $data.activeTemplate ? {
    j: common_vendor.t($data.templateName),
    k: common_vendor.n($data.activeTemplate)
  } : {}, {
    l: $data.customSketchUrl
  }, $data.customSketchUrl ? {
    m: $data.customSketchUrl
  } : {}, {
    n: $data.isLevelEnabled
  }, $data.isLevelEnabled ? {
    o: $data.isLeveled ? 1 : "",
    p: $data.isFlat ? 1 : "",
    q: "rotate(" + $data.tiltAngle + "deg)"
  } : {}, {
    r: $data.aiMessage
  }, $data.aiMessage ? {
    s: common_vendor.t($data.isPerfect ? "✨" : $data.isSpeaking ? "🔊" : $data.isAnalyzing ? "⌛" : $data.grokRunning ? "🧠" : "🤖"),
    t: common_vendor.t($data.aiMessage),
    v: $data.isPerfect ? 1 : "",
    w: $data.isPerfect ? 1 : ""
  } : {}, {
    x: $data.cameraPosition,
    y: $data.flashMode,
    z: common_vendor.o((...args) => $options.onCameraError && $options.onCameraError(...args))
  }) : {
    A: common_vendor.o((...args) => $options.openSettings && $options.openSettings(...args))
  }, {
    B: $data.smartMode === "person" ? 1 : "",
    C: common_vendor.o(($event) => $options.setSmartMode("person")),
    D: $data.smartMode === "object" ? 1 : "",
    E: common_vendor.o(($event) => $options.setSmartMode("object")),
    F: $data.smartMode === "scenery" ? 1 : "",
    G: common_vendor.o(($event) => $options.setSmartMode("scenery")),
    H: $data.smartMode === "" ? 1 : "",
    I: common_vendor.o(($event) => $options.setSmartMode("")),
    J: common_vendor.o((...args) => $options.switchCamera && $options.switchCamera(...args)),
    K: common_vendor.t($options.flashDesc),
    L: common_vendor.o((...args) => $options.toggleFlash && $options.toggleFlash(...args)),
    M: common_vendor.o(($event) => $data.showTemplates = !$data.showTemplates),
    N: common_vendor.t($data.grokRunning ? "🟢" : "⚪"),
    O: common_vendor.o((...args) => $options.toggleGrok && $options.toggleGrok(...args)),
    P: common_vendor.t($data.isAudioEnabled ? "🔊" : "🔇"),
    Q: common_vendor.o((...args) => $options.toggleAudio && $options.toggleAudio(...args)),
    R: common_vendor.t($data.aiRunning ? "🟢" : "⚪"),
    S: common_vendor.o((...args) => $options.toggleAI && $options.toggleAI(...args)),
    T: common_vendor.t($data.isLevelEnabled ? "🟢" : "⚪"),
    U: common_vendor.o((...args) => $options.toggleLevel && $options.toggleLevel(...args)),
    V: common_vendor.o((...args) => $options.showIpConfig && $options.showIpConfig(...args)),
    W: common_vendor.o((...args) => $options.takePhoto && $options.takePhoto(...args)),
    X: $data.showTemplates
  }, $data.showTemplates ? {
    Y: $data.gridType === "none" ? 1 : "",
    Z: common_vendor.o(($event) => $options.setGrid("none")),
    aa: $data.gridType === "nine" ? 1 : "",
    ab: common_vendor.o(($event) => $options.setGrid("nine")),
    ac: $data.gridType === "third" ? 1 : "",
    ad: common_vendor.o(($event) => $options.setGrid("third")),
    ae: common_vendor.o(($event) => $options.setTemplate("portrait")),
    af: common_vendor.o(($event) => $options.setTemplate("food")),
    ag: common_vendor.o(($event) => $options.setTemplate("scenery")),
    ah: common_vendor.o((...args) => $options.chooseAndUploadSketch && $options.chooseAndUploadSketch(...args)),
    ai: common_vendor.o(($event) => $options.setTemplate("")),
    aj: common_vendor.o(() => {
    }),
    ak: common_vendor.o(($event) => $data.showTemplates = false)
  } : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-3913aa5f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/camera/index.js.map
