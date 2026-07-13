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
          👁️ 纯视觉比对模式（该模板无法识别骨骼，肉眼对齐半透明图即可）
        </cover-view>

        <!-- 打分模式下的状态指示器：统一黄色边框，颜色不随分数变化，只变浓淡/粗细/发光强度 -->
        <cover-view
          v-if="isRunning && !isPureOverlayMode"
          class="pose-ring"
          :class="{ 'pose-ring-locked': isLocked }"
          :style="{ borderColor: ringColor }"
        ></cover-view>

        <cover-view v-if="!isRunning" class="hint-bubble">
          <cover-view class="hint-text">请先加载模板图片，再点击「开始比对」</cover-view>
        </cover-view>

        <cover-view v-if="isRunning && !isPureOverlayMode && lockProgress > 0 && !isLocked" class="pose-progress-text">
          锁定中 {{ Math.round(lockProgress * 100) }}%
        </cover-view>
        <cover-view v-if="isRunning && !isPureOverlayMode && !isLocked" class="pose-score-text">
          匹配度 {{ similarityScore }}%
        </cover-view>
        <cover-view v-if="isRunning && !isPureOverlayMode && isLocked" class="pose-confirm-badge">
          ✨ 姿态已对齐，可以按快门了
        </cover-view>

        <!-- 需求5：AI 语义指导文本 -->
        <cover-view v-if="isRunning && !isPureOverlayMode && guidanceText" class="guidance-text">
          💡 {{ guidanceText }}
        </cover-view>

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
        <text class="p-text">需要相机权限才能使用姿态引导拍摄</text>
        <button class="p-btn" @tap="initCamera">去授权</button>
      </view>
    </view>

    <view class="footer">
      <view class="template-row">
        <input
          class="url-input"
          v-model="templateUrlInput"
          placeholder="粘贴模板图片 URL（如 Unsplash 直链）"
          :disabled="isLoadingTemplate"
        />
        <button class="mini-btn" :disabled="isLoadingTemplate" @tap="loadTemplateFromUrl">
          {{ isLoadingTemplate ? '识别中…' : '加载' }}
        </button>
        <button class="mini-btn" :disabled="isLoadingTemplate" @tap="loadTemplateFromAlbum">相册选图</button>
      </view>

      <scroll-view class="filter-row" scroll-x :show-scrollbar="false">
        <view class="filter-inner">
          <text
            v-for="f in filterOptions"
            :key="f.key"
            class="filter-item"
            :class="{ active: filterName === f.key }"
            @tap="filterName = f.key"
          >{{ f.label }}</text>
        </view>
      </scroll-view>

      <view class="action-row">
        <button class="ghost-btn" @tap="goBack">返回</button>
        <button class="main-btn" :disabled="!templateThumb" @tap="toggleRunning">
          {{ runningButtonText }}
        </button>
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
import { calculatePoseSimilarity, cocoArrayToNamedPoints, generateAIPrompt } from '@/utils/poseSimilarity.js';
import { fetchTemplateLandmarks, extractLandmarksFromLocalPath, TemplatePoseError } from '@/utils/poseTemplate.js';

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
      isLocked: false,
      lockProgress: 0,
      guidanceText: '',
      isFlashing: false,

      // 需求3：PiP 自由拖拽/缩放的受控状态
      pipX: 200,
      pipY: 120,
      pipScale: 1,

      filterName: 'none',
      filterOptions: [
        { key: 'none', label: '原图' },
        { key: 'warm', label: '暖调' },
        { key: 'cool', label: '冷调' },
        { key: 'bw', label: '黑白' },
        { key: 'vivid', label: '鲜艳' },
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
      if (this.isPureOverlayMode) return this.isRunning ? '停止参考' : '显示参考图';
      return this.isRunning ? '停止比对' : '开始比对';
    },
    // 需求4：纯视觉模式没有打分能力，快门始终可用（回归"你自己判断"）；
    // 打分模式下必须 isLocked 才激活，交互权完全交给用户自己按快门
    canShutterFire() {
      return this.isRunning && (this.isPureOverlayMode || this.isLocked);
    },
  },
  onLoad() {
    this._userKps = null;
    this.poseCanvasNode = null;
    this.poseCanvasCtx = null;
    this.initCamera();
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
      uni.authorize({
        scope: 'scope.camera',
        success: () => { this.isAuth = true; },
        fail: () => { uni.showToast({ title: '需要相机权限', icon: 'none' }); },
      });
    },
    onCameraError() {
      uni.showToast({ title: '相机调用异常', icon: 'none' });
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
        uni.showToast({ title: '请先粘贴图片地址', icon: 'none' });
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
      this.templateLandmarks = landmarks;
      this.templateThumb = localPath;
      uni.showToast({ title: '模板加载成功，可以开始比对了', icon: 'none' });
    },

    // 需求2 核心：识别失败不阻断流程——只要还有本地图（recoverable），就降级为纯视觉叠加模式
    _onTemplateError(err) {
      if (err instanceof TemplatePoseError && err.recoverable && err.localPath) {
        this.isPureOverlayMode = true;
        this.templateLandmarks = null;
        this.templateThumb = err.localPath;
        uni.showToast({ title: '未识别到人体骨骼，已切换为纯视觉叠加比对模式', icon: 'none' });
        return;
      }
      const msg = err instanceof TemplatePoseError ? err.message : '模板加载失败，请重试';
      uni.showToast({ title: msg, icon: 'none' });
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
      return new Promise((resolve) => {
        try {
          const canvas = wx.createOffscreenCanvas({ type: '2d', width: frame.width, height: frame.height });
          const ctx = canvas.getContext('2d');
          const imgData = ctx.createImageData(frame.width, frame.height);
          imgData.data.set(new Uint8ClampedArray(frame.data));
          ctx.putImageData(imgData, 0, 0);
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'jpg',
            quality: 0.6,
            success: (r) => resolve(r.tempFilePath),
            fail: () => resolve(null),
          });
        } catch (e) {
          console.error('[frameToJpeg]', e);
          resolve(null);
        }
      });
    },

    // ── 防抖核心：相似度连续 >= 85% 保持满 1.2s 才判定 Pose Locked ──
    // 用墙钟时间而非帧数计时，避免网络延迟抖动导致实际保持时长偏离预期。
    // 需求4：这里不再触发拍照，只切换 isLocked（驱动快门置灰/激活）；
    // 需求5：借同一个节流窗口顺带更新 AI 指导文本，不额外开计时器。
    _applyLockDebounce(result) {
      const { score, maxErrorLimb } = result;
      const now = Date.now();
      if (now - this._scoreUiTs > 300) {
        this._scoreUiTs = now;
        this.similarityScore = score;
        this.guidanceText = generateAIPrompt(this._userKps, this.templateLandmarks, maxErrorLimb);
      }

      if (score < LOCK_THRESHOLD) {
        _lockStartTs = 0;
        this.lockProgress = 0;
        this.isLocked = false;
        return;
      }

      if (!_lockStartTs) _lockStartTs = now;
      const heldMs = now - _lockStartTs;
      this.lockProgress = Math.min(heldMs / LOCK_HOLD_MS, 1);

      const nowLocked = heldMs >= LOCK_HOLD_MS;
      if (nowLocked && !this.isLocked) {
        // 只在"刚刚锁定"这一刻震动一次提示，不再自动拍照
        uni.vibrateShort();
      }
      this.isLocked = nowLocked;
    },

    // ── 需求4：快门交互——置灰时点击只给提示，激活时才真正拍照 ──
    onShutterTap() {
      if (!this.canShutterFire) {
        uni.showToast({ title: this.isRunning ? '姿态还没对齐，请继续调整' : '请先点击「开始比对」', icon: 'none' });
        return;
      }
      this._capturePhoto();
    },

    _capturePhoto() {
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
              success: () => uni.showToast({ title: '📸 已保存到相册', icon: 'none' }),
              fail: () => uni.showToast({ title: '保存失败', icon: 'none' }),
            });
          });
        },
        fail: () => uni.showToast({ title: '拍照失败', icon: 'none' }),
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
        uni.getImageInfo({
          src: srcPath,
          success: (info) => {
            try {
              const canvas = wx.createOffscreenCanvas({ type: '2d', width: info.width, height: info.height });
              const ctx = canvas.getContext('2d');
              const img = canvas.createImage();
              img.onload = () => {
                // 需要基础库 >= 2.19 支持 canvas 2d ctx.filter；不支持的机型 catch 到下面直接回退原图
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
      });
    },

    // ── Canvas 绘制：仅画用户实时关键点，命中锁定时切换为统一黄色 ──
    _drawOverlay() {
      const ctx = this.poseCanvasCtx;
      const W = this.poseCanvasWidth;
      const H = this.poseCanvasHeight;
      if (!ctx || !W || !H) return;

      ctx.clearRect(0, 0, W, H);
      const kps = this._userKps;
      if (!kps) return;

      const color = this.isLocked ? HIGHLIGHT_COLOR : '#00FFFF';
      Object.values(kps).forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
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
      _lockStartTs = 0;
      this.isRunning = false;
      this.isLocked = false;
      this.lockProgress = 0;
      this.similarityScore = 0;
      this.guidanceText = '';
      this._userKps = null;
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
