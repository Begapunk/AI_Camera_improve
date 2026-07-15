# 📸 万能拍 (Universal Snap) - AI 智能视觉应用

> **跨端重构版 V2.0** | 微信小程序 + iOS App + Android App 一套代码，多端运行

## ✨ 项目简介

"万能拍"是一款主打 **AI 视觉处理与多端交互** 的智能摄像应用。通过高度定制化的相机界面与强大的底层 AI 视觉模型（如 Qwen-VL/PaliGemma），为用户提供从图像采集、硬件交互到智能识别的一站式解决方案。

### 核心特性

- 🎯 **多端同构**：uni-app (Vue3) 开发，一套代码同时运行在微信小程序、iOS、Android
- 🧠 **AI 智能分析**：集成 Qwen-VL / PaliGemma 等大模型，实时拍照指导与场景分析
- 📐 **专业模式**：骨架追踪、手势拍照、AR 测距等高级功能
- 🔒 **安全合规**：防 OOM 压缩引擎，兼容 iPhone 6 (1GB) 等低配设备
- 🌍 **国际化支持**：10+ 语言本地化（中/英/日/韩/法/德/西/阿拉伯语等）

---

## 🛠️ 技术栈

### 前端
- **框架**: uni-app (Vue 3, Composition API / Options API)
- **UI 渲染**: 
  - 小程序端：原生 `<camera>` 组件
  - App 端：nvue + `<live-pusher>` 原生渲染
- **状态管理**: Vuex / Pinia 兼容
- **国际化**: 自定义 i18n 方案

### 后端
- **框架**: Python Flask
- **AI 引擎**: Qwen-VL (视觉语言模型) / PaliGemma (姿态估计)
- **部署**: 本地开发 → Render 云服务

---

## 📁 项目结构

```
universal_snap_vue3/
├── pages/
│   ├── camera/
│   │   ├── index.vue          # 小程序端相机页面（主逻辑）
│   │   └── index.nvue         # App 端相机页面（原生渲染）
│   ├── pose-guide/            # 姿势引导页
│   ├── ar/                    # AR 测距页（小程序专属）
│   └── login/                 # 登录页
├── utils/
│   ├── imageManager.js        # ⭐ 跨端图像处理中心（核心模块）
│   ├── request.js             # 网络请求封装（带重试机制）
│   ├── safeAreaUtils.js       # 安全区域适配工具
│   ├── permission.js          # 权限管理器
│   ├── livePusherManager.js   # LivePusher 封装
│   ├── cameraCommon.js        # 相机业务逻辑 Mixin
│   └── fileBase64.js          # Base64 转换工具（向后兼容）
├── locale/                    # 国际化资源文件
├── static/                    # 静态资源
└── nativeplugins/             # UTS 原生插件（AR 测距等）
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0
- HBuilderX 3.8+ 或 VS Code + uni-app 插件
- iOS: Xcode 14+ (真机调试)
- Android: Android Studio (API Level 30+)
- 微信开发者工具 (小程序开发)

### 安装依赖

```bash
# 安装项目依赖
npm install

# 安装 uni-app CLI（如使用命令行开发）
npm install -g @dcloudio/uni-cli
```

### 配置环境变量

```bash
# .env.development（开发环境）
VITE_API_BASE_URL=http://192.168.124.35:5001

# .env.production（生产环境）
VITE_API_BASE_URL=https://your-app-name.onrender.com
```

### 运行项目

#### 微信小程序
```bash
# 使用 HBuilderX 运行到微信开发者工具
# 或使用 CLI：
npm run dev:mp-weixin
```

#### iOS App
```bash
# 使用 HBuilderX 运行到 iPhone 真机
# 或使用 CLI：
npm run dev:app-ios
```

#### Android App
```bash
# 使用 HBuilderX 运行到 Android 真机/模拟器
# 或使用 CLI：
npm run dev:app-android
```

---

## 📋 核心功能模块

### 1️⃣ 跨端智能相机

| 平台 | 实现方案 | 特性 |
|------|---------|------|
| **微信小程序** | `<camera>` + `wx.createCameraContext()` | 骨架追踪、手势拍照、水平仪 |
| **iOS App** | nvue + `<live-pusher>` + `plus.io` API | 全屏预览、安全区适配、原生性能 |
| **Android App** | 同 iOS 方案 | 兼容水滴屏/挖孔屏 |

**关键文件**:
- [pages/camera/index.vue](pages/camera/index.vue) — 小程序端主逻辑
- [pages/camera/index.nvue](pages/camera/index.nvue) — App 端原生渲染
- [utils/livePusherManager.js](utils/livePusherManager.js) — LivePusher 封装
- [utils/cameraCommon.js](utils/cameraCommon.js) — 业务逻辑 Mixin

---

### 2️⃣ 图像处理中心 (ImageManager)

**核心能力**:

```javascript
import ImageManager from '@/utils/imageManager.js';

