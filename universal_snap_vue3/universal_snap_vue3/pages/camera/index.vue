<template>
  <view class="container">
    <view class="camera-area">
    <camera
      v-if="isAuth"
      :device-position="cameraPosition"
      :flash="flashMode"
      resolution="low"
      class="camera-view"
      @error="onCameraError"
      :enable-detect="isLevelEnabled"
    >
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
        <cover-view class="grid-v" style="left: 25%;"></cover-view>
        <cover-view class="grid-v" style="left: 50%;"></cover-view>
        <cover-view class="grid-v" style="left: 75%;"></cover-view>
        <cover-view class="grid-h" style="top: 25%;"></cover-view>
        <cover-view class="grid-h" style="top: 50%;"></cover-view>
        <cover-view class="grid-h" style="top: 75%;"></cover-view>
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
          :style="{ transform: levelLineTransform }"
        ></cover-view>
      </cover-view>

      <!-- 手势拍照：黄色高亮进度环，命中/触发时反馈防抖进度 -->
      <cover-view v-if="gestureMode" class="gesture-hud">
        <cover-view
          class="gesture-ring"
          :class="{ 'gesture-ring-active': isGestureDetected, 'gesture-ring-fire': isPhotoTriggered }"
          :style="{ borderColor: gestureHighlightColor, boxShadow: `0 0 24rpx ${gestureHighlightColor}` }"
        >
          <cover-view class="gesture-icon">✌️</cover-view>
        </cover-view>
        <cover-view v-if="isGestureDetected && !isPhotoTriggered" class="gesture-progress-text" :style="{ color: gestureHighlightColor }">
          保持中 {{ gestureProgressPercent }}%
        </cover-view>
        <cover-view
          v-if="isPhotoTriggered"
          class="gesture-confirm-badge"
          :style="{ borderColor: gestureHighlightColor, color: gestureHighlightColor }"
        >
          Pose Confirmed - Snap!
        </cover-view>
      </cover-view>

      <cover-view v-if="aiMessage" class="ai-bubble-wrap">
        <cover-view class="ai-bubble" :class="{'perfect-bubble': isPerfect}" :style="isPhotoTriggered ? { borderColor: gestureHighlightColor } : {}">
          <cover-view class="ai-text" :class="{'perfect-text': isPerfect}" :style="isPhotoTriggered ? { color: gestureHighlightColor } : {}">
            {{ isPerfect ? '✨' : (isPhotoTriggered ? '✌️' : (isSpeaking ? '🔊' : (isAnalyzing ? '⌛' : (grokRunning ? '🌐' : '🧠')))) }} {{ aiMessage }}
          </cover-view>
        </cover-view>
      </cover-view>
    </camera>

    <!-- Canvas 叠加层：专业模式 / 独立骨骼追踪 / 手势拍照(身体骨架+手部关节) 时显示 -->
    <canvas
      v-if="proMode || skeletonMode || gestureMode"
      type="2d"
      id="proCanvas"
      class="pro-canvas-overlay"
    ></canvas>

    <!-- 专业模式：一键分析触发按钮（悬浮在取景框右上角） -->
    <view v-if="proMode" class="pro-trigger-btn" @tap="triggerProAnalysis">
      <text class="pro-trigger-icon">{{ proAnalyzing ? '⌛' : '🎯' }}</text>
      <text class="pro-trigger-text">{{ proAnalyzing ? '分析中' : '分析场景' }}</text>
    </view>

    </view><!-- /camera-area -->

    <view v-if="!isAuth" class="permission-box" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:100;">
      <view class="permission-content">
        <view class="permission-icon">📸</view>
        <text class="p-text">需要相机权限才能使用自拍功能</text>
        <button class="p-btn" @tap="openSettings">授权相机</button>
      </view>
    </view>

    <view class="footer">
      <scroll-view class="mode-selector" scroll-x :show-scrollbar="false">
        <view class="mode-inner">
          <text class="mode-item" :class="{active: smartMode === 'person'}" @tap="setSmartMode('person')">👤 拍人</text>
          <text class="mode-item" :class="{active: smartMode === 'object'}" @tap="setSmartMode('object')">🍎 拍物</text>
          <text class="mode-item" :class="{active: smartMode === 'scenery'}" @tap="setSmartMode('scenery')">🏔️ 拍景</text>
          <text class="mode-item" :class="{active: smartMode === ''}" @tap="setSmartMode('')">🚫 自由</text>
          <text class="mode-item pro-mode-item" :class="{active: proMode}" @tap="toggleProMode">🔬 专业</text>
        </view>
      </scroll-view>

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
            <text class="emoji">{{ isLevelEnabled ? '⚖️' : '⚪' }}</text>
            <text class="desc">水平仪</text>
          </view>
          
          <view class="btn" @tap="toggleSkeletonMode">
            <text class="emoji">{{ skeletonMode ? '🟢' : '🦴' }}</text>
            <text class="desc">骨骼追踪</text>
          </view>

          <view class="btn" @tap="toggleGestureMode">
            <text class="emoji">{{ gestureMode ? '🟢' : '✌️' }}</text>
            <text class="desc">手势拍照</text>
          </view>

          <view class="btn" @tap="goToARMeasure">
            <text class="emoji">📡</text>
            <text class="desc">AR测距</text>
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
          <view class="tag" :class="{ active: gridType === 'none' }" @tap="setGrid('none')">无</view>
          <view class="tag" :class="{ active: gridType === 'nine' }" @tap="setGrid('nine')">九宫格</view>
          <view class="tag" :class="{ active: gridType === 'third' }" @tap="setGrid('third')">细分网格</view>
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
} from '@/utils/request.js';

// ====== 骨架追踪：模块级非响应式变量 ======
// ★ 严禁移入 data()！Vue Proxy 会拦截每次写入，每帧必卡 ★

let _isDetecting = false     // 推理异步硬锁（规则2核心）
let _frameListener = null    // onCameraFrame 监听器句柄（规则4清理用）
let _lastInferTs = 0         // 节流时间戳（双重保险）
const _INFER_INTERVAL = 200  // 5fps = 200ms

// ====== 手势拍照：模块级非响应式变量（同规则2/规则4，独立于骨架推理锁）======
let _isGestureDetecting = false      // 手势推理异步硬锁
let _gestureFrameListener = null     // 手势专属 onCameraFrame 句柄
let _lastGestureInferTs = 0          // 手势节流时间戳
const _GESTURE_INFER_INTERVAL = 150  // 剪刀手判定需要比骨架更灵敏，约 6-7fps
let _gestureHoldStartTs = 0          // 连续命中起始时间戳（墙钟计时，0=当前未在连续命中中）
const _GESTURE_HOLD_DURATION = 1500  // 剪刀手需连续保持 1.5s 才判定为拍摄确认，不受帧率抖动影响

// MediaPipe 21 点手部拓扑连接（绘制剪刀手识别时的手部关节连线）
const _HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // 拇指
  [0, 5], [5, 6], [6, 7], [7, 8],           // 食指
  [5, 9], [9, 10], [10, 11], [11, 12],      // 中指
  [9, 13], [13, 14], [14, 15], [15, 16],    // 无名指
  [13, 17], [17, 18], [18, 19], [19, 20],   // 小指
  [0, 17]                                    // 掌根
]

