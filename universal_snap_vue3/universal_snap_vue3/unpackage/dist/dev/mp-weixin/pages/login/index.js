"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  __name: "index",
  setup(__props) {
    const username = common_vendor.ref("");
    const password = common_vendor.ref("");
    const message = common_vendor.ref("");
    const showCamera = common_vendor.ref(false);
    const captchaId = common_vendor.ref("");
    const captchaImage = common_vendor.ref("");
    const captchaAnswer = common_vendor.ref("");
    const fetchCaptcha = () => {
      utils_request.fetchCaptchaApi().then((res) => {
        if (res.statusCode === 200 && res.data) {
          captchaId.value = res.data.captcha_id;
          captchaImage.value = res.data.captcha_image;
          captchaAnswer.value = "";
        }
      }).catch(() => {
        common_vendor.index.showToast({ title: "验证码加载失败", icon: "none" });
      });
    };
    common_vendor.onLoad(() => {
      fetchCaptcha();
    });
    async function onLogin() {
      if (!username.value || !password.value) {
        message.value = "请完整填写信息";
        return;
      }
      if (!captchaAnswer.value) {
        message.value = "请填写计算结果";
        return;
      }
      message.value = "";
      common_vendor.index.showLoading({ title: "登录中...", mask: true });
      utils_request.loginApi({
        username: username.value,
        password: password.value,
        captcha_id: captchaId.value,
        captcha_answer: captchaAnswer.value
      }).then((res) => {
        common_vendor.index.hideLoading();
        if (res.statusCode === 200 && res.data.message) {
          common_vendor.index.showToast({ title: "登录成功", icon: "success" });
          common_vendor.index.setStorageSync("username", username.value);
          setTimeout(() => {
            common_vendor.index.redirectTo({ url: "/pages/home/index" });
          }, 1e3);
        } else {
          fetchCaptcha();
          message.value = res.data.error || res.data.message || "登录失败";
        }
      }).catch(() => {
        common_vendor.index.hideLoading();
        fetchCaptcha();
        message.value = "请求失败，请稍后重试";
      });
    }
    function takePhotoAndLogin() {
      const ctx = common_vendor.index.createCameraContext();
      ctx.takePhoto({
        quality: "high",
        success: (res) => {
          const filePath = res.tempImagePath || res.tempFilePath;
          const fs = common_vendor.index.getFileSystemManager();
          const base64Data = fs.readFileSync(filePath, "base64");
          common_vendor.index.showLoading({ title: "正在识别身份...", mask: true });
          utils_request.loginFaceApi(base64Data).then((loginRes) => {
            common_vendor.index.hideLoading();
            if (loginRes.statusCode === 200 && loginRes.data.username) {
              common_vendor.index.showToast({ title: "识别成功", icon: "success" });
              common_vendor.index.setStorageSync("username", loginRes.data.username);
              setTimeout(() => {
                common_vendor.index.redirectTo({ url: "/pages/home/index" });
              }, 1e3);
            } else {
              common_vendor.index.showModal({
                title: "识别失败",
                content: loginRes.data.error || "未匹配到人脸信息",
                showCancel: false
              });
            }
          }).catch(() => {
            common_vendor.index.hideLoading();
            common_vendor.index.showToast({ title: "网络请求失败", icon: "none" });
          });
        },
        fail: () => {
          common_vendor.index.showToast({ title: "摄像头调用失败", icon: "none" });
        }
      });
    }
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: showCamera.value
      }, showCamera.value ? {
        b: common_vendor.o(takePhotoAndLogin),
        c: common_vendor.o(($event) => showCamera.value = false)
      } : common_vendor.e({
        d: username.value,
        e: common_vendor.o(($event) => username.value = $event.detail.value),
        f: password.value,
        g: common_vendor.o(($event) => password.value = $event.detail.value),
        h: captchaAnswer.value,
        i: common_vendor.o(($event) => captchaAnswer.value = $event.detail.value),
        j: captchaImage.value
      }, captchaImage.value ? {
        k: captchaImage.value,
        l: common_vendor.o(fetchCaptcha)
      } : {}, {
        m: common_vendor.o(onLogin),
        n: common_vendor.o(($event) => showCamera.value = true)
      }), {
        o: !showCamera.value
      }, !showCamera.value ? {} : {}, {
        p: message.value
      }, message.value ? {
        q: common_vendor.t(message.value)
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-d08ef7d4"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/login/index.js.map
