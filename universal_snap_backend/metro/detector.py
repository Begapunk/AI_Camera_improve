"""转辙机遗留物（FOD）检测核心。

纯 OpenCV/NumPy 实现的路B（基准差分）与质量闸门今天即可工作；
路A（YOLO）权重可插拔——指向训练好的工器具权重即生效，未训练时优雅返回空。

对外主入口：run_detection(image_bytes, baseline_bytes) -> dict
"""

import os
import threading

import cv2
import numpy as np


# =========================================================================
# 型号族常量（25 个型号聚为 4 族；路A 与型号无关，型号仅用于路B 选基准图）
# =========================================================================
METRO_MODELS = {
    "ZD6": ["ZD6-A", "ZD6-D", "ZD6-E", "ZD6-F", "ZD6-G", "ZD6-H", "ZD6-J"],
    "ZD9": ["ZD9-220/2.5", "ZD9-220/2.5G", "ZD9-170/4.0", "ZD9-170/4.0M"],
    "ZDJ9": ["ZDJ9-170/4.0", "ZDJ9-220/2.5", "ZDJ9-G"],
    "其它": ["ZD7-A", "S700K", "ZDJ10", "TK710", "ZD1", "ZD4", "ZD8",
             "ZDKJ-165/2.5k", "ZK3", "ZYK", "ZYJ7"],
}

# 反向索引：具体型号 -> 族
_MODEL_TO_FAMILY = {m: fam for fam, models in METRO_MODELS.items() for m in models}


def resolve_family(model):
    """根据具体型号解析其所属族，未知型号归入 '其它'。"""
    return _MODEL_TO_FAMILY.get((model or "").strip(), "其它")


# =========================================================================
# 决策结果常量
# =========================================================================
RESULT_PASS = "PASS"        # 绿：三路均无命中且质量达标，可合盖
RESULT_REVIEW = "REVIEW"    # 黄：灰区命中 / 无基准 / 服务降级，强制人工复核
RESULT_BLOCKED = "BLOCKED"  # 红：高置信命中遗留物，禁止合盖
RESULT_RETAKE = "RETAKE"    # 质量不达标，要求重拍


# =========================================================================
# 阈值（集中管理，便于调参；红线指标是漏报率，阈值整体偏召回）
# =========================================================================
# Stage 0 质量闸门
BLUR_MIN_VAR = 80.0          # 拉普拉斯方差下限，越低越糊
BRIGHTNESS_MIN = 35.0        # 平均灰度下限（欠曝）
BRIGHTNESS_MAX = 225.0       # 平均灰度上限（过曝/反光淹没）

# 路A YOLO
YOLO_CONF_REVIEW = 0.30      # 进入候选的最低置信度
YOLO_CONF_BLOCK = 0.55       # 达到拦截的置信度

# 路B 基准差分（以连通域面积占比作为强度分）
DIFF_REVIEW_RATIO = 0.0008   # 疑似区域面积占比下限 -> 进入复核
DIFF_BLOCK_RATIO = 0.02      # 疑似区域足够大 -> 直接拦截
DIFF_BIN_THRESH = 40         # 差分二值化阈值
DIFF_MIN_INLIERS = 12        # 配准内点数下限，低于此认为对齐失败


# =========================================================================
# 路A：闭集 YOLO（懒加载，权重可插拔）
# =========================================================================
_yolo_model = None
_yolo_lock = threading.Lock()

# COCO 类名 -> 中文工器具标签的兜底映射（默认通用权重能命中的少量相关类）；
# 训练专用权重后，类名直接来自模型，无需此表。
_TOOL_LABEL_MAP = {
    "scissors": "剪刀",
    "knife": "刀具",
    "cell phone": "手机",
    "bottle": "瓶子",
    "cup": "杯子",
    "remote": "遥控/手持件",
    "book": "纸册/说明书",
    "mouse": "线缆类",
}


def _get_yolo_model():
    """懒加载地铁专用 YOLO 权重。

    通过环境变量 METRO_YOLO_MODEL 指定权重路径；缺省回退到通用 yolov8n.pt。
    通用权重检不出扳手/导线等专业工器具，路A 会优雅返回空，由路B 兜底。
    """
    global _yolo_model
    if _yolo_model is None:
        with _yolo_lock:
            if _yolo_model is None:
                from ultralytics import YOLO
                weights = os.getenv("METRO_YOLO_MODEL", "yolov8n.pt")
                _yolo_model = YOLO(weights)
    return _yolo_model


