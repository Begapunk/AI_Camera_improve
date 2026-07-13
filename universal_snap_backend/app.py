import os
import base64
import time
import uuid
import random
import json  # 引入 json 解析测距模型的返回结果
from io import BytesIO

# --- 引入 Pillow 用于生成图片验证码 ---
from PIL import Image, ImageDraw, ImageFont

# --- 引入 OpenCV 和 NumPy 用于图像处理 ---
import cv2
import numpy as np
# --- 骨骼追踪：YOLOv8n-pose 延迟加载（首次调用时自动下载 ~6MB 模型）---
import threading
_pose_model = None
_pose_model_lock = threading.Lock()

def _get_pose_model():
    global _pose_model
    if _pose_model is None:
        with _pose_model_lock:
            if _pose_model is None:
                from ultralytics import YOLO
                _pose_model = YOLO('yolov8n-pose.pt')
    return _pose_model

def _preload_pose_model():
    try:
        _get_pose_model()
        print('[Pose] YOLOv8n-pose model ready')
    except Exception as e:
        print(f'[Pose] model preload failed: {e}')

threading.Thread(target=_preload_pose_model, daemon=True).start()
# -------------------------------------------

# --- 手势识别：MediaPipe 官方 Gesture Recognizer 延迟加载 ---
# 用 Gesture Recognizer 拿 21 个手部关键点（分类结果 gesture/score 仅作调试参考），
# 剪刀手（is_scissor）判定改为自定义几何算法，见 _is_scissor_hand，便于精确控制判据。
# 模型资产需手动下载一次，放到 models/gesture_recognizer.task：
#   https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task
_gesture_recognizer = None
_gesture_recognizer_lock = threading.Lock()
_GESTURE_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'gesture_recognizer.task')

