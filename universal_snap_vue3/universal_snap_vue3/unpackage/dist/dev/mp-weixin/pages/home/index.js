"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  data() {
    return {
      username: "",
      showFaceCamera: false
      // 控制人脸补录相机的显示
    };
  },
  onShow() {
    this.username = common_vendor.index.getStorageSync("username") || "用户";
  },
  methods: {
    // 补录人脸的核心逻辑
    captureAndBindFace() {
      const ctx = common_vendor.index.createCameraContext();
      ctx.takePhoto({
        quality: "high",
        success: (res) => {
          common_vendor.index.showLoading({ title: "正在绑定...", mask: true });
          const fs = common_vendor.index.getFileSystemManager();
          const base64Data = fs.readFileSync(res.tempFilePath, "base64");
          common_vendor.index.request({
            url: `${utils_request.getBaseUrl()}`,
            method: "POST",
            data: {
              username: this.username,
              face_data: base64Data
            },
            success: (result) => {
              common_vendor.index.hideLoading();
              if (result.statusCode === 200) {
                common_vendor.index.showToast({ title: "绑定成功！", icon: "success" });
                this.showFaceCamera = false;
              } else {
                common_vendor.index.showModal({
                  title: "绑定失败",
                  content: result.data.error || "请重试",
                  showCancel: false
                });
              }
            },
            fail: () => {
              common_vendor.index.hideLoading();
              common_vendor.index.showToast({ title: "网络错误", icon: "none" });
            }
          });
        }
      });
    },
    goToCamera() {
      common_vendor.index.navigateTo({ url: "/pages/camera/index" });
    },
    // 【新增】跳转到独立的 AR 测距页面
    goToARCamera() {
      common_vendor.index.navigateTo({ url: "/pages/ar/index" });
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
    }
  }
};
if (!Array) {
  const _component_uni_icons = common_vendor.resolveComponent("uni-icons");
  _component_uni_icons();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.t($data.username),
    b: $data.showFaceCamera
  }, $data.showFaceCamera ? {
    c: common_vendor.o((...args) => $options.captureAndBindFace && $options.captureAndBindFace(...args)),
    d: common_vendor.o(($event) => $data.showFaceCamera = false)
  } : {}, {
    e: common_vendor.p({
      type: "camera-filled",
      size: "20",
      color: "#fff"
    }),
    f: common_vendor.o((...args) => $options.goToCamera && $options.goToCamera(...args)),
    g: common_vendor.p({
      type: "scan",
      size: "20",
      color: "#fff"
    }),
    h: common_vendor.o((...args) => $options.goToARCamera && $options.goToARCamera(...args)),
    i: common_vendor.p({
      type: "auth-filled",
      size: "20",
      color: "#fff"
    }),
    j: common_vendor.o(($event) => $data.showFaceCamera = true),
    k: common_vendor.p({
      type: "person-filled",
      size: "20",
      color: "#fff"
    }),
    l: common_vendor.o((...args) => $options.goToAnalyze && $options.goToAnalyze(...args)),
    m: common_vendor.p({
      type: "compass",
      size: "20",
      color: "#fff"
    }),
    n: common_vendor.o((...args) => $options.goToEnvironment && $options.goToEnvironment(...args)),
    o: common_vendor.p({
      type: "list",
      size: "20",
      color: "#fff"
    }),
    p: common_vendor.o((...args) => $options.goToTemplate && $options.goToTemplate(...args)),
    q: common_vendor.p({
      type: "folder",
      size: "20",
      color: "#fff"
    }),
    r: common_vendor.o((...args) => $options.goToTemplateCollection && $options.goToTemplateCollection(...args))
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-4978fed5"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/home/index.js.map
