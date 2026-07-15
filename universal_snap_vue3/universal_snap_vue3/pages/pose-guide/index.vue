<template>
  <view class="container">
    <view class="camera-area">
      <camera
        v-if="isAuth"
        :device-position="cameraPosition"
        flash="off"
        class="camera-view"
        :style="{ filter: currentFilterCss }"
        @error="onCameraError"
      >
        <!-- 自拍/后置切换：前置摄像头才能一边看模板/进度环一边自己摆姿势 -->
        <cover-view class="flip-btn" @tap="switchCamera">🔄</cover-view>

        <!-- 需求2：纯视觉叠加模式——骨骼打分系统整体关闭，只显示提示条 -->
        <cover-view v-if="isRunning && isPureOverlayMode" class="overlay-mode-badge">
          👁️ {{ $t('poseGuide.pureOverlayBadge') }}
        </cover-view>

        <!-- 打分模式下的状态指示器：统一黄色边框，颜色不随分数变化，只变浓淡/粗细/发光强度 -->
        <cover-view
          v-if="isRunning && !isPureOverlayMode"
          class="pose-ring"
          :class="{ 'pose-ring-locked': isLocked }"
          :style="{ borderColor: ringColor }"
        ></cover-view>

        <cover-view v-if="!isRunning" class="hint-bubble">
          <cover-view class="hint-text">{{ $t('poseGuide.loadTemplateHint') }}</cover-view>
        </cover-view>

        <cover-view v-if="isRunning && !isPureOverlayMode && lockProgress > 0 && !isLocked" class="pose-progress-text">
          {{ $t('poseGuide.locking', { percent: Math.round(lockProgress * 100) }) }}
        </cover-view>
        <cover-view v-if="isRunning && !isPureOverlayMode && !isLocked" class="pose-score-text">
          {{ $t('poseGuide.matchScore', { score: similarityScore }) }}
          <cover-view v-if="coverageRatio < 70" class="coverage-hint">⚠️ {{ $t('poseGuide.coverageWarning', { percent: coverageRatio }) }}</cover-view>
        </cover-view>
        <cover-view v-if="isRunning && !isPureOverlayMode && isLocked" class="pose-confirm-badge">
          ✨ {{ autoCountdownEnabled ? $t('poseGuide.poseLocked') : $t('poseGuide.poseLockedManualShutter') }}
        </cover-view>

        <!-- 需求5：AI 语义指导文本 -->
        <cover-view v-if="isRunning && !isPureOverlayMode && guidanceText" class="guidance-text">
          💡 {{ guidanceText }}
        </cover-view>

        <!-- 倒计时连拍：锁定后如果开启了自动倒计时，大数字覆盖在画面正中 -->
        <cover-view v-if="countdownValue > 0" class="countdown-number">{{ countdownValue }}</cover-view>

        <!-- 快门瞬间白屏闪烁反馈 -->
        <cover-view class="flash-overlay" :class="{ 'flash-active': isFlashing }"></cover-view>
      </camera>

      <!-- Canvas 叠加层：只在打分模式下挂载，画用户实时关键点；纯视觉模式不跑推理，没必要挂 -->
      <canvas v-if="isRunning && !isPureOverlayMode" type="2d" id="poseCanvas" class="pose-canvas-overlay"></canvas>

      <!-- 需求3：画中画自由拖拽/双指缩放，废弃了固定左上角缩略图 -->
      <movable-area v-if="templateThumb" class="pip-area">
        <movable-view
          class="pip-view"
          direction="all"
          :scale="true"
          scale-min="0.4"
          scale-max="3"
          :x="pipX"
          :y="pipY"
          :scale-value="pipScale"
          @change="onPipChange"
          @scale="onPipScale"
        >
          <image
            :src="templateThumb"
            class="pip-image"
            :style="{ opacity: isPureOverlayMode ? overlayOpacity : 1 }"
            mode="aspectFit"
          ></image>
          <cover-view v-if="isPureOverlayMode" class="opacity-btn" @tap.stop="cycleOverlayOpacity">◐</cover-view>
        </movable-view>
      </movable-area>

      <view v-if="!isAuth" class="permission-box">
        <view class="p-icon">📷</view>
        <text class="p-text">{{ $t('poseGuide.needCameraPermission') }}</text>
        <button class="p-btn" @tap="initCamera">{{ $t('poseGuide.authorize') }}</button>
      </view>
    </view>

    <view class="footer">
      <view class="template-row">
        <input
          class="url-input"
          v-model="templateUrlInput"
          :placeholder="$t('poseGuide.urlPlaceholder')"
          :disabled="isLoadingTemplate"
        />
        <button class="mini-btn" :disabled="isLoadingTemplate" @tap="loadTemplateFromUrl">
          {{ isLoadingTemplate ? $t('poseGuide.recognizing') : $t('common.loadAction') }}
        </button>
        <button class="mini-btn" :disabled="isLoadingTemplate" @tap="loadTemplateFromAlbum">{{ $t('poseGuide.chooseFromAlbum') }}</button>
        <view v-if="templateThumb && !usingPreset" class="star-btn" @tap="favoriteCurrentTemplate">★</view>
      </view>

      <!-- 需求：内置常见姿势模板库 + 收藏的照片模板，同一条横滑列表 -->
      <scroll-view class="library-row" scroll-x :show-scrollbar="false">
        <view class="library-inner">
          <view
            v-for="f in favorites"
            :key="'fav-' + f.savedFilePath"
            class="library-item favorite-item"
            @tap="loadFavorite(f)"
          >
            <image :src="f.savedFilePath" class="library-thumb" mode="aspectFill" />
            <view class="library-remove" @tap.stop="removeFavorite(f)">✕</view>
          </view>
          <view
            v-for="p in presetOptions"
            :key="p.id"
            class="library-item preset-item"
            :class="{ active: usingPreset && selectedPresetId === p.id }"
            @tap="selectPreset(p)"
          >
            <text class="library-icon">{{ p.icon }}</text>
            <text class="library-label">{{ $t('poseGuide.presets.' + p.id) }}</text>
          </view>
        </view>
      </scroll-view>

      <scroll-view class="filter-row" scroll-x :show-scrollbar="false">
        <view class="filter-inner">
          <text
            v-for="f in filterOptions"
            :key="f.key"
            class="filter-item"
            :class="{ active: filterName === f.key }"
            @tap="filterName = f.key"
          >{{ $t('poseGuide.filters.' + f.key) }}</text>
        </view>
      </scroll-view>

      <view class="action-row">
        <button class="ghost-btn" @tap="goBack">{{ $t('common.back') }}</button>
        <button class="main-btn" :disabled="!templateThumb" @tap="toggleRunning">
          {{ runningButtonText }}
        </button>
        <view
          v-if="!isPureOverlayMode"
          class="countdown-toggle"
          :class="{ active: autoCountdownEnabled }"
          @tap="autoCountdownEnabled = !autoCountdownEnabled"
        >⏱ {{ $t('poseGuide.countdownToggle') }}</view>
      </view>

      <!-- 需求4：交互权转移——快门默认置灰，姿态对齐(或纯视觉模式下始终)才激活，激活色统一 #FFD700 -->
      <view class="shutter-zone">
        <view
          class="shutter-outer"
          :class="{ 'shutter-active': canShutterFire }"
          @tap="onShutterTap"
        >
          <view class="shutter-inner" :class="{ 'shutter-inner-active': canShutterFire }"></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { detectPoseApi } from '@/utils/request.js';