// COCO-17 索引 → 名称（匹配 Qwen target_keypoints 字段）
const _KP_NAMES = [
  'nose','left_eye','right_eye','left_ear','right_ear',
  'left_shoulder','right_shoulder','left_elbow','right_elbow',
  'left_wrist','right_wrist','left_hip','right_hip',
  'left_knee','right_knee','left_ankle','right_ankle'
]

// ── 骨架拓扑（COCO-17 主体 + MediaPipe-33 手部末端放射线）────────
// side: 'L'=左半身(青蓝) | 'R'=右半身(橙黄) | 'C'=主干(白)
// 手部射线（indices 17-22）在 COCO-17 模型下因关键点缺失自动跳过，
// 切换到 MediaPipe-33/YOLOv8-wholebody 后即刻生效，无需修改绘制代码。
const _SKELETON_PAIRS = [
  // 头部
  { a:  0, b:  1, side: 'L' },  // 鼻-左眼
  { a:  0, b:  2, side: 'R' },  // 鼻-右眼
  { a:  1, b:  3, side: 'L' },  // 左眼-左耳
  { a:  2, b:  4, side: 'R' },  // 右眼-右耳
  // 主干
  { a:  5, b:  6, side: 'C' },  // 左肩-右肩
  { a: 11, b: 12, side: 'C' },  // 左髋-右髋
  { a:  5, b: 11, side: 'L' },  // 左肩-左髋
  { a:  6, b: 12, side: 'R' },  // 右肩-右髋
  // 左臂
  { a:  5, b:  7, side: 'L' },  // 左肩-左肘
  { a:  7, b:  9, side: 'L' },  // 左肘-左腕
  // 右臂
  { a:  6, b:  8, side: 'R' },  // 右肩-右肘
  { a:  8, b: 10, side: 'R' },  // 右肘-右腕
  // 左腿
  { a: 11, b: 13, side: 'L' },  // 左髋-左膝
  { a: 13, b: 15, side: 'L' },  // 左膝-左踝
  // 右腿
  { a: 12, b: 14, side: 'R' },  // 右髋-右膝
  { a: 14, b: 16, side: 'R' },  // 右膝-右踝
  // 左手放射线（MediaPipe-33: 17=left_pinky 19=left_index 21=left_thumb）
  { a:  9, b: 17, side: 'L' },  // 左腕-左小拇指
  { a:  9, b: 19, side: 'L' },  // 左腕-左食指
  { a:  9, b: 21, side: 'L' },  // 左腕-左拇指
  // 右手放射线（MediaPipe-33: 18=right_pinky 20=right_index 22=right_thumb）
  { a: 10, b: 18, side: 'R' },  // 右腕-右小拇指
  { a: 10, b: 20, side: 'R' },  // 右腕-右食指
  { a: 10, b: 22, side: 'R' },  // 右腕-右拇指
]

// 极客科技感配色
const _COLORS = { L: '#00FFFF', R: '#FF8C42', C: '#FFFFFF' }

// 关键点索引 → 色组（模块级，避免每帧重建 Set）
const _KP_SIDE = (() => {
  const m = {}
  ;[1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21].forEach(i => (m[i] = 'L'))
  ;[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].forEach(i => (m[i] = 'R'))
  return m
})()

// ── 火柴人骨架绘制（纯原生 Canvas，零 Vue 响应式调用）───────────
// keypoints : [{x, y, score?}, ...]（坐标已归一化 0~1，对应 _KP_NAMES 索引）
// W / H     : Canvas 像素尺寸
function _drawSkeleton(ctx, keypoints, W, H) {
  const MIN_SCORE = 0.3
  const ok = (kp) => kp != null && (kp.score ?? 1) >= MIN_SCORE

  // ── 第一层：骨骼连线（带霓虹发光描边）──────────────────────────
  _SKELETON_PAIRS.forEach(({ a, b, side }) => {
    const ka = keypoints[a]
    const kb = keypoints[b]
    if (!ok(ka) || !ok(kb)) return

    const color = _COLORS[side]
    ctx.beginPath()
    ctx.moveTo(ka.x * W, ka.y * H)
    ctx.lineTo(kb.x * W, kb.y * H)
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.78
    ctx.lineWidth = side === 'C' ? 2.5 : 2
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = 9
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  })

  // ── 第二层：关节节点（实心圆 + 白色描边，鼻子略大标示头部朝向）─
  keypoints.forEach((kp, i) => {
    if (!ok(kp) || i > 22) return

    const side = _KP_SIDE[i] ?? 'C'
    const color = _COLORS[side]
    const x = kp.x * W
    const y = kp.y * H
    const r = i === 0 ? 7 : 5   // 鼻子节点 r=7，其余 r=5

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 14
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1.2
    ctx.stroke()
  })
}

// ── 手部关节连线绘制（剪刀手识别专用，金黄色统一高亮）─────────────
// landmarks: [{x, y}, ...]（21 点，坐标已归一化 0~1）
function _drawHandLandmarks(ctx, landmarks, W, H) {
  const color = '#FFD700'

  _HAND_CONNECTIONS.forEach(([a, b]) => {
    const pa = landmarks[a]
    const pb = landmarks[b]
    if (!pa || !pb) return
    ctx.beginPath()
    ctx.moveTo(pa.x * W, pa.y * H)
    ctx.lineTo(pb.x * W, pb.y * H)
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  })

  landmarks.forEach((p, i) => {
    if (!p) return
    const r = (i === 8 || i === 12) ? 5 : 3.5   // 食指尖/中指尖：剪刀手判定关键点，略大标示

    ctx.beginPath()
    ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1
    ctx.stroke()
  })
}

