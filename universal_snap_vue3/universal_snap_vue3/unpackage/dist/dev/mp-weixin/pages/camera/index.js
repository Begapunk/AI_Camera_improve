"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
let _isDetecting = false;
let _frameListener = null;
let _lastInferTs = 0;
const _INFER_INTERVAL = 200;
const _KP_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle"
];
const _SKELETON_PAIRS = [
  // 头部
  { a: 0, b: 1, side: "L" },
  // 鼻-左眼
  { a: 0, b: 2, side: "R" },
  // 鼻-右眼
  { a: 1, b: 3, side: "L" },
  // 左眼-左耳
  { a: 2, b: 4, side: "R" },
  // 右眼-右耳
  // 主干
  { a: 5, b: 6, side: "C" },
  // 左肩-右肩
  { a: 11, b: 12, side: "C" },
  // 左髋-右髋
  { a: 5, b: 11, side: "L" },
  // 左肩-左髋
  { a: 6, b: 12, side: "R" },
  // 右肩-右髋
  // 左臂
  { a: 5, b: 7, side: "L" },
  // 左肩-左肘
  { a: 7, b: 9, side: "L" },
  // 左肘-左腕
  // 右臂
  { a: 6, b: 8, side: "R" },
  // 右肩-右肘
  { a: 8, b: 10, side: "R" },
  // 右肘-右腕
  // 左腿
  { a: 11, b: 13, side: "L" },
  // 左髋-左膝
  { a: 13, b: 15, side: "L" },
  // 左膝-左踝
  // 右腿
  { a: 12, b: 14, side: "R" },
  // 右髋-右膝
  { a: 14, b: 16, side: "R" },
  // 右膝-右踝
  // 左手放射线（MediaPipe-33: 17=left_pinky 19=left_index 21=left_thumb）
  { a: 9, b: 17, side: "L" },
  // 左腕-左小拇指
  { a: 9, b: 19, side: "L" },
  // 左腕-左食指
  { a: 9, b: 21, side: "L" },
  // 左腕-左拇指
  // 右手放射线（MediaPipe-33: 18=right_pinky 20=right_index 22=right_thumb）
  { a: 10, b: 18, side: "R" },
  // 右腕-右小拇指
  { a: 10, b: 20, side: "R" },
  // 右腕-右食指
  { a: 10, b: 22, side: "R" }
  // 右腕-右拇指
];
const _COLORS = { L: "#00FFFF", R: "#FF8C42", C: "#FFFFFF" };
const _KP_SIDE = (() => {
  const m = {};
  [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21].forEach((i) => m[i] = "L");
  [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].forEach((i) => m[i] = "R");
  return m;
})();
function _drawSkeleton(ctx, keypoints, W, H) {
  const MIN_SCORE = 0.3;
  const ok = (kp) => kp != null && (kp.score ?? 1) >= MIN_SCORE;
  _SKELETON_PAIRS.forEach(({ a, b, side }) => {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ok(ka) || !ok(kb))
      return;
    const color = _COLORS[side];
    ctx.beginPath();
    ctx.moveTo(ka.x * W, ka.y * H);
    ctx.lineTo(kb.x * W, kb.y * H);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = side === "C" ? 2.5 : 2;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });
  keypoints.forEach((kp, i) => {
    if (!ok(kp) || i > 22)
      return;
    const side = _KP_SIDE[i] ?? "C";
    const color = _COLORS[side];
    const x = kp.x * W;
    const y = kp.y * H;
    const r = i === 0 ? 7 : 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });
}
const _sfc_main = {
  data() {
    return {
      username: "",
      // 相机状态
      cameraPosition: "back",
      isAuth: false,
      flashMode: "off",
      gridType: "nine",
      activeTemplate: "",
      templateName: "",
      customSketchUrl: "",
      showTemplates: false,
      // AI分析与模式
      smartMode: "",
      isPerfect: false,
      aiRunning: false,
      aiTimer: null,
      aiEstimatedDistance: null,
      aiFailCount: 0,
      grokRunning: false,
      grokTimer: null,
      grokFailCount: 0,
      isAudioEnabled: false,
      isAnalyzing: false,
      isSpeaking: false,
      aiMessage: "",
      // 水平仪与传感器状态
      isLevelEnabled: false,
      tiltAngle: 0,
      levelLineTransform: "rotate(0deg)",
      smoothedAngle: 0,
      lastRawAngle: 0,
      pitchAngle: 0,
      smoothedPitch: 0,
      lastRawPitch: 0,
      isLeveled: false,
      isFlat: false,
      lastVibrateTime: 0,
      levelCallback: null,
      levelFrameId: null,
      levelFrameApi: null,
      levelSensorFrame: null,
      levelLastRenderAngle: 0,
      smX: void 0,
      smY: void 0,
      smZ: void 0,
      // 系统
      audioContext: null,
      serverUrl: "",
      // 专业模式
      proMode: false,
      proAnalyzing: false,
      proPlan: null,
      // Qwen 下发的拍摄方案 JSON
      proVKSession: null,
      // 保留字段（兼容旧引用，新架构不再使用）
      proCanvasNode: null,
      // canvas 2d node
      proCanvasCtx: null,
      // canvas 2d context
      proCanvasWidth: 0,
      proCanvasHeight: 0,
      // 注意：proActualKeypoints 已移至非响应式实例变量 this._proKps
      // 避免 VKSession 每帧写入触发 Vue diff 造成卡顿
      // 独立骨骼追踪模式
      skeletonMode: false
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
      let dist = HAND_HEIGHT / Math.tan(theta);
      if (dist > 15)
        return "> 15m";
      return dist.toFixed(2) + "m";
    }
  },
  onLoad() {
    this.serverUrl = utils_request.getBaseUrl();
    this.initCamera();
    this.initAudioContext();
    this._proKps = {};
    this._smoothedKps = {};
    this._proHudTs = 0;
  },
  onShow() {
    if (this.isLevelEnabled) {
      this.startLevelSensor();
    }
  },
  onHide() {
    this.stopLevelSensor();
  },
  onUnload() {
    this.stopAI();
    this.stopGrok();
    this.stopLevelSensor();
    this._stopProMode();
    this._stopSkeletonMode();
  },
  methods: {
    // === 拍摄模式选择 ===
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
    // === 传感器与水平仪功能 ===
    toggleLevel() {
      this.isLevelEnabled = !this.isLevelEnabled;
      if (this.isLevelEnabled) {
        this.smX = void 0;
        this.startLevelSensor();
      } else {
        this.stopLevelSensor();
        this.isLeveled = false;
        this.isFlat = false;
        this.tiltAngle = 0;
        this.smoothedAngle = 0;
        this.pitchAngle = 0;
        this.smoothedPitch = 0;
        this.levelLineTransform = "rotate(0deg)";
      }
    },
    startLevelSensor() {
      this.levelFrameApi = typeof common_vendor.wx$1 !== "undefined" ? common_vendor.wx$1 : common_vendor.index;
      this.levelSensorFrame = null;
      if (!this.levelCallback || this.levelCallback._rafVersion !== true) {
        this.levelCallback = (res) => {
          this.levelSensorFrame = res;
        };
        this.levelCallback._rafVersion = true;
      }
      common_vendor.index.startAccelerometer({
        interval: "ui",
        success: () => {
          common_vendor.index.offAccelerometerChange(this.levelCallback);
          common_vendor.index.onAccelerometerChange(this.levelCallback);
          this.startLevelFrameLoop();
        },
        fail: (err) => {
          common_vendor.index.__f__("log", "at pages/camera/index.vue:484", "传感器启动失败", err);
        }
      });
    },
    stopLevelSensor() {
      if (this.levelCallback)
        common_vendor.index.offAccelerometerChange(this.levelCallback);
      if (this.levelFrameId) {
        if (this.levelFrameApi && this.levelFrameApi.cancelAnimationFrame) {
          this.levelFrameApi.cancelAnimationFrame(this.levelFrameId);
        } else {
          clearTimeout(this.levelFrameId);
        }
        this.levelFrameId = null;
      }
      this.levelSensorFrame = null;
      common_vendor.index.stopAccelerometer();
    },
    startLevelFrameLoop() {
      if (this.levelFrameId)
        return;
      const requestFrame = (callback) => {
        if (this.levelFrameApi && this.levelFrameApi.requestAnimationFrame) {
          return this.levelFrameApi.requestAnimationFrame(callback);
        }
        return setTimeout(callback, 16);
      };
      const tick = () => {
        if (!this.isLevelEnabled)
          return;
        this.updateLevelFrame();
        this.levelFrameId = requestFrame(tick);
      };
      this.levelFrameId = requestFrame(tick);
    },
    updateLevelFrame() {
      const res = this.levelSensorFrame;
      if (!res)
        return;
      if (typeof this.smX === "undefined") {
        this.smX = res.x;
        this.smY = res.y;
        this.smZ = res.z;
        this.smoothedAngle = Math.atan2(this.smX, -this.smY) * (180 / Math.PI);
        this.smoothedPitch = Math.asin(Math.max(-1, Math.min(1, this.smZ))) * (180 / Math.PI);
      }
      this.smX = this.smX * 0.85 + res.x * 0.15;
      this.smY = this.smY * 0.85 + res.y * 0.15;
      this.smZ = this.smZ * 0.85 + res.z * 0.15;
      if (Math.abs(this.smZ) > 0.85) {
        if (!this.isFlat)
          this.isFlat = true;
        if (this.isLeveled)
          this.isLeveled = false;
        return;
      }
      if (this.isFlat)
        this.isFlat = false;
      let targetAngle = Math.atan2(this.smX, -this.smY) * (180 / Math.PI);
      let diff = targetAngle - this.smoothedAngle;
      while (diff <= -180)
        diff += 360;
      while (diff > 180)
        diff -= 360;
      this.smoothedAngle += diff * 0.12;
      let targetPitch = Math.asin(Math.max(-1, Math.min(1, this.smZ))) * (180 / Math.PI);
      this.smoothedPitch += (targetPitch - this.smoothedPitch) * 0.12;
      this.pitchAngle = this.smoothedPitch;
      const snapped = Math.round(this.smoothedAngle / 90) * 90;
      const snapDiff = Math.abs(this.smoothedAngle - snapped);
      const nextLeveled = snapDiff < 3.5;
      const nextAngle = nextLeveled ? -snapped : -this.smoothedAngle;
      if (nextLeveled && !this.isLeveled) {
        const now = Date.now();
        if (now - this.lastVibrateTime > 1e3) {
          common_vendor.index.vibrateShort();
          this.lastVibrateTime = now;
        }
      }
      if (this.isLeveled !== nextLeveled)
        this.isLeveled = nextLeveled;
      if (Math.abs(nextAngle - this.levelLastRenderAngle) > 0.1) {
        this.levelLastRenderAngle = nextAngle;
        this.tiltAngle = nextAngle;
        this.levelLineTransform = `rotate(${nextAngle}deg)`;
      }
    },
    // === 其他功能保持不变 ===
    chooseAndUploadSketch() {
      common_vendor.index.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album"],
        success: (res) => {
          const filePath = res.tempFiles[0].tempFilePath;
          common_vendor.index.showLoading({ title: "生成线稿中..." });
          utils_request.generateSketchApi(filePath).then((uploadRes) => {
            common_vendor.index.hideLoading();
            if (uploadRes.statusCode === 200) {
              const data = uploadRes.data;
              if (data.sketchUrl) {
                this.customSketchUrl = data.sketchUrl;
                this.activeTemplate = "";
                this.templateName = "";
                this.showTemplates = false;
                common_vendor.index.showToast({ title: "线稿已加载", icon: "success" });
              }
            } else {
              common_vendor.index.showToast({ title: "生成失败", icon: "none" });
            }
          }).catch(() => {
            common_vendor.index.hideLoading();
            common_vendor.index.showToast({ title: "上传失败，请检查网络", icon: "none" });
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
      if (this.grokTimer)
        clearInterval(this.grokTimer);
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
      utils_request.grokAnalyzeApi(filePath).then((res) => {
        if (this.grokRunning && res.statusCode === 200) {
          const data = res.data;
          if (data.advice) {
            this.aiMessage = `[Grok] ${data.advice}`;
            this.grokFailCount = 0;
          }
        }
        this.isAnalyzing = false;
      }).catch(() => {
        this.grokFailCount++;
        if (this.grokRunning) {
          this.aiMessage = this.grokFailCount >= 3 ? "Grok 连接中断，请检查网络" : "Grok 重连中...";
        }
        this.isAnalyzing = false;
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
      if (this.aiTimer)
        clearInterval(this.aiTimer);
      this.aiRunning = false;
      this.isPerfect = false;
      this.aiEstimatedDistance = null;
      this.aiFailCount = 0;
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
        utils_request.analyzeApi(filePath, { need_audio: this.isAudioEnabled ? "true" : "false" }).then((res) => {
          if (this.aiRunning && res.statusCode === 200) {
            const data = res.data;
            if (data.advice) {
              this.aiMessage = data.advice;
              this.aiFailCount = 0;
              if (this.isAudioEnabled && data.audioUrl) {
                this.playAudio(data.audioUrl);
              }
            }
          }
          this.isAnalyzing = false;
        }).catch(() => {
          this.aiFailCount++;
          if (this.aiRunning) {
            this.aiMessage = this.aiFailCount >= 3 ? "网络持续中断，请检查连接" : "网络波动，重试中...";
          }
          this.isAnalyzing = false;
        });
        return;
      }
      utils_request.smartAnalyzeApi(filePath, {
        mode: this.smartMode,
        tilt_angle: Math.round(this.tiltAngle).toString()
      }).then((res) => {
        if (this.aiRunning && res.statusCode === 200) {
          const response = res.data;
          if (response.code === 200 && response.data) {
            const aiData = response.data;
            this.aiFailCount = 0;
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
        }
        this.isAnalyzing = false;
      }).catch(() => {
        this.aiFailCount++;
        if (this.aiRunning) {
          this.aiMessage = this.aiFailCount >= 3 ? "网络持续中断，请检查连接" : "网络波动，重试中...";
        }
        this.isAnalyzing = false;
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
        this.audioContext.stop();
        this.onAudioFinished();
      }
      common_vendor.index.showToast({ title: this.isAudioEnabled ? "语音开启" : "语音关闭", icon: "none" });
    },
    playAudio(url) {
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
    },
    // ================================================================
    // 专业模式：三段流水线（PaliGemma→Qwen→VKSession）
    // ================================================================
    toggleProMode() {
      this.proMode = !this.proMode;
      if (this.proMode) {
        if (this.aiRunning)
          this.stopAI();
        if (this.grokRunning)
          this.stopGrok();
        this.aiMessage = "🔬 专业模式已开启 · 点击「分析场景」获取拍摄方案";
        this.$nextTick(() => this._initProCanvas());
      } else {
        this._stopProMode();
        this.aiMessage = "";
      }
    },
    _stopProMode() {
      this._stopBodyTracking();
      this.proMode = false;
      this.proPlan = null;
      this.proAnalyzing = false;
      this._proKps = {};
      this.proCanvasCtx = null;
      this.proCanvasNode = null;
    },
    // ── Stage 3a: 初始化 Canvas（type=2d，支持高 DPR） ──────────────
    _initProCanvas() {
      const query = common_vendor.index.createSelectorQuery().in(this);
      query.select("#proCanvas").fields({ node: true, size: true }).exec((res) => {
        if (!res[0] || !res[0].node)
          return;
        const canvas = res[0].node;
        const dpr = common_vendor.index.getSystemInfoSync().pixelRatio || 2;
        this.proCanvasWidth = res[0].width;
        this.proCanvasHeight = res[0].height;
        canvas.width = Math.round(res[0].width * dpr);
        canvas.height = Math.round(res[0].height * dpr);
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        this.proCanvasNode = canvas;
        this.proCanvasCtx = ctx;
      });
    },
    // ── Stage 1+2: 一键抓帧 → 发送后端 /pro-analyze ─────────────────
    triggerProAnalysis() {
      if (this.proAnalyzing)
        return;
      const ctx = common_vendor.index.createCameraContext();
      ctx.takePhoto({
        quality: "normal",
        success: (res) => {
          const path = res.tempFilePath || res.tempImagePath;
          if (!path)
            return;
          this.proAnalyzing = true;
          this.aiMessage = "⌛ PaliGemma 检测中...";
          utils_request.proAnalyzeApi(path, {
            tilt_angle: this.tiltAngle.toFixed(2),
            pitch_angle: this.pitchAngle.toFixed(2),
            estimated_distance: this.aiEstimatedDistance || "未知"
          }).then((res2) => {
            var _a, _b;
            this.proAnalyzing = false;
            if (res2.statusCode !== 200 || !((_a = res2.data) == null ? void 0 : _a.data)) {
              this.aiMessage = `❌ 分析失败: ${((_b = res2.data) == null ? void 0 : _b.error) || "请重试"}`;
              return;
            }
            this.proPlan = res2.data.data.plan;
            const pg = res2.data.data.paligemma_active ? "✅ PaliGemma+Qwen" : "✅ Qwen 视觉";
            this.aiMessage = `${pg} 方案已获取 · 姿态追踪启动中...`;
            this.$nextTick(() => {
              if (!this.proCanvasCtx)
                this._initProCanvas();
              setTimeout(() => this._startBodyTracking(false), 300);
            });
          }).catch(() => {
            this.proAnalyzing = false;
            this.aiMessage = "❌ 网络异常，请重试";
          });
        },
        fail: () => common_vendor.index.showToast({ title: "抓帧失败", icon: "none" })
      });
    },
    // ── 共用：onCameraFrame 架构（专业模式和骨骼模式共享）──────────
    //
    // 原 VKSession 卡死的根本原因：
    //   session.start() 后 AR 引擎在底层以相机原生帧率（30fps）持续跑骨架推理 pipeline。
    //   我们在 JS 层对 requestAnimationFrame 的节流只控制"什么时候读结果"，
    //   底层 GPU 推理负载从未减少，导致发烫卡死。
    //
    // 新架构：onCameraFrame 拿原始帧 → _isDetecting 硬锁控制推理频率
    //   → 推理完成才释放锁 → 主线程不会被帧堆积淹没。
    //
    _startBodyTracking(forSkeleton = false) {
      this._stopBodyTracking();
      this._smoothedKps = {};
      const cameraCtx = common_vendor.index.createCameraContext();
      _frameListener = cameraCtx.onCameraFrame(async (frame) => {
        if (_isDetecting)
          return;
        const now = Date.now();
        if (now - _lastInferTs < _INFER_INTERVAL)
          return;
        _lastInferTs = now;
        _isDetecting = true;
        try {
          const poses = await this._estimatePose(frame);
          if (poses && poses[0] && poses[0].keypoints) {
            const smoothed = this._applySmoothing(poses[0].keypoints, frame.width, frame.height);
            const kpMap = {};
            smoothed.forEach((kp, i) => {
              const name = _KP_NAMES[i];
              if (name && (kp.score ?? 1) > 0.3)
                kpMap[name] = { x: kp.x, y: kp.y };
            });
            this._proKps = kpMap;
            this._drawProOverlay();
            if (now - this._proHudTs > 500) {
              this._proHudTs = now;
              if (!forSkeleton && this.proPlan) {
                this.aiMessage = this._buildProGuideText();
              } else if (forSkeleton) {
                this.aiMessage = `🦴 检测到 ${Object.keys(kpMap).length} 个关键点`;
              }
            }
          } else {
            this._clearCanvas();
          }
        } catch (e) {
          common_vendor.index.__f__("error", "at pages/camera/index.vue:1005", "[Pose]", e);
        } finally {
          _isDetecting = false;
        }
      });
      _frameListener.start();
      common_vendor.index.showToast({ title: "骨骼追踪已启动", icon: "none" });
    },
    // ── 推理：onCameraFrame 原始帧 → JPEG → Flask /detect-pose → COCO-17 ─
    // TF.js 在微信小程序中受 2MB 包体积和沙箱限制无法直接运行；
    // 用现有 Flask 后端（YOLOv8n-pose）是最可靠的端云协同方案。
    async _estimatePose(frame) {
      var _a;
      const tempFilePath = await this._frameToJpeg(frame);
      if (!tempFilePath)
        return null;
      let res;
      try {
        res = await utils_request.detectPoseApi(tempFilePath);
      } catch (_) {
        return null;
      }
      if (res.statusCode !== 200 || !((_a = res.data) == null ? void 0 : _a.keypoints))
        return null;
      const kps = res.data.keypoints.map((kp) => ({
        x: kp.x * frame.width,
        y: kp.y * frame.height,
        score: kp.score
      }));
      return [{ keypoints: kps }];
    },
    // ── ArrayBuffer(RGBA) → JPEG 临时文件路径 ─────────────────────
    // 使用 wx.createOffscreenCanvas (基础库 2.7.0+) + wx.canvasToTempFilePath
    async _frameToJpeg(frame) {
      return new Promise((resolve) => {
        try {
          const canvas = common_vendor.wx$1.createOffscreenCanvas({
            type: "2d",
            width: frame.width,
            height: frame.height
          });
          const ctx = canvas.getContext("2d");
          const imgData = ctx.createImageData(frame.width, frame.height);
          imgData.data.set(new Uint8ClampedArray(frame.data));
          ctx.putImageData(imgData, 0, 0);
          common_vendor.wx$1.canvasToTempFilePath({
            canvas,
            fileType: "jpg",
            quality: 0.6,
            // 骨架检测不需要高清，60% 够用且体积小
            success: (r) => resolve(r.tempFilePath),
            fail: () => resolve(null)
          });
        } catch (e) {
          common_vendor.index.__f__("error", "at pages/camera/index.vue:1065", "[frameToJpeg]", e);
          resolve(null);
        }
      });
    },
    // ── EMA 平滑 + 像素坐标归一化（pixel → 0~1）─────────────────
    _applySmoothing(keypoints, frameW, frameH) {
      const ALPHA = 0.3;
      const W = frameW || 1;
      const H = frameH || 1;
      return keypoints.map((kp, i) => {
        const nx = kp.x / W;
        const ny = kp.y / H;
        const prev = this._smoothedKps[i];
        if (prev && (kp.score ?? 1) > 0.3) {
          prev.x = prev.x * (1 - ALPHA) + nx * ALPHA;
          prev.y = prev.y * (1 - ALPHA) + ny * ALPHA;
          return { ...kp, x: prev.x, y: prev.y };
        }
        if ((kp.score ?? 1) > 0.3)
          this._smoothedKps[i] = { x: nx, y: ny };
        return { ...kp, x: nx, y: ny };
      });
    },
    // ── 规则4：彻底停止帧监听，释放摄像头与推理锁 ─────────────────
    _stopBodyTracking() {
      if (_frameListener) {
        try {
          _frameListener.stop();
        } catch (_) {
        }
        _frameListener = null;
      }
      _isDetecting = false;
      this._proKps = {};
      this._smoothedKps = {};
      this._clearCanvas();
    },
    _clearCanvas() {
      if (this.proCanvasCtx && this.proCanvasWidth) {
        this.proCanvasCtx.clearRect(0, 0, this.proCanvasWidth, this.proCanvasHeight);
      }
    },
    // ── Canvas 绘制主入口 ──────────────────────────────────────────
    _drawProOverlay() {
      var _a;
      const ctx = this.proCanvasCtx;
      const W = this.proCanvasWidth;
      const H = this.proCanvasHeight;
      if (!ctx || !W || !H)
        return;
      ctx.clearRect(0, 0, W, H);
      const kpArray = _KP_NAMES.map((name) => this._proKps[name] ?? null);
      _drawSkeleton(ctx, kpArray, W, H);
      const targetKps = (_a = this.proPlan) == null ? void 0 : _a.target_keypoints;
      if (!targetKps)
        return;
      Object.entries(targetKps).forEach(([, [nx, ny]]) => {
        ctx.beginPath();
        ctx.arc(nx * W, ny * H, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(52,199,89,0.75)";
        ctx.shadowColor = "#34C759";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      _KP_NAMES.forEach((name, i) => {
        const actual = kpArray[i];
        const target = targetKps[name];
        if (!actual || !target)
          return;
        const devPx = Math.hypot((actual.x - target[0]) * W, (actual.y - target[1]) * H);
        if (devPx <= 10)
          return;
        ctx.beginPath();
        ctx.moveTo(actual.x * W, actual.y * H);
        ctx.lineTo(target[0] * W, target[1] * H);
        ctx.strokeStyle = "rgba(255,59,48,0.7)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    },
    // ── 构建专业模式 HUD 文字（含精确数字） ────────────────────────
    _buildProGuideText() {
      var _a, _b;
      if (!this.proPlan)
        return "";
      const plan = this.proPlan;
      const parts = [];
      const rot = plan.rotation_hint;
      if (rot && rot.degrees > 0.3) {
        const dir = rot.direction === "left" ? "左" : "右";
        const liveErr = Math.abs(this.tiltAngle).toFixed(1);
        parts.push(`📐 向${dir}转 ${rot.degrees.toFixed(1)}°（当前偏 ${liveErr}°）`);
      } else if (Math.abs(this.tiltAngle) > 1) {
        const dir = this.tiltAngle > 0 ? "左" : "右";
        parts.push(`📐 向${dir}转 ${Math.abs(this.tiltAngle).toFixed(1)}°`);
      }
      const dist = plan.distance_hint;
      if (dist && dist.cm > 5) {
        parts.push(`📏 ${dist.action === "move_back" ? "后退" : "前进"} ${dist.cm}cm`);
      }
      const W = this.proCanvasWidth || 375;
      const H = this.proCanvasHeight || 600;
      const nosePlan = (_a = plan.target_keypoints) == null ? void 0 : _a.nose;
      const noseActual = (_b = this._proKps) == null ? void 0 : _b.nose;
      if (nosePlan && noseActual) {
        const devPx = Math.round(Math.hypot(
          (noseActual.x - nosePlan[0]) * W,
          (noseActual.y - nosePlan[1]) * H
        ));
        parts.push(`🎯 头部偏 ${devPx}px`);
      }
      if (plan.framing_score !== void 0) {
        const e = plan.framing_score >= 80 ? "✨" : plan.framing_score >= 60 ? "👍" : "⚠️";
        parts.push(`${e} 构图 ${plan.framing_score}分`);
      }
      return parts.length > 0 ? parts.join(" · ") : plan.voice_guide || "保持当前姿势";
    },
    // ── 独立骨骼追踪模式 ────────────────────────────────────────────
    toggleSkeletonMode() {
      this.skeletonMode = !this.skeletonMode;
      if (this.skeletonMode) {
        if (this.aiRunning)
          this.stopAI();
        if (this.grokRunning)
          this.stopGrok();
        if (this.proMode)
          this._stopProMode();
        this.aiMessage = "🦴 骨骼追踪启动中...";
        this.$nextTick(() => {
          this._initProCanvas();
          setTimeout(() => this._startBodyTracking(true), 300);
        });
      } else {
        this._stopSkeletonMode();
      }
    },
    _stopSkeletonMode() {
      this._stopBodyTracking();
      this.skeletonMode = false;
      this.aiMessage = "";
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
    q: $data.levelLineTransform
  } : {}, {
    r: $data.aiMessage
  }, $data.aiMessage ? {
    s: common_vendor.t($data.isPerfect ? "✨" : $data.isSpeaking ? "🔊" : $data.isAnalyzing ? "⌛" : $data.grokRunning ? "🌐" : "🧠"),
    t: common_vendor.t($data.aiMessage),
    v: $data.isPerfect ? 1 : "",
    w: $data.isPerfect ? 1 : ""
  } : {}, {
    x: $data.cameraPosition,
    y: $data.flashMode,
    z: common_vendor.o((...args) => $options.onCameraError && $options.onCameraError(...args)),
    A: $data.isLevelEnabled
  }) : {}, {
    B: $data.proMode || $data.skeletonMode
  }, $data.proMode || $data.skeletonMode ? {} : {}, {
    C: $data.proMode
  }, $data.proMode ? {
    D: common_vendor.t($data.proAnalyzing ? "⌛" : "🎯"),
    E: common_vendor.t($data.proAnalyzing ? "分析中" : "分析场景"),
    F: common_vendor.o((...args) => $options.triggerProAnalysis && $options.triggerProAnalysis(...args))
  } : {}, {
    G: !$data.isAuth
  }, !$data.isAuth ? {
    H: common_vendor.o((...args) => $options.openSettings && $options.openSettings(...args))
  } : {}, {
    I: $data.smartMode === "person" ? 1 : "",
    J: common_vendor.o(($event) => $options.setSmartMode("person")),
    K: $data.smartMode === "object" ? 1 : "",
    L: common_vendor.o(($event) => $options.setSmartMode("object")),
    M: $data.smartMode === "scenery" ? 1 : "",
    N: common_vendor.o(($event) => $options.setSmartMode("scenery")),
    O: $data.smartMode === "" ? 1 : "",
    P: common_vendor.o(($event) => $options.setSmartMode("")),
    Q: $data.proMode ? 1 : "",
    R: common_vendor.o((...args) => $options.toggleProMode && $options.toggleProMode(...args)),
    S: common_vendor.o((...args) => $options.switchCamera && $options.switchCamera(...args)),
    T: common_vendor.t($options.flashDesc),
    U: common_vendor.o((...args) => $options.toggleFlash && $options.toggleFlash(...args)),
    V: common_vendor.o(($event) => $data.showTemplates = !$data.showTemplates),
    W: common_vendor.t($data.grokRunning ? "🟢" : "⚪"),
    X: common_vendor.o((...args) => $options.toggleGrok && $options.toggleGrok(...args)),
    Y: common_vendor.t($data.isAudioEnabled ? "🔊" : "🔇"),
    Z: common_vendor.o((...args) => $options.toggleAudio && $options.toggleAudio(...args)),
    aa: common_vendor.t($data.aiRunning ? "🟢" : "⚪"),
    ab: common_vendor.o((...args) => $options.toggleAI && $options.toggleAI(...args)),
    ac: common_vendor.t($data.isLevelEnabled ? "⚖️" : "⚪"),
    ad: common_vendor.o((...args) => $options.toggleLevel && $options.toggleLevel(...args)),
    ae: common_vendor.t($data.skeletonMode ? "🟢" : "🦴"),
    af: common_vendor.o((...args) => $options.toggleSkeletonMode && $options.toggleSkeletonMode(...args)),
    ag: common_vendor.o((...args) => $options.showIpConfig && $options.showIpConfig(...args)),
    ah: common_vendor.o((...args) => $options.takePhoto && $options.takePhoto(...args)),
    ai: $data.showTemplates
  }, $data.showTemplates ? {
    aj: $data.gridType === "none" ? 1 : "",
    ak: common_vendor.o(($event) => $options.setGrid("none")),
    al: $data.gridType === "nine" ? 1 : "",
    am: common_vendor.o(($event) => $options.setGrid("nine")),
    an: $data.gridType === "third" ? 1 : "",
    ao: common_vendor.o(($event) => $options.setGrid("third")),
    ap: common_vendor.o(($event) => $options.setTemplate("portrait")),
    aq: common_vendor.o(($event) => $options.setTemplate("food")),
    ar: common_vendor.o(($event) => $options.setTemplate("scenery")),
    as: common_vendor.o((...args) => $options.chooseAndUploadSketch && $options.chooseAndUploadSketch(...args)),
    at: common_vendor.o(($event) => $options.setTemplate("")),
    av: common_vendor.o(() => {
    }),
    aw: common_vendor.o(($event) => $data.showTemplates = false)
  } : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-3913aa5f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/camera/index.js.map