def _get_gesture_recognizer():
    global _gesture_recognizer
    if _gesture_recognizer is None:
        with _gesture_recognizer_lock:
            if _gesture_recognizer is None:
                import mediapipe as mp
                from mediapipe.tasks.python import BaseOptions
                from mediapipe.tasks.python.vision import (
                    GestureRecognizer, GestureRecognizerOptions, RunningMode
                )
                options = GestureRecognizerOptions(
                    base_options=BaseOptions(model_asset_path=_GESTURE_MODEL_PATH),
                    running_mode=RunningMode.IMAGE,
                    num_hands=2,  # 双手都要能识别，任一只手比出剪刀手都算命中
                    min_hand_detection_confidence=0.5,
                    min_hand_presence_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                _gesture_recognizer = GestureRecognizer.create_from_options(options)
    return _gesture_recognizer

def _preload_gesture_model():
    try:
        _get_gesture_recognizer()
        print('[Gesture] MediaPipe GestureRecognizer ready')
    except Exception as e:
        print(f'[Gesture] model preload failed (需先下载 gesture_recognizer.task 到 models/ 目录): {e}')

threading.Thread(target=_preload_gesture_model, daemon=True).start()

# --- 剪刀手（V 字手势）几何判定 ---
# 判据：食指(8)、中指(12) 伸直，无名指(16)、小指(20) 弯曲。
# "伸直/弯曲"用"指尖到手腕(0)的距离"对比"对应 PIP 关节到手腕的距离"判断，
# 比直接比较 y 坐标更抗手部旋转/倾斜。EXTEND_RATIO 可按实际误检情况微调。
_EXTEND_RATIO = 1.1
_FINGER_JOINTS = {
    'index':  (6, 8),   # (PIP, TIP)
    'middle': (10, 12),
    'ring':   (14, 16),
    'pinky':  (18, 20),
}

def _dist(a, b):
    return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5

def _finger_extended(landmarks, pip_idx, tip_idx, wrist_idx=0):
    wrist = landmarks[wrist_idx]
    return _dist(wrist, landmarks[tip_idx]) > _dist(wrist, landmarks[pip_idx]) * _EXTEND_RATIO

def _is_scissor_hand(landmarks):
    """剪刀手几何判定：landmarks 为 MediaPipe 21 点手部关键点（原始对象，需 .x/.y 属性）"""
    index_ext  = _finger_extended(landmarks, *_FINGER_JOINTS['index'])
    middle_ext = _finger_extended(landmarks, *_FINGER_JOINTS['middle'])
    ring_curl  = not _finger_extended(landmarks, *_FINGER_JOINTS['ring'])
    pinky_curl = not _finger_extended(landmarks, *_FINGER_JOINTS['pinky'])
    return index_ext and middle_ext and ring_curl and pinky_curl
# -------------------------------------------
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from werkzeug.utils import secure_filename
from openai import OpenAI
from aip import AipSpeech
from volcengine.visual.VisualService import VisualService

# 引入数据库操作与配置 (合并了所有所需的数据库函数)
from db.db import (
    insert_photo_analysis, get_all_photo_analyses,
    delete_photo_analysis, register_user, verify_user,
    get_user_info, update_user_info, update_user_password,
    get_face_registered, mark_face_registered,
    insert_analysis_record, get_analysis_records,
    log_user_activity, get_user_stats
)
from Face_ID import face_manager
# 地铁模式：转辙机遗留物（FOD）检测
from db.metro_db import (
    upsert_device, get_device, insert_inspection,
    confirm_inspection, list_inspections
)
from metro import (
    METRO_MODELS, resolve_family, run_detection, RESULT_REVIEW, RESULT_PASS
)
from settings import (
    BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY,
    ALIYUN_API_KEY, ALIYUN_BASE_URL,
    VOLC_IA_AK, VOLC_IA_SK,
    GROK_API_KEY, GROK_BASE_URL, PALIGEMMA_MODEL_PATH, SECRET_KEY,
    CORS_ORIGINS, FLASK_DEBUG
)
from security.password_validator import PasswordValidator
from security.auth import (
    init_auth, generate_token, require_auth,
    generate_file_token, verify_file_token
)
from migrate_users_table import migrate_users_table
from migrate_extra_tables import migrate_extra_tables
from migrate_metro_tables import migrate as migrate_metro_tables

app = Flask(__name__)

# 启动时自动完成数据库迁移（幂等操作，已有表/列则跳过）
try:
    migrate_users_table()
    migrate_extra_tables()
    migrate_metro_tables()
except Exception as _migrate_err:
    print(f'[migrate] 迁移跳过: {_migrate_err}')

init_auth(SECRET_KEY)

# 跨域支持：小程序原生请求不受 CORS 约束，这里主要影响 H5 端；
# 来源白名单由 CORS_ORIGINS 环境变量控制（逗号分隔），缺省 * 便于局域网真机调试
_cors_origins = "*" if CORS_ORIGINS.strip() == "*" else [
    o.strip() for o in CORS_ORIGINS.split(",") if o.strip()
]
CORS(app, resources={r"/*": {"origins": _cors_origins}})

# 基础路径配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
AUDIO_FOLDER = os.path.join(BASE_DIR, 'static', 'audio')
# 地铁模式：基准图与检测证据分目录存放，便于审计与生命周期管理
METRO_BASELINE_FOLDER = os.path.join(UPLOAD_FOLDER, 'metro_baseline')
METRO_EVIDENCE_FOLDER = os.path.join(UPLOAD_FOLDER, 'metro')

# 确保目录存在
for folder in [UPLOAD_FOLDER, AUDIO_FOLDER, METRO_BASELINE_FOLDER, METRO_EVIDENCE_FOLDER]:
    os.makedirs(folder, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# 初始化各平台 SDK 客户端 (注: OpenAI 客户端已移至函数内部按需实例化，防止长连接超时)
baidu_client = AipSpeech(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY)

visual_service = VisualService()
visual_service.set_ak(VOLC_IA_AK)
visual_service.set_sk(VOLC_IA_SK)
password_validator = PasswordValidator()

# 内存验证码存储 (格式: {captcha_id: {"answer": "12", "expires": timestamp}})
CAPTCHA_STORE = {}


def cleanup_captchas():
    """清理过期的验证码（有效期 5 分钟）"""
    current_time = time.time()
    expired_keys = [k for k, v in CAPTCHA_STORE.items() if current_time > v['expires']]
    for k in expired_keys:
        del CAPTCHA_STORE[k]


# -------------------------------------------------------------------------

# --- 辅助函数：构建动态 URL（附带访问签名，未签名/过期请求一律 403）---
def build_file_url(subpath, filename):
    base_url = request.host_url.rstrip('/')
    token = generate_file_token(subpath, filename)
    return f"{base_url}/{subpath}/{filename}?st={token}"


def build_metro_file_url(filename):
    return build_file_url('metro-file', filename)


# --- 辅助函数：生成透明背景的线稿 ---
def create_transparent_sketch(image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    inverted_gray = cv2.bitwise_not(gray)
    blurred = cv2.GaussianBlur(inverted_gray, (21, 21), 0)
    inverted_blurred = cv2.bitwise_not(blurred)
    sketch = cv2.divide(gray, inverted_blurred, scale=256.0)
    rgba = cv2.cvtColor(sketch, cv2.COLOR_GRAY2RGBA)
    white_mask = rgba[:, :, 0] > 230
    rgba[white_mask, 3] = 0
    return rgba


# --- 辅助函数：校验验证码 ---
def verify_captcha(captcha_id, captcha_answer):
    cleanup_captchas()  # 每次校验时顺便清理过期数据
    if not captcha_id or not captcha_answer:
        return False, "请提供验证码"

    record = CAPTCHA_STORE.get(captcha_id)
    if not record:
        return False, "验证码已过期或不存在，请刷新重试"

    # 无论成功失败，校验一次后立即删除，防止重复使用（防重放攻击）
    del CAPTCHA_STORE[captcha_id]

    if record['answer'] != str(captcha_answer).strip():
        return False, "验证码错误"

    return True, "验证通过"


# -------------------------------------------

# --- 0. 获取验证码接口 ---
@app.route('/api/captcha', methods=['GET'])
def get_captcha():
    num1 = random.randint(1, 10)
    num2 = random.randint(1, 10)
    operator = random.choice(['+', '*'])

    if operator == '+':
        answer = str(num1 + num2)
        text = f"{num1} + {num2} = ?"
    else:
        answer = str(num1 * num2)
        text = f"{num1} x {num2} = ?"

    # 生成图片 (使用柔和的黄色系)
    width, height = 120, 40
    image = Image.new('RGB', (width, height), color=(255, 250, 205))
    draw = ImageDraw.Draw(image)

    # 绘制干扰线
    for _ in range(5):
        x1, y1 = random.randint(0, width), random.randint(0, height)
        x2, y2 = random.randint(0, width), random.randint(0, height)
        draw.line([(x1, y1), (x2, y2)], fill=(255, 215, 0), width=2)

    # 绘制噪点
    for _ in range(30):
        x, y = random.randint(0, width), random.randint(0, height)
        draw.point((x, y), fill=(218, 165, 32))

    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    draw.text((15, 10), text, font=font, fill=(139, 101, 8))

    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode()
    img_data_url = f"data:image/png;base64,{img_base64}"

    captcha_id = str(uuid.uuid4())
    CAPTCHA_STORE[captcha_id] = {
        "answer": answer,
        "expires": time.time() + 300  # 5分钟有效期
    }

    return jsonify({
        "captcha_id": captcha_id,
        "captcha_image": img_data_url
    })


# -------------------------------------------

# --- 1. 用户认证模块 ---
@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username, password = data.get('username'), data.get('password')
    face_data = data.get('face_data')
    captcha_id = data.get('captcha_id')
    captcha_answer = data.get('captcha_answer')

    is_valid_captcha, captcha_msg = verify_captcha(captcha_id, captcha_answer)
    if not is_valid_captcha:
        return jsonify({"error": captcha_msg}), 400

    if not username or not password:
        return jsonify({"error": "用户名和密码不能为空"}), 400

    # 密码强度在注册入口校验（登录不再校验，避免日后收紧规则把老用户锁在门外）
    is_valid_pwd, errors = password_validator.validate(password, username)
    if not is_valid_pwd:
        return jsonify({"error": "密码不合规", "details": errors}), 400

    success, message = register_user(username, password)
    if not success:
        return jsonify({"error": message}), 400

    # 注册时可选同步录入人脸
    if face_data:
        ok, _ = face_manager.register_user_face(username, face_data)
        if ok:
            mark_face_registered(username)

    return jsonify({"message": message})


@app.route('/login-face', methods=['POST'])
def login_face():
    data = request.json or {}
    face_data = data.get('face_data')
    if not face_data:
        return jsonify({"error": "缺少人脸数据"}), 400

    success, result = face_manager.verify_login_face(face_data)
    if not success:
        return jsonify({"error": result}), 401

    # result 即注册时写入百度的 user_id（等于 username）
    username = result
    user_info = get_user_info(username)
    if not user_info:
        return jsonify({"error": "用户不存在，请先注册"}), 404

    token = generate_token(username)
    return jsonify({"message": "识别成功", "username": username, "token": token})


@app.route('/update-face', methods=['POST'])
@require_auth
def update_face():
    data = request.json or {}
    username = g.current_user
    face_data = data.get('face_data')

    if not face_data:
        return jsonify({"error": "缺少必要参数"}), 400

    already_bound = get_face_registered(username)
    if already_bound:
        ok, message = face_manager.update_user_face(username, face_data)
    else:
        ok, message = face_manager.register_user_face(username, face_data)

    if not ok:
        return jsonify({"error": message}), 400

    mark_face_registered(username)
    return jsonify({"message": message})


@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username, password = data.get('username'), data.get('password')
    captcha_id = data.get('captcha_id')
    captcha_answer = data.get('captcha_answer')

    is_valid_captcha, captcha_msg = verify_captcha(captcha_id, captcha_answer)
    if not is_valid_captcha:
        return jsonify({"error": captcha_msg}), 400

    success, message = verify_user(username, password)
    if not success:
        return jsonify({"error": message}), 401

    token = generate_token(username)
    return jsonify({"message": message, "username": username, "token": token})


# -------------------------------------------

# --- 2. 核心分析模块 ---
@app.route('/analyze', methods=['POST'])
@require_auth
def analyze():
    file = request.files.get('file')
    if not file: return jsonify({"error": "未上传文件"}), 400

    filename = f"snap_{int(time.time())}_{secure_filename(file.filename)}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    with open(filepath, "rb") as f:
        img_base64 = base64.b64encode(f.read()).decode()
    img_data_url = f"data:image/jpeg;base64,{img_base64}"

    try:
        # 【核心修复】：函数内部建立全新连接，杜绝僵尸 Socket
        local_client = OpenAI(api_key=ALIYUN_API_KEY, base_url=ALIYUN_BASE_URL)
        completion = local_client.chat.completions.create(
            model="qwen-vl-plus",
            messages=[
                {"role": "system", "content": [{"type": "text", "text": "你是一个摄影指导助手。"}]},
                {"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": img_data_url}},
                    {"type": "text", "text": "请分析这张自拍，给出50字以内的改进建议（关注构图、姿势、角度）。"}
                ]},
            ],
            presence_penalty=1.5,
            max_tokens=300,
        )
        advice = completion.choices[0].message.content.strip()

        audio_url = None
        if request.form.get('need_audio') == 'true':
            res = baidu_client.synthesis(advice, 'zh', 1, {'vol': 7, 'per': 0, 'spd': 4})
            if not isinstance(res, dict):
                audio_filename = f"advice_{int(time.time())}.mp3"
                with open(os.path.join(AUDIO_FOLDER, audio_filename), 'wb') as f: f.write(res)
                audio_url = build_file_url('static/audio', audio_filename)
            else:
                app.logger.error("百度TTS合成失败(analyze): %s", res)

        user_info = get_user_info(g.current_user)
        audio_filename = os.path.basename(audio_url) if audio_url else None
        insert_analysis_record(user_info['id'], 'selfie', filename, advice, audio_filename)
        log_user_activity(user_info['id'])

        return jsonify({"advice": advice, "audioUrl": audio_url, "imageUrl": build_file_url('uploads', filename)})
    except Exception:
        app.logger.exception("analyze 失败")
        return jsonify({"error": "分析服务暂时不可用，请稍后重试"}), 500


