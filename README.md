<div align="center">

# 📸 万能拍 · AI Camera

**基于LLM的移动端摄影智能引导平台**

> 集自拍分析、智能构图、骨骼追踪、环境优化、人脸识别于一体，附带地铁转辙机 FOD 检测专业模块。

<p>
  <a href="#核心功能"><img src="https://img.shields.io/badge/功能-AI构图引导-FF8C42?style=flat-square" alt="功能"/></a>
  <a href="#技术架构"><img src="https://img.shields.io/badge/后端-Flask%20%2B%20OpenCV-4f46e5?style=flat-square" alt="后端"/></a>
  <a href="#技术架构"><img src="https://img.shields.io/badge/前端-UniApp%20%2F%20Vue3-34C759?style=flat-square" alt="前端"/></a>
  <a href="#技术架构"><img src="https://img.shields.io/badge/AI-PaliGemma%20%2B%20Qwen%20%2B%20Grok-FF6E61?style=flat-square" alt="AI"/></a>
  <img src="https://img.shields.io/badge/platform-微信小程序-07C160?style=flat-square" alt="platform"/>
</p>

</div>

---

## 界面预览

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/ui-preview-home.svg" width="280" alt="首页预览"/>
      <br/>
      <sub><b>首页 · 功能导航</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/images/ui-preview-camera.svg" width="280" alt="相机页预览"/>
      <br/>
      <sub><b>相机页 · AI 构图引导 + 水平仪</b></sub>
    </td>
  </tr>
</table>

> **水平仪**：取景框居中显示动态指示线——设备倾斜时呈**橙白色**，手机水平对齐后自动变为**黄橙色渐变并触发振动**，实现零视线转移的水平校准。

---

## ✨ 核心功能

### 🎨 透明线稿叠加（核心创新）
上传参考照片，后端经 OpenCV 提取轮廓后生成 RGBA 透明线稿，以 40% 透明度实时叠加在相机取景框之上，作为直觉式构图引导层——区别于静态拍摄教程，引导随画面实时同步。

### 🤳 智能自拍分析
上传自拍照片，AI（Qwen-VL-Plus / Grok-2-Vision）即时给出构图、姿势、角度等方面的改进建议，支持语音合成播报。

### 🎯 智能构图测距
结合手机传感器数据（倾斜角、俯仰角），AI 实时分析画面主体占比，给出精准的「靠近/远离/抬高/左移」语音级指令，支持**人像 / 静物 / 风景**三种模式。构图完美时自动触发抓拍并高亮绿色边框。

### 🔬 专业模式（三段流水线）
```
Stage 1: PaliGemma2-DOCCI (本地 GPU)  →  密集场景描述与构图感知
Stage 2: Qwen-VL-Plus (云端)           →  结构化拍摄方案 JSON
Stage 3: YOLOv8n-pose + Canvas 2D      →  实时骨骼关键点比对与霓虹骨架渲染
```
输出包含 17 点骨骼关键点坐标、姿态指令、语音引导、旋转纠正、距离建议、光照评价与构图评分。

### 🦴 骨骼追踪
YOLOv8n-pose 实时检测人体 COCO-17 关键点，采用 `onCameraFrame` 异步推理硬锁（5fps）架构，在 Canvas 2D 层渲染霓虹色火柴人骨架，实际关键点与 Qwen 目标点以红色虚线连接，实时计算像素偏差。

### ⚖️ 水平仪
三轴加速度计低通滤波 + 磁吸吸附（±3.5° 容差），水平时自动振动并切换配色（橙白 → 黄橙渐变发光）。

### 🌍 环境分析
AI 分析拍摄环境的光线、背景、构图，给出具体可执行的改善建议，支持语音合成。

### 📊 模板评分
对接火山引擎视觉智能服务，对上传照片进行美学评分，支持保存为参考、合集浏览与管理。

### 👤 人脸识别登录
本地 OpenCV LBPHFaceRecognizer + 云端火山引擎双重校验，支持人脸注册、登录、更新。

### 🙋 个人中心
基于 Token 的登录态鉴权（`itsdangerous` 签名，30 天有效期），覆盖头像/昵称修改、密码修改、人脸登录管理、自拍/环境分析历史记录查询与语音回放、帮助中心与关于我们。

### 🚇 地铁模式 · FOD 遗留物检测
面向轨道交通场景，检测转辙机内部遗留物（工具、零件等）：
- **三路并联检测**：YOLO 闭集检测 + 基准差分 + 异常兜底
- **红黄绿三级结论**：fail-safe 安全闸门，宁可误报不可漏报
- **全链路可追溯**：检测记录落库，证据可审计

