"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  data() {
    return {
      username: "",
      showFaceCamera: false,
      faceRegistered: false
    };
  },
  onShow() {
    this.username = common_vendor.index.getStorageSync("username") || "用户";
    if (this.username && this.username !== "用户") {
      utils_request.getUserInfoApi(this.username).then((res) => {
        if (res.statusCode === 200 && res.data.user) {
          this.faceRegistered = !!res.data.user.face_registered;
        }
      }).catch(() => {
      });
    }
  },
  methods: {
    captureAndBindFace() {
      const ctx = common_vendor.index.createCameraContext();
      ctx.takePhoto({
        quality: "high",
        success: (res) => {
          common_vendor.index.showLoading({ title: "正在绑定...", mask: true });
          const filePath = res.tempImagePath || res.tempFilePath;
          const fs = common_vendor.index.getFileSystemManager();
          const base64Data = fs.readFileSync(filePath, "base64");
          utils_request.updateFaceApi({
            username: this.username,
            face_data: base64Data
          }).then((result) => {
            common_vendor.index.hideLoading();
            if (result.statusCode === 200) {
              this.faceRegistered = true;
              common_vendor.index.showToast({ title: "绑定成功", icon: "success" });
              this.showFaceCamera = false;
            } else {
              common_vendor.index.showModal({
                title: "绑定失败",
                content: result.data.error || "请重试",
                showCancel: false
              });
            }
          }).catch(() => {
            common_vendor.index.hideLoading();
            common_vendor.index.showToast({ title: "网络错误", icon: "none" });
          });
        },
        fail: () => {
          common_vendor.index.showToast({ title: "摄像头启动失败", icon: "none" });
        }
      });
    },
    goHome() {
    },
    goToCamera() {
      common_vendor.index.navigateTo({ url: "/pages/camera/index" });
    },
    goToAnalyze() {
      common_vendor.index.navigateTo({ url: "/pages/analyze/index" });
    },
    goToEnvironment() {
      common_vendor.index.navigateTo({ url: "/pages/environment/index" });
    },
    goToTemplate() {
      common_vendor.index.navigateTo({ url: "/pages/template/index" });
    },
    goToTemplateCollection() {
      common_vendor.index.navigateTo({ url: "/pages/template/templateCollection" });
    },
    goToProfile() {
      common_vendor.index.navigateTo({ url: "/pages/profile/index" });
    },
    goToMetro() {
      common_vendor.index.navigateTo({ url: "/pages/metro/index" });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.t($data.username),
    b: common_vendor.o((...args) => $options.goToCamera && $options.goToCamera(...args)),
    c: common_vendor.o((...args) => $options.goToCamera && $options.goToCamera(...args)),
    d: common_vendor.t($data.faceRegistered ? "✅" : "🔐"),
    e: common_vendor.n($data.faceRegistered ? "face-bound" : ""),
    f: common_vendor.t($data.faceRegistered ? "人脸已绑定" : "人脸绑定"),
    g: common_vendor.o(($event) => $data.showFaceCamera = true),
    h: common_vendor.o((...args) => $options.goToAnalyze && $options.goToAnalyze(...args)),
    i: common_vendor.o((...args) => $options.goToEnvironment && $options.goToEnvironment(...args)),
    j: common_vendor.o((...args) => $options.goToTemplate && $options.goToTemplate(...args)),
    k: common_vendor.o((...args) => $options.goToTemplateCollection && $options.goToTemplateCollection(...args)),
    l: common_vendor.o((...args) => $options.goToMetro && $options.goToMetro(...args)),
    m: common_vendor.o((...args) => $options.goHome && $options.goHome(...args)),
    n: common_vendor.o((...args) => $options.goToProfile && $options.goToProfile(...args)),
    o: $data.showFaceCamera
  }, $data.showFaceCamera ? {
    p: common_vendor.o((...args) => $options.captureAndBindFace && $options.captureAndBindFace(...args)),
    q: common_vendor.o(($event) => $data.showFaceCamera = false)
  } : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-4978fed5"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/home/index.js.map
