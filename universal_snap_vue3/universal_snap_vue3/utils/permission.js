/**
 * 跨端权限管理器：统一 微信小程序 / iOS App(App-Plus) 的权限申请与"拒绝后引导去设置"流程。
 *
 * 两端的权限模型本质不同，这里刻意不假装它们一样，而是各自用平台最正确的方式实现，
 * 对外只暴露一套 Promise 接口：
 *
 *   - 小程序：wx.authorize 一次性询问；一旦用户点了拒绝，之后再调用只会立即 fail，
 *     必须靠 wx.getSetting 读到 authSetting[scope] === false 才能确认"已被拒绝过"，
 *     再引导 wx.openSetting() 打开小程序自身的授权管理页（不是系统设置）。
 *   - iOS App：没有 uni.authorize 这回事（那是小程序专属 API），系统权限弹窗是调用
 *     真正的资源型 API（uni.chooseImage / uni.getLocation / uni.startRecord...）时
 *     由 iOS 系统自动触发的，且只会弹一次。这里用 uni.getAppAuthorizeSetting()
 *     （App-Plus 专属，跨 Android/iOS 统一）提前查状态，一旦是 'denied' 就不再重复
 *     调用资源 API（调了也是白 fail），直接引导 uni.openAppAuthorizeSetting()
 *     跳系统"设置 - 本App"页面。
 *
 * @typedef {'camera'|'album'|'microphone'|'location'} PermissionType
 */

// 权限类型 -> 小程序 scope 映射
const MP_SCOPE_MAP = {
  camera: 'scope.camera',
  microphone: 'scope.record',
  location: 'scope.userLocation',
  // 小程序没有"读取相册"这个独立 scope——wx.chooseMedia/chooseImage 的相册来源
  // 走的是系统选择器，不经过 wx.authorize 这套鉴权；这里映射到"保存到相册"这个
  // 唯一存在的相册相关 scope，语义上最接近，调用方如果只是要"选图"可以不必先查这个。
  album: 'scope.writePhotosAlbum',
};

// 权限类型 -> uni.getAppAuthorizeSetting() 返回字段映射（App-Plus 专属，Android/iOS 统一）
const APP_AUTH_FIELD_MAP = {
  camera: 'cameraAuthorized',
  microphone: 'microphoneAuthorized',
  location: 'locationAuthorized',
  album: 'albumAuthorized',
};

const PERMISSION_LABELS = {
  camera: '相机',
  microphone: '麦克风',
  location: '定位',
  album: '相册',
};

/**
 * @param {PermissionType} type
 * @returns {Promise<void>} resolve 表示已获得权限，可以放心调用对应的资源 API；
 *                          reject 表示用户最终拒绝（已经引导过设置页或用户关闭了引导弹窗）
 */
export function requestPermission(type) {
  // #ifdef MP-WEIXIN
  return requestPermissionMP(type);
  // #endif

  // #ifdef APP-PLUS
  return requestPermissionApp(type);
  // #endif

  // #ifndef MP-WEIXIN || APP-PLUS
  // H5 等其余平台：交给浏览器自己的权限弹窗，这里直接放行，由调用方的资源 API 自行处理失败
  return Promise.resolve();
  // #endif
}

// ────────────────────────── 小程序实现 ──────────────────────────
// #ifdef MP-WEIXIN
function requestPermissionMP(type) {
  const scope = MP_SCOPE_MAP[type];
  if (!scope) return Promise.reject(new Error(`未知权限类型: ${type}`));

  return new Promise((resolve, reject) => {
    wx.authorize({
      scope,
      success: () => resolve(),
      fail: () => {
        // 单次 fail 无法区分"用户刚点了拒绝"还是"之前拒绝过这次静默失败"，
        // 统一查一次 getSetting 确认当前授权状态，再决定要不要弹"去设置"引导
        wx.getSetting({
          success: (res) => {
            const authorized = res.authSetting[scope];
            if (authorized === false) {
              guideToMPSetting(type, scope).then(resolve, reject);
            } else {
              // undefined：用户在系统级弹窗里选了"拒绝"但小程序还没记录成 false 的边界情况，
              // 这里也走引导流程，比直接判失败更稳妥（宁可多问一次，不要漏掉引导机会）
              guideToMPSetting(type, scope).then(resolve, reject);
            }
          },
          fail: () => reject(new Error('无法读取授权状态')),
        });
      },
    });
  });
}

