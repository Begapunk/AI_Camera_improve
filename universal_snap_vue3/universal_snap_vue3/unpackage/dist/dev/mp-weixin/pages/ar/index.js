"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  data() {
    return {
      radarMode: "visual",
      isAuth: false,
      isSupportAR: true,
      smartMode: "object",
      aiRunning: false,
      aiMessage: "",
      isPerfect: false,
      rollAngle: 0,
      pitchAngle: 0,
      aiDistance: 0,
      aiSubjectRef: "",
      realDistance: 0,
      hasHit: false,
      serverUrl: utils_request.getBaseUrl(),
      lastAITime: 0,
      aiTimer: null,
      lastRawRoll: 0,
      lastRawPitch: 0
    };
  },
  computed: {
    displayRoll() {
      return Math.round(this.rollAngle);
    },
    displayPitch() {
      return Math.round(this.pitchAngle);
    },
    distanceText() {
      if (this.radarMode === "ar") {
        return this.hasHit ? this.realDistance.toFixed(2) + "m (AR 激光锁定)" : "寻找平面中...";
      }
      if (this.aiDistance > 0) {
        return `${this.aiDistance.toFixed(2)}m (${this.aiSubjectRef})`;
      }
      const p = this.pitchAngle;
      if (p < -2)
        return "仰角 (高处)";
      if (p >= -2 && p <= 2)
        return "> 10m (平视)";
      const theta = p * (Math.PI / 180);
      let dist = 1.4 / Math.tan(theta);
      if (dist > 15)
        return "> 15m";
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
    if (this.radarMode === "visual")
      this.startSensors();
  },
  onHide() {
    this.stopSensors();
  },
  onUnload() {
    this.stopAllEngines();
  },
  methods: {
    goBack() {
      common_vendor.index.navigateBack();
    },
    // 💡 解除死锁的核心：严格的互斥卸载
    toggleRadarMode() {
      common_vendor.index.vibrateShort();
      this.aiMessage = "";
      this.hasHit = false;
      this.isPerfect = false;
      if (this.radarMode === "visual") {
        if (!common_vendor.wx$1.isVKSupport || !common_vendor.wx$1.isVKSupport("v2")) {
          common_vendor.index.showToast({ title: "设备不支持 AR 引擎", icon: "none" });
          return;
        }
        this.stopSensors();
        if (this.aiTimer)
          clearInterval(this.aiTimer);
        this.radarMode = "ar";
        this.$nextTick(() => {
          this.checkAndInitAR();
        });
        common_vendor.index.showToast({ title: "启动 AR 引擎中...", icon: "none" });
      } else {
        this.stopAR();
        this.radarMode = "visual";
        this.$nextTick(() => {
          this.initCamera();
          this.startSensors();
        });
        common_vendor.index.showToast({ title: "已切换至视觉模式", icon: "none" });
      }
    },
    stopAllEngines() {
      this.stopSensors();
      this.stopAR();
      if (this.aiTimer)
        clearInterval(this.aiTimer);
    },
    initCamera() {
      common_vendor.index.authorize({
        scope: "scope.camera",
        success: () => {
          this.isAuth = true;
        },
        fail: () => {
          common_vendor.index.showToast({ title: "需要相机权限", icon: "none" });
        }
      });
    },
    startSensors() {
      common_vendor.index.startAccelerometer({
        interval: "ui",
        success: () => {
          common_vendor.index.onAccelerometerChange((res) => {
            if (this.radarMode !== "visual")
              return;
            let rawRoll = Math.atan2(res.x, -res.y) * (180 / Math.PI);
            let rawPitch = Math.atan2(res.z, -res.y) * (180 / Math.PI);
            let deltaRoll = rawRoll - this.lastRawRoll;
            if (deltaRoll > 180)
              rawRoll -= 360;
            else if (deltaRoll < -180)
              rawRoll += 360;
            this.lastRawRoll = rawRoll;
            this.rollAngle = this.rollAngle + (rawRoll - this.rollAngle) * 0.1;
            let deltaPitch = rawPitch - this.lastRawPitch;
            if (deltaPitch > 180)
              rawPitch -= 360;
            else if (deltaPitch < -180)
              rawPitch += 360;
            this.lastRawPitch = rawPitch;
            this.pitchAngle = this.pitchAngle + (rawPitch - this.pitchAngle) * 0.1;
          });
        }
      });
    },
    stopSensors() {
      common_vendor.index.stopAccelerometer();
    },
    // ================== AR 引擎与官方标准化 WebGL ==================
    checkAndInitAR() {
      this.isSupportAR = true;
      this.$nextTick(() => {
        common_vendor.index.createSelectorQuery().in(this).select("#webgl").fields({ node: true, size: true }).select("#photo-canvas").fields({ node: true }).exec((res) => {
          if (res && res[0] && res[0].node) {
            this._canvasNode = res[0].node;
            if (res[1] && res[1].node)
              this._photoCanvasNode = res[1].node;
            const sysInfo = common_vendor.index.getSystemInfoSync();
            const dpr = sysInfo.pixelRatio;
            this._canvasNode.width = (res[0].width || sysInfo.windowWidth) * dpr;
            this._canvasNode.height = (res[0].height || sysInfo.windowHeight) * dpr;
            this._gl = this._canvasNode.getContext("webgl", { alpha: false });
            this.initVKSession();
          }
        });
      });
    },
    initVKSession() {
      if (!this._canvasNode || !this._gl)
        return;
      this.initWebGLShader(this._gl);
      this._vkSession = common_vendor.wx$1.createVKSession({
        track: { plane: { mode: 3 } },
        version: "v2",
        gl: this._gl
      });
      this._vkSession.start((err) => {
        if (err) {
          common_vendor.index.showToast({ title: "AR启动失败", icon: "none" });
          return;
        }
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
        -1,
        -1,
        0,
        1,
        1,
        -1,
        1,
        1,
        -1,
        1,
        0,
        0,
        1,
        1,
        1,
        0
      ]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(program, "a_position");
      const aTex = gl.getAttribLocation(program, "a_texCoord");
      gl.enableVertexAttribArray(aPos);
      gl.enableVertexAttribArray(aTex);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);
      this._glProgram = program;
      this._yTexLoc = gl.getUniformLocation(program, "y_texture");
      this._uvTexLoc = gl.getUniformLocation(program, "uv_texture");
    },
    renderARCameraFrame(frame) {
      const gl = this._gl;
      if (!gl || !this._glProgram || !frame.camera)
        return;
      gl.viewport(0, 0, this._canvasNode.width, this._canvasNode.height);
      gl.useProgram(this._glProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frame.camera.yTexture);
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
      if (!this._vkSession || this.radarMode !== "ar")
        return;
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
        this.realDistance = Math.sqrt(t[12] ** 2 + t[13] ** 2 + t[14] ** 2);
        this.hasHit = true;
      } else {
        this.hasHit = false;
      }
      const now = Date.now();
      if (this.aiRunning && now - this.lastAITime > 5e3) {
        this.lastAITime = now;
        this.runAIAnalysis();
      }
    },
    stopAR() {
      if (this._vkSession) {
        if (this._renderLoopId)
          this._vkSession.cancelAnimationFrame(this._renderLoopId);
        try {
          this._vkSession.destroy();
        } catch (e) {
        }
        this._vkSession = null;
        this._gl = null;
        this._lastFrame = null;
      }
    },
    // 💡 安全提帧：保证 AI 和拍照 100% 运行
    executePixelExtraction() {
      if (!this._gl || !this._canvasNode || !this._photoCanvasNode || !this._lastFrame)
        return;
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
      const ctx2d = this._photoCanvasNode.getContext("2d");
      if (!ctx2d)
        return;
      this._photoCanvasNode.width = width;
      this._photoCanvasNode.height = height;
      ctx2d.clearRect(0, 0, width, height);
      const imageData = ctx2d.createImageData(width, height);
      imageData.data.set(pixels);
      ctx2d.putImageData(imageData, 0, 0);
      common_vendor.wx$1.canvasToTempFilePath({
        canvas: this._photoCanvasNode,
        destWidth: width,
        destHeight: height,
        success: (res) => {
          if (this._snapshotCallback) {
            this._snapshotCallback(res.tempFilePath);
            this._snapshotCallback = null;
          }
        },
        fail: (err) => {
          common_vendor.index.__f__("error", "at pages/ar/index.vue:507", "生成图片失败", err);
        }
      });
    },
    takePhoto() {
      common_vendor.index.vibrateShort();
      if (this.radarMode === "visual") {
        if (!this.isAuth)
          return;
        common_vendor.index.createCameraContext().takePhoto({
          quality: "high",
          success: (res) => this.saveToAlbum(res.tempFilePath),
          fail: () => common_vendor.index.showToast({ title: "拍照失败", icon: "none" })
        });
      } else {
        this._needSnapshot = true;
        this._snapshotCallback = (path) => {
          this.saveToAlbum(path);
        };
      }
    },
    saveToAlbum(path) {
      common_vendor.index.saveImageToPhotosAlbum({
        filePath: path,
        success: () => common_vendor.index.showToast({ title: "照片已保存", icon: "success" })
      });
    },
    triggerManualScan() {
      this.aiMessage = "雷达扫描分析中...";
      this.runAIAnalysis();
    },
    toggleAI() {
      this.aiRunning = !this.aiRunning;
      if (this.aiRunning) {
        this.aiMessage = "AI 连续扫描开启...";
        this.runAIAnalysis();
        if (this.radarMode === "visual")
          this.aiTimer = setInterval(this.runAIAnalysis, 5e3);
      } else {
        if (this.aiTimer)
          clearInterval(this.aiTimer);
        this.aiMessage = "";
        this.aiDistance = 0;
      }
    },
    runAIAnalysis() {
      const successCb = (resPath) => {
        common_vendor.index.uploadFile({
          url: `${this.serverUrl}/smart-analyze`,
          filePath: resPath,
          name: "file",
          formData: {
            mode: this.smartMode || "person",
            tilt_angle: this.displayRoll.toString()
          },
          success: (uploadRes) => {
            try {
              const result = JSON.parse(uploadRes.data);
              if (result.code === 200) {
                this.aiMessage = result.data.advice;
                if (this.radarMode === "visual") {
                  const ratio = result.data.subject_ratio;
                  const objectName = result.data.subject_name || this.smartMode;
                  let realWidth = result.data.subject_real_width;
                  if (!realWidth) {
                    const widthMap = { "person": 0.4, "face": 0.15, "hand": 0.1, "object": 0.15, "scenery": 5 };
                    realWidth = widthMap[objectName] || widthMap[this.smartMode] || 0.2;
                  }
                  if (result.data.subject_name && result.data.subject_real_width) {
                    this.aiSubjectRef = `参考: ${result.data.subject_name}`;
                  } else {
                    const labelMap = { "person": "人体40cm", "object": "物体15cm", "scenery": "建筑5m" };
                    this.aiSubjectRef = `参考: ${labelMap[this.smartMode] || "识别物"}`;
                  }
                  if (ratio && ratio > 0) {
                    const FOV_CONSTANT_K = 1.3;
                    this.aiDistance = realWidth / (ratio * FOV_CONSTANT_K);
                    this.hasHit = true;
                    setTimeout(() => {
                      if (!this.aiRunning)
                        this.hasHit = false;
                    }, 3e3);
                  }
                }
                if (result.data.is_perfect) {
                  this.isPerfect = true;
                  common_vendor.index.vibrateLong();
                  this.takePhoto();
                  setTimeout(() => {
                    this.isPerfect = false;
                  }, 3e3);
                }
              }
            } catch (e) {
            }
          }
        });
      };
      if (this.radarMode === "visual") {
        if (!this.isAuth)
          return;
        common_vendor.index.createCameraContext().takePhoto({ quality: "low", success: (res) => successCb(res.tempFilePath) });
      } else {
        this._needSnapshot = true;
        this._snapshotCallback = (path) => {
          successCb(path);
        };
      }
    },
    setSmartMode(mode) {
      this.smartMode = mode;
      common_vendor.index.showToast({ title: mode ? `目标：${mode}` : "自由拍摄", icon: "none" });
    },
    onCameraError() {
      common_vendor.index.showToast({ title: "相机调用异常", icon: "none" });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.radarMode === "visual" && $data.isAuth
  }, $data.radarMode === "visual" && $data.isAuth ? common_vendor.e({
    b: common_vendor.t($options.displayRoll),
    c: common_vendor.t($options.displayPitch),
    d: common_vendor.t($options.distanceText),
    e: $data.hasHit ? 1 : "",
    f: $data.hasHit ? 1 : "",
    g: $data.aiMessage
  }, $data.aiMessage ? {
    h: common_vendor.t($data.isPerfect ? "✨ PERFECT" : $data.aiMessage),
    i: $data.isPerfect ? 1 : ""
  } : {}, {
    j: $data.isPerfect
  }, $data.isPerfect ? {} : {}, {
    k: common_vendor.o((...args) => $options.onCameraError && $options.onCameraError(...args))
  }) : {}, {
    l: $data.radarMode === "ar" && $data.isSupportAR
  }, $data.radarMode === "ar" && $data.isSupportAR ? common_vendor.e({
    m: common_vendor.t($options.displayRoll),
    n: common_vendor.t($options.displayPitch),
    o: common_vendor.t($options.distanceText),
    p: $data.hasHit ? 1 : "",
    q: $data.hasHit ? 1 : "",
    r: $data.aiMessage
  }, $data.aiMessage ? {
    s: common_vendor.t($data.isPerfect ? "✨ PERFECT" : $data.aiMessage),
    t: $data.isPerfect ? 1 : ""
  } : {}, {
    v: $data.isPerfect
  }, $data.isPerfect ? {} : {}) : {}, {
    w: !$data.isAuth && $data.radarMode === "visual"
  }, !$data.isAuth && $data.radarMode === "visual" ? {
    x: common_vendor.o((...args) => $options.initCamera && $options.initCamera(...args))
  } : {}, {
    y: !$data.isSupportAR && $data.radarMode === "ar"
  }, !$data.isSupportAR && $data.radarMode === "ar" ? {
    z: common_vendor.o((...args) => $options.toggleRadarMode && $options.toggleRadarMode(...args))
  } : {}, {
    A: $data.smartMode === "person" ? 1 : "",
    B: common_vendor.o(($event) => $options.setSmartMode("person")),
    C: $data.smartMode === "object" ? 1 : "",
    D: common_vendor.o(($event) => $options.setSmartMode("object")),
    E: $data.smartMode === "scenery" ? 1 : "",
    F: common_vendor.o(($event) => $options.setSmartMode("scenery")),
    G: $data.smartMode === "" ? 1 : "",
    H: common_vendor.o(($event) => $options.setSmartMode("")),
    I: common_vendor.t($data.radarMode === "visual" ? "👁️" : "🛰️"),
    J: common_vendor.t($data.radarMode === "visual" ? "启动AR引擎" : "切至视觉雷达"),
    K: common_vendor.o((...args) => $options.toggleRadarMode && $options.toggleRadarMode(...args)),
    L: common_vendor.o((...args) => $options.triggerManualScan && $options.triggerManualScan(...args)),
    M: common_vendor.t($data.aiRunning ? "🟢" : "⚪"),
    N: common_vendor.o((...args) => $options.toggleAI && $options.toggleAI(...args)),
    O: common_vendor.o((...args) => $options.goBack && $options.goBack(...args)),
    P: common_vendor.o((...args) => $options.takePhoto && $options.takePhoto(...args))
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-995ee9db"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ar/index.js.map
