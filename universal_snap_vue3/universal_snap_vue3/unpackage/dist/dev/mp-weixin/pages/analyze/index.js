"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  data() {
    return {
      imgSrc: "",
      advice: "",
      audioUrl: "",
      innerAudioContext: null
    };
  },
  methods: {
    chooseImage() {
      common_vendor.index.chooseImage({
        count: 1,
        sourceType: ["camera", "album"],
        success: (res) => {
          const path = res.tempFilePaths[0];
          this.imgSrc = path;
          this.advice = "正在分析，请稍候...";
          this.audioUrl = "";
          utils_request.uploadImageToServer(path).then((res2) => {
            if (res2 && res2.advice) {
              this.advice = res2.advice;
              this.audioUrl = res2.audioUrl;
              this.playAudio();
            } else if (res2 && res2.error) {
              this.advice = "服务器错误：" + res2.error;
            } else {
              this.advice = "未获取到有效建议";
            }
          }).catch((err) => {
            common_vendor.index.__f__("error", "at pages/analyze/index.vue:56", err);
            this.advice = "分析失败，请稍后重试";
          });
        }
      });
    },
    playAudio() {
      if (!this.audioUrl)
        return;
      if (this.innerAudioContext) {
        this.innerAudioContext.stop();
        this.innerAudioContext.destroy();
      }
      this.innerAudioContext = common_vendor.index.createInnerAudioContext();
      this.innerAudioContext.src = this.audioUrl;
      this.innerAudioContext.obeyMuteSwitch = false;
      this.innerAudioContext.play();
      this.innerAudioContext.onError((res) => {
        common_vendor.index.__f__("error", "at pages/analyze/index.vue:74", "音频播放错误：", res);
        common_vendor.index.showToast({ title: "语音播放失败", icon: "none" });
      });
    }
  },
  onUnload() {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.o((...args) => $options.chooseImage && $options.chooseImage(...args)),
    b: $data.imgSrc
  }, $data.imgSrc ? {
    c: $data.imgSrc
  } : {}, {
    d: $data.advice
  }, $data.advice ? {
    e: common_vendor.t($data.advice)
  } : {}, {
    f: $data.audioUrl
  }, $data.audioUrl ? {
    g: common_vendor.o((...args) => $options.playAudio && $options.playAudio(...args))
  } : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-52e100b2"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/analyze/index.js.map
