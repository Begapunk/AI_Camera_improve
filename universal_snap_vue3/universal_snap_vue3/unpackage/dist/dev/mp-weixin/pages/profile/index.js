"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  data() {
    return {
      username: "用户昵称",
      userId: "88888888",
      photoCount: 0,
      score: 0,
      days: 0,
      avatar: ""
    };
  },
  onShow() {
    this.loadUserInfo();
  },
  methods: {
    loadUserInfo() {
      const storedUsername = common_vendor.index.getStorageSync("username");
      if (!storedUsername) {
        common_vendor.index.redirectTo({ url: "/pages/login/index" });
        return;
      }
      common_vendor.index.showLoading({ title: "加载中...", mask: true });
      utils_request.getUserInfoApi(storedUsername).then((res) => {
        common_vendor.index.hideLoading();
        if (res.statusCode === 200 && res.data.user) {
          const user = res.data.user;
          this.username = user.nickname || user.username || "用户昵称";
          this.userId = user.id || "88888888";
          this.avatar = user.avatar || "";
        }
      }).catch(() => {
        common_vendor.index.hideLoading();
        common_vendor.index.showToast({ title: "获取用户信息失败", icon: "none" });
      });
    },
    goHome() {
      common_vendor.index.navigateBack({ delta: 1 });
    },
    goToProfile() {
    },
    goToTemplateCollection() {
      common_vendor.index.navigateTo({ url: "/pages/template/templateCollection" });
    },
    goToAnalyze() {
      common_vendor.index.navigateTo({ url: "/pages/analyze/index" });
    },
    goToEnvironment() {
      common_vendor.index.navigateTo({ url: "/pages/environment/index" });
    },
    goToSettings() {
      common_vendor.index.showToast({ title: "设置功能开发中", icon: "none" });
    },
    goToHelp() {
      common_vendor.index.showToast({ title: "帮助中心开发中", icon: "none" });
    },
    goToAbout() {
      common_vendor.index.showToast({ title: "关于我们开发中", icon: "none" });
    },
    handleLogout() {
      common_vendor.index.showModal({
        title: "退出登录",
        content: "确定要退出当前账号吗？",
        success: (res) => {
          if (res.confirm) {
            common_vendor.index.removeStorageSync("username");
            common_vendor.index.redirectTo({ url: "/pages/login/index" });
          }
        }
      });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.t($data.username),
    b: common_vendor.t($data.userId),
    c: common_vendor.t($data.photoCount),
    d: common_vendor.t($data.score),
    e: common_vendor.t($data.days),
    f: common_vendor.o((...args) => $options.goToTemplateCollection && $options.goToTemplateCollection(...args)),
    g: common_vendor.o((...args) => $options.goToAnalyze && $options.goToAnalyze(...args)),
    h: common_vendor.o((...args) => $options.goToEnvironment && $options.goToEnvironment(...args)),
    i: common_vendor.o((...args) => $options.goToSettings && $options.goToSettings(...args)),
    j: common_vendor.o((...args) => $options.goToHelp && $options.goToHelp(...args)),
    k: common_vendor.o((...args) => $options.goToAbout && $options.goToAbout(...args)),
    l: common_vendor.o((...args) => $options.handleLogout && $options.handleLogout(...args)),
    m: common_vendor.o((...args) => $options.goHome && $options.goHome(...args)),
    n: common_vendor.o((...args) => $options.goToProfile && $options.goToProfile(...args))
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-201c0da5"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/profile/index.js.map
