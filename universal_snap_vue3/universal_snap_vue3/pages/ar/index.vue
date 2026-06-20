<template>
  <view class="container">
    
    <!-- ========================================== -->
    <!-- 引擎 A：AI 视觉雷达 (原生 Camera) -->
    <!-- 仅在视觉模式下挂载，避免和 AR 引擎抢夺摄像头导致卡死！ -->
    <!-- ========================================== -->
    <camera 
      v-if="radarMode === 'visual' && isAuth" 
      id="camera" 
      device-position="back" 
      flash="off" 
      class="camera-view"
      @error="onCameraError"
    >
      <cover-view class="ar-overlay">
        <cover-view class="hud-panel" style="border-color: #00c2ff;">
          <cover-view class="hud-header" style="color: #00c2ff;">👁️ AI 视觉雷达 (纯图像估算)</cover-view>
          <cover-view class="hud-line" style="background: rgba(0, 194, 255, 0.3);"></cover-view>
          <cover-view class="hud-row"><cover-view class="hud-label">↔️ 左右倾角:</cover-view><cover-view class="hud-value">{{ displayRoll }}°</cover-view></cover-view>
          <cover-view class="hud-row"><cover-view class="hud-label">↕️ 前后俯仰:</cover-view><cover-view class="hud-value">{{ displayPitch }}°</cover-view></cover-view>
          <cover-view class="hud-row dist-row">
            <cover-view class="hud-label">📏 目标距离:</cover-view>
            <cover-view class="hud-value highlight" style="color: #00c2ff;">{{ distanceText }}</cover-view>
          </cover-view>
        </cover-view>

        <cover-view class="reticle-wrap">
          <cover-view class="reticle-circle" :class="{'reticle-active-visual': hasHit}"></cover-view>
          <cover-view class="reticle-dot" :class="{'dot-active-visual': hasHit}"></cover-view>
        </cover-view>

        <cover-view v-if="aiMessage" class="ai-bubble-wrap">
          <cover-view class="ai-bubble" :class="{'perfect-bubble': isPerfect}">
            <cover-view class="ai-text">{{ isPerfect ? '✨ PERFECT' : aiMessage }}</cover-view>
          </cover-view>
        </cover-view>
        <cover-view v-if="isPerfect" class="perfect-frame"></cover-view>
      </cover-view>
    </camera>

    <!-- ========================================== -->
    <!-- 引擎 B：增强现实雷达 (硬件 WebGL + 官方标准着色器) -->
    <!-- 切换时完全接管屏幕，不会红屏/绿屏，同时提供画面和物理距离 -->
    <!-- ========================================== -->
    <canvas 
      v-if="radarMode === 'ar' && isSupportAR" 
      type="webgl" 
      id="webgl" 
      class="camera-view"
    >
      <cover-view class="ar-overlay">
        <cover-view class="hud-panel" style="border-color: #39FF14;">
          <cover-view class="hud-header" style="color: #39FF14;">🛰️ 增强现实雷达 (物理+AI双轨)</cover-view>
          <cover-view class="hud-line" style="background: rgba(57,255,20,0.3);"></cover-view>
          <cover-view class="hud-row"><cover-view class="hud-label">↔️ 左右倾角:</cover-view><cover-view class="hud-value">{{ displayRoll }}°</cover-view></cover-view>
          <cover-view class="hud-row"><cover-view class="hud-label">↕️ 前后俯仰:</cover-view><cover-view class="hud-value">{{ displayPitch }}°</cover-view></cover-view>
          <cover-view class="hud-row dist-row">
            <cover-view class="hud-label">📏 物理距离:</cover-view>
            <cover-view class="hud-value highlight" style="color: #39FF14;">{{ distanceText }}</cover-view>
          </cover-view>
        </cover-view>

        <cover-view class="reticle-wrap">
          <cover-view class="reticle-circle" :class="{'reticle-active': hasHit}"></cover-view>
          <cover-view class="reticle-dot" :class="{'dot-active': hasHit}"></cover-view>
        </cover-view>

        <cover-view v-if="aiMessage" class="ai-bubble-wrap">
          <cover-view class="ai-bubble" :class="{'perfect-bubble': isPerfect}">
            <cover-view class="ai-text">{{ isPerfect ? '✨ PERFECT' : aiMessage }}</cover-view>
          </cover-view>
        </cover-view>
        <cover-view v-if="isPerfect" class="perfect-frame"></cover-view>
      </cover-view>
    </canvas>

    <!-- 💡 离屏抠图安全区：专门解决 WebGL 截图 Bug -->
    <canvas 
      type="2d" 
      id="photo-canvas" 
      style="position: fixed; left: -9999px; top: 0; width: 10px; height: 10px; opacity: 0; pointer-events: none; z-index: -100;">
    </canvas>

    <view v-if="!isAuth && radarMode === 'visual'" class="permission-box">
      <view class="p-icon">📷</view><text class="p-text">请授权开启相机权限</text>
      <button class="p-btn" @tap="initCamera">去授权</button>
    </view>
    
    <view v-if="!isSupportAR && radarMode === 'ar'" class="permission-box">
      <view class="p-icon">🚫</view><text class="p-text">当前设备不支持 AR 引擎</text>
      <button class="p-btn" @tap="toggleRadarMode">切回视觉模式</button>
    </view>

    <!-- ========================================== -->
    <!-- 统一底部控制栏 -->
    <!-- ========================================== -->
    <view class="footer">
      <view class="mode-selector">
        <text class="mode-item" :class="{active: smartMode === 'person'}" @tap="setSmartMode('person')">👤 拍人</text>
        <text class="mode-item" :class="{active: smartMode === 'object'}" @tap="setSmartMode('object')">🍎 拍物(手)</text>
        <text class="mode-item" :class="{active: smartMode === 'scenery'}" @tap="setSmartMode('scenery')">🏔️ 拍景</text>
        <text class="mode-item" :class="{active: smartMode === ''}" @tap="setSmartMode('')">🚫 自由</text>
      </view>

      <scroll-view class="tools-scroll" scroll-x="true">
        <view class="tools-inner">
          <view class="btn" @tap="toggleRadarMode">
            <text class="emoji">{{ radarMode === 'visual' ? '👁️' : '🛰️' }}</text>
            <text class="desc">{{ radarMode === 'visual' ? '启动AR引擎' : '切至视觉雷达' }}</text>
          </view>
          <view class="btn" @tap="triggerManualScan">
            <text class="emoji">📡</text>
            <text class="desc">AI 扫描分析</text>
          </view>
          <view class="btn" @tap="toggleAI">
            <text class="emoji">{{ aiRunning ? '🟢' : '⚪' }}</text>
            <text class="desc">AI 连续监测</text>
          </view>
          <view class="btn" @tap="goBack">
            <text class="emoji">🔙</text>
            <text class="desc">返回</text>
          </view>
        </view>
      </scroll-view>

      <view class="shutter-zone">
        <view class="shutter-outer" @tap="takePhoto">
          <view class="shutter-inner"></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { smartAnalyzeApi } from '@/utils/request.js';