export default {
  data() {
    return {
      username: '', 
      
      // 相机状态
      cameraPosition: 'back',
      isAuth: false,
      flashMode: 'off',
      gridType: 'nine',
      activeTemplate: '',
      templateName: '',
      customSketchUrl: '',
      showTemplates: false,
      
      // AI分析与模式
      smartMode: '',
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
      aiMessage: '',
      
      // 水平仪与传感器状态
      isLevelEnabled: false, 
      tiltAngle: 0,           
      levelLineTransform: 'rotate(0deg)',
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
      
      smX: undefined,
      smY: undefined,
      smZ: undefined,
      
      // 系统
      audioContext: null,
      serverUrl: '',

      // 专业模式
      proMode: false,
      proAnalyzing: false,
      proPlan: null,              // Qwen 下发的拍摄方案 JSON
      proVKSession: null,         // 保留字段（兼容旧引用，新架构不再使用）
      proCanvasNode: null,        // canvas 2d node
      proCanvasCtx: null,         // canvas 2d context
      proCanvasWidth: 0,
      proCanvasHeight: 0,
      // 注意：proActualKeypoints 已移至非响应式实例变量 this._proKps
      // 避免 VKSession 每帧写入触发 Vue diff 造成卡顿

      // 独立骨骼追踪模式
      skeletonMode: false,

      // 手势拍照模式（剪刀手触发）
      gestureMode: false,
      isGestureDetected: false,   // 当前帧原始识别信号（未防抖）
      gestureProgress: 0,         // 0~1 防抖进度，供 UI 进度环/高亮强度绑定
      isPhotoTriggered: false,    // 防抖满足、拍照触发后短暂置真（用于高亮闪烁反馈）
      gestureHighlightColor: '#FFD700'  // 系统提示/高亮色，统一黄色，可在此处或作为 prop 传入自定义
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
      let dist = HAND_HEIGHT / Math.tan(theta);
      
      if (dist > 15) return "> 15m";
      return dist.toFixed(2) + "m";
    },
    gestureProgressPercent() {
      return Math.round(this.gestureProgress * 100);
    }
  },
  onLoad() {
    this.serverUrl = getBaseUrl();
    this.initCamera();
    this.initAudioContext();
    // 非响应式实例变量（每帧写入但不触发 Vue re-render）
    this._proKps = {};         // name-keyed 关键点，供 _buildProGuideText 和 _drawProOverlay 读取
    this._smoothedKps = {};    // EMA 平滑缓冲（key = COCO-17 索引）
    this._proHudTs = 0;        // HUD 文字限流时间戳
    // _poseDetector 已由后端 /detect-pose 接口替代，无需前端模型实例
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
    this._stopGestureMode();
  },
  methods: {
    // === 拍摄模式选择 ===
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

    // === 传感器与水平仪功能 ===
    toggleLevel() {
      this.isLevelEnabled = !this.isLevelEnabled;
      if (this.isLevelEnabled) {
        this.smX = undefined;
        this.startLevelSensor();
      } else {
        this.stopLevelSensor();
        this.isLeveled = false;
        this.isFlat = false;
        this.tiltAngle = 0;
        this.smoothedAngle = 0;
        this.pitchAngle = 0;
        this.smoothedPitch = 0;
        this.levelLineTransform = 'rotate(0deg)';
      }
    },
    
    startLevelSensor() {
      this.levelFrameApi = typeof wx !== 'undefined' ? wx : uni;
      this.levelSensorFrame = null;
      if (!this.levelCallback || this.levelCallback._rafVersion !== true) {
        this.levelCallback = (res) => { this.levelSensorFrame = res; };
        this.levelCallback._rafVersion = true;
      }
      uni.startAccelerometer({
        interval: 'ui', 
        success: () => {
          uni.offAccelerometerChange(this.levelCallback);
          uni.onAccelerometerChange(this.levelCallback);
          this.startLevelFrameLoop();
        },
        fail: (err) => { console.log("传感器启动失败", err); }
      });
    },

    stopLevelSensor() {
      if (this.levelCallback) uni.offAccelerometerChange(this.levelCallback);
      if (this.levelFrameId) {
        if (this.levelFrameApi && this.levelFrameApi.cancelAnimationFrame) {
          this.levelFrameApi.cancelAnimationFrame(this.levelFrameId);
        } else {
          clearTimeout(this.levelFrameId);
        }
        this.levelFrameId = null;
      }
      this.levelSensorFrame = null;
      uni.stopAccelerometer();
    },

    startLevelFrameLoop() {
      if (this.levelFrameId) return;
      const requestFrame = (callback) => {
        if (this.levelFrameApi && this.levelFrameApi.requestAnimationFrame) {
          return this.levelFrameApi.requestAnimationFrame(callback);
        }
        return setTimeout(callback, 16);
      };
      const tick = () => {
        if (!this.isLevelEnabled) return;
        this.updateLevelFrame();
        this.levelFrameId = requestFrame(tick);
      };
      this.levelFrameId = requestFrame(tick);
    },

    updateLevelFrame() {
      const res = this.levelSensorFrame;
      if (!res) return;

      // 1. 三轴低通滤波 (过滤手部抖动)
      if (typeof this.smX === 'undefined') {
        this.smX = res.x; this.smY = res.y; this.smZ = res.z;
        this.smoothedAngle = Math.atan2(this.smX, -this.smY) * (180 / Math.PI);
        this.smoothedPitch = Math.asin(Math.max(-1, Math.min(1, this.smZ))) * (180 / Math.PI);
      }
      this.smX = this.smX * 0.85 + res.x * 0.15;
      this.smY = this.smY * 0.85 + res.y * 0.15;
      this.smZ = this.smZ * 0.85 + res.z * 0.15;

      // 2. 检测平放状态 (防止万向节死锁)
      if (Math.abs(this.smZ) > 0.85) {
        if (!this.isFlat) this.isFlat = true;
        if (this.isLeveled) this.isLeveled = false;
        return; 
      }
      if (this.isFlat) this.isFlat = false;

      // 3. 计算偏航角 (Roll) 并处理 360° 跳变
      let targetAngle = Math.atan2(this.smX, -this.smY) * (180 / Math.PI);
      let diff = targetAngle - this.smoothedAngle;
      while (diff <= -180) diff += 360;
      while (diff > 180) diff -= 360;
      this.smoothedAngle += diff * 0.12;

      // 4. 俯仰角 (Pitch)
      let targetPitch = Math.asin(Math.max(-1, Math.min(1, this.smZ))) * (180 / Math.PI);
      this.smoothedPitch += (targetPitch - this.smoothedPitch) * 0.12;
      this.pitchAngle = this.smoothedPitch;

      // 5. 磁吸吸附逻辑
      const snapped = Math.round(this.smoothedAngle / 90) * 90;
      const snapDiff = Math.abs(this.smoothedAngle - snapped);
      const nextLeveled = snapDiff < 3.5;
      const nextAngle = nextLeveled ? -snapped : -this.smoothedAngle;

      if (nextLeveled && !this.isLeveled) {
        const now = Date.now();
        if (now - this.lastVibrateTime > 1000) {
          uni.vibrateShort();
          this.lastVibrateTime = now;
        }
      }
      if (this.isLeveled !== nextLeveled) this.isLeveled = nextLeveled;
      
      if (Math.abs(nextAngle - this.levelLastRenderAngle) > 0.1) {
        this.levelLastRenderAngle = nextAngle;
        this.tiltAngle = nextAngle;
        this.levelLineTransform = `rotate(${nextAngle}deg)`;
      }
    },

    // === 其他功能保持不变 ===
    chooseAndUploadSketch() {
      uni.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'], 
        success: (res) => {
          const filePath = res.tempFiles[0].tempFilePath;
          uni.showLoading({ title: '生成线稿中...' });
          
          generateSketchApi(filePath)
            .then((uploadRes) => {
              uni.hideLoading();
              if (uploadRes.statusCode === 200) {
                const data = uploadRes.data;
                if (data.sketchUrl) {
                  this.customSketchUrl = data.sketchUrl;
                  this.activeTemplate = ''; 
                  this.templateName = '';
                  this.showTemplates = false; 
                  uni.showToast({ title: '线稿已加载', icon: 'success' });
                }
              } else {
                uni.showToast({ title: '生成失败', icon: 'none' });
              }
            })
            .catch(() => {
              uni.hideLoading();
              uni.showToast({ title: '上传失败，请检查网络', icon: 'none' });
            });
        }
      });
    },

    toggleGrok() {
      this.grokRunning = !this.grokRunning;
      if (this.grokRunning) {
        if (this.aiRunning) this.stopAI();
        if (this.gestureMode) this._stopGestureMode();
        this.aiMessage = 'Grok 模式已启动...';
        this.isAnalyzing = false;
        this.analyzeGrokScene();
        this.grokTimer = setInterval(this.analyzeGrokScene, 5000);
      } else {
        this.stopGrok();
      }
    },
    stopGrok() {
      if (this.grokTimer) clearInterval(this.grokTimer);
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
      grokAnalyzeApi(filePath)
        .then((res) => {
          if (this.grokRunning && res.statusCode === 200) {
            const data = res.data;
            if (data.advice) {
              this.aiMessage = `[Grok] ${data.advice}`;
              this.grokFailCount = 0;
            }
          }
          this.isAnalyzing = false;
        })
        .catch(() => {
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
        if (this.grokRunning) this.stopGrok();
        if (this.gestureMode) this._stopGestureMode();
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
              }
            }
            this.isAnalyzing = false;
          })
          .catch(() => {
            this.aiFailCount++;
            if (this.aiRunning) {
              this.aiMessage = this.aiFailCount >= 3 ? "网络持续中断，请检查连接" : "网络波动，重试中...";
            }
            this.isAnalyzing = false;
          });
        return;
      }

      smartAnalyzeApi(filePath, {
        mode: this.smartMode,
        tilt_angle: Math.round(this.tiltAngle).toString(),
        need_audio: this.isAudioEnabled ? 'true' : 'false'
      })
        .then((res) => {
          if (this.aiRunning && res.statusCode === 200) {
            const response = res.data;
            if (response.code === 200 && response.data) {
              const aiData = response.data;
              this.aiFailCount = 0;

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
          }
          this.isAnalyzing = false;
        })
        .catch(() => {
          this.aiFailCount++;
          if (this.aiRunning) {
            this.aiMessage = this.aiFailCount >= 3 ? "网络持续中断，请检查连接" : "网络波动，重试中...";
          }
          this.isAnalyzing = false;
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
      // 每次播放前新建实例：复用单一长期实例会被微信回收，
      // 再操作时报 "operateAudio:fail audioInstance is not set"
      if (this.audioContext) {
        try { this.audioContext.destroy(); } catch (e) {}
      }
      this.audioContext = uni.createInnerAudioContext();
      this.audioContext.obeyMuteSwitch = false; // iOS 静音拨片下仍播报，与 environment 页保持一致
      this.audioContext.onEnded(() => this.onAudioFinished());
      this.audioContext.onError((err) => {
        console.error('[audio] play error:', err, 'src=', this.audioContext && this.audioContext.src);
        uni.showToast({ title: '播放失败:' + (err && err.errMsg || '未知'), icon: 'none' });
        this.onAudioFinished();
      });
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
        this.audioContext.stop();
        this.onAudioFinished();
      }
      uni.showToast({ title: this.isAudioEnabled ? '语音开启' : '语音关闭', icon: 'none' });
    },
    playAudio(url) {
      this.isSpeaking = true;
      this.initAudioContext(); // 重建实例，避免复用被回收的实例
      // 本地文件(temp/http already downloaded)直接播；网络地址先下载到本地再播，
      // 规避微信 innerAudioContext 无法直接播放网络 http mp3 的问题
      if (/^https?:\/\//i.test(url)) {
        uni.downloadFile({
          url,
          success: (res) => {
            if (res.statusCode === 200 && res.tempFilePath) {
              this.audioContext.src = res.tempFilePath;
              this.audioContext.play();
            } else {
              console.error('[audio] downloadFile bad status:', res.statusCode);
              this.onAudioFinished();
            }
          },
          fail: (err) => {
            console.error('[audio] downloadFile fail:', err);
            uni.showToast({ title: '语音下载失败:' + (err && err.errMsg || '未知'), icon: 'none' });
            this.onAudioFinished();
          }
        });
      } else {
        this.audioContext.src = url;
        this.audioContext.play();
      }
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
    onCameraError() { uni.showToast({ title: '相机异常', icon: 'none' }); },

    // ================================================================
    // 专业模式：三段流水线（PaliGemma→Qwen→VKSession）
    // ================================================================

    toggleProMode() {
      this.proMode = !this.proMode;
      if (this.proMode) {
        // 专业模式与其他 AI 模式互斥
        if (this.aiRunning) this.stopAI();
        if (this.grokRunning) this.stopGrok();
        if (this.gestureMode) this._stopGestureMode();
        this.aiMessage = '🔬 专业模式已开启 · 点击「分析场景」获取拍摄方案';
        // 初始化 Canvas（需等组件渲染完成）
        this.$nextTick(() => this._initProCanvas());
      } else {
        this._stopProMode();
        this.aiMessage = '';
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
      const query = uni.createSelectorQuery().in(this);
      query.select('#proCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const dpr = (uni.getSystemInfoSync().pixelRatio) || 2;
        this.proCanvasWidth = res[0].width;
        this.proCanvasHeight = res[0].height;
        canvas.width = Math.round(res[0].width * dpr);
        canvas.height = Math.round(res[0].height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this.proCanvasNode = canvas;
        this.proCanvasCtx = ctx;
      });
    },

    // ── Stage 1+2: 一键抓帧 → 发送后端 /pro-analyze ─────────────────
    triggerProAnalysis() {
      if (this.proAnalyzing) return;
      const ctx = uni.createCameraContext();
      ctx.takePhoto({
        quality: 'normal',
        success: (res) => {
          const path = res.tempFilePath || res.tempImagePath;
          if (!path) return;
          this.proAnalyzing = true;
          this.aiMessage = '⌛ PaliGemma 检测中...';

          proAnalyzeApi(path, {
            tilt_angle: this.tiltAngle.toFixed(2),
            pitch_angle: this.pitchAngle.toFixed(2),
            estimated_distance: this.aiEstimatedDistance || '未知',
          }).then((res) => {
            this.proAnalyzing = false;
            if (res.statusCode !== 200 || !res.data?.data) {
              this.aiMessage = `❌ 分析失败: ${res.data?.error || '请重试'}`;
              return;
            }
            this.proPlan = res.data.data.plan;
            const pg = res.data.data.paligemma_active ? '✅ PaliGemma+Qwen' : '✅ Qwen 视觉';
            this.aiMessage = `${pg} 方案已获取 · 姿态追踪启动中...`;
            // 若 canvas 尚未初始化（第一次触发），给 nextTick 时间挂载节点
            this.$nextTick(() => {
              if (!this.proCanvasCtx) this._initProCanvas();
              setTimeout(() => this._startBodyTracking(false), 300);
            });
          }).catch(() => {
            this.proAnalyzing = false;
            this.aiMessage = '❌ 网络异常，请重试';
          });
        },
        fail: () => uni.showToast({ title: '抓帧失败', icon: 'none' }),
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
      this._stopBodyTracking();   // 先清旧监听，防重入
      this._smoothedKps = {};

      const cameraCtx = uni.createCameraContext();

      // ★ 规则4：保存句柄，onUnload/onHide 时 stop() 彻底释放摄像头 ★
      _frameListener = cameraCtx.onCameraFrame(async (frame) => {
        // ★ 规则2：异步推理硬锁——第一句就 return，绝对不堆帧 ★
        if (_isDetecting) return;

        // 规则1 第二道防线：时间戳节流 5fps
        const now = Date.now();
        if (now - _lastInferTs < _INFER_INTERVAL) return;
        _lastInferTs = now;

        _isDetecting = true;
        try {
          const poses = await this._estimatePose(frame);
          if (poses && poses[0] && poses[0].keypoints) {
            // 规则1：坐标归一化 + EMA 平滑，弥补低帧率跳点感
            const smoothed = this._applySmoothing(poses[0].keypoints, frame.width, frame.height);

            // ★ 规则3：构建 name-keyed map → 直接调 Canvas API，不写 Vue data ★
            const kpMap = {};
            smoothed.forEach((kp, i) => {
              const name = _KP_NAMES[i];
              if (name && (kp.score ?? 1) > 0.3) kpMap[name] = { x: kp.x, y: kp.y };
            });
            this._proKps = kpMap;     // 非响应式写入，_buildProGuideText / _drawProOverlay 读取
            this._drawProOverlay();   // 直接操作 Canvas 2D，完全绕过 Vue 响应式

            // HUD 文字：每 500ms 最多触发一次 Vue diff
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
          console.error('[Pose]', e);
        } finally {
          // ★ 规则2：无论成功失败必须释放锁，哪怕 1s 只处理 2 帧也没关系 ★
          _isDetecting = false;
        }
      });

      _frameListener.start();
      uni.showToast({ title: '骨骼追踪已启动', icon: 'none' });
    },

    // ── 推理：onCameraFrame 原始帧 → JPEG → Flask /detect-pose → COCO-17 ─
    // TF.js 在微信小程序中受 2MB 包体积和沙箱限制无法直接运行；
    // 用现有 Flask 后端（YOLOv8n-pose）是最可靠的端云协同方案。
    async _estimatePose(frame) {
      // 1. 将 ArrayBuffer(RGBA) 编码为 JPEG 临时文件
      const tempFilePath = await this._frameToJpeg(frame);
      if (!tempFilePath) return null;

      // 2. 上传至后端推理，10s 超时（本地局域网通常 <200ms）
      let res;
      try {
        res = await detectPoseApi(tempFilePath);
      } catch (_) {
        return null;
      }
      if (res.statusCode !== 200 || !res.data?.keypoints) return null;

      // 3. 后端返回归一化坐标 (0~1)，还原为帧像素坐标
      //    _applySmoothing 内部会再次 /frameW /frameH 归一化，保持管线一致
      const kps = res.data.keypoints.map(kp => ({
        x:     kp.x * frame.width,
        y:     kp.y * frame.height,
        score: kp.score
      }));
      return [{ keypoints: kps }];
    },

    // ── ArrayBuffer(RGBA) → JPEG 临时文件路径 ─────────────────────
    // 使用 wx.createOffscreenCanvas (基础库 2.7.0+) + wx.canvasToTempFilePath
    async _frameToJpeg(frame) {
      return new Promise((resolve) => {
        try {
          const canvas = wx.createOffscreenCanvas({
            type: '2d',
            width:  frame.width,
            height: frame.height
          });
          const ctx = canvas.getContext('2d');
          const imgData = ctx.createImageData(frame.width, frame.height);
          imgData.data.set(new Uint8ClampedArray(frame.data));
          ctx.putImageData(imgData, 0, 0);
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'jpg',
            quality: 0.6,       // 骨架检测不需要高清，60% 够用且体积小
            success: (r) => resolve(r.tempFilePath),
            fail:    ()  => resolve(null)
          });
        } catch (e) {
          console.error('[frameToJpeg]', e);
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
        if ((kp.score ?? 1) > 0.3) this._smoothedKps[i] = { x: nx, y: ny };
        return { ...kp, x: nx, y: ny };
      });
    },

    // ── 规则4：彻底停止帧监听，释放摄像头与推理锁 ─────────────────
    _stopBodyTracking() {
      // ★ 规则4 核心：stop() 彻底断开 onCameraFrame，释放摄像头占用 ★
      if (_frameListener) {
        try { _frameListener.stop(); } catch (_) {}
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
      const ctx = this.proCanvasCtx
      const W   = this.proCanvasWidth
      const H   = this.proCanvasHeight
      if (!ctx || !W || !H) return

      ctx.clearRect(0, 0, W, H)

      // name-keyed _proKps → COCO-17 索引数组（_drawSkeleton 所需格式）
      // 缺失的关键点为 null，_drawSkeleton 内部 ok(null)=false 自动跳过
      const kpArray = _KP_NAMES.map(name => this._proKps[name] ?? null)

      // ★ 规则1：调用封装好的火柴人绘制函数，无任何 fillText ★
      _drawSkeleton(ctx, kpArray, W, H)

      // ── 专业模式附加层：目标点（绿色光晕）+ 偏差连线（红色虚线）──
      // 骨骼模式下 proPlan 为空，直接跳过，零开销
      const targetKps = this.proPlan?.target_keypoints
      if (!targetKps) return

      // 绿色目标关键点（Qwen 方案下发的参考姿态）
      Object.entries(targetKps).forEach(([, [nx, ny]]) => {
        ctx.beginPath()
        ctx.arc(nx * W, ny * H, 11, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(52,199,89,0.75)'
        ctx.shadowColor = '#34C759'
        ctx.shadowBlur = 12
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 2
        ctx.stroke()
      })

      // 红色虚线偏差连线（实际位置 → 目标位置，偏差 >10px 才显示）
      _KP_NAMES.forEach((name, i) => {
        const actual = kpArray[i]
        const target = targetKps[name]
        if (!actual || !target) return
        const devPx = Math.hypot((actual.x - target[0]) * W, (actual.y - target[1]) * H)
        if (devPx <= 10) return
        ctx.beginPath()
        ctx.moveTo(actual.x * W, actual.y * H)
        ctx.lineTo(target[0] * W, target[1] * H)
        ctx.strokeStyle = 'rgba(255,59,48,0.7)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 5])
        ctx.stroke()
        ctx.setLineDash([])
      })
    },

    // ── 构建专业模式 HUD 文字（含精确数字） ────────────────────────
    _buildProGuideText() {
      if (!this.proPlan) return '';
      const plan = this.proPlan;
      const parts = [];

      // 旋转：Qwen 建议值 + 实时传感器双重校验
      const rot = plan.rotation_hint;
      if (rot && rot.degrees > 0.3) {
        const dir = rot.direction === 'left' ? '左' : '右';
        const liveErr = Math.abs(this.tiltAngle).toFixed(1);
        parts.push(`📐 向${dir}转 ${rot.degrees.toFixed(1)}°（当前偏 ${liveErr}°）`);
      } else if (Math.abs(this.tiltAngle) > 1.0) {
        const dir = this.tiltAngle > 0 ? '左' : '右';
        parts.push(`📐 向${dir}转 ${Math.abs(this.tiltAngle).toFixed(1)}°`);
      }

      // 距离
      const dist = plan.distance_hint;
      if (dist && dist.cm > 5) {
        parts.push(`📏 ${dist.action === 'move_back' ? '后退' : '前进'} ${dist.cm}cm`);
      }

      // 头部实时偏差（从非响应式 _proKps 读取）
      const W = this.proCanvasWidth || 375;
      const H = this.proCanvasHeight || 600;
      const nosePlan = plan.target_keypoints?.nose;
      const noseActual = this._proKps?.nose;
      if (nosePlan && noseActual) {
        const devPx = Math.round(Math.hypot(
          (noseActual.x - nosePlan[0]) * W,
          (noseActual.y - nosePlan[1]) * H
        ));
        parts.push(`🎯 头部偏 ${devPx}px`);
      }

      // 构图评分
      if (plan.framing_score !== undefined) {
        const e = plan.framing_score >= 80 ? '✨' : plan.framing_score >= 60 ? '👍' : '⚠️';
        parts.push(`${e} 构图 ${plan.framing_score}分`);
      }

      return parts.length > 0 ? parts.join(' · ') : (plan.voice_guide || '保持当前姿势');
    },

    // ── 独立骨骼追踪模式 ────────────────────────────────────────────
    // ── 跳转到独立的 AR 测距页面（wx.createVKSession 引擎，见 pages/ar/index）──
    // 先关掉所有占用摄像头 onCameraFrame 通道的模式，避免和目标页面抢摄像头硬件
    goToARMeasure() {
      if (this.aiRunning) this.stopAI();
      if (this.grokRunning) this.stopGrok();
      if (this.proMode) this._stopProMode();
      if (this.skeletonMode) this._stopSkeletonMode();
      if (this.gestureMode) this._stopGestureMode();
      uni.navigateTo({ url: '/pages/ar/index' });
    },

    toggleSkeletonMode() {
      this.skeletonMode = !this.skeletonMode;
      if (this.skeletonMode) {
        if (this.aiRunning) this.stopAI();
        if (this.grokRunning) this.stopGrok();
        if (this.proMode) this._stopProMode();
        if (this.gestureMode) this._stopGestureMode();
        this.aiMessage = '🦴 骨骼追踪启动中...';
        this.$nextTick(() => {
          this._initProCanvas();
          // canvas 初始化是异步的，稍等再启动 VKSession
          setTimeout(() => this._startBodyTracking(true), 300);
        });
      } else {
        this._stopSkeletonMode();
      }
    },

    _stopSkeletonMode() {
      this._stopBodyTracking();
      this.skeletonMode = false;
      this.aiMessage = '';
    },

    // ================================================================
    // 手势拍照：全身姿态 + 剪刀手（V字手势）融合识别 → 防抖确认 → takePhoto()
    // 复用现有 onCameraFrame 端云协同数据流（同 _startBodyTracking 的
    // "硬锁 + 节流" 架构），但作为独立的并行模块，不与骨架追踪模式共用锁。
    // /detect-gesture 单次请求融合返回：手部 21 点关键点（几何算法判定剪刀手，
    // 见后端 _is_scissor_hand）+ 身体 17 点骨骼（YOLOv8n-pose），前端同屏渲染。
    // ================================================================
    toggleGestureMode() {
      this.gestureMode = !this.gestureMode;
      if (this.gestureMode) {
        // 与其余取景/追踪类模式互斥：共享同一颗摄像头 onCameraFrame 通道，
        // 同时开多路会重复占用相机硬件，导致规则2/规则4描述的发烫卡死问题
        if (this.aiRunning) this.stopAI();
        if (this.grokRunning) this.stopGrok();
        if (this.proMode) this._stopProMode();
        if (this.skeletonMode) this._stopSkeletonMode();
        this.aiMessage = '✌️ 手势拍照已开启 · 比出剪刀手保持约1.5秒自动拍照';
        this.$nextTick(() => {
          this._initProCanvas();
          // canvas 初始化是异步的，稍等再启动帧监听
          setTimeout(() => this._startGestureTracking(), 300);
        });
      } else {
        this._stopGestureMode();
      }
    },

    _startGestureTracking() {
      this._stopGestureTracking();
      _gestureHoldStartTs = 0;
      this.gestureProgress = 0;
      this.isGestureDetected = false;
      this._gestureHandLm = null;
      this._gestureBodyKps = null;

      const cameraCtx = uni.createCameraContext();
      _gestureFrameListener = cameraCtx.onCameraFrame(async (frame) => {
        // 异步推理硬锁：绝不堆帧（同规则2）
        if (_isGestureDetecting) return;

        const now = Date.now();
        if (now - _lastGestureInferTs < _GESTURE_INFER_INTERVAL) return;
        _lastGestureInferTs = now;

        _isGestureDetecting = true;
        try {
          const detected = await this._estimateGesture(frame);
          this._applyGestureDebounce(detected);
        } catch (e) {
          console.error('[Gesture]', e);
        } finally {
          _isGestureDetecting = false;
        }
      });

      _gestureFrameListener.start();
    },

    // ── 推理：复用骨架追踪同款 frame→JPEG 编码，上传后端 /detect-gesture ──
    // 响应中同时含手部 21 点 + 身体 17 点，非响应式存入 this._gesture*
    // （同 this._proKps 模式，避免每帧触发 Vue diff 卡顿）供 Canvas 直接绘制
    async _estimateGesture(frame) {
      const tempFilePath = await this._frameToJpeg(frame);
      if (!tempFilePath) return false;

      let res;
      try {
        res = await detectGestureApi(tempFilePath);
      } catch (_) {
        return false;
      }
      if (res.statusCode !== 200 || !res.data) return false;

      this._gestureHandLm = res.data.landmarks || null;
      this._gestureBodyKps = res.data.keypoints || null;
      this._drawGestureOverlay();

      return !!res.data.is_scissor;
    },

    // ── Canvas 绘制：身体骨架 + (最多双手)手部关节连线同屏渲染 ──────
    // this._gestureHandLm 现为"每只手一个 21 点数组"的数组，最多 2 只手
    _drawGestureOverlay() {
      const ctx = this.proCanvasCtx;
      const W = this.proCanvasWidth;
      const H = this.proCanvasHeight;
      if (!ctx || !W || !H) return;

      ctx.clearRect(0, 0, W, H);
      if (this._gestureBodyKps) _drawSkeleton(ctx, this._gestureBodyKps, W, H);
      if (this._gestureHandLm) {
        this._gestureHandLm.forEach((hand) => _drawHandLandmarks(ctx, hand, W, H));
      }
    },

    // ── 防抖核心：连续命中满 _GESTURE_HOLD_DURATION(1.5s) 才判定为拍摄确认 ──
    // 用墙钟时间而非帧数计时，避免网络延迟抖动导致实际保持时长偏离预期。
    // 单帧误检（手部一晃而过）不会触发拍照，只有稳定保持满 1.5s 才算数
    _applyGestureDebounce(detected) {
      this.isGestureDetected = detected;
      const now = Date.now();

      if (!detected) {
        _gestureHoldStartTs = 0;
        this.gestureProgress = 0;
        return;
      }

      if (!_gestureHoldStartTs) _gestureHoldStartTs = now;
      const heldMs = now - _gestureHoldStartTs;
      this.gestureProgress = Math.min(heldMs / _GESTURE_HOLD_DURATION, 1);

      if (heldMs >= _GESTURE_HOLD_DURATION) {
        _gestureHoldStartTs = 0;
        this._triggerGesturePhoto();
      }
    },

    // ── 动作确认后统一抛出 takePhoto()，与手动快门走同一条拍照路径 ──
    _triggerGesturePhoto() {
      this.isPhotoTriggered = true;
      this.aiMessage = '✌️ 手势确认！拍摄中...';
      uni.vibrateLong();
      this.takePhoto();

      setTimeout(() => {
        this.isPhotoTriggered = false;
        this.gestureProgress = 0;
        if (this.gestureMode) {
          this.aiMessage = '✌️ 手势拍照已开启 · 比出剪刀手保持约1.5秒自动拍照';
        }
      }, 1500);
    },

    _stopGestureTracking() {
      if (_gestureFrameListener) {
        try { _gestureFrameListener.stop(); } catch (_) {}
        _gestureFrameListener = null;
      }
      _isGestureDetecting = false;
      _gestureHoldStartTs = 0;
    },

    _stopGestureMode() {
      this._stopGestureTracking();
      this.gestureMode = false;
      this.isGestureDetected = false;
      this.gestureProgress = 0;
      this.isPhotoTriggered = false;
      this.aiMessage = '';
      this._gestureHandLm = null;
      this._gestureBodyKps = null;
      this._clearCanvas();
    }
  }
};
</script>

<style scoped>
.container {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.camera-view {
  flex: 1;
  width: 100%;
  position: relative;
  overflow: hidden;
  background: #1a1a1e;
  border-radius: 0 0 48rpx 48rpx;
  box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.08);
}

/* === HUD 数据看板 (适配浅色主题风格) === */
.hud-panel {
  position: absolute;
  top: 40rpx;
  left: 40rpx;
  background: rgba(255, 248, 240, 0.85); 
  backdrop-filter: blur(8px);
  padding: 16rpx 28rpx;
  border-radius: 24rpx;
  border: 1px solid rgba(255, 205, 165, 0.6);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  pointer-events: none;
  z-index: 20;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06);
}

.hud-text {
  color: #EF6C3E; 
  font-size: 24rpx;
  font-weight: 600;
  font-family: monospace; 
}

/* 完美构图绿框高亮 */
.perfect-border {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  border: 12rpx solid #34C759; box-sizing: border-box;
  box-shadow: inset 0 0 40rpx rgba(52, 199, 89, 0.4);
  pointer-events: none; z-index: 10;
}

.grid-v {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.55);
}

.grid-h {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.55);
}

.v1 { left: 33.33%; }
.v2 { left: 66.66%; }
.h1 { top: 33.33%; }
.h2 { top: 66.66%; }

.template-box {
  position: absolute;
  top: 15%;
  left: 10%;
  width: 80%;
  height: 60%;
  border: 3rpx dashed rgba(255, 140, 66, 0.7);
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 32rpx;
  background: rgba(255, 245, 230, 0.15);
  backdrop-filter: blur(4px);
}

.template-box.portrait {
  border-radius: 50%;
  border-color: rgba(255, 140, 66, 0.9);
  height: 50%;
  top: 10%;
  box-shadow: 0 0 40rpx rgba(255, 140, 66, 0.2);
}

.template-box.food {
  border-color: rgba(255, 179, 71, 0.9);
  height: 40%;
  top: 30%;
  box-shadow: 0 0 30rpx rgba(255, 179, 71, 0.15);
}

.template-box.scenery {
  border-left: none;
  border-right: none;
  width: 100%;
  left: 0;
  top: 35%;
  height: 30%;
}

.template-text {
  margin-top: -40rpx;
  color: #FF8C42;
  background: rgba(255, 255, 245, 0.92);
  font-size: 24rpx;
  padding: 10rpx 24rpx;
  border-radius: 48rpx;
  font-weight: 600;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.08);
  backdrop-filter: blur(4px);
}

.ai-bubble-wrap {
  position: absolute;
  bottom: 140rpx;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  padding: 0 32rpx;
  pointer-events: none;
  z-index: 10;
}

.ai-bubble {
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  border: 1px solid rgba(255, 205, 165, 0.6);
  border-radius: 48rpx;
  padding: 20rpx 36rpx;
  display: flex;
  flex-direction: column;
  max-width: 88%;
  box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(12px);
  transition: all 0.3s;
}

.ai-bubble.perfect-bubble { 
  background: linear-gradient(135deg, rgba(240, 255, 244, 0.98) 0%, rgba(220, 255, 230, 0.95) 100%);
  border-color: rgba(52, 199, 89, 0.6); 
  transform: scale(1.05); 
}

.ai-text {
  color: #EF6C3E;
  font-size: 30rpx;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  font-weight: 500;
  transition: all 0.3s;
}

.ai-text.perfect-text { color: #34C759; font-weight: bold; }

/* 手势拍照：黄色高亮进度环（颜色统一由 gestureHighlightColor 内联绑定，非硬编码） */
.gesture-hud {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  pointer-events: none;
  z-index: 15;
}

.gesture-ring {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 215, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.08);
  transition: all 0.15s ease-out;
}

.gesture-ring.gesture-ring-active {
  border-width: 6rpx;
  transform: scale(1.08);
}

.gesture-ring.gesture-ring-fire {
  transform: scale(1.25);
  background: rgba(255, 215, 0, 0.25);
}

.gesture-icon {
  font-size: 64rpx;
  line-height: 1;
}

.gesture-progress-text {
  font-size: 24rpx;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.45);
  padding: 6rpx 20rpx;
  border-radius: 24rpx;
}