import { calculatePoseSimilarity, cocoArrayToNamedPoints, generateAIPrompt, LIMB_DEFS } from '@/utils/poseSimilarity.js';
import { fetchTemplateLandmarks, extractLandmarksFromLocalPath, TemplatePoseError } from '@/utils/poseTemplate.js';
import { POSE_PRESETS } from '@/utils/posePresets.js';
import { requestPermission } from '@/utils/permission.js';

const FAVORITES_STORAGE_KEY = 'poseGuideFavorites';
const MAX_FAVORITES = 20; // 收藏上限，超过时淘汰最旧的一条并释放其永久存储文件

const SCORE_SMOOTH_ALPHA = 0.3; // 分数 EMA 平滑系数，和骨骼追踪的关键点平滑用同一套经验值
const COUNTDOWN_SECONDS = 3;    // 倒计时连拍：锁定后再等 3 秒自动拍照，给用户留出摆稳的时间

// 偏差最大的肢体单独高亮成洋红色，与"未锁定青色/已锁定金色"的骨架线区分开
const WORST_LIMB_COLOR = '#FF3B8D';

// 骨架线绘制专用的中点解析：只取 x/y（不需要 score，绘制时已经是筛过的检出点），
// ref 可以是单个关键点名，也可以是多个关键点名取中点（对应 LIMB_DEFS 里 torso 的写法）
function _resolveMidpointForDraw(points, ref) {
  const names = Array.isArray(ref) ? ref : [ref];
  let sx = 0, sy = 0;
  for (const name of names) {
    const p = points[name];
    if (!p) return null;
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / names.length, y: sy / names.length };
}

// ====== 骨架追踪：模块级非响应式变量 ======
// 同 camera/index.vue 的既有约定：绝不放进 data()，Vue Proxy 拦截写入会导致每帧卡顿
let _frameListener = null;   // onCameraFrame 句柄
let _isDetecting = false;    // 推理异步硬锁
let _lastInferTs = 0;        // 节流时间戳
const _INFER_INTERVAL = 200; // 5fps，与项目其余骨架追踪模式一致

let _lockStartTs = 0;        // "连续达标"起始墙钟时间，0=当前未在连续达标中

const LOCK_THRESHOLD = 85;   // 相似度达标线（百分比）
const LOCK_HOLD_MS = 1200;   // 连续保持 1000~1500ms 区间取中值，判定 Pose Locked
const HIGHLIGHT_COLOR = '#FFD700'; // 统一高亮色，不使用红色或其他颜色

// 极简滤镜方案：CSSgram 思路对 <camera> 施加 filter；能否生效取决于机型/基础库
// （原生组件同层渲染的支持程度不一）。无论预览是否生效，拍照后都会用同一套字符串
// 在 canvas 2d 上 ctx.filter 重新渲染一遍，保证保存到相册的照片滤镜一定生效。
const FILTERS = {
  none:  'none',
  warm:  'saturate(1.15) sepia(0.18) contrast(1.05)',
  cool:  'saturate(1.05) hue-rotate(-8deg) contrast(1.05)',
  bw:    'grayscale(1) contrast(1.1)',
  vivid: 'saturate(1.35) contrast(1.1)',
};

