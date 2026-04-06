"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  __name: "index",
  setup(__props) {
    const imgSrc = common_vendor.ref("");
    const score = common_vendor.ref("");
    const advice = common_vendor.ref("");
    const formattedScore = common_vendor.computed(() => {
      if (score.value === "" || score.value == null)
        return "";
      const num = parseFloat(score.value);
      return isNaN(num) ? "" : num.toFixed(3);
    });
    function chooseImage() {
      common_vendor.index.chooseImage({
        count: 1,
        sourceType: ["camera", "album"],
        success: ({ tempFilePaths }) => {
          imgSrc.value = tempFilePaths[0];
          score.value = "";
          advice.value = "";
        }
      });
    }
    async function submitTemplate(saveAsTemplate) {
      if (!imgSrc.value)
        return;
      common_vendor.index.showLoading({ title: "分析中...", mask: true });
      try {
        const res = await utils_request.analyzeTemplateApi(imgSrc.value, saveAsTemplate);
        common_vendor.index.hideLoading();
        if (res.error) {
          common_vendor.index.showToast({ title: "分析失败", icon: "none" });
          return;
        }
        score.value = res.score;
        advice.value = res.advice || res.suggestion;
        if (saveAsTemplate) {
          common_vendor.index.showToast({ title: "已保存为模板", icon: "success" });
        }
      } catch (err) {
        common_vendor.index.hideLoading();
        common_vendor.index.showToast({ title: typeof err === "string" ? err : "上传失败", icon: "none" });
      }
    }
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: common_vendor.o(chooseImage),
        b: imgSrc.value
      }, imgSrc.value ? {
        c: imgSrc.value
      } : {}, {
        d: score.value
      }, score.value ? common_vendor.e({
        e: score.value
      }, score.value ? {
        f: common_vendor.t(formattedScore.value)
      } : {}) : {}, {
        g: advice.value
      }, advice.value ? {
        h: common_vendor.t(advice.value)
      } : {}, {
        i: imgSrc.value
      }, imgSrc.value ? {
        j: common_vendor.o(($event) => submitTemplate(false)),
        k: common_vendor.o(($event) => submitTemplate(true))
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-380f8012"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/template/index.js.map