/* 极简状态提示框：剪刀手防抖确认后显示，黄色统一高亮，无红色等杂色 */
.gesture-confirm-badge {
  font-size: 26rpx;
  font-weight: 700;
  letter-spacing: 0.5rpx;
  background: rgba(0, 0, 0, 0.55);
  border: 2rpx solid;
  padding: 10rpx 28rpx;
  border-radius: 12rpx;
}

.level-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 240rpx;
  height: 240rpx;
  transform: translate(-50%, -50%);
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 5;
}

.crosshair-v {
  position: absolute;
  width: 3rpx;
  height: 50rpx;
  background: rgba(255, 140, 66, 0.9);
  border-radius: 2rpx;
}

.crosshair-h {
  position: absolute;
  width: 50rpx;
  height: 3rpx;
  background: rgba(255, 140, 66, 0.9);
  border-radius: 2rpx;
}

/* 【关键修复点】：仅移除了 transform 的 transition 动画，保留原生 UI */
.dynamic-line {
  position: absolute;
  width: 200rpx;
  height: 4rpx;
  background: rgba(255, 140, 66, 0.9);
  transform-origin: center;
  border-radius: 4rpx;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  will-change: transform;
}

.line-leveled {
  background: linear-gradient(90deg, #FFB347, #FF8C42);
  height: 5rpx;
  box-shadow: 0 0 20rpx rgba(255, 140, 66, 0.7);
}

.line-flat {
  opacity: 0.2;
}

.permission-box {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.permission-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 64rpx 48rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  border-radius: 48rpx;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 245, 230, 0.8);
  box-shadow: 0 20rpx 48rpx -16rpx rgba(255, 140, 66, 0.12);
}