export default {
  data() {
    return {
      isAuth: false,
      // 默认前置：姿态引导拍摄的核心场景是自拍——一边看模板/进度环一边自己摆姿势，
      // 需要别人帮拍或用三脚架时再点右上角 🔄 切到后置
      cameraPosition: 'front',
      templateUrlInput: '',
      templateLandmarks: null,   // null 时表示"无可用骨骼数据"，可能是没加载模板，也可能是纯视觉模式
      templateThumb: '',
      isLoadingTemplate: false,

      // 需求2：纯视觉叠加降级——模板图识别不出人体（常见于二次元/动漫图）时置 true，
      // 该模式下不跑打分/不跑 onCameraFrame 推理，模板图变成半透明图层纯靠肉眼对齐
      isPureOverlayMode: false,
      overlayOpacity: 0.55,

      isRunning: false,
      similarityScore: 0,
      coverageRatio: 100,   // 本轮实际参与打分的肢体权重占比，低于阈值时提示"仅比对部分身体"
      isLocked: false,
      lockProgress: 0,
      guidanceText: '',
      isFlashing: false,

      // 内置姿势模板库 + 收藏
      presetOptions: POSE_PRESETS,
      usingPreset: false,
      selectedPresetId: '',
      favorites: [],

      // 倒计时连拍：锁定后可选自动倒数拍照，替代"必须自己精准按快门"
      autoCountdownEnabled: false,
      countdownValue: 0,

      // 需求3：PiP 自由拖拽/缩放的受控状态
      pipX: 200,
      pipY: 120,
      pipScale: 1,

      filterName: 'none',
      // 显示名走 poseGuide.filters.<key> 翻译键，这里只留 key
      filterOptions: [
        { key: 'none' },
        { key: 'warm' },
        { key: 'cool' },
        { key: 'bw' },
        { key: 'vivid' },
      ],

      poseCanvasWidth: 0,
      poseCanvasHeight: 0,
    };
  },
  computed: {
    currentFilterCss() {
      return FILTERS[this.filterName] || 'none';
    },
    // 状态指示器：颜色恒定为黄色，仅透明度随匹配度提升——满足"绝不使用红色/杂色"的约束
    ringColor() {
      const alpha = 0.25 + 0.55 * (Math.min(this.similarityScore, 100) / 100);
      return `rgba(255, 215, 0, ${alpha.toFixed(2)})`;
    },
    runningButtonText() {
      if (this.isPureOverlayMode) return this.isRunning ? this.$t('poseGuide.stopReference') : this.$t('poseGuide.showReference');
      return this.isRunning ? this.$t('poseGuide.stopMatching') : this.$t('poseGuide.startMatching');
    },
    // 需求4：纯视觉模式没有打分能力，快门始终可用（回归"你自己判断"）；
    // 打分模式下必须 isLocked 才激活，交互权完全交给用户自己按快门
    canShutterFire() {
      return this.isRunning && (this.isPureOverlayMode || this.isLocked);
    },
  },
  onLoad() {
    // #ifdef APP-PLUS
    // 本页依赖 <camera> 页内取景 + onCameraFrame 帧流，均为小程序专属能力；
    // App-vue 端挂载 <camera> 会让渲染管线崩溃(页面僵死)，这里直接拦截并退回
    uni.showModal({
      title: this.$t('poseGuide.title'),
      content: this.$t('camera.mpOnlyFeature'),
      showCancel: false,
      success: () => uni.navigateBack()
    });
    return;
    // #endif

    // #ifndef APP-PLUS
    this._userKps = null;
    this.poseCanvasNode = null;
    this.poseCanvasCtx = null;
    this._smoothedScore = 0;      // EMA 平滑后的分数，非响应式中间量
    this._lastLimbScores = {};    // 最近一次各肢体单独得分，供骨架高亮读取
    this._lastMaxErrorLimb = null;
    this._countdownTimer = null;
    this.favorites = uni.getStorageSync(FAVORITES_STORAGE_KEY) || [];
    this.initCamera();
    // #endif
  },
  onHide() {
    this._stopPoseGuide();
  },
  onUnload() {
    this._stopPoseGuide();
  },
  methods: {
    goBack() {
      this._stopPoseGuide();
      uni.navigateBack();
    },

    initCamera() {
      // uni.authorize 是微信小程序专属 API，App 端(APP-PLUS)没有这个函数，直接调用会同步抛
      // TypeError，摄像头权限永远申请不到。统一走 utils/permission.js 的跨端封装。
      requestPermission('camera')
        .then(() => { this.isAuth = true; })
        .catch(() => { uni.showToast({ title: this.$t('poseGuide.needCameraPermission'), icon: 'none' }); });
    },
    onCameraError() {
      uni.showToast({ title: this.$t('poseGuide.cameraError'), icon: 'none' });
    },

    // 前置(自拍)/后置切换：<camera> 是原生组件，device-position 变化会让组件重新挂载，
    // 已有的 onCameraFrame 句柄会失效，切换前先停掉追踪、切完再按原状态重启，避免黑屏/空转
    switchCamera() {
      const wasRunning = this.isRunning;
      if (wasRunning) this._stopPoseGuide();

      this.cameraPosition = this.cameraPosition === 'back' ? 'front' : 'back';
      uni.vibrateShort();

      if (wasRunning) {
        this.$nextTick(() => {
          this.isRunning = true;
          if (!this.isPureOverlayMode) this._initPoseCanvas();
          setTimeout(() => this._startPoseGuide(), 300);
        });
      }
    },

    // ================================================================
    // 模块一 + 需求2：模板图加载（网络 URL / 本地相册），失败时按 recoverable 决定
    // 是硬失败还是降级为纯视觉叠加模式
    // ================================================================
    loadTemplateFromUrl() {
      const url = this.templateUrlInput.trim();
      if (!url) {
        uni.showToast({ title: this.$t('poseGuide.pasteUrlFirst'), icon: 'none' });
        return;
      }
      this.isLoadingTemplate = true;
      fetchTemplateLandmarks(url)
        .then(({ landmarks, localPath }) => this._onTemplateReady(landmarks, localPath))
        .catch((err) => this._onTemplateError(err))
        .finally(() => { this.isLoadingTemplate = false; });
    },

    loadTemplateFromAlbum() {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        success: (res) => {
          const path = res.tempFilePaths?.[0];
          if (!path) return;
          this.isLoadingTemplate = true;
          extractLandmarksFromLocalPath(path)
            .then(({ landmarks, localPath }) => this._onTemplateReady(landmarks, localPath))
            .catch((err) => this._onTemplateError(err))
            .finally(() => { this.isLoadingTemplate = false; });
        },
      });
    },

    _onTemplateReady(landmarks, localPath) {
      this.isPureOverlayMode = false;
      this.usingPreset = false;
      this.selectedPresetId = '';
      this.templateLandmarks = landmarks;
      this.templateThumb = localPath;
      uni.showToast({ title: this.$t('poseGuide.templateLoadSuccess'), icon: 'none' });
    },

    // 需求2 核心：识别失败不阻断流程——只要还有本地图（recoverable），就降级为纯视觉叠加模式
    _onTemplateError(err) {
      if (err instanceof TemplatePoseError && err.recoverable && err.localPath) {
        this.isPureOverlayMode = true;
        this.usingPreset = false;
        this.selectedPresetId = '';
        this.templateLandmarks = null;
        this.templateThumb = err.localPath;
        uni.showToast({ title: this.$t('poseGuide.fallbackToOverlay'), icon: 'none' });
        return;
      }
      // err.key 是 poseTemplate.js 里定义好的翻译键，err.message 只是固定中文兜底供 console 调试
      const msg = err instanceof TemplatePoseError ? this.$t(err.key) : this.$t('poseGuide.templateLoadFailed');
      uni.showToast({ title: msg, icon: 'none' });
    },

    // ================================================================
    // 内置姿势模板库：直接是手写关键点坐标，不涉及图片/网络/识别失败
    // ================================================================
    selectPreset(preset) {
      this._stopPoseGuide();
      this.isPureOverlayMode = false;
      this.usingPreset = true;
      this.selectedPresetId = preset.id;
      this.templateLandmarks = preset.landmarks;
      this.templateThumb = ''; // 预设没有照片，PiP 区域不显示图（模板行为通过 usingPreset 区分）
      uni.showToast({ title: this.$t('poseGuide.presetSelected', { name: this.$t('poseGuide.presets.' + preset.id) }), icon: 'none' });
    },

    // ================================================================
    // 收藏：用 ImageManager.saveFile 把临时图存成永久本地文件，收藏项直接存关键点，
    // 下次加载不用重新下载/重新识别，秒开
    // ================================================================
    async favoriteCurrentTemplate() {
      if (!this.templateThumb || this.usingPreset) return;
      const landmarksSnapshot = this.templateLandmarks;
      const isPureOverlaySnapshot = this.isPureOverlayMode;
      try {
        const { saveFile, removeFile } = require('@/utils/imageManager.js');
        const savedFilePath = await saveFile(this.templateThumb);
        const entry = {
          savedFilePath: savedFilePath,
          landmarks: landmarksSnapshot,
          isPureOverlayMode: isPureOverlaySnapshot,
          createdAt: Date.now(),
        };
        this.favorites.unshift(entry);
        if (this.favorites.length > MAX_FAVORITES) {
          const evicted = this.favorites.splice(MAX_FAVORITES);
          evicted.forEach((e) => {
            removeFile(e.savedFilePath).catch(() => {});
          });
        }
        this._persistFavorites();
        uni.showToast({ title: this.$t('poseGuide.favoriteSaved'), icon: 'success' });
      } catch (_) {
        uni.showToast({ title: this.$t('poseGuide.favoriteSaveFailed'), icon: 'none' });
      }
    },

    loadFavorite(item) {
      this._stopPoseGuide();
      this.usingPreset = false;
      this.selectedPresetId = '';
      this.isPureOverlayMode = !!item.isPureOverlayMode;
      this.templateLandmarks = item.isPureOverlayMode ? null : item.landmarks;
      this.templateThumb = item.savedFilePath;
      uni.showToast({ title: this.$t('poseGuide.favoriteLoaded'), icon: 'none' });
    },

    async removeFavorite(item) {
      const idx = this.favorites.indexOf(item);
      if (idx === -1) return;
      this.favorites.splice(idx, 1);
      this._persistFavorites();
      try {
        const { removeFile } = require('@/utils/imageManager.js');
        await removeFile(item.savedFilePath);
      } catch (_) {}
    },

    _persistFavorites() {
      uni.setStorageSync(FAVORITES_STORAGE_KEY, this.favorites);
    },

    // ── 需求3：PiP 自由拖拽/缩放 ────────────────────────────────────
    onPipChange(e) {
      this.pipX = e.detail.x;
      this.pipY = e.detail.y;
    },
    onPipScale(e) {
      this.pipScale = e.detail.scale;
    },
    cycleOverlayOpacity() {
      const steps = [0.35, 0.55, 0.8];
      const idx = steps.indexOf(this.overlayOpacity);
      this.overlayOpacity = steps[(idx + 1) % steps.length];
    },

    // ================================================================
    // 模块三（重构）：纯视觉模式下只显示叠加图不跑推理；打分模式下实时对比 + 防抖锁定
    // 需求4：不再自动拍照，只把快门从置灰切换为激活
    // ================================================================
    toggleRunning() {
      if (!this.templateThumb) return;
      if (this.isRunning) {
        this._stopPoseGuide();
        return;
      }
      this.isRunning = true;
      if (this.isPureOverlayMode) return; // 纯视觉模式：亮出摄像头+半透明图即可，不需要推理管线

      this.$nextTick(() => {
        this._initPoseCanvas();
        setTimeout(() => this._startPoseGuide(), 300);
      });
    },

    _initPoseCanvas() {
      const query = uni.createSelectorQuery().in(this);
      query.select('#poseCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const dpr = uni.getSystemInfoSync().pixelRatio || 2;
        this.poseCanvasWidth = res[0].width;
        this.poseCanvasHeight = res[0].height;
        canvas.width = Math.round(res[0].width * dpr);
        canvas.height = Math.round(res[0].height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this.poseCanvasNode = canvas;
        this.poseCanvasCtx = ctx;
      });
    },

    _startPoseGuide() {
      if (this.isPureOverlayMode) return; // 纯视觉模式不跑打分，见 toggleRunning 里的提前 return
      this._stopFrameListener();
      _lockStartTs = 0;
      this.isLocked = false;
      this.lockProgress = 0;
      this.similarityScore = 0;
      this.guidanceText = '';
      this._scoreUiTs = 0;

      const cameraCtx = uni.createCameraContext();
      _frameListener = cameraCtx.onCameraFrame(async (frame) => {
        // 异步推理硬锁：绝不堆帧
        if (_isDetecting) return;
        const now = Date.now();
        if (now - _lastInferTs < _INFER_INTERVAL) return;
        _lastInferTs = now;

        _isDetecting = true;
        try {
          const kpArray = await this._estimateUserPose(frame);
          if (kpArray) {
            const userLandmarks = cocoArrayToNamedPoints(kpArray);
            this._userKps = userLandmarks;
            const result = calculatePoseSimilarity(userLandmarks, this.templateLandmarks);
            this._applyLockDebounce(result);
            this._drawOverlay();
          } else {
            this._userKps = null;
            this._applyLockDebounce({ score: 0, maxErrorLimb: null });
            this._drawOverlay();
          }
        } catch (e) {
          console.error('[PoseGuide]', e);
        } finally {
          _isDetecting = false;
        }
      });
      _frameListener.start();
    },

    // ── 推理：onCameraFrame 原始帧 → JPEG → 后端 /detect-pose → COCO-17 ──
    // 与 camera/index.vue 的骨架追踪同款端云协同管线（小程序里跑不了 MediaPipe wasm）
    async _estimateUserPose(frame) {
      const tempFilePath = await this._frameToJpeg(frame);
      if (!tempFilePath) return null;
      let res;
      try {
        res = await detectPoseApi(tempFilePath);
      } catch (_) {
        return null;
      }
      if (res.statusCode !== 200) return null;
      return res.data?.keypoints || null;
    },

    async _frameToJpeg(frame) {
      try {
        const { frameToJpeg } = require('@/utils/imageManager.js');
        return await frameToJpeg(frame, { quality: 0.6 });
      } catch (e) {
        console.error('[frameToJpeg]', e);
        return null;
      }
    },

    // ── 防抖核心：相似度连续 >= 85% 保持满 1.2s 才判定 Pose Locked ──
    // 用墙钟时间而非帧数计时，避免网络延迟抖动导致实际保持时长偏离预期。
    // 需求4：这里不再自动触发拍照，只切换 isLocked（驱动快门置灰/激活，
    // 或若开启了倒计时连拍则另外起一个可中断的倒数）；
    // 需求5：借同一个节流窗口顺带更新 AI 指导文本，不额外开计时器。
    _applyLockDebounce(result) {
      const { score: rawScore, maxErrorLimb, limbScores, coverageRatio } = result;
      // EMA 平滑：网络/识别抖动会让瞬时分数一跳一跳的，平滑后阈值判断和显示都更稳
      this._smoothedScore = this._smoothedScore
        ? this._smoothedScore * (1 - SCORE_SMOOTH_ALPHA) + rawScore * SCORE_SMOOTH_ALPHA
        : rawScore;
      const score = Math.round(this._smoothedScore);

      this._lastLimbScores = limbScores || {};
      this._lastMaxErrorLimb = maxErrorLimb;

      const now = Date.now();
      if (now - this._scoreUiTs > 300) {
        this._scoreUiTs = now;
        this.similarityScore = score;
        this.coverageRatio = coverageRatio ?? 100;
        this.guidanceText = this._translateGuidance(generateAIPrompt(this._userKps, this.templateLandmarks, maxErrorLimb));
      }

      if (score < LOCK_THRESHOLD) {
        _lockStartTs = 0;
        this.lockProgress = 0;
        if (this.isLocked) this._cancelCountdown();
        this.isLocked = false;
        return;
      }

      if (!_lockStartTs) _lockStartTs = now;
      const heldMs = now - _lockStartTs;
      this.lockProgress = Math.min(heldMs / LOCK_HOLD_MS, 1);

      const nowLocked = heldMs >= LOCK_HOLD_MS;
      if (nowLocked && !this.isLocked) {
        // 刚刚锁定：震动提示一次；若开启了倒计时连拍，顺势起一个可被"姿态跑掉"打断的倒数
        uni.vibrateShort();
        if (this.autoCountdownEnabled) this._startCountdown();
      }
      this.isLocked = nowLocked;
    },

    // generateAIPrompt 返回 {key, params}，params.limb 是英文肢体名，要先单独查
    // poseGuide.limbNames.<limb> 翻译成当前语言，再作为参数插值进句子模板，
    // 两步翻译不能合并，否则肢体名没法跟着 UI 语言切换
    _translateGuidance(result) {
      const params = { ...result.params };
      if (params.limb) params.limb = this.$t('poseGuide.limbNames.' + params.limb);
      return this.$t(result.key, params);
    },

    // ── 倒计时连拍：默认关闭（保持需求4"交互权还给用户"的初衷），用户主动开启时才生效。
    // 倒数过程中一旦姿态跑掉（isLocked 变 false）会被 _applyLockDebounce 里的 _cancelCountdown 打断，
    // 不会出现"人已经走开了但还在倒数拍照"的情况。
    _startCountdown() {
      this._cancelCountdown();
      this.countdownValue = COUNTDOWN_SECONDS;
      this._countdownTimer = setInterval(() => {
        this.countdownValue -= 1;
        if (this.countdownValue <= 0) {
          this._cancelCountdown();
          this._capturePhoto();
        }
      }, 1000);
    },
    _cancelCountdown() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
      }
      this.countdownValue = 0;
    },

    // ── 需求4：快门交互——置灰时点击只给提示，激活时才真正拍照 ──
    onShutterTap() {
      if (!this.canShutterFire) {
        uni.showToast({
          title: this.isRunning ? this.$t('poseGuide.poseNotAlignedYet') : this.$t('poseGuide.startMatchingFirst'),
          icon: 'none',
        });
        return;
      }
      this._capturePhoto();
    },

    _capturePhoto() {
      // 手动按快门打断正在进行的倒计时，避免倒计时结束后又追加拍一张
      this._cancelCountdown();
      uni.vibrateShort();
      this.isFlashing = true;
      setTimeout(() => { this.isFlashing = false; }, 180);

      const camCtx = uni.createCameraContext();
      camCtx.takePhoto({
        quality: 'high',
        success: (res) => {
          const rawPath = res.tempFilePath || res.tempImagePath;
          if (!rawPath) return;
          this._bakeFilterIntoPhoto(rawPath, this.currentFilterCss).then((finalPath) => {
            uni.saveImageToPhotosAlbum({
              filePath: finalPath,
              success: () => uni.showToast({ title: '📸 ' + this.$t('poseGuide.photoSaved'), icon: 'none' }),
              fail: () => uni.showToast({ title: this.$t('common.saveFailed'), icon: 'none' }),
            });
          });
        },
        fail: () => uni.showToast({ title: this.$t('poseGuide.captureFailed'), icon: 'none' }),
      });
    },

    // ── 滤镜烧录：确保保存的照片一定带滤镜，不依赖 <camera> 预览是否支持同层渲染 filter ──
    // 只处理"展示/成片"层，不影响 _estimateUserPose 里喂给后端的原始帧数据
    _bakeFilterIntoPhoto(srcPath, filterCss) {
      return new Promise((resolve) => {
        if (!filterCss || filterCss === 'none') {
          resolve(srcPath);
          return;
        }
        // #ifdef MP-WEIXIN
        uni.getImageInfo({
          src: srcPath,
          success: (info) => {
            try {
              const canvas = wx.createOffscreenCanvas({ type: '2d', width: info.width, height: info.height });
              const ctx = canvas.getContext('2d');
              const img = canvas.createImage();
              img.onload = () => {
                try { ctx.filter = filterCss; } catch (_) {}
                ctx.drawImage(img, 0, 0, info.width, info.height);
                wx.canvasToTempFilePath({
                  canvas,
                  fileType: 'jpg',
                  quality: 0.92,
                  success: (r) => resolve(r.tempFilePath),
                  fail: () => resolve(srcPath),
                });
              };
              img.onerror = () => resolve(srcPath);
              img.src = srcPath;
            } catch (e) {
              resolve(srcPath);
            }
          },
          fail: () => resolve(srcPath),
        });
        // #endif

        // #ifndef MP-WEIXIN
        // App 端暂不支持离屏 Canvas 滤镜烧录，直接返回原图
        resolve(srcPath);
        // #endif
      });
    },

    // ── Canvas 绘制：骨架线（偏差最大的肢体单独高亮）+ 关键点，命中锁定时统一切换黄色 ──
    // 前置摄像头镜像说明见文件顶部注释；这里按 cameraPosition 决定要不要把 x 镜像后再画，
    // 只影响"画面显示在哪"，不影响 calculatePoseSimilarity 的打分（打分不依赖左右镜像约定，
    // 因为 user 和 template 各自都是从同一个 YOLOv8-pose 模型按解剖学左右标注出来的）。
    _mirrorX(x) {
      return this.cameraPosition === 'front' ? 1 - x : x;
    },

    _drawOverlay() {
      const ctx = this.poseCanvasCtx;
      const W = this.poseCanvasWidth;
      const H = this.poseCanvasHeight;
      if (!ctx || !W || !H) return;

      ctx.clearRect(0, 0, W, H);
      const kps = this._userKps;
      if (!kps) return;

      const baseColor = this.isLocked ? HIGHLIGHT_COLOR : '#00FFFF';
      const worstName = this._lastMaxErrorLimb?.name;
      const limbScores = this._lastLimbScores || {};

      // 第一层：骨架线，按 LIMB_DEFS 拓扑连线（和打分完全同一套定义，不会各画各的）
      LIMB_DEFS.forEach((def) => {
        const a = _resolveMidpointForDraw(kps, def.from);
        const b = _resolveMidpointForDraw(kps, def.to);
        if (!a || !b) return;
        const isWorst = def.name === worstName && limbScores[def.name] != null;
        const color = isWorst ? WORST_LIMB_COLOR : baseColor;
        ctx.beginPath();
        ctx.moveTo(this._mirrorX(a.x) * W, a.y * H);
        ctx.lineTo(this._mirrorX(b.x) * W, b.y * H);
        ctx.strokeStyle = color;
        ctx.lineWidth = isWorst ? 5 : 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = isWorst ? 14 : 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // 第二层：关节点
      Object.values(kps).forEach((p) => {
        ctx.beginPath();
        ctx.arc(this._mirrorX(p.x) * W, p.y * H, 5, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    },

    _stopFrameListener() {
      if (_frameListener) {
        try { _frameListener.stop(); } catch (_) {}
        _frameListener = null;
      }
      _isDetecting = false;
    },

    _stopPoseGuide() {
      this._stopFrameListener();
      this._cancelCountdown();
      _lockStartTs = 0;
      this.isRunning = false;
      this.isLocked = false;
      this.lockProgress = 0;
      this.similarityScore = 0;
      this.coverageRatio = 100;
      this.guidanceText = '';
      this._userKps = null;
      this._smoothedScore = 0;
      this._lastLimbScores = {};
      this._lastMaxErrorLimb = null;
      this.poseCanvasCtx = null;
      this.poseCanvasNode = null;
    },
  },
};
</script>

<style scoped>
/* 全页统一沿用 camera/index.vue 的暖橙色毛玻璃风格：暖白渐变背景 + 磨砂面板 +
   橙色系 CTA 渐变；#FFD700 专用于"姿态已对齐/可拍照"这一个信号，不挪作它用 */
.container {
  width: 100vw; height: 100vh; overflow: hidden; display: flex; flex-direction: column;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
.camera-area { flex: 1; position: relative; min-height: 0; padding: 0 16rpx; }
.camera-view {
  width: 100%; height: 100%; position: relative; z-index: 1;
  background: #1a1a1e; border-radius: 32rpx; overflow: hidden;
  box-shadow: 0 12rpx 32rpx rgba(0, 0, 0, 0.1);
  transition: filter 0.2s ease;
}

.pose-canvas-overlay {
  position: absolute; top: 0; left: 16rpx; right: 16rpx; bottom: 0;
  z-index: 2; pointer-events: none; border-radius: 32rpx; overflow: hidden;
}

.flip-btn {
  position: absolute; top: 24rpx; left: 24rpx; z-index: 4;
  width: 72rpx; height: 72rpx; line-height: 72rpx; text-align: center;
  font-size: 32rpx; background: rgba(255, 248, 240, 0.85);
  backdrop-filter: blur(8px); border-radius: 50%;
  border: 1px solid rgba(255, 205, 165, 0.6);
  box-shadow: 0 8rpx 20rpx rgba(0,0,0,0.1);
}

.overlay-mode-badge {
  position: absolute; top: 112rpx; left: 24rpx; right: 24rpx; z-index: 4;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 215, 0, 0.5);
  color: #B8860B; font-size: 22rpx; font-weight: 500;
  padding: 14rpx 24rpx; border-radius: 24rpx; text-align: center;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06);
}

/* 状态指示器：统一黄色边框，仅浓淡/粗细/发光随匹配度和锁定状态变化——
   这是页面里唯一使用 #FFD700 的地方，和其余暖橙色 UI 刻意区分开来 */
.pose-ring {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 420rpx; height: 560rpx; border-radius: 32rpx;
  border-width: 4rpx; border-style: solid;
  transition: all 0.15s ease-out;
}
.pose-ring-locked {
  border-width: 8rpx;
  box-shadow: 0 0 48rpx rgba(255, 215, 0, 0.85);
}

.hint-bubble { position: absolute; bottom: 40rpx; left: 0; right: 0; display: flex; justify-content: center; padding: 0 40rpx; }
.hint-text {
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 205, 165, 0.6);
  color: #EF6C3E; font-size: 24rpx; font-weight: 500;
  padding: 16rpx 32rpx; border-radius: 40rpx;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06);
}