// 1. 路径抹平：自动适配 wxfile:// / _doc:// / file://
const base64 = await ImageManager.pathToBase64(filePath);

// 2. 防 OOM 压缩：iPhone 6 安全保障（1920×1080 阈值检测）
const compressedPath = await ImageManager.compress(filePath, { quality: 80 });

// 3. 一站式 AI 处理流水线
const { base64, compressedPath } = await ImageManager.processForAI(filePath);

// 4. 文件管理（替代 wx.saveFile / wx.removeSavedFile）
await ImageManager.saveToAlbum(filePath);
await ImageManager.saveFile(tempFilePath);
await ImageManager.removeFile(filePath);
```

**技术细节**:
- ✅ 条件编译隔离 (`#ifdef MP-WEIXIN` / `#ifdef APP-PLUS`)
- ✅ 小程序端：`wx.getFileSystemManager()` + Canvas 降级压缩
- ✅ App 端：`plus.io.FileReader()` + `plus.zip.compressImage()`
- ✅ 自动降分辨率防止 OOM 崩溃

---

### 3️⃣ 网络请求封装

**特性**:
- 自动 BASE_URL 切换（开发/生产环境）
- App 端请求重试机制（超时/网络错误自动恢复）
- Token 自动注入与过期处理

```javascript
import { get, post, upload } from '@/utils/request.js';

// GET 请求（App 端自动重试 2 次）
const res = await get('/api/user/info');

// POST 请求
const result = await post('/api/analyze', { image: base64 });

// 文件上传
await upload('/api/upload', filePath, { name: 'photo' });
```

---

### 4️⃣ 安全区域适配

**三层适配体系**:

| 层级 | 适用场景 | 实现方式 |
|------|---------|----------|
| **CSS 变量层** | Vue 页面 | `var(--safe-area-inset-bottom)` |
| **JS 动态计算层** | nvue 页面 | `safeAreaUtils.getSafeAreaInsets()` |
| **Mixin 层** | Vue 组件 | `safeAreaMixin` 直接使用 |

**使用示例**:
```vue
<!-- Vue 页面 -->
<view class="footer" style="padding-bottom: var(--safe-area-inset-bottom)">
  底部内容
</view>

<!-- nvue 页面 -->
<div :style="{ paddingBottom: safeBottom + 'px' }">
  底部内容
</div>
```

---

### 5️⃣ AI 视觉交互

**支持的 AI 功能**:

| 功能 | API | 说明 |
|------|-----|------|
| 智能引导 | `analyzeApi()` | 实时拍照指导（构图/光线/姿势） |
| 专业分析 | `proAnalyzeApi()` | 场景深度分析（物体识别/美学评分） |
| 姿态估计 | `detectPoseApi()` | 人体关键点检测（17 点骨骼） |
| 手势识别 | `detectGestureApi()` | ✌️ 手势触发拍照 |
| Grok 分析 | `grokAnalyzeApi()` | 多模态大模型对话 |

---

## 📱 设备兼容性

### iOS
| 设备类型 | 最低版本 | 支持状态 |
|---------|---------|---------|
| iPhone 6/7/8 (16:9) | iOS 12+ | ✅ 完全兼容（防 OOM 优化） |
| iPhone X~14 (刘海屏) | iOS 13+ | ✅ 安全区域适配 |
| iPhone 15+ (灵动岛) | iOS 17+ | ✅ 动态安全区域计算 |

### Android
| 设备类型 | 最低版本 | 支持状态 |
|---------|---------|---------|
| 全面屏手机 | Android 7.0+ | ✅ 底部导航栏适配 |
| 水滴屏/挖孔屏 | Android 9.0+ | ✅ 刘海区域避让 |
| 平板设备 | Android 7.0+ | ✅ 响应式布局 |