@app.route('/analyze-grok', methods=['POST'])
@require_auth
def analyze_grok():
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "未上传文件"}), 400

    filename = f"grok_{int(time.time())}_{secure_filename(file.filename)}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    with open(filepath, "rb") as f:
        img_base64 = base64.b64encode(f.read()).decode()
    img_data_url = f"data:image/jpeg;base64,{img_base64}"

    try:
        # 【核心修复】：新建客户端
        local_xai_client = OpenAI(api_key=GROK_API_KEY, base_url=GROK_BASE_URL)
        completion = local_xai_client.chat.completions.create(
            model="grok-2-vision-1212",
            messages=[
                {
                    "role": "system",
                    "content": "你是一个专业且有趣的摄影顾问。请针对这张照片给出简短、有用的构图或姿势建议（50字左右，用幽默且毒舌的口吻回复）。"
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": img_data_url, "detail": "high"}},
                        {"type": "text", "text": "给点建议，怎么拍更好看？"}
                    ]
                },
            ],
            temperature=0.7,
        )
        advice = completion.choices[0].message.content.strip()

        user_info = get_user_info(g.current_user)
        insert_analysis_record(user_info['id'], 'selfie', filename, advice)
        log_user_activity(user_info['id'])

        return jsonify({
            "advice": advice,
            "imageUrl": build_file_url('uploads', filename),
            "model": "Grok"
        })
    except Exception:
        app.logger.exception("analyze-grok 失败")
        return jsonify({"error": "Grok 服务异常，请稍后重试"}), 500


# --- 智能测距构图相关提示词与处理逻辑 ---
PROMPT_TEMPLATES = {
    "person": """
你是一个专业的人像摄影指导大师。请分析这张图片，并结合用户当前的手机参数给出构图建议。
【当前手机状态】：水平倾斜角 {tilt_angle} 度。
【人像构图法则】：
1. 人脸不应在正中心，应在画面上方的三分之一处（黄金分割线）。
2. 头顶上方必须留有一定的空间（留白）。
3. 画面必须保持水平（倾斜角应接近 0 度）。

请严格判断当前画面是否符合标准。
如果不完美，请给出一句简短的中文语音指令（控制在15个字以内）。
【视觉测距强制要求】：请识别画面中主要人物的肩宽或脸宽，估算其占整张图片宽度的比例（用小数 subject_ratio 表示）。并预估该部位的真实物理宽度（单位：米，用 subject_real_width 表示，如成年人肩宽0.4，脸宽0.15）。同时返回部位名称 subject_name。
""",
    "object": """
你是一个专业的静物/产品摄影指导大师。请分析这张图片，并结合用户当前的手机参数给出构图建议。
【当前手机状态】：水平倾斜角 {tilt_angle} 度。
【静物构图法则】：核心拍摄物体应该尽可能占据画面的中心位置，背景尽量干净。

请严格判断当前画面是否符合标准。
如果不完美，请给出一句简短的中文语音指令（控制在15个字以内）。
【视觉测距强制要求】：请识别画面中的核心物品，精确估算其宽度占整张图片宽度的比例（用小数 subject_ratio 表示）。并预估该物品的真实物理宽度（单位：米，用 subject_real_width 表示）。同时返回物品名称 subject_name。
""",
    "scenery": """
你是一个专业的风景风光摄影指导大师。请分析这张图片，并结合用户当前的手机参数给出构图建议。
【当前手机状态】：水平倾斜角 {tilt_angle} 度。
【风景构图法则】：画面中的地平线或海平面必须绝对水平。遵循三分法则。

请严格判断当前画面是否符合标准。
如果不完美，请给出一句简短的中文语音指令（控制在15个字以内）。
【视觉测距强制要求】：请识别画面中最大的特征景物（如建筑、树木、车辆），估算其宽度占整张图片的比例（小数 subject_ratio）。并预估其真实物理宽度（单位：米，用 subject_real_width 表示，如普通汽车约 4.0 米）。同时返回景物名称 subject_name。
"""
}