.permission-icon {
  font-size: 120rpx;
  margin-bottom: 36rpx;
  animation: iconBreathe 2s ease-in-out infinite;
}

@keyframes iconBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.p-text {
  color: #5B6E8C;
  font-size: 32rpx;
  margin-bottom: 36rpx;
  line-height: 1.6;
  font-weight: 500;
}

.p-btn {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  border-radius: 48rpx;
  padding: 28rpx 72rpx;
  font-size: 30rpx;
  font-weight: 650;
  border: none;
  box-shadow: 0 16rpx 32rpx -10rpx rgba(255, 110, 97, 0.35);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.p-btn:active {
  transform: scale(0.96);
  box-shadow: 0 8rpx 16rpx -6rpx rgba(255, 110, 97, 0.4);
}

.footer {
  background: linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255, 248, 240, 0.92) 100%);
  backdrop-filter: blur(24px);
  border-top: 1px solid rgba(255, 245, 230, 0.8);
  border-radius: 48rpx 48rpx 0 0;
  padding-top: 12rpx;
  padding-bottom: env(safe-area-inset-bottom, 24rpx);
  box-shadow: 0 -12rpx 32rpx rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

/* 模式选择器（已改为 scroll-view，样式移至专业模式区块统一定义）*/
.mode-item { 
  color: #9CA8B8; font-size: 28rpx; font-weight: 500; transition: all 0.25s; 
  padding: 12rpx 32rpx; border-radius: 40rpx; background: rgba(255, 248, 240, 0.8);
}
.mode-item.active { 
  color: #fff; background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%); 
  font-weight: 600; transform: scale(1.05); box-shadow: 0 8rpx 16rpx rgba(255, 110, 97, 0.3);
}

