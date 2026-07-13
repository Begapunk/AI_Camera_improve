/**
 * 姿态相似度计算（余弦相似度）。
 * 纯函数，不依赖 uni/wx API，可在 Node 环境直接单元测试。
 *
 * 关键点格式统一为 name-keyed 字典（与 camera/index.vue 的 _proKps 一致）：
 *   { left_shoulder: {x, y, score}, right_shoulder: {x, y, score}, ... }
 * 坐标要求归一化到 0~1（消除画面尺寸差异），比较的是"方向"而非绝对位置/绝对长度。
 * score 字段（YOLOv8-pose 原始置信度）保留、不在适配器层过滤——
 * 置信度判断统一放在 calculatePoseSimilarity 内部做，见需求1。
 */

// COCO-17 索引 -> 名称，供 cocoArrayToNamedPoints 适配后端 /detect-pose 的数组返回值
export const KP_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
];

// 关键点最低置信度：低于此分数的肢体在 calculatePoseSimilarity 中动态剔除，不进入总分母
export const MIN_KP_SCORE = 0.3;

/**
 * 后端 /detect-pose 返回的 COCO-17 数组 -> name-keyed 字典（原样保留 score，不做过滤）。
 * @param {Array<{x:number,y:number,score?:number}>|null} kpArray
 * @returns {Record<string,{x:number,y:number,score:number}>}
 */
export function cocoArrayToNamedPoints(kpArray) {
  const named = {};
  if (!Array.isArray(kpArray)) return named;
  kpArray.forEach((kp, i) => {
    const name = KP_NAMES[i];
    if (!name || !kp) return;
    named[name] = { x: kp.x, y: kp.y, score: kp.score ?? 1 };
  });
  return named;
}

// 主要肢体向量定义：from/to 支持单个关键点名，或多个关键点名取中点（用于躯干干线）。
// weight 是该肢体在总分中的权重，核心躯干权重更高——注意这只是"满编"权重，
// 实际参与打分时会按需求1动态重新归一化（缺失/低置信度的肢体权重从分母里剔除）。
const LIMB_DEFS = [
  { name: 'torso', from: ['left_shoulder', 'right_shoulder'], to: ['left_hip', 'right_hip'], weight: 3 },
  { name: 'left_upper_arm', from: 'left_shoulder', to: 'left_elbow', weight: 1.5 },
  { name: 'right_upper_arm', from: 'right_shoulder', to: 'right_elbow', weight: 1.5 },
  { name: 'left_forearm', from: 'left_elbow', to: 'left_wrist', weight: 1 },
  { name: 'right_forearm', from: 'right_elbow', to: 'right_wrist', weight: 1 },
  { name: 'left_thigh', from: 'left_hip', to: 'left_knee', weight: 1 },
  { name: 'right_thigh', from: 'right_hip', to: 'right_knee', weight: 1 },
  { name: 'left_shin', from: 'left_knee', to: 'left_ankle', weight: 0.8 },
  { name: 'right_shin', from: 'right_knee', to: 'right_ankle', weight: 0.8 },
];

const FULL_WEIGHT = LIMB_DEFS.reduce((s, d) => s + d.weight, 0);

// 中文标签 + 需求5 指导语生成共用
const LIMB_LABELS = {
  torso: '躯干',
  left_upper_arm: '左大臂', right_upper_arm: '右大臂',
  left_forearm: '左小臂', right_forearm: '右小臂',
  left_thigh: '左大腿', right_thigh: '右大腿',
  left_shin: '左小腿', right_shin: '右小腿',
};

// 取一个或多个关键点的坐标中点；任一关键点缺失则返回 null。
// score 取参与中点计算的各点里的最小值（躯干干线要求肩+髋都靠谱，木桶效应）。
function resolvePoint(points, ref) {
  const names = Array.isArray(ref) ? ref : [ref];
  let sx = 0, sy = 0, minScore = Infinity;
  for (const name of names) {
    const p = points[name];
    if (!p) return null;
    sx += p.x;
    sy += p.y;
    minScore = Math.min(minScore, p.score ?? 1);
  }
  return { x: sx / names.length, y: sy / names.length, score: minScore };
}

// 需求1核心：置信度检查放在这里——任一端点关键点缺失，或置信度 < minScore，
// 该肢体向量直接判定为"本轮不参与打分"，返回 null。
function limbVector(points, def, minScore) {
  const a = resolvePoint(points, def.from);
  const b = resolvePoint(points, def.to);
  if (!a || !b) return null;
  if (a.score < minScore || b.score < minScore) return null;
  const v = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return null; // 两点重合，方向无意义
  return v;
}

function cosineSimilarity(v1, v2) {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  return dot / (len1 * len2);
}

/**
 * 计算用户实时姿态与模板姿态的匹配度。
 * @param {Record<string,{x:number,y:number,score?:number}>} userLandmarks
 * @param {Record<string,{x:number,y:number,score?:number}>} templateLandmarks
 * @param {{ minScore?: number }} [options] minScore 默认 MIN_KP_SCORE，测试/调参可覆盖
 * @returns {{
 *   score: number,                          0~100 加权匹配度
 *   limbScores: Record<string, number|null>, 每个肢体的单独得分，未参与打分为 null
 *   matchedWeight: number,                   本轮实际参与打分的权重之和
 *   totalWeight: number,                     全部肢体的满编权重之和
 *   coverageRatio: number,                   matchedWeight/totalWeight * 100，缺失越多这个值越低
 *   maxErrorLimb: { name, errorDeg, direction } | null   误差最大的肢体，供 generateAIPrompt 使用
 * }}
 *
 * 需求1（动态权重）：某肢体双方关键点置信度都够、且都能算出向量才计入 matchedWeight；
 * 缺失的肢体（比如自拍图里腿部越界，thigh/shin 置信度天然 <0.3）直接退出分母，
 * 剩余部位按原比例重新分摊到 100 分——不再是"缺腿就扣分"，而是"缺腿就不算腿"。
 */