def call_smart_vision_model(img_base64, prompt):
    """专门为智能构图调用的视觉分析函数，强行提取包含占比参数的 JSON"""
    system_instruction = prompt + """

请必须只返回合法的 JSON 格式，不要包含任何 markdown 标记，格式必须严格包含以下字段：
{
  "is_perfect": false, 
  "advice": "请把手机靠近一点", 
  "subject_ratio": 0.35, 
  "subject_name": "马克杯", 
  "subject_real_width": 0.08
}"""

    img_data_url = f"data:image/jpeg;base64,{img_base64}"

    # 【核心修复】：新建客户端
    local_client = OpenAI(api_key=ALIYUN_API_KEY, base_url=ALIYUN_BASE_URL)
    completion = local_client.chat.completions.create(
        model="qwen-vl-plus",
        messages=[
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": img_data_url}},
                {"type": "text", "text": system_instruction}
            ]},
        ],
        max_tokens=400,
    )
    raw_content = completion.choices[0].message.content.strip()

    # 【终极防截断写法】：使用 chr(96) 生成反引号，彻底避开网页复制粘贴 bug
    backticks = chr(96) * 3
    raw_content = raw_content.replace(backticks + "json", "").replace(backticks, "").strip()

    return json.loads(raw_content)


# --- 智能构图视觉测距接口 ---
@app.route('/smart-analyze', methods=['POST'])
@require_auth
def smart_analyze():
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({"error": "No image file provided"}), 400

        filename = f"smart_{int(time.time())}_{secure_filename(file.filename)}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        with open(filepath, "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode()

        mode = request.form.get('mode', 'person')
        tilt_angle = request.form.get('tilt_angle', '0')

        if mode not in PROMPT_TEMPLATES:
            return jsonify({"error": "Invalid mode"}), 400

        base_prompt = PROMPT_TEMPLATES[mode]
        formatted_prompt = base_prompt.format(tilt_angle=tilt_angle)

        ai_result = call_smart_vision_model(img_base64, formatted_prompt)

        advice = ai_result.get("advice", "继续保持")
        is_perfect = ai_result.get("is_perfect", False)

        # 智能模式语音播报：与 /analyze 保持一致，需前端 need_audio=true；完美构图时不打扰
        audio_url = None
        if request.form.get('need_audio') == 'true' and advice and not is_perfect:
            res = baidu_client.synthesis(advice, 'zh', 1, {'vol': 7, 'per': 0, 'spd': 4})
            if not isinstance(res, dict):
                audio_filename = f"smart_advice_{int(time.time())}.mp3"
                with open(os.path.join(AUDIO_FOLDER, audio_filename), 'wb') as f:
                    f.write(res)
                audio_url = build_file_url('static/audio', audio_filename)
            else:
                app.logger.error("百度TTS合成失败(smart): %s", res)

        return jsonify({
            "code": 200,
            "audioUrl": audio_url,
            "data": {
                "mode": mode,
                "is_perfect": is_perfect,
                "advice": advice,
                "subject_ratio": float(ai_result.get("subject_ratio", 0.0)),
                "subject_name": ai_result.get("subject_name", ""),
                "subject_real_width": float(ai_result.get("subject_real_width", 0.0))
            }
        })

    except Exception:
        # 不抛 HTML 报错页面、不外泄内部异常细节，优雅返回 JSON；细节进服务端日志
        app.logger.exception("smart-analyze 失败")
        return jsonify({
            "code": 500,
            "error": "分析服务暂时不可用，请稍后重试",
            "data": {
                "is_perfect": False,
                "advice": "系统思考中，请重新测距...",
                "subject_ratio": 0.0,
                "subject_name": "",
                "subject_real_width": 0.0
            }
        }), 500


# -------------------------------------------

# =========================================================================
# --- 专业模式：PaliGemma（本地）+ Qwen-VL（云端）三段流水线 ---
# =========================================================================

# PaliGemma 懒加载：首次调用时初始化，避免 Flask 启动时阻塞 30+ 秒
_pali_model = None
_pali_processor = None
_pali_device = None
_pali_lock = threading.Lock()


def _load_paligemma():
    """懒加载 PaliGemma。threaded 模式下冷启动可能并发进入，双重检查锁防止模型被加载两次撑爆显存"""
    global _pali_model, _pali_processor, _pali_device
    if _pali_model is not None:
        return _pali_model, _pali_processor, _pali_device

    with _pali_lock:
        if _pali_model is not None:
            return _pali_model, _pali_processor, _pali_device

        import torch
        from transformers import AutoProcessor, PaliGemmaForConditionalGeneration

        _pali_device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if _pali_device == "cuda" else torch.float32

        _pali_processor = AutoProcessor.from_pretrained(PALIGEMMA_MODEL_PATH)
        # _pali_model 最后赋值：锁外快路径以它判断“已就绪”，processor/device 必须先可用
        _pali_model = PaliGemmaForConditionalGeneration.from_pretrained(
            PALIGEMMA_MODEL_PATH,
            torch_dtype=dtype,
            device_map=_pali_device,
        ).eval()

    return _pali_model, _pali_processor, _pali_device


