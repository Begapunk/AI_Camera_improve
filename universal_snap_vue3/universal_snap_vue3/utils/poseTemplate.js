/**
 * 模板图姿态提取（模块一 + 需求2 二次元/动漫图降级）。
 *
 * 小程序里没有浏览器 Canvas 读网络图片的 CORS 问题——那是 Web 特有的限制。
 * 小程序对应的限制是"下载域名白名单"：wx.downloadFile 的目标域名必须加入
 * 小程序后台"downloadFile 合法域名"配置，否则请求会直接失败（这一步是控制台配置，非代码层面）。
 *
 * 姿态提取本身复用后端已有的 /detect-pose（YOLOv8n-pose），不引入 MediaPipe：
 * 小程序 JS 环境跑不了 MediaPipe 的 wasm 包（体积/沙箱限制），
 * camera/index.vue 的骨骼追踪已验证"端云协同"是这里唯一可靠的路线。
 */
import { detectPoseApi } from './request.js';
import { cocoArrayToNamedPoints, MIN_KP_SCORE } from './poseSimilarity.js';

// 判定"检测到人体"至少需要这些核心关键点都在场且置信度达标（否则后续肢体向量算不出几条，比较没有意义）
const REQUIRED_CORE_POINTS = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'];

/**
 * @property {string|null} localPath   已下载/已选中的本地图片路径（哪怕识别失败也可能有值），
 *                                      用于需求2的纯视觉叠加模式，避免重新下载
 * @property {boolean} recoverable     true = "真没检测到人体/关键点大面积缺失"，
 *                                      调用方应捕获后降级为纯视觉叠加模式而不是直接报错阻断；
 *                                      false = 下载失败/服务异常等真失败，不应该静默降级
 * @property {string} key              locale 文件里 poseGuide.errors.* 的翻译键，UI 层应该用
 *                                      $t(err.key) 而不是 err.message 展示给用户——message 只是
 *                                      固定中文兜底，方便 console.error 调试，不跟随 UI 语言切换
 */
export class TemplatePoseError extends Error {
  constructor(message, { localPath = null, recoverable = false, key = 'poseGuide.errors.templateLoadFailed' } = {}) {
    super(message);
    this.name = 'TemplatePoseError';
    this.localPath = localPath;
    this.recoverable = recoverable;
    this.key = key;
  }
}

/**
 * 对已经在本地（临时文件/相册选图）的图片提取骨骼关键点 + 合法性校验。
 * 网络模板图下载后、相册选图两条路径最终都走这里，校验逻辑只写一份。
 * @param {string} localPath 本地文件路径
 * @returns {Promise<{ landmarks: Record<string,{x:number,y:number,score:number}>, localPath: string }>}
 * @throws {TemplatePoseError} recoverable=true：未检测到人体/关键点大面积缺失（如二次元图），
 *                             调用方可捕获后降级为纯视觉叠加模式；
 *                             recoverable=false：识别服务本身异常，视为真失败
 */
export function extractLandmarksFromLocalPath(localPath) {
  return detectPoseApi(localPath).then((uploadRes) => {
    if (uploadRes.statusCode !== 200) {
      // 服务本身出错（超时/5xx），不确定是不是"画风识别不了"，不做纯视觉降级，按真失败处理
      throw new TemplatePoseError('姿态识别服务异常，请重试', {
        localPath, recoverable: false, key: 'poseGuide.errors.recognitionServiceError',
      });
    }
    const kpArray = uploadRes.data?.keypoints;
    if (!kpArray) {
      // 需求2：真没检测到人体——常见于二次元/动漫人物、纯风景图等 YOLOv8-pose 认不出的画风
      throw new TemplatePoseError('模板图中未检测到人体骨骼', {
        localPath, recoverable: true, key: 'poseGuide.errors.noBodyDetected',
      });
    }

    const landmarks = cocoArrayToNamedPoints(kpArray);
    const missing = REQUIRED_CORE_POINTS.filter(
      (name) => !landmarks[name] || landmarks[name].score < MIN_KP_SCORE
    );
    if (missing.length > 0) {
      // 需求2：关键点大面积缺失（同样常见于非真实人体图像/严重遮挡），同样降级而不是硬失败
      throw new TemplatePoseError('模板图人物姿态关键部位未检测完整', {
        localPath, recoverable: true, key: 'poseGuide.errors.incompleteKeypoints',
      });
    }

    return { landmarks, localPath };
  });
}

/**
 * 下载网络模板图并提取静态骨骼关键点。
 * @param {string} imageUrl 模板图 URL（如 Unsplash 等图床直链）
 * @returns {Promise<{ landmarks: Record<string,{x:number,y:number,score:number}>, localPath: string }>}
 * @throws {TemplatePoseError} 下载失败时 recoverable=false 且没有 localPath（没有图可用于降级）；
 *                             识别失败时见 extractLandmarksFromLocalPath
 */
export function fetchTemplateLandmarks(imageUrl) {
  if (!imageUrl) {
    return Promise.reject(new TemplatePoseError('模板图片地址不能为空', { key: 'poseGuide.errors.emptyUrl' }));
  }

  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          reject(new TemplatePoseError('模板图片下载失败，请检查图片地址或域名是否已加入下载白名单', {
            key: 'poseGuide.errors.downloadFailedUrl',
          }));
          return;
        }
        resolve(res.tempFilePath);
      },
      fail: () => {
        reject(new TemplatePoseError('模板图片下载失败，请检查网络', { key: 'poseGuide.errors.downloadFailedNetwork' }));
      },
    });
  }).then((localPath) => extractLandmarksFromLocalPath(localPath));
}
