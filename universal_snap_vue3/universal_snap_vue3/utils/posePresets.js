/**
 * 内置常见姿势模板库。
 *
 * 不依赖任何真实图片——每个预设直接是手写的目标关键点坐标（归一化 0~1，
 * 与 poseSimilarity.js 的 name-keyed 字典格式完全一致），跳过"下载图片 → 后端识别"
 * 整条链路。好处：零网络依赖、零"模板图识别失败"的边界情况、选中即可用。
 * 画中画区域展示的不是照片，而是一个简笔火柴人预览（见 pose-guide/index.vue 的
 * _drawPresetPreview），由这里的坐标直接画出来，所以预设的坐标要尽量贴近真实人体比例。
 *
 * 「上半身特写・比心」这个预设故意不给 hip/knee/ankle，用来展示动态权重设计：
 * 选中它之后 coverageRatio 会明显偏低，页面应提示"仅比对上半身"。
 *
 * 每个预设的显示名不放在这里——项目要支持 8 种语言，名字统一走
 * locale/*.json 的 poseGuide.presets.<id> 翻译键，这里只留 id/icon/landmarks，
 * id 后面的中文注释仅供开发者对照阅读。
 */
function kp(x, y) {
  return { x, y, score: 1 };
}

export const POSE_PRESETS = [
  {
    id: 'natural-stand', // 自然站立
    icon: '🧍',
    landmarks: {
      nose: kp(0.50, 0.12),
      left_shoulder: kp(0.38, 0.28), right_shoulder: kp(0.62, 0.28),
      left_elbow: kp(0.35, 0.40), right_elbow: kp(0.65, 0.40),
      left_wrist: kp(0.33, 0.52), right_wrist: kp(0.67, 0.52),
      left_hip: kp(0.40, 0.55), right_hip: kp(0.60, 0.55),
      left_knee: kp(0.40, 0.75), right_knee: kp(0.60, 0.75),
      left_ankle: kp(0.40, 0.95), right_ankle: kp(0.60, 0.95),
    },
  },
  {
    id: 'hands-on-hips', // 叉腰
    icon: '🧎',
    landmarks: {
      nose: kp(0.50, 0.12),
      left_shoulder: kp(0.38, 0.28), right_shoulder: kp(0.62, 0.28),
      left_elbow: kp(0.20, 0.38), right_elbow: kp(0.80, 0.38),
      left_wrist: kp(0.36, 0.50), right_wrist: kp(0.64, 0.50),
      left_hip: kp(0.40, 0.55), right_hip: kp(0.60, 0.55),
      left_knee: kp(0.40, 0.75), right_knee: kp(0.60, 0.75),
      left_ankle: kp(0.40, 0.95), right_ankle: kp(0.60, 0.95),
    },
  },
  {
    id: 'peace-raise', // 举手比V
    icon: '✌️',
    landmarks: {
      nose: kp(0.50, 0.12),
      left_shoulder: kp(0.38, 0.28), right_shoulder: kp(0.62, 0.28),
      left_elbow: kp(0.35, 0.40), left_wrist: kp(0.33, 0.52),
      right_elbow: kp(0.68, 0.15), right_wrist: kp(0.72, 0.02),
      left_hip: kp(0.40, 0.55), right_hip: kp(0.60, 0.55),
      left_knee: kp(0.40, 0.75), right_knee: kp(0.60, 0.75),
      left_ankle: kp(0.40, 0.95), right_ankle: kp(0.60, 0.95),
    },
  },
  {
    id: 'hands-in-pocket', // 双手插兜
    icon: '🙆',
    landmarks: {
      nose: kp(0.50, 0.12),
      left_shoulder: kp(0.38, 0.28), right_shoulder: kp(0.62, 0.28),
      left_elbow: kp(0.34, 0.42), right_elbow: kp(0.66, 0.42),
      left_wrist: kp(0.38, 0.54), right_wrist: kp(0.62, 0.54),
      left_hip: kp(0.40, 0.55), right_hip: kp(0.60, 0.55),
      left_knee: kp(0.40, 0.75), right_knee: kp(0.60, 0.75),
      left_ankle: kp(0.40, 0.95), right_ankle: kp(0.60, 0.95),
    },
  },
  {
    id: 'twist-hips', // 叉腰回眸
    icon: '💃',
    landmarks: {
      nose: kp(0.52, 0.12),
      left_shoulder: kp(0.35, 0.30), right_shoulder: kp(0.63, 0.26),
      left_elbow: kp(0.20, 0.40), right_elbow: kp(0.80, 0.36),
      left_wrist: kp(0.38, 0.52), right_wrist: kp(0.60, 0.50),
      left_hip: kp(0.42, 0.55), right_hip: kp(0.58, 0.53),
      left_knee: kp(0.42, 0.75), right_knee: kp(0.58, 0.74),
      left_ankle: kp(0.42, 0.95), right_ankle: kp(0.58, 0.94),
    },
  },
  {
    id: 'heart-hands-half', // 上半身特写・比心
    icon: '🫶',
    // 故意不给 hip/knee/ankle：演示动态权重——选中后 coverageRatio 明显偏低，
    // 页面应提示"仅比对上半身"，而不是把缺失的腿部硬算成 0 分
    landmarks: {
      nose: kp(0.50, 0.20),
      left_shoulder: kp(0.38, 0.35), right_shoulder: kp(0.62, 0.35),
      left_elbow: kp(0.42, 0.50), right_elbow: kp(0.58, 0.50),
      left_wrist: kp(0.47, 0.40), right_wrist: kp(0.53, 0.40),
    },
  },
];