def _paligemma_infer(image_bytes):
    """
    使用本地 paligemma2-3b-ft-docci-448 生成密集场景描述。
    DOCCI 微调版不支持 <loc> 边界框格式，但能生成极详细的
    场景/人物/光照/姿态描述，作为 Qwen 的高质量上下文输入。

    返回 dict: description (str), img_w (int), img_h (int)
    """
    import torch
    from PIL import Image as PILImage

    model, processor, device = _load_paligemma()
    pil_img = PILImage.open(BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = pil_img.size

    # DOCCI 模型标准用法：必须在 prompt 开头加 <image> 占位符
    # PaliGemma2 是因果 LM，输出序列 = 输入 token + 生成 token
    # 必须切掉 input_len 之前的部分，否则解码出来会重复 prompt 内容
    prompt = "<image>"
    inputs = processor(text=prompt, images=pil_img, return_tensors="pt").to(device)
    input_len = inputs["input_ids"].shape[-1]

    with torch.inference_mode():
        ids = model.generate(
            **inputs,
            max_new_tokens=256,
            do_sample=False,
        )

    # 切掉输入 token，只解码生成部分
    generated = ids[0][input_len:]
    raw = processor.decode(generated, skip_special_tokens=True).strip()

    return {
        "description": raw,
        "img_w": img_w,
        "img_h": img_h,
    }


@app.route('/pro-analyze', methods=['POST'])
@require_auth
def pro_analyze():
    """
    专业模式三段流水线接口：
      Stage 1 → PaliGemma (本地): 目标检测 + 场景描述
      Stage 2 → Qwen-VL-Plus (云端): 制定精确拍摄方案 JSON
      Stage 3 → 前端 VKSession 实时比对（此路由只管前两段）
    """
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({"error": "未上传文件"}), 400

        # 从前端传来的实时传感器数据
        tilt_angle = float(request.form.get('tilt_angle', 0))   # Roll，正=右倾
        pitch_angle = float(request.form.get('pitch_angle', 0)) # Pitch，正=仰拍
        est_distance = request.form.get('estimated_distance', '未知')

        filename = f"pro_{int(time.time())}_{secure_filename(file.filename)}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        with open(filepath, 'rb') as f:
            image_bytes = f.read()
        img_base64 = base64.b64encode(image_bytes).decode()

        # ── Stage 1: PaliGemma2-DOCCI 密集场景描述 (本地推理) ──────────
        # DOCCI 微调版输出高质量自然语言描述（人物姿态/光照/背景/构图），
        # 作为 Qwen 的上下文，比原始 BBox 坐标更有利于制定拍摄方案。
        pg_context = "（PaliGemma 未加载，由 Qwen 直接做视觉分析）"
        pg_active = False

        try:
            pg = _paligemma_infer(image_bytes)
            pg_context = (
                f"【PaliGemma2-DOCCI 场景描述（本地推理）】\n"
                f"  {pg['description']}\n"
                f"  （图像尺寸: {pg['img_w']}×{pg['img_h']}px）"
            )
            pg_active = True
        except Exception as pg_err:
            pg_context = f"（PaliGemma 降级原因: {str(pg_err)[:120]}）"

        # ── Stage 2: Qwen-VL-Plus 制定精确拍摄方案 (云端) ──────────────
        # 传感器纠正提示：正值=右倾=需向左转
        tilt_desc = (
            f"右倾 {tilt_angle:.1f}°，需向左旋转 {tilt_angle:.1f}° 来纠正"
            if tilt_angle > 0.5
            else f"左倾 {abs(tilt_angle):.1f}°，需向右旋转 {abs(tilt_angle):.1f}° 来纠正"
            if tilt_angle < -0.5
            else "水平良好"
        )

        qwen_prompt = f"""你是专业摄影导师，请综合传感器数据与图像，制定一份严格的 JSON 拍摄方案。

{pg_context}

【实时传感器快照】
  水平倾斜 Roll: {tilt_angle:+.1f}°  （{tilt_desc}）
  俯仰角 Pitch:  {pitch_angle:+.1f}°  （正值=仰拍，负值=俯拍）
  当前估算距离:  {est_distance}

【输出要求】
严格只返回合法 JSON，禁止 markdown 包裹，所有坐标为归一化值 [0,1]（左上角原点）：
{{
  "target_keypoints": {{
    "nose":            [0.50, 0.26],
    "left_shoulder":   [0.37, 0.44],
    "right_shoulder":  [0.63, 0.44],
    "left_hip":        [0.40, 0.64],
    "right_hip":       [0.60, 0.64],
    "left_wrist":      [0.30, 0.62],
    "right_wrist":     [0.70, 0.62]
  }},
  "pose_instruction": "挺胸，下巴微收，双肩自然下沉",
  "voice_guide": "向左移15厘米，抬高手机3厘米让头顶进入画面",
  "rotation_hint": {{
    "direction": "left",
    "degrees": 2.3,
    "reason": "当前右倾 2.3°，向左旋转手机可纠正"
  }},
  "distance_hint": {{
    "action": "move_back",
    "cm": 25,
    "reason": "主体人物占画面过大，后退 25cm 可纳入全身"
  }},
  "framing_score": 58,
  "lighting_note": "左侧光源不足，建议侧身约 30° 使自然光从左前方补充"
}}
请根据图像主体的真实位置精确填写 target_keypoints，不要给默认值。"""

        img_data_url = f"data:image/jpeg;base64,{img_base64}"
        local_client = OpenAI(api_key=ALIYUN_API_KEY, base_url=ALIYUN_BASE_URL)

        completion = local_client.chat.completions.create(
            model="qwen-vl-plus",
            messages=[{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": img_data_url}},
                {"type": "text", "text": qwen_prompt},
            ]}],
            max_tokens=700,
        )

        raw = completion.choices[0].message.content.strip()
        backticks = chr(96) * 3
        raw = raw.replace(backticks + "json", "").replace(backticks, "").strip()
        plan = json.loads(raw)

        return jsonify({
            "code": 200,
            "data": {
                "plan": plan,
                "paligemma_active": pg_active,
                "sensor_snapshot": {
                    "tilt": tilt_angle,
                    "pitch": pitch_angle,
                    "distance": est_distance,
                },
            }
        })

    except json.JSONDecodeError:
        return jsonify({"code": 500, "error": "Qwen 返回了非法 JSON，请重试", "data": None}), 500
    except Exception:
        app.logger.exception("pro-analyze 失败")
        return jsonify({"code": 500, "error": "专业模式分析失败，请稍后重试", "data": None}), 500


# -------------------------------------------

# --- 3. 工具与分析模块 ---
@app.route('/generate-sketch', methods=['POST'])
@require_auth
def generate_sketch():
    file = request.files.get('file')
    if not file: return jsonify({"error": "未上传文件"}), 400

    try:
        file_content = file.read()
        sketch_rgba = create_transparent_sketch(file_content)

        filename = f"sketch_{int(time.time())}_{secure_filename(file.filename.rsplit('.', 1)[0])}.png"
        filepath = os.path.join(UPLOAD_FOLDER, filename)

        cv2.imwrite(filepath, sketch_rgba)

        return jsonify({
            "message": "线稿生成成功",
            "sketchUrl": build_file_url('uploads', filename)
        })

    except Exception:
        app.logger.exception("generate-sketch 失败")
        return jsonify({"error": "线稿生成失败，请稍后重试"}), 500