---

## 🏗️ 技术架构

```mermaid
flowchart TB
    subgraph 前端["🖥️ 前端 (uni-app)"]
        direction LR
        VUE["Vue 3"]
        UNI["uni-ui"]
        VK["onCameraFrame (骨骼追踪)"]
        WX["微信小程序"]
    end

    前端 -->|"HTTP REST"| 后端

    subgraph 后端["⚙️ 后端 (Flask + Python)"]
        subgraph 业务模块["业务模块"]
            AUTH["用户认证<br/>注册 · 登录 · 人脸 · 验证码"]
            IMG["图像分析<br/>自拍 · 构图 · 环境 · 评分"]
            METRO["地铁 FOD 检测<br/>设备登记 · 三路检测 · 审计"]
        end
        subgraph AI["🧠 AI 模型层"]
            PALI["PaliGemma2-DOCCI<br/>本地 GPU 推理"]
            QWEN["Qwen-VL-Plus<br/>阿里云百炼"]
            GROK["Grok-2-Vision<br/>xAI"]
            YOLO["YOLOv8n-pose<br/>骨骼追踪"]
            VOLC["火山引擎<br/>图像评分"]
            BAIDU["百度 AI<br/>人脸识别 + 语音合成"]
        end
        subgraph CV["🎨 OpenCV 处理层"]
            SKETCH["透明线稿生成<br/>高斯模糊 + 颜色减淡"]
            FACE["本地人脸识别<br/>LBPHFaceRecognizer"]
        end
    end

    后端 -->|"读写"| 数据层

    subgraph 数据层["🗄️ 数据层"]
        DB[("MySQL")]
        FS["文件存储"]
        CACHE["验证码缓存"]
    end
```

---

## 🚀 快速开始

### 环境要求

| 组件 | 版本要求 |
|------|---------|
| Python | ≥ 3.10 |
| Node.js | ≥ 16 |
| CUDA（可选） | ≥ 11.8（GPU 推理需要） |
| MySQL | ≥ 5.7 |
| HBuilderX | 最新版（小程序开发工具） |

### 1. 克隆项目

```bash
git clone https://github.com/Begapunk/AI_Camera_improve.git
cd AI_Camera_improve
```

### 2. 后端部署

```bash
cd universal_snap_backend

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 安装依赖（首次安装 PaliGemma 依赖约 5GB，可跳过 torch/transformers 仅用云端模型）
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写各平台 API Key（详见下方环境变量说明）

# 初始化数据库
mysql -u root -p < init_db.sql

# 启动后端服务
python app.py
```

> YOLOv8n-pose 模型（~6MB）在首次调用 `/detect-pose` 时自动下载至 `~/.ultralytics` 缓存目录。

### 3. 前端部署

```bash
cd universal_snap_vue3/universal_snap_vue3

npm install

# 用 HBuilderX 打开项目，配置小程序 AppID
# 运行 → 运行到小程序模拟器 → 微信开发者工具
```

### 4. 模型准备（可选）

- **PaliGemma2-DOCCI**：将模型放置于 `paligemma2-3b-ft-docci-448/` 目录，或在 `.env` 中配置 `PALIGEMMA_MODEL_PATH`
- **YOLOv8n-pose**：首次运行自动下载（约 6MB）

---

## 📁 项目结构

```
AI_Camera_improve/
├── universal_snap_vue3/         # 前端 uni-app 项目
│   └── universal_snap_vue3/
│       ├── pages/               # 页面模块
│       │   ├── login/           # 登录 & 注册
│       │   ├── home/            # 主页
│       │   ├── camera/          # 智能拍摄（水平仪、线稿叠加、骨骼追踪）
│       │   ├── analyze/         # 自拍分析
│       │   ├── environment/     # 环境分析
│       │   ├── template/        # 模板评分
│       │   ├── metro/           # 地铁 FOD 检测
│       │   ├── profile/         # 个人中心（设置/历史记录/帮助中心/关于我们）
│       │   └── ar/              # AR 实时引导
│       ├── static/              # 静态资源
│       └── utils/               # 工具函数
│
├── universal_snap_backend/      # 后端 Flask 项目
│   ├── app.py                   # 主应用入口 & API 路由
│   ├── Face_ID.py               # 人脸识别封装
│   ├── face_local.py            # 本地人脸识别
│   ├── config.py / settings.py  # 配置管理
│   ├── db/                      # 数据库操作
│   │   ├── db.py                # 用户 & 照片分析
│   │   └── metro_db.py          # 地铁检测记录
│   ├── metro/                   # 地铁 FOD 检测核心
│   ├── security/                # 密码安全校验
│   ├── uploads/                 # 上传文件存储
│   └── static/audio/            # 语音合成文件
│
├── paligemma2-3b-ft-docci-448/  # PaliGemma 本地模型
├── docs/images/                 # 界面预览图（SVG）
├── modeltest.py                 # 模型测试脚本
└── replacements.txt             # 文本替换配置
```