### 微信小程序
| 基础库 | 最低版本 | 必选 API |
|--------|---------|---------|
| 2.19.0+ | 推荐 2.25.0+ | `canvas.filter`, `createOffscreenCanvas` |

---

## 🔧 开发指南

### 双端差异处理规范

#### ❌ 错误做法（污染双端）

```javascript
// 在 .js 文件中使用条件编译会导致语法错误
if (#ifdef APP-PLUS) {
  // 编译报错！
}
```

#### ✅ 正确做法

```javascript
// 方法 1：运行时检测（推荐用于 .js 工具类）
const isApp = typeof plus !== 'undefined';

if (isApp) {
  // App 端逻辑
} else {
  // 小程序/H5 逻辑
}

// 方法 2：条件编译（仅用于 .vue/.nvue 文件）
// #ifdef APP-PLUS
// App 端专用代码
// #endif

// #ifndef APP-PLUS
// 非 App 端代码
// #endif
```

---

### 新增平台特定功能的步骤

1. **创建独立的 .nvue 文件**（App 端）
2. **在 pages.json 中配置路由**
```json
{
  "path": "pages/camera/index",
  "style": {
    "app-plus": {
      "nvue": true,
      "softinputNavBar": "none"
    }
  }
}
```
3. **使用 Mixin 共享业务逻辑**
```javascript
// cameraCommon.js - 双端通用
export const cameraMixin = {
  methods: {
    takePhoto() { /* 公共逻辑 */ },
    switchCamera() { /* 公共逻辑 */ }
  }
}

// index.vue - 小程序端实现
export default {
  mixins: [cameraMixin],
  methods: {
    // 覆盖实现：使用 wx.createCameraContext()
    async takePhoto() { ... }
  }
}

// index.nvue - App 端实现
export default {
  mixins: [cameraMixin],
  methods: {
    // 覆盖实现：使用 livePusherManager.takeSnapshot()
    async takePhoto() { ... }
  }
}
```

---

## 🚢 部署指南

### 后端部署（Render）

1. **准备 Flask 应用**
```python
# main.py
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    image_data = request.json.get('image')
    # 调用 AI 模型...
    return jsonify({'advice': '建议...'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
```

2. **创建 render.yaml**
```yaml
services:
  - type: web
    name: universal-snap-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
```

3. **推送至 Render**
```bash
git add .
git commit -m "Add backend deployment config"
git push origin main
```

### 前端发布

#### 微信小程序
1. 在微信公众平台上传代码
2. 配置服务器域名白名单
3. 提交审核并发布

#### iOS App
1. 在 HBuilderX 中选择"发行 -> 原生App-云打包"
2. 配置证书和描述文件
3. 上传至 App Store Connect
4. 提交审核

#### Android App
1. 同上选择云打包
2. 生成 APK/AAB 包
3. 上传至 Google Play Console 或分发渠道

---

## 📊 性能指标

| 指标 | 目标值 | 当前值 |
|------|-------|-------|
| 冷启动时间 | < 2.5s | ~1.8s (iOS) |
| 相机开启延迟 | < 1.0s | ~0.6s (已授权) |
| 连续拍照 10 次 OOM | 不崩溃 | ✅ 通过 (iPhone 6) |
| AI 分析响应时间 | < 3s | ~1.5s (局域网) |

---

## 🤝 贡献指南

### Git 工作流

```bash
# 创建功能分支
git checkout -b feature/xxx

# 开发完成后提交
git add .
git commit -m "feat: 添加 xxx 功能"

# 推送到远程仓库
git push origin feature/xxx

# 创建 Pull Request
```

### Commit 规范

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具变更

---

## 📄 许可证

MIT License © 2024 万能拍团队

---

## 🙏 致谢

- **uni-app 团队**: 提供优秀的跨端开发框架
- **DCloud**: HBuilderX IDE 支持
- **Qwen-VL / PaliGemma**: AI 视觉模型开源社区
- **Render**: 云服务平台

---

## 📞 联系方式

- **问题反馈**: [GitHub Issues](https://github.com/Begapunk/AI_Camera/issues)
- **技术讨论**: [GitHub Discussions](https://github.com/Begapunk/AI_Camera/discussions)

---

> **最后更新**: 2026-07-14  
> **版本**: V2.0.0 (跨端重构版)  
> **维护者**: 万能拍架构组