# --- 4. 环境分析模块 ---
@app.route('/analyze-env', methods=['POST'])
@require_auth
def analyze_env():
    """环境分析接口 - 支持AI分析和语音合成"""
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({"error": "未上传文件"}), 400

        filename = f"env_{int(time.time())}_{secure_filename(file.filename)}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        with open(filepath, "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode()
        img_data_url = f"data:image/jpeg;base64,{img_base64}"

        local_client = OpenAI(api_key=ALIYUN_API_KEY, base_url=ALIYUN_BASE_URL)
        completion = local_client.chat.completions.create(
            model="qwen-vl-plus",
            messages=[
                {
                    "role": "system",
                    "content": "你是一个环境分析专家。请分析图片中的环境状况，给出实用的改善建议。关注构图、光线、背景、角度。回复80字以内，建议要具体可执行。"
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": img_data_url}},
                        {"type": "text", "text": "请分析这张环境照片，给出具体改善建议。"}
                    ]
                },
            ],
            temperature=0.7,
            max_tokens=400,
        )

        advice = completion.choices[0].message.content.strip()

        response_data = {
            "advice": advice,
            "imageUrl": build_file_url('uploads', filename),
            "audioUrl": None
        }

        # 生成语音建议
        try:
            audio_result = baidu_client.synthesis(advice, 'zh', 1, {
                'vol': 7,
                'per': 4,
                'spd': 5,
                'pit': 5,
            })

            if not isinstance(audio_result, dict):
                audio_filename = f"env_advice_{int(time.time())}.mp3"
                audio_filepath = os.path.join(AUDIO_FOLDER, audio_filename)

                with open(audio_filepath, 'wb') as f:
                    f.write(audio_result)

                response_data["audioUrl"] = build_file_url('static/audio', audio_filename)
            else:
                app.logger.error("百度TTS合成失败(env): %s", audio_result)
        except Exception as e:
            app.logger.error("百度TTS合成异常(env): %s", e)

        user_info = get_user_info(g.current_user)
        audio_filename = os.path.basename(response_data['audioUrl']) if response_data['audioUrl'] else None
        insert_analysis_record(user_info['id'], 'environment', filename, advice, audio_filename)
        log_user_activity(user_info['id'])

        return jsonify(response_data)

    except Exception:
        app.logger.exception("analyze-env 失败")
        return jsonify({"error": "环境分析失败，请稍后重试"}), 500


# --- 5. 图像评分与模板存取模块 ---
@app.route('/analyze-template', methods=['POST'])
@require_auth
def analyze_template():
    file = request.files.get('file')
    save_as_template = request.form.get('save_as_template') == 'true'
    if not file: return jsonify({"error": "未上传文件"}), 400

    # 时间戳前缀保证唯一，否则不同用户的同名文件会互相覆盖
    filename = f"template_{int(time.time())}_{secure_filename(file.filename)}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    with open(filepath, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode()

    try:
        result = visual_service.image_score({"image_base64": image_base64})
        data = result.get('data', {})
        score = data.get('score', 0.0)
        advice = data.get('advice', '画面极具美感')

        if save_as_template:
            user_info = get_user_info(g.current_user)
            insert_photo_analysis(filename, advice, score, user_info['id'])
            log_user_activity(user_info['id'])

        return jsonify({
            "score": score, "advice": advice, "saved": save_as_template,
            "imageUrl": build_file_url('uploads', filename)
        })
    except Exception:
        app.logger.exception("analyze-template 失败")
        return jsonify({"error": "评分服务暂时不可用，请稍后重试"}), 500


@app.route('/api/templates', methods=['GET'])
@require_auth
def get_templates():
    try:
        user_info = get_user_info(g.current_user)
        templates = get_all_photo_analyses(user_info['id'])
        for t in templates:
            t['imageUrl'] = build_file_url('uploads', t['filename'])
        return jsonify({"templates": templates})
    except Exception:
        app.logger.exception("templates 查询失败")
        return jsonify({"error": "获取模板列表失败，请稍后重试"}), 500


@app.route('/api/delete', methods=['DELETE'])
@require_auth
def delete_template():
    template_id = request.args.get('template_id', type=int)
    if not template_id: return jsonify({"error": "缺少ID"}), 400
    try:
        user_info = get_user_info(g.current_user)
        success, filename = delete_photo_analysis(template_id, user_info['id'])
        if success:
            path = os.path.join(UPLOAD_FOLDER, filename)
            if os.path.exists(path): os.remove(path)
            return jsonify({"message": "删除成功"})
        return jsonify({"error": "删除失败或无权限"}), 404
    except Exception:
        app.logger.exception("删除模板失败")
        return jsonify({"error": "删除失败，请稍后重试"}), 500


@app.route('/api/history', methods=['GET'])
@require_auth
def get_history():
    """自拍建议(selfie) / 环境分析(environment) 历史记录列表"""
    record_type = request.args.get('type')
    if record_type not in ('selfie', 'environment'):
        return jsonify({"error": "type 参数必须是 selfie 或 environment"}), 400
    try:
        user_info = get_user_info(g.current_user)
        records = get_analysis_records(user_info['id'], record_type)
        for r in records:
            r['imageUrl'] = build_file_url('uploads', r['filename'])
            r['audioUrl'] = build_file_url('static/audio', r['audio_filename']) if r.get('audio_filename') else None
        return jsonify({"records": records})
    except Exception:
        app.logger.exception("history 查询失败")
        return jsonify({"error": "获取历史记录失败，请稍后重试"}), 500


# --- 静态资源路由（一律校验 ?st= 签名，防止陌生人猜文件名枚举用户照片/语音）---
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    if not verify_file_token('uploads', filename, request.args.get('st', '')):
        return jsonify({"error": "链接无效或已过期"}), 403
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/static/audio/<filename>')
def serve_audio(filename):
    if not verify_file_token('static/audio', filename, request.args.get('st', '')):
        return jsonify({"error": "链接无效或已过期"}), 403
    return send_from_directory(AUDIO_FOLDER, filename)


# --- 6. 我的模块 ---
@app.route('/api/user/info', methods=['GET'])
@require_auth
def get_user_profile():
    username = g.current_user

    user_info = get_user_info(username)
    if not user_info:
        return jsonify({"error": "用户不存在"}), 404

    if user_info.get('avatar'):
        user_info['avatar'] = build_file_url('uploads', user_info['avatar'])

    user_info.update(get_user_stats(user_info['id']))
    return jsonify({"user": user_info})


