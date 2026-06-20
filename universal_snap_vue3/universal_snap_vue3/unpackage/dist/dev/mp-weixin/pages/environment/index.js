"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  __name: "index",
  setup(__props) {
    const imageUrl = common_vendor.ref("");
    const suggestion = common_vendor.ref("");
    const audioUrl = common_vendor.ref("");
    let audioCtx = null;
    function goBack() {
      common_vendor.index.navigateBack();
    }
    function chooseImage() {
      common_vendor.index.chooseImage({
        count: 1,
        success: ({ tempFilePaths }) => {
          imageUrl.value = tempFilePaths[0];
          suggestion.value = "AI 分析中...";
          audioUrl.value = "";
          doAnalyze();
        }
      });
    }
    async function doAnalyze() {
      common_vendor.index.showLoading({ title: "分析中...", mask: true });
      try {
        const res = await utils_request.analyzeEnvApi(imageUrl.value);
        common_vendor.index.hideLoading();
        if (res.advice) {
          suggestion.value = res.advice;
          audioUrl.value = res.audioUrl || "";
          playAudio();
        } else {
          suggestion.value = "AI 未返回建议";
        }
      } catch (err) {
        common_vendor.index.hideLoading();
        suggestion.value = typeof err === "string" ? err : "上传失败";
      }
    }
    function playAudio() {
      if (!audioUrl.value)
        return;
      if (audioCtx) {
        audioCtx.stop();
        audioCtx.destroy();
      }
      audioCtx = common_vendor.index.createInnerAudioContext();
      audioCtx.src = audioUrl.value;
      audioCtx.obeyMuteSwitch = false;
      audioCtx.play();
    }
    function replayAudio() {
      playAudio();
    }
    common_vendor.onUnmounted(() => {
      if (audioCtx) {
        audioCtx.stop();
        audioCtx.destroy();
      }
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: common_vendor.o(goBack),
        b: imageUrl.value
      }, imageUrl.value ? {
        c: imageUrl.value
      } : {}, {
        d: common_vendor.o(chooseImage),
        e: suggestion.value
      }, suggestion.value ? {
        f: common_vendor.t(suggestion.value)
      } : {}, {
        g: audioUrl.value
      }, audioUrl.value ? {
        h: common_vendor.o(replayAudio)
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-ead559aa"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/environment/index.js.map