def detect_known_tools(img_bgr):
    """路A：检测已知工器具，返回 detection 列表。

    每个元素：{source, label, conf, bbox:[x,y,w,h], blocking:bool}
    任意异常都吞掉并返回空——路A 失败不能阻断整条流水线（由融合层兜底降级）。
    """
    detections = []
    try:
        model = _get_yolo_model()
        results = model(img_bgr, verbose=False)
        if not results:
            return detections
        res = results[0]
        names = res.names if hasattr(res, "names") else {}
        boxes = getattr(res, "boxes", None)
        if boxes is None:
            return detections
        for box in boxes:
            conf = float(box.conf[0]) if box.conf is not None else 0.0
            if conf < YOLO_CONF_REVIEW:
                continue
            cls_id = int(box.cls[0]) if box.cls is not None else -1
            raw_name = names.get(cls_id, str(cls_id))
            label = _TOOL_LABEL_MAP.get(raw_name, raw_name)
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            detections.append({
                "source": "yolo",
                "label": label,
                "conf": round(conf, 3),
                "bbox": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)],
                "blocking": conf >= YOLO_CONF_BLOCK,
            })
    except Exception as e:
        # 路A 不可用（未装 ultralytics / 权重缺失）时静默降级
        print(f"[Metro] 路A YOLO 降级: {e}")
    return detections