export function calculatePoseSimilarity(userLandmarks, templateLandmarks, options = {}) {
  const minScore = options.minScore ?? MIN_KP_SCORE;
  const limbScores = {};
  let weightedSum = 0;
  let matchedWeight = 0;
  let worst = null; // 误差最大的肢体（用弧度比较，找到后转成角度存起来）

  for (const def of LIMB_DEFS) {
    const userVec = limbVector(userLandmarks || {}, def, minScore);
    const templateVec = limbVector(templateLandmarks || {}, def, minScore);
    if (!userVec || !templateVec) {
      limbScores[def.name] = null;
      continue;
    }

    const rawCos = cosineSimilarity(userVec, templateVec);
    // 打分用 clamp 过的余弦：负值（方向反了）在"匹配度"语义下直接记 0 分，比负数百分比更直觉
    const cos = Math.max(0, rawCos);
    limbScores[def.name] = Math.round(cos * 100);
    weightedSum += cos * def.weight;
    matchedWeight += def.weight;

    // 需求5：误差用未 clamp 的余弦求夹角，能区分 90° 和 179° 的差异（clamp 后两者都会变成 0 分，无法分辨谁更差）
    const errorRad = Math.acos(Math.min(1, Math.max(-1, rawCos)));
    if (!worst || errorRad > worst.errorRad) {
      // 2D 叉积判断"把 user 向量转到 template 向量"需要的旋转方向。
      // 屏幕坐标系 y 轴向下：cross = userVec.x*templateVec.y - userVec.y*templateVec.x，
      // cross > 0 时视觉上是顺时针(cw)才能对齐，cross < 0 则是逆时针(ccw)。
      // （实测校验：手臂朝上、模板要求朝下的用例，必须得到 cw="往下压"，不能反了）
      const cross = userVec.x * templateVec.y - userVec.y * templateVec.x;
      worst = {
        name: def.name,
        errorRad,
        errorDeg: Math.round((errorRad * 180) / Math.PI),
        direction: cross > 0 ? 'cw' : 'ccw',
      };
    }
  }

  const score = matchedWeight > 0 ? Math.round((weightedSum / matchedWeight) * 100) : 0;
  const coverageRatio = FULL_WEIGHT > 0 ? Math.round((matchedWeight / FULL_WEIGHT) * 100) : 0;

  return {
    score,
    limbScores,
    matchedWeight,
    totalWeight: FULL_WEIGHT,
    coverageRatio,
    maxErrorLimb: worst ? { name: worst.name, errorDeg: worst.errorDeg, direction: worst.direction } : null,
  };
}

/**
 * 需求5：生成一句中文指导语。
 *
 * 当前用基础 if-else 规则实现，但入参刻意保持"结构化、自解释"：
 * userLandmarks/templateLandmarks 是完整关键点字典，maxErrorPart 是
 * calculatePoseSimilarity 返回的 { name, errorDeg, direction }。
 * 日后要换成远端 VLM/LLM（如 DeepSeek）时，直接把这三个参数序列化进 prompt 请求体即可，
 * 函数签名和调用点都不用改——这是预留的 Hook，而不是最终产品文案。
 *
 * @param {Record<string,{x:number,y:number,score?:number}>} userLandmarks
 * @param {Record<string,{x:number,y:number,score?:number}>} templateLandmarks
 * @param {{ name: string, errorDeg: number, direction: 'cw'|'ccw' } | null} maxErrorPart
 * @returns {string}
 */
export function generateAIPrompt(userLandmarks, templateLandmarks, maxErrorPart) {
  if (!maxErrorPart) return '暂无可比较的部位，请正对镜头';
  if (maxErrorPart.errorDeg < 8) return '姿态非常接近模板，保持住';

  // 简化说明：cw/ccw 只是一个标量旋转方向，把它翻译成"抬高/放下""左转/右转"
  // 对于肢体当前朝向接近垂直/水平的常见姿势足够直观，但极端斜向角度时可能不够精确——
  // 这正是留出 generateAIPrompt 这个 Hook 的原因，未来交给 VLM/LLM 看图直接描述会更准确。
  const label = LIMB_LABELS[maxErrorPart.name] || maxErrorPart.name;

  if (maxErrorPart.name === 'torso') {
    return maxErrorPart.direction === 'cw' ? '身体再向右转一点' : '身体再向左转一点';
  }
  if (maxErrorPart.name.includes('thigh') || maxErrorPart.name.includes('shin')) {
    return `${label}角度不太对，偏差约 ${maxErrorPart.errorDeg}°`;
  }
  const turnWord = maxErrorPart.direction === 'cw' ? '往下压一点' : '再抬高一点';
  return `${label}${turnWord}，偏差约 ${maxErrorPart.errorDeg}°`;
}