function guideToMPSetting(type, scope) {
  return new Promise((resolve, reject) => {
    uni.showModal({
      title: '需要权限',
      content: `使用该功能需要${PERMISSION_LABELS[type] || type}权限，请前往设置开启`,
      confirmText: '去设置',
      success: (modalRes) => {
        if (!modalRes.confirm) {
          reject(new Error('用户取消授权'));
          return;
        }
        wx.openSetting({
          success: (settingRes) => {
            if (settingRes.authSetting[scope]) {
              resolve();
            } else {
              reject(new Error('用户仍未开启权限'));
            }
          },
          fail: () => reject(new Error('打开设置页失败')),
        });
      },
      fail: () => reject(new Error('弹窗调用失败')),
    });
  });
}
// #endif

// ────────────────────────── iOS / Android App 实现 ──────────────────────────
// #ifdef APP-PLUS
function requestPermissionApp(type) {
  const authField = APP_AUTH_FIELD_MAP[type];
  if (!authField) return Promise.reject(new Error(`未知权限类型: ${type}`));

  return new Promise((resolve, reject) => {
    // ⚠️ uni.getAppAuthorizeSetting() 是【同步】API：直接返回结果对象，不接受
    // success/fail 回调（之前按异步风格传 options 会导致回调永远不触发、Promise
    // 永远 pending，页面上表现为"点了授权按钮毫无反应也不报错"）。
    // 部分老基座版本没有这个函数，同步抛 TypeError，用 try/catch 兜底降级放行。
    let status;
    try {
      const setting = uni.getAppAuthorizeSetting();
      status = setting && setting[authField];
      console.log(`[permission] getAppAuthorizeSetting ${authField} = ${status}`);
    } catch (e) {
      // 基座不支持该 API：降级为直接放行，由资源 API 自己的 fail 兜底
      console.warn('[permission] getAppAuthorizeSetting unavailable, pass through:', e && e.message);
      resolve(true);
      return;
    }

    if (status === 'denied') {
      // 已经明确拒绝过：iOS 不允许 App 再次弹出系统授权框，唯一出路是跳系统设置页，
      // 调用方此时不应该再去调 uni.chooseImage/getLocation 等资源 API（调了也只会静默失败）
      guideToAppSetting(type).then(resolve, reject);
      return;
    }
    // 'authorized'：已授权，直接放行。
    // 'not determined' / 'config error' 等：尚未询问过或无法精确查询，也放行——
    // 交给调用方去调真正的资源 API，让系统在首次调用时自动弹出授权框
    resolve(status === 'authorized');
  });
}

function guideToAppSetting(type) {
  return new Promise((resolve, reject) => {
    uni.showModal({
      title: '需要权限',
      content: `使用该功能需要${PERMISSION_LABELS[type] || type}权限，请前往"设置"开启`,
      confirmText: '去设置',
      success: (modalRes) => {
        if (!modalRes.confirm) {
          reject(new Error('用户取消授权'));
          return;
        }
        // 跨 Android/iOS 统一的系统设置跳转；iOS 上会打开"设置 - 本App"页面。
        // 老基座可能没有这个函数（同步抛 TypeError），降级用 plus 原生方式跳系统设置。
        try {
          uni.openAppAuthorizeSetting({
            success: () => {
              // 从设置页返回后无法同步拿到最新状态（用户可能开了也可能没开），
              // 交由调用方在页面 onShow 里重新判断一次，这里先 resolve 让流程继续，
              // 真正的资源 API 调用失败时自然还是会走一次同样的引导
              resolve();
            },
            fail: () => reject(new Error('打开设置页失败')),
          });
        } catch (e) {
          openSystemSettingFallback().then(resolve, reject);
        }
      },
      fail: () => reject(new Error('弹窗调用失败')),
    });
  });
}

// uni.openAppAuthorizeSetting 不可用时的兜底：用 5+ 原生能力跳系统设置
function openSystemSettingFallback() {
  return new Promise((resolve, reject) => {
    try {
      if (plus.os.name === 'iOS') {
        // iOS：跳"设置 - 本App"页
        plus.runtime.openURL('app-settings://');
        resolve();
      } else {
        // Android：跳本应用详情页（含权限管理入口）
        const Intent = plus.android.importClass('android.content.Intent');
        const Uri = plus.android.importClass('android.net.Uri');
        const mainActivity = plus.android.runtimeMainActivity();
        const intent = new Intent('android.settings.APPLICATION_DETAILS_SETTINGS');
        intent.setData(Uri.fromParts('package', mainActivity.getPackageName(), null));
        mainActivity.startActivity(intent);
        resolve();
      }
    } catch (e) {
      reject(new Error('打开设置页失败'));
    }
  });
}
// #endif

export default { requestPermission };