/* 工具栏滚动区 (适配原版 UI) */
.tools-scroll {
  width: 100%; white-space: nowrap; margin-bottom: 20rpx; height: 130rpx;
}
.tools-inner {
  display: inline-flex; padding: 0 32rpx; gap: 40rpx; align-items: center; height: 100%;
}

.btn {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center; 
  min-width: 100rpx; padding: 16rpx 8rpx; border-radius: 32rpx; transition: all 0.25s;
}
.btn:active {
  background: rgba(255, 140, 66, 0.1);
  transform: scale(0.96);
}

.emoji {
  font-size: 48rpx;
  margin-bottom: 8rpx;
  color: #FF8C42;
  transition: transform 0.2s;
}

.desc {
  color: #9CA8B8;
  font-size: 24rpx;
  font-weight: 500;
}

.btn:active .emoji {
  transform: scale(0.9);
}

.shutter-zone {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-bottom: 10rpx;
}

.shutter-outer {
  width: 152rpx;
  height: 152rpx;
  border: 6rpx solid rgba(255, 140, 66, 0.4);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 245, 230, 0.3);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 12rpx 32rpx rgba(255, 140, 66, 0.1);
}

.shutter-outer:active {
  transform: scale(0.92);
  border-color: #FF8C42;
  background: rgba(255, 140, 66, 0.12);
}

