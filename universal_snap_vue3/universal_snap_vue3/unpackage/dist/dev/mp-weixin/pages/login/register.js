"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  __name: "register",
  setup(__props) {
    const username = common_vendor.ref("");
    const password = common_vendor.ref("");
    const confirmPassword = common_vendor.ref("");
    const message = common_vendor.ref("");
    const passwordErrors = common_vendor.ref([]);
    const captchaId = common_vendor.ref("");
    const captchaImage = common_vendor.ref("");
    const captchaAnswer = common_vendor.ref("");
    const fetchCaptcha = () => {
      common_vendor.index.request({
        url: `${utils_request.getBaseUrl()}/api/captcha`,
        // 动态地址
        method: "GET",
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            captchaId.value = res.data.captcha_id;
            captchaImage.value = res.data.captcha_image;
            captchaAnswer.value = "";
          }
        },
        fail: () => {
          common_vendor.index.showToast({ title: "验证码加载失败", icon: "none" });
        }
      });
    };
    common_vendor.onMounted(() => {
      fetchCaptcha();
    });
    const showCamera = common_vendor.ref(false);
    const facePreview = common_vendor.ref("");
    const faceBase64 = common_vendor.ref(null);
    const captureFace = () => {
      const ctx = common_vendor.index.createCameraContext();
      ctx.takePhoto({
        quality: "high",
        success: (res) => {
          facePreview.value = res.tempFilePath;
          const fs = common_vendor.index.getFileSystemManager();
          faceBase64.value = fs.readFileSync(res.tempFilePath, "base64");
          showCamera.value = false;
          common_vendor.index.showToast({ title: "采集成功", icon: "success" });
        },
        fail: () => {
          common_vendor.index.showToast({ title: "调用相机失败", icon: "none" });
        }
      });
    };
    async function onRegister() {
      if (!username.value || !password.value || !confirmPassword.value) {
        message.value = "请完整填写信息";
        return;
      }
      if (password.value !== confirmPassword.value) {
        message.value = "两次密码不一致";
        return;
      }
      if (!captchaAnswer.value) {
        message.value = "请填写计算结果";
        return;
      }
      passwordErrors.value = [];
      if (password.value.length < 8) {
        passwordErrors.value.push("密码至少需要8个字符");
      }
      const hasUpper = /[A-Z]/.test(password.value);
      const hasLower = /[a-z]/.test(password.value);
      const hasNumber = /\d/.test(password.value);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password.value);
      const complexityCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
      if (complexityCount < 3) {
        const missing = [];
        if (!hasUpper)
          missing.push("大写字母");
        if (!hasLower)
          missing.push("小写字母");
        if (!hasNumber)
          missing.push("数字");
        if (!hasSpecial)
          missing.push("特殊字符");
        passwordErrors.value.push(`需要至少3种字符类型，缺少：${missing.join("、")}`);
      }
      if (username.value && password.value.toLowerCase().includes(username.value.toLowerCase())) {
        passwordErrors.value.push("密码不应包含用户名");
      }
      if (passwordErrors.value.length > 0) {
        message.value = "密码不符合要求";
        return;
      }
      message.value = "";
      common_vendor.index.showLoading({ title: "注册中...", mask: true });
      try {
        common_vendor.index.request({
          url: `${utils_request.getBaseUrl()}/register`,
          // 动态地址
          method: "POST",
          data: {
            username: username.value,
            password: password.value,
            face_data: faceBase64.value,
            captcha_id: captchaId.value,
            captcha_answer: captchaAnswer.value
          },
          success: (res) => {
            common_vendor.index.hideLoading();
            if (res.statusCode === 200) {
              common_vendor.index.showToast({ title: "注册成功", icon: "success" });
              setTimeout(() => {
                common_vendor.index.redirectTo({ url: "/pages/login/index" });
              }, 1e3);
            } else {
              fetchCaptcha();
              if (res.data.details && Array.isArray(res.data.details)) {
                passwordErrors.value = res.data.details;
                message.value = res.data.error || "验证失败";
              } else {
                message.value = res.data.error || res.data.message || "注册失败";
              }
            }
          },
          fail: () => {
            common_vendor.index.hideLoading();
            message.value = "连接服务器失败";
            fetchCaptcha();
          }
        });
      } catch (err) {
        common_vendor.index.hideLoading();
        message.value = "请求异常，请检查网络";
        fetchCaptcha();
      }
    }
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: username.value,
        b: common_vendor.o(($event) => username.value = $event.detail.value),
        c: common_vendor.o([($event) => password.value = $event.detail.value, ($event) => passwordErrors.value = []]),
        d: password.value,
        e: password.value
      }, password.value ? {} : {}, {
        f: confirmPassword.value,
        g: common_vendor.o(($event) => confirmPassword.value = $event.detail.value),
        h: captchaAnswer.value,
        i: common_vendor.o(($event) => captchaAnswer.value = $event.detail.value),
        j: captchaImage.value
      }, captchaImage.value ? {
        k: captchaImage.value,
        l: common_vendor.o(fetchCaptcha)
      } : {}, {
        m: showCamera.value
      }, showCamera.value ? {
        n: common_vendor.o(captureFace)
      } : common_vendor.e({
        o: facePreview.value
      }, facePreview.value ? {
        p: facePreview.value
      } : {}, {
        q: common_vendor.o(($event) => showCamera.value = true)
      }), {
        r: passwordErrors.value.length > 0
      }, passwordErrors.value.length > 0 ? {
        s: common_vendor.f(passwordErrors.value, (error, index, i0) => {
          return {
            a: common_vendor.t(error),
            b: index
          };
        })
      } : {}, {
        t: common_vendor.o(onRegister),
        v: message.value
      }, message.value ? {
        w: common_vendor.t(message.value)
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-838b72c9"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/login/register.js.map
