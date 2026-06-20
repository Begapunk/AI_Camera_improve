"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const OFFLINE_KEY = "metro_offline_queue";
const _sfc_main = {
  data() {
    return {
      worker: "",
      deviceCode: "",
      deviceInfo: null,
      deviceQueried: false,
      // 登记
      showRegister: false,
      families: {},
      modelList: [],
      regModel: "",
      regStation: "",
      regBaselinePath: "",
      // 拍摄/检测
      photoPath: "",
      detecting: false,
      result: null,
      confirmed: false,
      // 离线
      offlineQueue: [],
      syncing: false
    };
  },
  computed: {
    canDetect() {
      return !!this.photoPath && !!this.deviceCode;
    },
    resultClass() {
      return { PASS: "green", REVIEW: "yellow", BLOCKED: "red", RETAKE: "gray" }[this.result.result] || "gray";
    },
    resultLabel() {
      return { PASS: "✓ 通过 可合盖", REVIEW: "⚠ 需人工复核", BLOCKED: "✕ 禁止合盖", RETAKE: "↻ 请重拍" }[this.result.result] || this.result.result;
    },
    needConfirm() {
      return this.result && (this.result.result === "REVIEW" || this.result.result === "BLOCKED");
    }
  },
  onLoad() {
    this.worker = common_vendor.index.getStorageSync("username") || "";
    this.offlineQueue = common_vendor.index.getStorageSync(OFFLINE_KEY) || [];
    this.loadModels();
  },
  methods: {
    async loadModels() {
      try {
        const res = await utils_request.metroModelsApi();
        this.families = res.data && res.data.families || {};
        this.modelList = Object.values(this.families).reduce((a, b) => a.concat(b), []);
      } catch (e) {
      }
    },
    scanDevice() {
      common_vendor.index.scanCode({
        success: (r) => {
          this.deviceCode = r.result;
          this.loadDevice();
        },
        fail: () => common_vendor.index.showToast({ title: "扫码取消", icon: "none" })
      });
    },
    async loadDevice() {
      if (!this.deviceCode)
        return common_vendor.index.showToast({ title: "请输入编号", icon: "none" });
      this.deviceQueried = true;
      try {
        const res = await utils_request.metroGetDeviceApi(this.deviceCode);
        if (res.statusCode === 200 && res.data.exists) {
          this.deviceInfo = res.data.device;
          this.showRegister = false;
        } else {
          this.deviceInfo = null;
        }
      } catch (e) {
        this.deviceInfo = null;
        common_vendor.index.showToast({ title: "查询失败", icon: "none" });
      }
    },
    onModelPick(e) {
      this.regModel = this.modelList[e.detail.value];
    },
    captureBaseline() {
      common_vendor.index.chooseImage({
        count: 1,
        sourceType: ["camera"],
        success: (r) => {
          this.regBaselinePath = r.tempFilePaths[0];
        }
      });
    },
    async registerDevice() {
      if (!this.deviceCode || !this.regModel)
        return common_vendor.index.showToast({ title: "编号与型号必填", icon: "none" });
      if (!this.regBaselinePath)
        return common_vendor.index.showToast({ title: "请采集基准图", icon: "none" });
      common_vendor.index.showLoading({ title: "登记中...", mask: true });
      try {
        await utils_request.metroRegisterDeviceApi(this.regBaselinePath, {
          device_code: this.deviceCode,
          model: this.regModel,
          station: this.regStation
        });
        common_vendor.index.hideLoading();
        common_vendor.index.showToast({ title: "登记成功", icon: "success" });
        this.showRegister = false;
        this.loadDevice();
      } catch (e) {
        common_vendor.index.hideLoading();
        common_vendor.index.showToast({ title: "登记失败", icon: "none" });
      }
    },
    capturePhoto() {
      common_vendor.index.chooseImage({
        count: 1,
        sourceType: ["camera"],
        success: (r) => {
          this.photoPath = r.tempFilePaths[0];
          this.result = null;
          this.confirmed = false;
        }
      });
    },
    async runDetect() {
      if (!this.canDetect || this.detecting)
        return;
      this.detecting = true;
      this.result = null;
      this.confirmed = false;
      common_vendor.index.showLoading({ title: "检测中...", mask: true });
      const formData = {
        device_code: this.deviceCode,
        worker_id: this.worker,
        captured_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      try {
        const data = await utils_request.metroDetectApi(this.photoPath, formData);
        this.result = data;
      } catch (e) {
        this.enqueueOffline(formData);
        common_vendor.index.showModal({
          title: "网络不可用",
          content: "已离线留证，回到有信号处可补传。请勿据此判定安全。",
          showCancel: false
        });
      } finally {
        this.detecting = false;
        common_vendor.index.hideLoading();
      }
    },
    enqueueOffline(formData) {
      this.offlineQueue.push({ photoPath: this.photoPath, formData });
      common_vendor.index.setStorageSync(OFFLINE_KEY, this.offlineQueue);
    },
    async syncOffline() {
      if (this.syncing || !this.offlineQueue.length)
        return;
      this.syncing = true;
      const remain = [];
      for (const item of this.offlineQueue) {
        try {
          await utils_request.metroDetectApi(item.photoPath, { ...item.formData, offline_flag: "1" });
        } catch (e) {
          remain.push(item);
        }
      }
      this.offlineQueue = remain;
      common_vendor.index.setStorageSync(OFFLINE_KEY, remain);
      this.syncing = false;
      common_vendor.index.showToast({ title: remain.length ? "部分补传失败" : "补传完成", icon: "none" });
    },
    async doConfirm(action) {
      if (!this.result || !this.result.trace_id)
        return;
      try {
        await utils_request.metroConfirmApi(this.result.trace_id, { confirmed_by: this.worker, confirm_action: action });
        this.confirmed = true;
        common_vendor.index.showToast({ title: "已记录", icon: "success" });
      } catch (e) {
        common_vendor.index.showToast({ title: "记录失败", icon: "none" });
      }
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.offlineQueue.length
  }, $data.offlineQueue.length ? {
    b: common_vendor.t($data.offlineQueue.length),
    c: common_vendor.t($data.syncing ? "补传中..." : "立即补传"),
    d: common_vendor.o((...args) => $options.syncOffline && $options.syncOffline(...args)),
    e: $data.syncing ? 1 : ""
  } : {}, {
    f: $data.deviceCode,
    g: common_vendor.o(($event) => $data.deviceCode = $event.detail.value),
    h: common_vendor.o((...args) => $options.scanDevice && $options.scanDevice(...args)),
    i: common_vendor.o((...args) => $options.loadDevice && $options.loadDevice(...args)),
    j: $data.deviceInfo
  }, $data.deviceInfo ? {
    k: common_vendor.t($data.deviceInfo.model),
    l: common_vendor.t($data.deviceInfo.family),
    m: common_vendor.t($data.deviceInfo.station || "—"),
    n: common_vendor.t($data.deviceInfo.baseline_ready ? "已就绪 v" + $data.deviceInfo.baseline_version : "未就绪（将降级人工复核）"),
    o: common_vendor.n($data.deviceInfo.baseline_ready ? "ok" : "warn")
  } : $data.deviceQueried ? {
    q: common_vendor.t($data.showRegister ? "收起登记" : "去登记设备 ▸"),
    r: common_vendor.o(($event) => $data.showRegister = !$data.showRegister)
  } : {}, {
    p: $data.deviceQueried,
    s: $data.showRegister
  }, $data.showRegister ? common_vendor.e({
    t: common_vendor.t($data.regModel || "选择型号"),
    v: $data.modelList,
    w: common_vendor.o((...args) => $options.onModelPick && $options.onModelPick(...args)),
    x: $data.regStation,
    y: common_vendor.o(($event) => $data.regStation = $event.detail.value),
    z: common_vendor.o((...args) => $options.captureBaseline && $options.captureBaseline(...args)),
    A: $data.regBaselinePath
  }, $data.regBaselinePath ? {} : {}, {
    B: common_vendor.o((...args) => $options.registerDevice && $options.registerDevice(...args))
  }) : {}, {
    C: $data.photoPath
  }, $data.photoPath ? {
    D: $data.photoPath
  } : {}, {
    E: common_vendor.o((...args) => $options.capturePhoto && $options.capturePhoto(...args)),
    F: common_vendor.t($data.detecting ? "检测中..." : "开始检测"),
    G: !$options.canDetect || $data.detecting ? 1 : "",
    H: common_vendor.o((...args) => $options.runDetect && $options.runDetect(...args)),
    I: $data.result
  }, $data.result ? common_vendor.e({
    J: common_vendor.t($options.resultLabel),
    K: common_vendor.t($data.result.message),
    L: common_vendor.n($options.resultClass),
    M: $data.result.annotated_url
  }, $data.result.annotated_url ? {
    N: $data.result.annotated_url
  } : {}, {
    O: common_vendor.t(($data.result.quality_score * 100).toFixed(0)),
    P: common_vendor.t($data.result.baseline_version ? "v" + $data.result.baseline_version : "无"),
    Q: $data.result.detections && $data.result.detections.length
  }, $data.result.detections && $data.result.detections.length ? {
    R: common_vendor.f($data.result.detections, (d, i, i0) => {
      return {
        a: common_vendor.t(d.source === "yolo" ? "工器具" : "差分"),
        b: common_vendor.n(d.source),
        c: common_vendor.t(d.label),
        d: common_vendor.t((d.conf * 100).toFixed(0)),
        e: i
      };
    })
  } : {}, {
    S: $options.needConfirm && !$data.confirmed
  }, $options.needConfirm && !$data.confirmed ? {
    T: common_vendor.o(($event) => $options.doConfirm("确认安全，无遗留物")),
    U: common_vendor.o(($event) => $options.doConfirm("已取出工具，需重拍复检"))
  } : {}, {
    V: $data.confirmed
  }, $data.confirmed ? {} : {}) : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-42e515c9"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/metro/index.js.map
