"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_request = require("../../utils/request.js");
const _sfc_main = {
  data() {
    return {
      templates: []
    };
  },
  onLoad() {
    this.loadTemplates();
  },
  methods: {
    async loadTemplates() {
      try {
        const res = await utils_request.fetchTemplateList();
        if (res.statusCode === 200 && res.data.templates) {
          this.templates = res.data.templates;
        } else {
          common_vendor.index.showToast({ title: "加载失败", icon: "none" });
        }
      } catch (err) {
        common_vendor.index.__f__("error", "at pages/template/templateCollection.vue:42", err);
        common_vendor.index.showToast({ title: "请求出错", icon: "none" });
      }
    },
    previewImage(index) {
      const urls = this.templates.map((item) => item.imageUrl);
      common_vendor.index.previewImage({
        current: urls[index],
        urls
      });
    },
    confirmDelete(id) {
      common_vendor.index.showModal({
        title: "提示",
        content: "确定要删除该模板吗？",
        success: async ({ confirm }) => {
          if (confirm)
            await this.handleDelete(id);
        }
      });
    },
    async handleDelete(id) {
      try {
        const res = await utils_request.deleteTemplateApi(id);
        if (res.statusCode === 200) {
          common_vendor.index.showToast({ title: "删除成功", icon: "success" });
          this.loadTemplates();
        } else {
          common_vendor.index.showToast({ title: "删除失败", icon: "none" });
        }
      } catch (err) {
        common_vendor.index.__f__("error", "at pages/template/templateCollection.vue:75", err);
        common_vendor.index.showToast({ title: "删除出错", icon: "none" });
      }
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.f($data.templates, (item, index, i0) => {
      return {
        a: item.imageUrl,
        b: common_vendor.o(($event) => $options.previewImage(index), index),
        c: common_vendor.o(($event) => $options.confirmDelete(item.id), index),
        d: common_vendor.t(item.score),
        e: index
      };
    })
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-5ef028ee"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/template/templateCollection.js.map