.shutter-inner {
  width: 120rpx;
  height: 120rpx;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  border-radius: 50%;
  transition: all 0.25s;
  box-shadow: 0 8rpx 20rpx rgba(255, 110, 97, 0.4);
}

.shutter-outer:active .shutter-inner {
  transform: scale(0.95);
}

.panel-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  z-index: 99;
  display: flex;
  align-items: flex-end;
}

.panel {
  width: 100%;
  background: linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(255, 248, 240, 0.98) 100%);
  border-radius: 48rpx 48rpx 0 0;
  padding: 48rpx 32rpx;
  box-shadow: 0 -16rpx 40rpx rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255, 245, 230, 0.8);
  animation: panelSlideUp 0.3s ease;
  max-height: 70vh;
  overflow-y: auto;
}

@keyframes panelSlideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.panel-header {
  color: #9CA8B8;
  font-size: 28rpx;
  margin-bottom: 24rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid rgba(255, 245, 230, 0.8);
  text-align: center;
  font-weight: 600;
  letter-spacing: 1px;
}

.grid-row {
  display: flex;
  gap: 24rpx;
  margin-bottom: 48rpx;
  justify-content: center;
}

.tag {
  background: linear-gradient(135deg, #fff8f0 0%, #ffffff 100%);
  color: #5B6E8C;
  padding: 16rpx 40rpx;
  border-radius: 48rpx;
  font-size: 28rpx;
  font-weight: 500;
  transition: all 0.25s;
  border: 1px solid rgba(255, 245, 230, 0.8);
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.02);
}