export default {
  data() {
    return {
      radarMode: 'visual',
      isAuth: false,
      isSupportAR: true,
      
      smartMode: 'object',
      aiRunning: false,
      aiMessage: '',
      isPerfect: false,
      
      rollAngle: 0,
      pitchAngle: 0,
      
      aiDistance: 0,
      aiSubjectRef: '',
      realDistance: 0,
      hasHit: false, 
      
      lastAITime: 0,
      aiTimer: null,
      
      lastRawRoll: 0,
      lastRawPitch: 0
    };
  },
  computed: {
    displayRoll() { return Math.round(this.rollAngle); },
    displayPitch() { return Math.round(this.pitchAngle); },
    
    distanceText() {
      if (this.radarMode === 'ar') {
        return this.hasHit ? this.realDistance.toFixed(2) + "m (AR 激光锁定)" : "寻找平面中...";
      } 
      if (this.aiDistance > 0) {
        return `${this.aiDistance.toFixed(2)}m (${this.aiSubjectRef})`;
      }
      const p = this.pitchAngle;
      if (p < -2) return "仰角 (高处)";
      if (p >= -2 && p <= 2) return "> 10m (平视)";
      const theta = p * (Math.PI / 180);
      let dist = 1.4 / Math.tan(theta);
      if (dist > 15) return "> 15m";
      return dist.toFixed(2) + "m (角度估算)";
    }
  },
  onLoad() {
    this._vkSession = null;
    this._gl = null;
    this._glProgram = null;
    this._canvasNode = null;
    this._photoCanvasNode = null;
    this._renderLoopId = null;
    this._lastFrame = null;
    this._needSnapshot = false;
    this._snapshotCallback = null;

    this.initCamera();
  },
  onShow() {
    if (this.radarMode === 'visual') this.startSensors();
  },
  onHide() {
    this.stopSensors();
  },
  onUnload() {
    this.stopAllEngines();
  },
  methods: {
    goBack() { uni.navigateBack(); },

    // 💡 解除死锁的核心：严格的互斥卸载
    toggleRadarMode() {
      uni.vibrateShort();
      this.aiMessage = "";
      this.hasHit = false;
      this.isPerfect = false;

      if (this.radarMode === 'visual') {
        if (!wx.isVKSupport || !wx.isVKSupport('v2')) {
          uni.showToast({ title: '设备不支持 AR 引擎', icon: 'none' });
          return;
        }
        this.stopSensors();
        if (this.aiTimer) clearInterval(this.aiTimer);
        
        // 标记切换，使得原生 Camera 卸载，释放硬件！
        this.radarMode = 'ar';
        // 等待下一帧 DOM 刷新完毕后再去拿摄像头
        this.$nextTick(() => { this.checkAndInitAR(); });
        uni.showToast({ title: '启动 AR 引擎中...', icon: 'none' });
      } else {
        this.stopAR();
        this.radarMode = 'visual';
        this.$nextTick(() => { 
          this.initCamera();
          this.startSensors();
        });
        uni.showToast({ title: '已切换至视觉模式', icon: 'none' });
      }
    },

    stopAllEngines() {
      this.stopSensors();
      this.stopAR();
      if (this.aiTimer) clearInterval(this.aiTimer);
    },

    initCamera() {
      uni.authorize({
        scope: 'scope.camera',
        success: () => { this.isAuth = true; },
        fail: () => { uni.showToast({ title: '需要相机权限', icon: 'none' }); }
      });
    },

    startSensors() {
      uni.startAccelerometer({
        interval: 'ui',
        success: () => {
          uni.onAccelerometerChange((res) => {
            if (this.radarMode !== 'visual') return;
            let rawRoll = Math.atan2(res.x, -res.y) * (180 / Math.PI);
            let rawPitch = Math.atan2(res.z, -res.y) * (180 / Math.PI);
            let deltaRoll = rawRoll - this.lastRawRoll;
            if (deltaRoll > 180) rawRoll -= 360; else if (deltaRoll < -180) rawRoll += 360;
            this.lastRawRoll = rawRoll;
            this.rollAngle = this.rollAngle + (rawRoll - this.rollAngle) * 0.1;
            let deltaPitch = rawPitch - this.lastRawPitch;
            if (deltaPitch > 180) rawPitch -= 360; else if (deltaPitch < -180) rawPitch += 360;
            this.lastRawPitch = rawPitch;
            this.pitchAngle = this.pitchAngle + (rawPitch - this.pitchAngle) * 0.1;
          });
        }
      });
    },
    stopSensors() { uni.stopAccelerometer(); },

    // ================== AR 引擎与官方标准化 WebGL ==================
    checkAndInitAR() {
      this.isSupportAR = true;
      this.$nextTick(() => {
        uni.createSelectorQuery().in(this)
          .select('#webgl').fields({ node: true, size: true })
          .select('#photo-canvas').fields({ node: true })
          .exec((res) => {
            if (res && res[0] && res[0].node) {
              this._canvasNode = res[0].node;
              if (res[1] && res[1].node) this._photoCanvasNode = res[1].node;
              
              const sysInfo = uni.getSystemInfoSync();
              const dpr = sysInfo.pixelRatio;
              this._canvasNode.width = (res[0].width || sysInfo.windowWidth) * dpr;
              this._canvasNode.height = (res[0].height || sysInfo.windowHeight) * dpr;

              // 获取底层 GPU 上下文
              this._gl = this._canvasNode.getContext('webgl', { alpha: false }); 
              this.initVKSession();
            }
          });
      });
    },

    initVKSession() {
      if (!this._canvasNode || !this._gl) return;
      this.initWebGLShader(this._gl);
      
      this._vkSession = wx.createVKSession({
        track: { plane: { mode: 3 } }, 
        version: 'v2',
        gl: this._gl 
      });
      
      this._vkSession.start((err) => {
        if (err) { uni.showToast({ title: 'AR启动失败', icon: 'none' }); return; }
        this.runARLoop();
      });
    },

    // 💡 官方标准化着色器：在 V2 引擎中，底层已抹平 iOS/Android 差异，直接取即可！红屏绿屏从此消失。
    initWebGLShader(gl) {
      const vsSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = vec2(a_texCoord.y, 1.0 - a_texCoord.x); // 适配竖屏
        }
      `;
      const fsSource = `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D y_texture;
        uniform sampler2D uv_texture;
        void main() {
          vec4 y_color = texture2D(y_texture, v_texCoord);
          vec4 uv_color = texture2D(uv_texture, v_texCoord);
          
          float y = y_color.r;
          // V2 引擎底层已经自动标准化为标准输出，直接用即可，不要猜！
          float u = uv_color.a - 0.5;
          float v = uv_color.r - 0.5;
          
          float r = y + 1.402 * v;
          float g = y - 0.344 * u - 0.714 * v;
          float b = y + 1.772 * u;
          
          gl_FragColor = vec4(r, g, b, 1.0);
        }
      `;

      const compileShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
      };

      const program = gl.createProgram();
      gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource));
      gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource));
      gl.linkProgram(program);
      gl.useProgram(program);

      const vertices = new Float32Array([
        -1.0, -1.0,  0.0, 1.0,   1.0, -1.0,  1.0, 1.0,
        -1.0,  1.0,  0.0, 0.0,   1.0,  1.0,  1.0, 0.0
      ]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(program, 'a_position');
      const aTex = gl.getAttribLocation(program, 'a_texCoord');
      gl.enableVertexAttribArray(aPos);
      gl.enableVertexAttribArray(aTex);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

      this._glProgram = program;
      this._yTexLoc = gl.getUniformLocation(program, 'y_texture');
      this._uvTexLoc = gl.getUniformLocation(program, 'uv_texture');
    },

    renderARCameraFrame(frame) {
      const gl = this._gl;
      if (!gl || !this._glProgram || !frame.camera) return;

      gl.viewport(0, 0, this._canvasNode.width, this._canvasNode.height);
      gl.useProgram(this._glProgram);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frame.camera.yTexture);
      // 兼容非 2 次方纹理的核心指令
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(this._yTexLoc, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, frame.camera.uvTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(this._uvTexLoc, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },

    runARLoop() {
      if (!this._vkSession || this.radarMode !== 'ar') return;
      this._renderLoopId = this._vkSession.requestAnimationFrame(() => {
        this.runARLoop(); 
        
        const frame = this._vkSession.getVKFrame(this._canvasNode.width, this._canvasNode.height);
        if (frame) {
          this._lastFrame = frame;
          this.updateARLogic(frame);
          this.renderARCameraFrame(frame); 
          
          if (this._needSnapshot) {
            this._needSnapshot = false;
            this.executePixelExtraction();
          }
        }
      });
    },

    updateARLogic(frame) {
      if (frame.camera && frame.camera.viewMatrix) {
        const vm = frame.camera.viewMatrix;
        this.rollAngle = Math.atan2(vm[1], vm[5]) * (180 / Math.PI);
        this.pitchAngle = Math.asin(-vm[9]) * (180 / Math.PI);
      }
      
      const hitRes = this._vkSession.hitTest(0.5, 0.5);
      if (hitRes && hitRes.length > 0) {
        const t = hitRes[0].transform;
        this.realDistance = Math.sqrt(t[12]**2 + t[13]**2 + t[14]**2);
        this.hasHit = true;
      } else {
        this.hasHit = false;
      }
      
      const now = Date.now();
      if (this.aiRunning && now - this.lastAITime > 5000) {
        this.lastAITime = now;
        this.runAIAnalysis();
      }
    },
    
    stopAR() {
      if (this._vkSession) {
        if (this._renderLoopId) this._vkSession.cancelAnimationFrame(this._renderLoopId);
        try { this._vkSession.destroy(); } catch (e) {}
        this._vkSession = null;
        this._gl = null;
        this._lastFrame = null;
      }
    },

    // 💡 安全提帧：保证 AI 和拍照 100% 运行
    executePixelExtraction() {
      if (!this._gl || !this._canvasNode || !this._photoCanvasNode || !this._lastFrame) return;
      
      const gl = this._gl;
      this.renderARCameraFrame(this._lastFrame); 
      
      const width = this._canvasNode.width;
      const height = this._canvasNode.height;
      const pixels = new Uint8ClampedArray(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      
      const bytesPerRow = width * 4;
      const temp = new Uint8ClampedArray(bytesPerRow);
      for (let y = 0; y < Math.floor(height / 2); y++) {
        const top = y * bytesPerRow;
        const bottom = (height - y - 1) * bytesPerRow;
        temp.set(pixels.subarray(top, top + bytesPerRow));
        pixels.set(pixels.subarray(bottom, bottom + bytesPerRow), top);
        pixels.set(temp, bottom);
      }
      
      const ctx2d = this._photoCanvasNode.getContext('2d');
      if (!ctx2d) return;
      this._photoCanvasNode.width = width;
      this._photoCanvasNode.height = height;
      ctx2d.clearRect(0, 0, width, height);
      
      const imageData = ctx2d.createImageData(width, height);
      imageData.data.set(pixels);
      ctx2d.putImageData(imageData, 0, 0);
      
      wx.canvasToTempFilePath({
        canvas: this._photoCanvasNode,
        destWidth: width,
        destHeight: height,
        success: (res) => { 
          if (this._snapshotCallback) {
            this._snapshotCallback(res.tempFilePath);
            this._snapshotCallback = null;
          }
        },
        fail: (err) => { console.error("生成图片失败", err); }
      });
    },

    takePhoto() {
      uni.vibrateShort();
      if (this.radarMode === 'visual') {
        if (!this.isAuth) return;
        uni.createCameraContext().takePhoto({
          quality: 'high',
          success: (res) => this.saveToAlbum(res.tempImagePath || res.tempFilePath),
          fail: () => uni.showToast({ title: '拍照失败', icon: 'none' })
        });
      } else {
        this._needSnapshot = true;
        this._snapshotCallback = (path) => { this.saveToAlbum(path); };
      }
    },
    saveToAlbum(path) {
      uni.saveImageToPhotosAlbum({
        filePath: path,
        success: () => uni.showToast({ title: '照片已保存', icon: 'success' })
      });
    },

    triggerManualScan() {
      this.aiMessage = "雷达扫描分析中...";
      this.runAIAnalysis();
    },

    toggleAI() {
      this.aiRunning = !this.aiRunning;
      if (this.aiRunning) {
        this.aiMessage = 'AI 连续扫描开启...';
        this.runAIAnalysis();
        if (this.radarMode === 'visual') this.aiTimer = setInterval(this.runAIAnalysis, 5000);
      } else {
        if (this.aiTimer) clearInterval(this.aiTimer);
        this.aiMessage = '';
        this.aiDistance = 0;
      }
    },

    runAIAnalysis() {
      const successCb = (resPath) => {
        smartAnalyzeApi(resPath, {
            mode: this.smartMode || 'person',
            tilt_angle: this.displayRoll.toString()
          })
          .then((uploadRes) => {
              const result = uploadRes.data;
              if (result.code === 200) {
                this.aiMessage = result.data.advice;
                
                if (this.radarMode === 'visual') {
                  const ratio = result.data.subject_ratio;
                  const objectName = result.data.subject_name || this.smartMode;
                  let realWidth = result.data.subject_real_width; 
                  if (!realWidth) {
                    const widthMap = { 'person': 0.40, 'face': 0.15, 'hand': 0.10, 'object': 0.15, 'scenery': 5.0 };
                    realWidth = widthMap[objectName] || widthMap[this.smartMode] || 0.2;
                  }
                  if (result.data.subject_name && result.data.subject_real_width) {
                    this.aiSubjectRef = `参考: ${result.data.subject_name}`;
                  } else {
                    const labelMap = {'person': '人体40cm', 'object': '物体15cm', 'scenery': '建筑5m'};
                    this.aiSubjectRef = `参考: ${labelMap[this.smartMode] || '识别物'}`;
                  }
                  
                  if (ratio && ratio > 0) {
                    const FOV_CONSTANT_K = 1.3;
                    this.aiDistance = realWidth / (ratio * FOV_CONSTANT_K);
                    this.hasHit = true;
                    setTimeout(() => { if (!this.aiRunning) this.hasHit = false; }, 3000);
                  }
                }
                
                if (result.data.is_perfect) {
                  this.isPerfect = true;
                  uni.vibrateLong();
                  this.takePhoto(); 
                  setTimeout(() => { this.isPerfect = false; }, 3000);
                }
              }
          })
          .catch(() => {
            this.aiMessage = '网络异常';
          });
      };

      if (this.radarMode === 'visual') {
        if (!this.isAuth) return;
        uni.createCameraContext().takePhoto({ quality: 'low', success: (res) => successCb(res.tempImagePath || res.tempFilePath) });
      } else {
        this._needSnapshot = true;
        this._snapshotCallback = (path) => { successCb(path); };
      }
    },

    setSmartMode(mode) {
      this.smartMode = mode;
      uni.showToast({ title: mode ? `目标：${mode}` : '自由拍摄', icon: 'none' });
    },
    onCameraError() { uni.showToast({ title: '相机调用异常', icon: 'none' }); }
  }
};
</script>

<style scoped>
.container { width: 100vw; height: 100vh; background: #000; overflow: hidden; display: flex; flex-direction: column; }
.camera-view { flex: 1; width: 100%; position: relative; z-index: 1; }

.ar-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }

/* HUD 工业风设计 */
.hud-panel { position: absolute; top: 60rpx; left: 40rpx; background: rgba(0, 20, 20, 0.7); border: 2rpx solid; border-radius: 8rpx; padding: 20rpx; width: 340rpx; transition: all 0.3s;}
.hud-header { font-size: 22rpx; font-weight: bold; margin-bottom: 10rpx; transition: color 0.3s;}
.hud-line { height: 1px; margin-bottom: 15rpx; transition: background 0.3s;}
.hud-row { display: flex; justify-content: space-between; margin-bottom: 10rpx; }
.hud-label { color: #888; font-size: 20rpx; }
.hud-value { color: #fff; font-size: 20rpx; font-family: monospace; }
.highlight { font-weight: bold; transition: color 0.3s;}
.dist-row { margin-top: 10rpx; padding-top: 10rpx; border-top: 1px dashed rgba(255,255,255,0.2); }

/* 准星 */
.reticle-wrap { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
.reticle-circle { width: 80rpx; height: 80rpx; border: 2rpx solid rgba(255,255,255,0.3); border-radius: 50%; transition: all 0.2s; }
.reticle-dot { position: absolute; top: 50%; left: 50%; width: 8rpx; height: 8rpx; background: #fff; border-radius: 50%; transform: translate(-50%, -50%); transition: all 0.2s;}

/* AR 绿色高亮 */
.reticle-active { width: 100rpx; height: 100rpx; border-color: #39FF14; border-width: 4rpx; box-shadow: 0 0 20rpx rgba(57, 255, 20, 0.5); }
.dot-active { background: #39FF14; transform: translate(-50%, -50%) scale(1.5); }

/* 视觉 蓝色高亮 */
.reticle-active-visual { width: 100rpx; height: 100rpx; border-color: #00c2ff; border-width: 4rpx; box-shadow: 0 0 20rpx rgba(0, 194, 255, 0.5); }
.dot-active-visual { background: #00c2ff; transform: translate(-50%, -50%) scale(1.5); }

/* AI 提示 */
.ai-bubble-wrap { position: absolute; bottom: 60rpx; left: 0; right: 0; display: flex; justify-content: center; }
.ai-bubble { background: rgba(0,0,0,0.8); border: 2rpx solid #fff; border-radius: 40rpx; padding: 20rpx 40rpx; max-width: 80%; }
.ai-text { color: #fff; font-size: 26rpx; text-align: center; }
.perfect-bubble { border-color: #39FF14; background: rgba(57, 255, 20, 0.2); }
.perfect-frame { position: absolute; top: 0; left: 0; right: 0; bottom: 0; border: 12rpx solid #39FF14; box-shadow: inset 0 0 60rpx rgba(57,255,20,0.4); }

/* 控制栏 */
.footer { height: 380rpx; background: #111; display: flex; flex-direction: column; padding-top: 20rpx; z-index: 10; position: relative;}
.mode-selector { display: flex; justify-content: center; gap: 30rpx; margin-bottom: 30rpx; }
.mode-item { color: #666; font-size: 24rpx; padding: 10rpx 24rpx; border-radius: 30rpx; background: #222; }
.mode-item.active { color: #000; background: #00ffcc; font-weight: bold; }

.tools-scroll { height: 120rpx; margin-bottom: 20rpx; }
.tools-inner { display: flex; gap: 60rpx; padding: 0 40rpx; align-items: center; }
.btn { display: flex; flex-direction: column; align-items: center; min-width: 100rpx; pointer-events: auto; }
.emoji { font-size: 44rpx; }
.desc { color: #888; font-size: 20rpx; margin-top: 8rpx; }

.shutter-zone { flex: 1; display: flex; justify-content: center; align-items: center; pointer-events: auto; }
.shutter-outer { width: 130rpx; height: 130rpx; border: 6rpx solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.1s;}
.shutter-outer:active { transform: scale(0.95); }
.shutter-inner { width: 105rpx; height: 105rpx; background: #fff; border-radius: 50%; }

.permission-box { flex: 1; background: #1a1a1a; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.p-icon { font-size: 100rpx; margin-bottom: 40rpx; }
.p-text { color: #888; margin-bottom: 50rpx; }
.p-btn { background: #00ffcc; color: #000; font-weight: bold; padding: 0 60rpx; border-radius: 50rpx; }

/* 布局修正：AR 底栏内容可换行/横滑，不再把视图挤偏 */
.container {
  width: 100%;
  min-width: 0;
}

.camera-view {
  min-height: 0;
}

.footer {
  flex-shrink: 0;
  height: auto;
  min-height: 360rpx;
  padding-left: 20rpx;
  padding-right: 20rpx;
  padding-bottom: env(safe-area-inset-bottom, 20rpx);
}

.mode-selector {
  width: 100%;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 0 8rpx;
}

.mode-item {
  flex: 1 1 150rpx;
  text-align: center;
  white-space: nowrap;
}

.tools-scroll {
  width: 100%;
  white-space: nowrap;
}

.tools-inner {
  width: max-content;
  min-width: 100%;
  gap: 36rpx;
  padding: 0 20rpx;
}

.btn {
  flex: 0 0 128rpx;
}

.desc {
  width: 128rpx;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hud-panel {
  max-width: calc(100% - 80rpx);
}
</style>