.pose-score-text {
  position: absolute; top: 32rpx; left: 50%; transform: translateX(-50%); z-index: 3;
  background: rgba(255, 248, 240, 0.85); backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 205, 165, 0.6);
  color: #EF6C3E; font-size: 26rpx; font-weight: 600;
  padding: 10rpx 28rpx; border-radius: 32rpx;
  box-shadow: 0 8rpx 20rpx rgba(0,0,0,0.06);
  display: flex; flex-direction: column; align-items: center; gap: 6rpx;
}
.coverage-hint {
  font-size: 20rpx; font-weight: 500; color: #D9822B; white-space: nowrap;
}

/* 倒计时连拍：大数字覆盖画面正中，复用锁定态的金色语义 */
.countdown-number {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 6;
  font-size: 140rpx; font-weight: 800; color: #FFD700;
  text-shadow: 0 0 40rpx rgba(255, 215, 0, 0.8), 0 4rpx 12rpx rgba(0,0,0,0.3);
}
.pose-progress-text {
  position: absolute; bottom: 168rpx; left: 0; right: 0; text-align: center;
  color: #FFD700; font-size: 26rpx; font-weight: 700;
  text-shadow: 0 2rpx 12rpx rgba(255, 215, 0, 0.5);
}
.pose-confirm-badge {
  position: absolute; bottom: 160rpx; left: 40rpx; right: 40rpx; text-align: center;
  background: rgba(255, 215, 0, 0.16);
  border: 1px solid rgba(255, 215, 0, 0.7);
  backdrop-filter: blur(12px);
  color: #B8860B; font-size: 28rpx; font-weight: 700;
  padding: 16rpx 24rpx; border-radius: 40rpx;
  box-shadow: 0 0 32rpx rgba(255, 215, 0, 0.35);
}