.tag.active {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  border: none;
  box-shadow: 0 12rpx 24rpx -8rpx rgba(255, 110, 97, 0.35);
}

.tag:active {
  transform: scale(0.96);
}

.template-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
  justify-content: center;
}

.t-item {
  background: linear-gradient(135deg, #fff8f0 0%, #ffffff 100%);
  color: #5B6E8C;
  padding: 20rpx 36rpx;
  border-radius: 48rpx;
  font-size: 28rpx;
  font-weight: 500;
  transition: all 0.25s;
  border: 1px solid rgba(255, 245, 230, 0.8);
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.02);
}

.t-item.custom {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: white;
  border: none;
  box-shadow: 0 12rpx 24rpx -8rpx rgba(255, 110, 97, 0.35);
}

.t-item.clear {
  background: rgba(255, 140, 66, 0.06);
  color: #EF6C3E;
  border-color: rgba(255, 140, 66, 0.2);
}

.t-item:active {
  transform: scale(0.96);
}

.custom-sketch-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.4;
  pointer-events: none;
  background: transparent;
}

/* ===================== 专业模式 ===================== */

/* camera-area 作为相机 + canvas 的共同定位父容器 */
.camera-area {
  flex: 1;
  width: 100%;
  position: relative;
  overflow: hidden;
}

/* 重写 camera-view：撑满 camera-area */
.camera-view {
  width: 100% !important;
  height: 100% !important;
  flex: unset !important;
  background: #1a1a1e;
  border-radius: 0 0 48rpx 48rpx;
}

/* Canvas 骨骼追踪层：绝对定位覆盖相机，z-index 高于 cover-view */
.pro-canvas-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 30;
  border-radius: 0 0 48rpx 48rpx;
}

/* 一键分析悬浮按钮 */
.pro-trigger-btn {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  z-index: 40;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.92) 0%, rgba(99, 102, 241, 0.88) 100%);
  border-radius: 40rpx;
  padding: 18rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  backdrop-filter: blur(12px);
  box-shadow: 0 8rpx 24rpx rgba(79, 70, 229, 0.4);
  border: 1px solid rgba(255,255,255,0.2);
  transition: all 0.2s;
}
.pro-trigger-btn:active {
  transform: scale(0.94);
  box-shadow: 0 4rpx 12rpx rgba(79, 70, 229, 0.5);
}
.pro-trigger-icon {
  font-size: 48rpx;
}
.pro-trigger-text {
  color: #fff;
  font-size: 22rpx;
  font-weight: 600;
}

/* 专业模式按钮：紫色渐变区别于橙色系 */
.mode-selector {
  width: 100%;
  white-space: nowrap;
  padding: 16rpx 0 20rpx;
}
.mode-inner {
  display: inline-flex;
  padding: 0 24rpx;
  gap: 16rpx;
  align-items: center;
  min-width: 100%;
  justify-content: center;
}
.pro-mode-item.active {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  box-shadow: 0 8rpx 16rpx rgba(99, 102, 241, 0.4) !important;
}
</style>