---

## 🖼️ 功能预览

<table>
  <tr>
    <td align="center"><img src="docs/images/ui-preview-login.svg" width="200" alt="登录"/><br/><sub><b>登录页</b></sub></td>
    <td align="center"><img src="docs/images/ui-preview-register.svg" width="200" alt="注册"/><br/><sub><b>注册页</b></sub></td>
    <td align="center"><img src="docs/images/ui-preview-home.svg" width="200" alt="首页"/><br/><sub><b>首页</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/ui-preview-camera.svg" width="200" alt="智能拍摄"/><br/><sub><b>智能拍摄 + 水平仪</b></sub></td>
    <td align="center"><img src="docs/images/ui-preview-analyze.svg" width="200" alt="自拍分析"/><br/><sub><b>自拍分析</b></sub></td>
    <td align="center"><img src="docs/images/ui-preview-environment.svg" width="200" alt="环境分析"/><br/><sub><b>环境分析</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/ui-preview-template.svg" width="200" alt="模板评分"/><br/><sub><b>模板评分</b></sub></td>
    <td align="center"><img src="docs/images/ui-preview-metro.svg" width="200" alt="地铁FOD检测"/><br/><sub><b>地铁 FOD 检测</b></sub></td>
    <td align="center"><img src="docs/images/ui-preview-profile.svg" width="200" alt="个人中心"/><br/><sub><b>个人中心</b></sub></td>
  </tr>
</table>

---

## 🔌 核心 API 一览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/captcha` | GET | 获取数学验证码 |
| `/register` | POST | 用户注册（含人脸） |
| `/login` | POST | 密码登录（返回登录态 Token） |
| `/login-face` | POST | 人脸登录（返回登录态 Token） |
| `/analyze` | POST | 自拍分析（Qwen-VL，需登录，写入分析记录） |
| `/analyze-grok` | POST | 自拍分析（Grok，需登录，写入分析记录） |
| `/smart-analyze` | POST | 智能构图测距 |
| `/pro-analyze` | POST | 专业模式三段流水线 |
| `/detect-pose` | POST | YOLOv8 骨骼关键点检测 |
| `/detect-gesture` | POST | MediaPipe 手势识别（剪刀手拍照触发） |
| `/generate-sketch` | POST | OpenCV 透明线稿生成 |
| `/analyze-env` | POST | 环境分析（需登录，写入分析记录） |
| `/analyze-template` | POST | 图像美学评分（可选保存为模板） |
| `/api/templates` | GET | 模板合集列表（需登录，按用户隔离） |
| `/api/delete` | DELETE | 删除模板（需登录，校验归属） |
| `/api/history` | GET | 自拍/环境分析历史记录（需登录） |
| `/api/user/info` | GET | 获取当前用户资料与统计（需登录） |
| `/api/user/update` | POST | 更新昵称/头像（需登录） |
| `/api/user/change-password` | POST | 修改密码（需登录） |
| `/update-face` | POST | 注册/更新人脸（需登录） |
| `/metro/detect` | POST | 地铁 FOD 检测 |
| `/metro/devices/register` | POST | 转辙机设备登记 |

---

## ⚙️ 环境变量配置

在 `universal_snap_backend/.env` 中配置：

```env
# 百度 AI（人脸识别 + 语音合成）
BAIDU_APP_ID=your_app_id
BAIDU_API_KEY=your_api_key
BAIDU_SECRET_KEY=your_secret_key

# 阿里云百炼（Qwen-VL-Plus）
ALIYUN_API_KEY=your_api_key
ALIYUN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 火山引擎（图像评分）
VOLC_IA_AK=your_access_key
VOLC_IA_SK=your_secret_key

# xAI Grok（可选）
GROK_API_KEY=your_grok_key

# PaliGemma 本地模型路径
PALIGEMMA_MODEL_PATH=paligemma2-3b-ft-docci-448

# 登录态签名密钥（务必设置为随机字符串，用于签发/校验用户 Token）
SECRET_KEY=your_random_secret_key

# MySQL 数据库
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=snap_db
DB_PORT=3306
```

---

## 📄 License

MIT License

---

> 💡 本项目为微信小程序，需配合 HBuilderX 开发工具使用。后端依赖多个第三方 AI 服务，请确保各平台 API Key 已正确配置。