/* 需求5：AI 指导文本——沿用 .ai-bubble 磨砂气泡语汇 */
.guidance-text {
  position: absolute; bottom: 96rpx; left: 40rpx; right: 40rpx; text-align: center;
  background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255, 248, 240, 0.95) 100%);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 205, 165, 0.6);
  color: #EF6C3E; font-size: 24rpx; font-weight: 500;
  padding: 14rpx 24rpx; border-radius: 32rpx;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06);
}

/* 快门瞬间白屏闪烁：class 切换 + transition，比 cover-view 内 @keyframes 更可靠 */
.flash-overlay {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: #fff; opacity: 0; pointer-events: none;
  transition: opacity 0.12s ease-out;
}
.flash-overlay.flash-active { opacity: 0.92; transition: opacity 0.05s ease-in; }

/* 需求3：PiP 自由拖拽区域——覆盖整个取景框，movable-view 只在图片本身范围内响应拖拽/缩放 */
.pip-area {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3;
}
.pip-view {
  width: 220rpx; height: 280rpx;
}
.pip-image {
  width: 100%; height: 100%; border-radius: 20rpx;
  border: 3rpx solid rgba(255, 248, 240, 0.9);
  box-shadow: 0 12rpx 32rpx rgba(0,0,0,0.28);
}
.opacity-btn {
  position: absolute; bottom: 8rpx; right: 8rpx;
  width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center;
  background: rgba(255, 248, 240, 0.9); color: #FF8C42;
  border-radius: 50%; font-size: 24rpx;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.15);
}