@app.route('/api/user/update', methods=['POST'])
@require_auth
def update_user_profile():
    username = g.current_user
    data = request.form
    nickname = data.get('nickname')

    avatar = None
    if 'avatar' in request.files:
        file = request.files['avatar']
        if file.filename:
            filename = f"avatar_{int(time.time())}_{secure_filename(file.filename)}"
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            file.save(filepath)
            avatar = filename

    success, message = update_user_info(username, nickname, avatar)
    if success:
        return jsonify({"message": message})
    return jsonify({"error": message}), 400


@app.route('/api/user/change-password', methods=['POST'])
@require_auth
def change_password():
    username = g.current_user
    data = request.json
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not old_password or not new_password:
        return jsonify({"error": "缺少必要参数"}), 400

    is_valid_pwd, errors = password_validator.validate(new_password, username)
    if not is_valid_pwd:
        return jsonify({"error": "新密码不合规", "details": errors}), 400

    success, message = update_user_password(username, old_password, new_password)
    if success:
        return jsonify({"message": message})
    return jsonify({"error": message}), 400


# ================================================================
# 骨骼追踪：YOLOv8n-pose 推理接口
# 接收：multipart/form-data  file=<JPEG>
# 返回：{ "keypoints": [{x,y,score}, ...] }（COCO-17，坐标已归一化 0~1）
# ================================================================
@app.route('/detect-pose', methods=['POST'])
@require_auth
def detect_pose():
    if 'file' not in request.files:
        return jsonify({'error': 'no file'}), 400

    img_bytes = request.files['file'].read()
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({'error': 'invalid image'}), 400

    try:
        model = _get_pose_model()
        results = model(img, verbose=False)
    except Exception:
        app.logger.exception("detect-pose 推理失败")
        return jsonify({'error': '姿态检测服务异常，请稍后重试'}), 500

    if not results or results[0].keypoints is None:
        return jsonify({'keypoints': None})

    kps_obj = results[0].keypoints
    if kps_obj.xyn is None or len(kps_obj.xyn) == 0:
        return jsonify({'keypoints': None})

    # xyn: 归一化坐标 (0~1)，shape (n_persons, 17, 2)
    # conf: 置信度，shape (n_persons, 17)
    xy  = kps_obj.xyn[0].tolist()
    conf = kps_obj.conf[0].tolist() if kps_obj.conf is not None else [1.0] * 17

    keypoints = [
        {'x': float(xy[i][0]), 'y': float(xy[i][1]), 'score': float(conf[i])}
        for i in range(17)
    ]
    return jsonify({'keypoints': keypoints})


# ================================================================
# 手势识别：MediaPipe Gesture Recognizer（手部 21 点+几何判定，最多双手）
#          + YOLOv8n-pose（身体 17 点）融合推理接口
# 接收：multipart/form-data  file=<JPEG>
# 返回：{
#   "gesture": "Victory" | null,      # 第一只检测到的手的分类器结果，仅供调试参考
#   "score": 0.93,
#   "is_scissor": true,               # 任一只手满足几何判定即为 true，实际触发拍照用这个字段
#   "landmarks": [[{x,y}×21], ...] | null,  # 每只手的关键点数组（最多 2 只手），归一化坐标 0~1
#   "keypoints": [{x,y,score}×17] | null    # 身体骨骼关键点，与 /detect-pose 同格式
# }
# ================================================================
@app.route('/detect-gesture', methods=['POST'])
@require_auth
def detect_gesture():
    if 'file' not in request.files:
        return jsonify({'error': 'no file'}), 400

    img_bytes = request.files['file'].read()
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({'error': 'invalid image'}), 400

    try:
        import mediapipe as mp
        recognizer = _get_gesture_recognizer()
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        gesture_result = recognizer.recognize(mp_image)
    except Exception:
        app.logger.exception("detect-gesture 推理失败")
        return jsonify({'error': '手势识别服务异常，请稍后重试'}), 500

    landmarks = None
    is_scissor = False
    gesture_name = None
    gesture_score = 0.0
    if gesture_result.hand_landmarks:
        landmarks = [
            [{'x': float(p.x), 'y': float(p.y)} for p in hand]
            for hand in gesture_result.hand_landmarks
        ]
        # 任一只手比出剪刀手都判定为命中
        is_scissor = any(_is_scissor_hand(hand) for hand in gesture_result.hand_landmarks)
        if gesture_result.gestures and gesture_result.gestures[0]:
            top = gesture_result.gestures[0][0]
            gesture_name = top.category_name
            gesture_score = float(top.score)

    # 身体骨骼融合：同一张已解码的帧复用给 YOLOv8n-pose，避免前端二次上传
    keypoints = None
    try:
        pose_model = _get_pose_model()
        pose_results = pose_model(img, verbose=False)
        kps_obj = pose_results[0].keypoints if pose_results else None
        if kps_obj is not None and kps_obj.xyn is not None and len(kps_obj.xyn) > 0:
            xy = kps_obj.xyn[0].tolist()
            conf = kps_obj.conf[0].tolist() if kps_obj.conf is not None else [1.0] * 17
            keypoints = [
                {'x': float(xy[i][0]), 'y': float(xy[i][1]), 'score': float(conf[i])}
                for i in range(17)
            ]
    except Exception as e:
        print(f'[Gesture] pose fusion failed: {e}')

    return jsonify({
        'gesture': gesture_name,
        'score': gesture_score,
        'is_scissor': is_scissor,
        'landmarks': landmarks,
        'keypoints': keypoints
    })


# =========================================================================
# 地铁模式：转辙机遗留物（FOD）检测
#   安全闸门定性：fail-safe + 宁可误报不可漏报 + 全链路可追溯
#   三路并联：路A 闭集 YOLO / 路B 基准差分 / 路C 异常兜底(二期)
# =========================================================================

@app.route('/metro/models', methods=['GET'])
@require_auth
def metro_models():
    """返回型号族映射，供前端选择器与后端登记校验保持同步。"""
    return jsonify({"families": METRO_MODELS})


@app.route('/metro/device/<device_code>', methods=['GET'])
@require_auth
def metro_get_device(device_code):
    """扫码后拉取设备信息 + 基准就绪状态。"""
    dev = get_device(device_code)
    if not dev:
        return jsonify({"exists": False}), 404
    # 不外泄基准图文件名细节以外的存储路径
    dev["baseline_ready"] = bool(dev.get("baseline_version", 0) and dev.get("baseline_image"))
    return jsonify({"exists": True, "device": dev})


