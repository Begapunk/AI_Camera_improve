"use strict";
const common_vendor = require("../../common/vendor.js");
const _sfc_main = {
  data() {
    return {
      imgSrc: "",
      advice: "上传照片后，AI将为您提供专业自拍建议",
      audioUrl: "",
      innerAudioContext: null,
      isLoading: false,
      initialAdvice: "上传照片后，AI将为您提供专业自拍建议",
      analysisStatus: "等待分析",
      statusClass: "status-waiting"
    };
  },
  methods: {
    // 返回上一页
    goBack() {
      common_vendor.index.navigateBack();
    },
    chooseImage() {
      this.isLoading = true;
      this.analysisStatus = "处理中";
      this.statusClass = "status-processing";
      common_vendor.index.chooseImage({
        count: 1,
        sourceType: ["camera", "album"],
        success: (res) => {
          const path = res.tempFilePaths[0];
          this.imgSrc = path;
          this.advice = "AI正在分析您的自拍...";
          this.audioUrl = "";
          this.analysisStatus = "分析中";
          this.statusClass = "status-analyzing";
          setTimeout(() => {
            this.simulateAnalysis().then((result) => {
              this.advice = result.advice;
              this.audioUrl = result.audioUrl;
              this.analysisStatus = "分析完成";
              this.statusClass = "status-completed";
              this.isLoading = false;
              if (this.audioUrl) {
                this.playAudio();
              }
            });
          }, 2200);
        },
        fail: () => {
          this.isLoading = false;
          common_vendor.index.showToast({ title: "选择图片失败", icon: "none" });
        }
      });
    },
    simulateAnalysis() {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            advice: "构图完美！建议调整角度至45°，使用自然光增强面部轮廓。背景简洁突出主体，美颜参数建议降低至30%。",
            audioUrl: ""
            // 实际项目替换为真实音频URL
          });
        }, 1800);
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
      this.innerAudioContext.play();
      this.innerAudioContext.onError(() => {
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
    a: common_vendor.o((...args) => $options.goBack && $options.goBack(...args)),
    b: $data.imgSrc
  }, $data.imgSrc ? {
    c: $data.imgSrc,
    d: common_vendor.n($data.statusClass),
    e: common_vendor.t($data.analysisStatus)
  } : {}, {
    f: $data.advice && $data.advice !== $data.initialAdvice
  }, $data.advice && $data.advice !== $data.initialAdvice ? common_vendor.e({
    g: common_vendor.t($data.advice),
    h: $data.audioUrl
  }, $data.audioUrl ? {
    i: common_vendor.o((...args) => $options.playAudio && $options.playAudio(...args))
  } : {}) : {}, {
    j: $data.imgSrc
  }, $data.imgSrc ? {} : {}, {
    k: common_vendor.t($data.imgSrc ? "重新拍摄" : "开始拍摄"),
    l: common_vendor.o((...args) => $options.chooseImage && $options.chooseImage(...args)),
    m: $data.isLoading
  }, $data.isLoading ? {} : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-52e100b2"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/analyze/index.js.map