.permission-box {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 100;
  background: linear-gradient(180deg, #fff8f0 0%, #fff5eb 50%, #fff0e6 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.p-icon { font-size: 100rpx; margin-bottom: 40rpx; }
.p-text { color: #5B6E8C; font-size: 32rpx; margin-bottom: 36rpx; line-height: 1.6; font-weight: 500; padding: 0 60rpx; text-align: center; }
.p-btn {
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  color: #fff; border-radius: 48rpx; padding: 28rpx 72rpx;
  font-size: 30rpx; font-weight: 650; border: none;
  box-shadow: 0 16rpx 32rpx -10rpx rgba(255, 110, 97, 0.35);
}
.p-btn:active { transform: scale(0.96); }

.footer {
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255, 248, 240, 0.92) 100%);
  backdrop-filter: blur(24px);
  border-top: 1px solid rgba(255, 245, 230, 0.8);
  border-radius: 48rpx 48rpx 0 0;
  box-shadow: 0 -12rpx 32rpx rgba(0, 0, 0, 0.04);
  padding: 24rpx 24rpx env(safe-area-inset-bottom, 24rpx);
}
.template-row { display: flex; gap: 12rpx; margin-bottom: 20rpx; }
.url-input {
  flex: 1; background: rgba(255, 248, 240, 0.8); color: #2D3E50; font-size: 24rpx;
  padding: 0 24rpx; height: 68rpx; border-radius: 34rpx;
  border: 1px solid rgba(255, 205, 165, 0.6);
}
.mini-btn {
  font-size: 22rpx; color: #EF6C3E; background: rgba(255, 248, 240, 0.8);
  border: 1px solid rgba(255, 205, 165, 0.6);
  border-radius: 34rpx; padding: 0 24rpx; height: 68rpx; line-height: 68rpx; margin: 0;
}
.mini-btn[disabled] { color: #C0C0C0; background: rgba(240,240,240,0.6); border-color: transparent; }

.star-btn {
  flex-shrink: 0; width: 68rpx; height: 68rpx; line-height: 68rpx; text-align: center;
  font-size: 28rpx; color: #FFB347; background: rgba(255, 248, 240, 0.8);
  border: 1px solid rgba(255, 205, 165, 0.6); border-radius: 50%;
}
.star-btn:active { transform: scale(0.92); }

/* 内置姿势模板库 + 收藏，同一条横滑列表 */
.library-row { margin-bottom: 20rpx; }
.library-inner { display: flex; gap: 16rpx; padding: 0 4rpx; }
.library-item {
  flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 120rpx; height: 120rpx; border-radius: 20rpx; position: relative;
  background: rgba(255, 248, 240, 0.8); border: 1px solid rgba(255, 205, 165, 0.6);
  transition: all 0.2s ease;
}
.library-item.active {
  border-color: #FF8C42; box-shadow: 0 0 0 3rpx rgba(255, 140, 66, 0.25);
}
.library-icon { font-size: 44rpx; }
.library-label { font-size: 20rpx; color: #9CA8B8; margin-top: 6rpx; }
.library-thumb { width: 100%; height: 100%; border-radius: 20rpx; }
.library-remove {
  position: absolute; top: -10rpx; right: -10rpx; width: 36rpx; height: 36rpx;
  line-height: 36rpx; text-align: center; font-size: 20rpx; color: #fff;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  border-radius: 50%; box-shadow: 0 4rpx 10rpx rgba(255, 110, 97, 0.4);
}

.filter-row { margin-bottom: 20rpx; }
.filter-inner { display: flex; gap: 16rpx; padding: 0 4rpx; }
.filter-item {
  flex-shrink: 0; color: #9CA8B8; font-size: 22rpx; font-weight: 500;
  padding: 12rpx 28rpx; border-radius: 32rpx;
  background: rgba(255, 248, 240, 0.8); white-space: nowrap; transition: all 0.25s;
}
.filter-item.active {
  color: #fff; font-weight: 600;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  box-shadow: 0 8rpx 16rpx rgba(255, 110, 97, 0.3);
}

.action-row { display: flex; gap: 16rpx; align-items: center; margin-bottom: 8rpx; }
.ghost-btn {
  width: 140rpx; background: rgba(255, 248, 240, 0.8); color: #9CA8B8;
  border: 1px solid rgba(255, 205, 165, 0.6);
  border-radius: 38rpx; height: 76rpx; line-height: 76rpx; margin: 0; font-size: 24rpx;
}
.main-btn {
  flex: 1; color: #fff; font-weight: 600;
  background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  border-radius: 38rpx; height: 76rpx; line-height: 76rpx; margin: 0; font-size: 26rpx;
  box-shadow: 0 8rpx 16rpx rgba(255, 110, 97, 0.3);
}
.main-btn[disabled] { background: rgba(240,240,240,0.8); color: #C0C0C0; box-shadow: none; }

.countdown-toggle {
  flex-shrink: 0; font-size: 22rpx; font-weight: 500; color: #9CA8B8;
  background: rgba(255, 248, 240, 0.8); border: 1px solid rgba(255, 205, 165, 0.6);
  border-radius: 38rpx; padding: 0 20rpx; height: 76rpx; line-height: 74rpx; white-space: nowrap;
}
.countdown-toggle.active {
  color: #fff; background: linear-gradient(135deg, #FFB25B 0%, #FF7E5F 100%);
  box-shadow: 0 8rpx 16rpx rgba(255, 110, 97, 0.3);
}

/* 需求4：快门——默认置灰不可用（沿用 camera/index.vue 的外圈+内圆结构），
   姿态对齐(或纯视觉模式)才激活，激活色统一 #FFD700，不用红色/其他颜色 */
.shutter-zone { display: flex; justify-content: center; align-items: center; padding-top: 4rpx; }
.shutter-outer {
  width: 132rpx; height: 132rpx; border-radius: 50%;
  border: 6rpx solid #d8d8d8;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s ease-out;
}
.shutter-inner {
  width: 104rpx; height: 104rpx; border-radius: 50%;
  background: #e4e4e4;
  transition: all 0.2s ease-out;
}
.shutter-outer.shutter-active {
  border-color: #FFD700;
  box-shadow: 0 0 28rpx rgba(255, 215, 0, 0.6);
}
.shutter-outer.shutter-active:active { transform: scale(0.92); }
.shutter-inner.shutter-inner-active {
  background: linear-gradient(135deg, #FFE066 0%, #FFD700 100%);
  box-shadow: 0 8rpx 20rpx rgba(255, 215, 0, 0.5);
}
</style>