@app.route('/metro/devices/register', methods=['POST'])
@require_auth
def metro_register_device():
    """登记/更新转辙机；可选上传基准空腔图（multipart: baseline=<JPEG>）。"""
    device_code = (request.form.get('device_code') or '').strip()
    model = (request.form.get('model') or '').strip()
    station = request.form.get('station')
    location = request.form.get('location')

    if not device_code or not model:
        return jsonify({"error": "device_code 与 model 必填"}), 400

    family = resolve_family(model)

    baseline_name = None
    baseline_file = request.files.get('baseline')
    if baseline_file:
        baseline_name = f"baseline_{secure_filename(device_code)}_{int(time.time())}.jpg"
        baseline_file.save(os.path.join(METRO_BASELINE_FOLDER, baseline_name))

    ok, msg = upsert_device(device_code, family, model, station, location,
                            baseline_image=baseline_name)
    if not ok:
        return jsonify({"error": msg}), 500
    return jsonify({"success": True, "message": msg, "family": family,
                    "baseline_uploaded": baseline_name is not None})


@app.route('/metro/detect', methods=['POST'])
@require_auth
def metro_detect():
    """核心检测接口。

    multipart: file=<现场内部照片>
    form: device_code, worker_id, captured_at, offline_flag(可选)
    返回红黄绿结论 + 标注图 + 三路命中明细，并落库为证据。
    """
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "未上传文件"}), 400

    device_code = (request.form.get('device_code') or '').strip()
    # 工号可由前端填报（可能与登录账号不同），缺省回落到登录身份，保证证据链必有可追溯主体
    worker_id = request.form.get('worker_id') or g.current_user
    captured_at = request.form.get('captured_at') or ''
    offline_flag = request.form.get('offline_flag') in ('1', 'true', 'True')

    image_bytes = file.read()

    # 取该设备型号对应的基准图（路B）；无设备/无基准则路B 跳过，融合层降级 REVIEW
    device = get_device(device_code) if device_code else None
    baseline_bytes = None
    baseline_version = 0
    device_model = None
    station = None
    if device:
        device_model = device.get('model')
        station = device.get('station')
        baseline_version = device.get('baseline_version', 0) or 0
        bname = device.get('baseline_image')
        if bname and baseline_version > 0:
            bpath = os.path.join(METRO_BASELINE_FOLDER, bname)
            if os.path.exists(bpath):
                with open(bpath, 'rb') as bf:
                    baseline_bytes = bf.read()

    # 跑三路检测 + 融合
    try:
        det = run_detection(image_bytes, baseline_bytes)
    except Exception:
        # 服务异常一律 fail-safe 降级，绝不放行；异常细节只进服务端日志
        app.logger.exception("metro/detect 检测服务异常")
        return jsonify({
            "result": RESULT_REVIEW,
            "message": "检测服务异常，已降级人工复核，请勿合盖",
            "detections": [],
        }), 200

    trace_id = uuid.uuid4().hex
    ts = int(time.time())

    # 落盘原图（证据）
    image_name = f"metro_{trace_id}_{ts}.jpg"
    with open(os.path.join(METRO_EVIDENCE_FOLDER, image_name), 'wb') as f:
        f.write(image_bytes)

    # 落盘标注图（如有命中）
    annotated_name = None
    if det.get("annotated_bytes"):
        annotated_name = f"metro_{trace_id}_{ts}_annotated.jpg"
        with open(os.path.join(METRO_EVIDENCE_FOLDER, annotated_name), 'wb') as f:
            f.write(det["annotated_bytes"])

    # 写入证据链
    rec = {
        "trace_id": trace_id,
        "worker_id": worker_id,
        "device_code": device_code,
        "device_model": device_model,
        "station": station,
        "image_file": image_name,
        "annotated_file": annotated_name,
        "result": det["result"],
        "quality_score": det["quality_score"],
        "detections": det["detections"],
        "baseline_version": baseline_version,
        "offline_flag": offline_flag,
        "captured_at": captured_at,
    }
    evidence_saved, evidence_err = insert_inspection(rec)
    if not evidence_saved:
        # 全链路可追溯是硬约束：证据没落库的"通过"不允许放行，降级人工复核
        app.logger.error("metro/detect 证据链写入失败 trace_id=%s: %s", trace_id, evidence_err)
        if det["result"] == RESULT_PASS:
            det["result"] = RESULT_REVIEW
            det["message"] = "检测通过但证据记录失败，已降级人工复核，请勿直接合盖"

    return jsonify({
        "trace_id": trace_id,
        "evidence_saved": evidence_saved,
        "result": det["result"],
        "message": det["message"],
        "quality_score": det["quality_score"],
        "detections": det["detections"],
        "baseline_version": baseline_version,
        "image_url": build_metro_file_url(image_name),
        "annotated_url": build_metro_file_url(annotated_name) if annotated_name else None,
    })


@app.route('/metro/inspection/<trace_id>/confirm', methods=['POST'])
@require_auth
def metro_confirm(trace_id):
    """人工复核回写，闭环 REVIEW/BLOCKED。"""
    data = request.get_json(silent=True) or {}
    # 复核人以登录身份为准，不信任客户端传值——证据链上的责任主体不可伪造
    confirmed_by = g.current_user
    action = data.get('confirm_action') or request.form.get('confirm_action') or ''
    if not action:
        return jsonify({"error": "confirm_action 必填(如: 确认安全/已取出工具)"}), 400
    ok, msg = confirm_inspection(trace_id, confirmed_by, action)
    if not ok:
        return jsonify({"error": msg}), 404
    return jsonify({"success": True, "message": msg})


@app.route('/metro/inspections', methods=['GET'])
@require_auth
def metro_list():
    """审计查询，支持 device_code / worker_id / result 过滤。"""
    rows = list_inspections(
        device_code=request.args.get('device_code'),
        worker_id=request.args.get('worker_id'),
        result=request.args.get('result'),
        limit=int(request.args.get('limit', 100)),
    )
    for r in rows:
        if r.get('image_file'):
            r['image_url'] = build_metro_file_url(r['image_file'])
        if r.get('annotated_file'):
            r['annotated_url'] = build_metro_file_url(r['annotated_file'])
    return jsonify({"items": rows, "count": len(rows)})


@app.route('/metro-file/<filename>')
def metro_file(filename):
    """读取检测证据图/标注图。"""
    if not verify_file_token('metro-file', filename, request.args.get('st', '')):
        return jsonify({"error": "链接无效或已过期"}), 403
    return send_from_directory(METRO_EVIDENCE_FOLDER, filename)


if __name__ == '__main__':
    # debug 缺省关闭：Werkzeug 调试器暴露在 0.0.0.0 等于给局域网开远程代码执行后门。
    # 本机排障时在 .env 里临时设 FLASK_DEBUG=1。
    app.run(host='0.0.0.0', port=5001, debug=FLASK_DEBUG, threaded=True)