# =========================================================================
# Stage 0：质量闸门
# =========================================================================
def quality_gate(img_bgr):
    """评估图像是否适合检测。返回 (ok, score, reason)。

    糊图/欠曝/过曝会让"检不出"被误读为"安全"，必须先卡掉。
    score 归一化到 0~1，仅供前端展示与审计。
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    blur_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())

    reasons = []
    if blur_var < BLUR_MIN_VAR:
        reasons.append(f"画面模糊(清晰度{blur_var:.0f}<{BLUR_MIN_VAR:.0f})")
    if brightness < BRIGHTNESS_MIN:
        reasons.append(f"光线过暗(亮度{brightness:.0f})，请开启补光")
    if brightness > BRIGHTNESS_MAX:
        reasons.append(f"曝光过强/反光(亮度{brightness:.0f})")

    # 清晰度分（截断到阈值的 2.5 倍封顶）与亮度分加权
    blur_score = min(blur_var / (BLUR_MIN_VAR * 2.5), 1.0)
    if BRIGHTNESS_MIN <= brightness <= BRIGHTNESS_MAX:
        bright_score = 1.0
    else:
        bright_score = 0.3
    score = round(0.7 * blur_score + 0.3 * bright_score, 3)

    ok = len(reasons) == 0
    reason = "图像质量合格" if ok else "；".join(reasons)
    return ok, score, reason


# =========================================================================
# 路B：基准差分（开集兜底的灵魂）
# =========================================================================
def _align_to_baseline(current_gray, baseline_gray):
    """用 ORB 特征 + RANSAC 单应，把基准图对齐到现场图坐标系。

    返回 (warped_baseline_gray, inliers) 或 (None, 0) 表示对齐失败。
    """
    orb = cv2.ORB_create(nfeatures=1500)
    kp1, des1 = orb.detectAndCompute(baseline_gray, None)
    kp2, des2 = orb.detectAndCompute(current_gray, None)
    if des1 is None or des2 is None or len(kp1) < 8 or len(kp2) < 8:
        return None, 0

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = matcher.match(des1, des2)
    if len(matches) < DIFF_MIN_INLIERS:
        return None, 0

    matches = sorted(matches, key=lambda m: m.distance)[:200]
    src = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    if H is None or mask is None:
        return None, 0
    inliers = int(mask.sum())
    if inliers < DIFF_MIN_INLIERS:
        return None, inliers

    h, w = current_gray.shape[:2]
    warped = cv2.warpPerspective(baseline_gray, H, (w, h))
    return warped, inliers


def baseline_diff(img_bgr, baseline_bgr):
    """路B：与基准空腔图差分，找出"基准没有、现在多出来"的疑似遗留物。

    返回 (detections, meta)。detections 元素与路A 同构（source='diff'）。
    meta 含对齐内点数等，写入审计便于事后倒查。
    """
    detections = []
    meta = {"aligned": False, "inliers": 0}

    current_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    baseline_gray = cv2.cvtColor(baseline_bgr, cv2.COLOR_BGR2GRAY)

    warped, inliers = _align_to_baseline(current_gray, baseline_gray)
    meta["inliers"] = inliers
    if warped is None:
        # 对齐失败：不能给出可信差分，交由融合层降级为 REVIEW
        return detections, meta
    meta["aligned"] = True

    # 光照鲁棒化：各自 CLAHE 均衡后再差分，抑制整体明暗差异
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cur_eq = clahe.apply(current_gray)
    base_eq = clahe.apply(warped)

    # 仅在基准的有效投影区域内比较（warp 边缘黑边要排除）
    valid = (warped > 0).astype(np.uint8)
    diff = cv2.absdiff(cur_eq, base_eq)
    diff = cv2.bitwise_and(diff, diff, mask=valid)

    _, binary = cv2.threshold(diff, DIFF_BIN_THRESH, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    img_area = float(img_bgr.shape[0] * img_bgr.shape[1])

    for cnt in contours:
        area = cv2.contourArea(cnt)
        ratio = area / img_area
        if ratio < DIFF_REVIEW_RATIO:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        detections.append({
            "source": "diff",
            "label": "未知遗留物",
            "conf": round(min(ratio / DIFF_BLOCK_RATIO, 1.0), 3),
            "bbox": [int(x), int(y), int(w), int(h)],
            "area_ratio": round(ratio, 5),
            "blocking": ratio >= DIFF_BLOCK_RATIO,
        })
    return detections, meta


# =========================================================================
# 融合决策
# =========================================================================
def fuse_decision(quality_ok, detections, has_baseline, baseline_aligned):
    """三路融合 + fail-safe 兜底。返回 (result, message)。

    优先级：质量不达标 > 任一路高置信命中(BLOCK) > 灰区命中/无基准/对齐失败(REVIEW) > PASS
    """
    if not quality_ok:
        return RESULT_RETAKE, "图像质量不达标，请重拍"

    blocking = [d for d in detections if d.get("blocking")]
    if blocking:
        labels = "、".join(sorted({d["label"] for d in blocking}))
        return RESULT_BLOCKED, f"检出疑似遗留物（{labels}），禁止合盖，请取出后重拍"

    if detections:
        labels = "、".join(sorted({d["label"] for d in detections}))
        return RESULT_REVIEW, f"发现 {len(detections)} 处疑似区域（{labels}），请人工复核后确认"

    # 无任何命中，但 fail-safe：缺基准或对齐失败时路B 未生效，不敢判 PASS
    if not has_baseline:
        return RESULT_REVIEW, "该型号尚无标准基准图，路B 未启用，请人工复核"
    if not baseline_aligned:
        return RESULT_REVIEW, "现场图与基准图对齐失败（角度/光线差异过大），请人工复核或调整角度重拍"

    return RESULT_PASS, "未检出遗留物，质量与基准比对均通过，可合盖"


# =========================================================================
# 标注图绘制
# =========================================================================
_COLOR_MAP = {"yolo": (0, 0, 255), "diff": (0, 165, 255)}  # BGR


def annotate_image(img_bgr, detections):
    """把检测框画回原图，返回 JPEG 字节。"""
    canvas = img_bgr.copy()
    for d in detections:
        x, y, w, h = d["bbox"]
        color = _COLOR_MAP.get(d["source"], (0, 0, 255))
        thickness = 3 if d.get("blocking") else 2
        cv2.rectangle(canvas, (x, y), (x + w, y + h), color, thickness)
        tag = f"{d['label']} {d['conf']:.2f}"
        cv2.putText(canvas, tag, (x, max(y - 6, 12)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", canvas)
    return buf.tobytes() if ok else None


# =========================================================================
# 主入口
# =========================================================================
def _decode(image_bytes):
    arr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def run_detection(image_bytes, baseline_bytes=None):
    """端到端跑一次检测。

    入参：
      image_bytes    现场内部照片字节
      baseline_bytes 该型号标准基准图字节（None 表示无基准，路B 跳过）
    返回 dict：result/message/quality_score/detections/annotated_bytes/meta
    """
    img = _decode(image_bytes)
    if img is None:
        return {
            "result": RESULT_RETAKE,
            "message": "图像无法解码，请重拍",
            "quality_score": 0.0,
            "detections": [],
            "annotated_bytes": None,
            "meta": {"error": "decode_failed"},
        }

    # Stage 0
    q_ok, q_score, q_reason = quality_gate(img)
    if not q_ok:
        return {
            "result": RESULT_RETAKE,
            "message": q_reason,
            "quality_score": q_score,
            "detections": [],
            "annotated_bytes": None,
            "meta": {"quality_reason": q_reason},
        }

    detections = []
    meta = {"quality_reason": q_reason}

    # 路A
    detections.extend(detect_known_tools(img))

    # 路B
    has_baseline = baseline_bytes is not None
    baseline_aligned = False
    if has_baseline:
        baseline = _decode(baseline_bytes)
        if baseline is not None:
            diffs, diff_meta = baseline_diff(img, baseline)
            detections.extend(diffs)
            baseline_aligned = diff_meta.get("aligned", False)
            meta["baseline_inliers"] = diff_meta.get("inliers", 0)
        else:
            has_baseline = False
            meta["baseline_error"] = "decode_failed"

    # 融合
    result, message = fuse_decision(q_ok, detections, has_baseline, baseline_aligned)

    annotated = annotate_image(img, detections) if detections else None

    return {
        "result": result,
        "message": message,
        "quality_score": q_score,
        "detections": detections,
        "annotated_bytes": annotated,
        "meta": meta,
    }
