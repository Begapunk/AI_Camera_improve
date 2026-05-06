import os
import base64
import time
import uuid
import random
from io import BytesIO

# --- [新增] 引入 Pillow 用于生成图片验证码 ---
from PIL import Image, ImageDraw, ImageFont

# --- [新增] 引入 OpenCV 和 NumPy 用于图像处理 ---
import cv2
import numpy as np
# -------------------------------------------
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from openai import OpenAI
from aip import AipSpeech
from volcengine.visual.VisualService import VisualService

# 引入数据库操作与配置
from db.db import (
    insert_photo_analysis, get_all_photo_analyses,
    delete_photo_analysis, register_user, verify_user,
    get_user_info, update_user_info, update_user_password
)
from settings import (
    BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY,
    ALIYUN_API_KEY, ALIYUN_BASE_URL,
    VOLC_IA_AK, VOLC_IA_SK,
    GROK_API_KEY
)
from security.password_validator import PasswordValidator

app = Flask(__name__)
# 开启全局跨域支持，确保小程序上传不被拦截
CORS(app, resources={r"/*": {"origins": "*"}})

# 基础路径配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
AUDIO_FOLDER = os.path.join(BASE_DIR, 'static', 'audio')

# 确保目录存在
for folder in [UPLOAD_FOLDER, AUDIO_FOLDER]:
    os.makedirs(folder, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# 初始化各平台 SDK 客户端
baidu_client = AipSpeech(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY)
client = OpenAI(api_key=ALIYUN_API_KEY, base_url=ALIYUN_BASE_URL)
xai_client = OpenAI(api_key=GROK_API_KEY, base_url="https://api.x.ai/v1")

visual_service = VisualService()
visual_service.set_ak(VOLC_IA_AK)
visual_service.set_sk(VOLC_IA_SK)
password_validator = PasswordValidator()

# --- [新增] 内存验证码存储 (格式: {captcha_id: {"answer": "12", "expires": timestamp}}) ---
CAPTCHA_STORE = {}


def cleanup_captchas():
    """清理过期的验证码（有效期 5 分钟）"""
    current_time = time.time()
    expired_keys = [k for k, v in CAPTCHA_STORE.items() if current_time > v['expires']]
    for k in expired_keys:
        del CAPTCHA_STORE[k]


# -------------------------------------------------------------------------


# --- 辅助函数：构建动态 URL ---
def build_file_url(subpath, filename):
    base_url = request.host_url.rstrip('/')
    return f"{base_url}/{subpath}/{filename}"


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


# --- [新增] 辅助函数：校验验证码 ---
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


# --- [新增] 0. 获取验证码接口 ---
@app.route('/api/captcha', methods=['GET'])
def get_captcha():
    # 1. 生成简单的数学题
    num1 = random.randint(1, 10)
    num2 = random.randint(1, 10)
    operator = random.choice(['+', '*'])

    if operator == '+':
        answer = str(num1 + num2)
        text = f"{num1} + {num2} = ?"
    else:
        answer = str(num1 * num2)
        text = f"{num1} x {num2} = ?"

    # 2. 生成图片 (使用柔和的黄色系，避开红色)
    width, height = 120, 40
    # 背景色：浅黄色
    image = Image.new('RGB', (width, height), color=(255, 250, 205))
    draw = ImageDraw.Draw(image)

    # 绘制干扰线 (暖黄色)
    for _ in range(5):
        x1, y1 = random.randint(0, width), random.randint(0, height)
        x2, y2 = random.randint(0, width), random.randint(0, height)
        draw.line([(x1, y1), (x2, y2)], fill=(255, 215, 0), width=2)

    # 绘制噪点
    for _ in range(30):
        x, y = random.randint(0, width), random.randint(0, height)
        draw.point((x, y), fill=(218, 165, 32))

    # 尽量加载默认字体，按需调整位置
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    # 文字颜色：深黄色/棕色
    draw.text((15, 10), text, font=font, fill=(139, 101, 8))

    # 3. 转为 Base64
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode()
    img_data_url = f"data:image/png;base64,{img_base64}"

    # 4. 存储答案
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
    captcha_id = data.get('captcha_id')
    captcha_answer = data.get('captcha_answer')

    # [新增] 校验验证码
    is_valid_captcha, captcha_msg = verify_captcha(captcha_id, captcha_answer)
    if not is_valid_captcha:
        return jsonify({"error": captcha_msg}), 400

    if not username or not password:
        return jsonify({"error": "用户名和密码不能为空"}), 400

    success, message = register_user(username, password)
    return jsonify({"message": message}) if success else (jsonify({"error": message}), 400)


@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username, password = data.get('username'), data.get('password')
    captcha_id = data.get('captcha_id')
    captcha_answer = data.get('captcha_answer')

    # [新增] 校验验证码
    is_valid_captcha, captcha_msg = verify_captcha(captcha_id, captcha_answer)
    if not is_valid_captcha:
        return jsonify({"error": captcha_msg}), 400

    # 密码安全校验
    is_valid_pwd, errors = password_validator.validate(password, username)
    if not is_valid_pwd:
        return jsonify({"error": "密码不合规", "details": errors}), 400

    success, message = verify_user(username, password)
    return jsonify({"message": message}) if success else (jsonify({"error": message}), 401)


# --- 2. 核心分析模块 (小程序实时轮询请求 - 阿里云 Qwen) ---
@app.route('/analyze', methods=['POST'])
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
        completion = client.chat.completions.create(
            model="qwen-vl-plus",
            messages=[
                {"role": "system", "content": [{"type": "text", "text": "你是一个摄影指导助手。"}]},
                {"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": img_data_url}},
                    {"type": "text", "text": "请分析这张自拍，给出50字以内的改进建议（关注构图、姿势、角度）。"}
                ]},
            ],
            presence_penalty=1.5,
        )
        advice = completion.choices[0].message.content.strip()

        audio_url = None
        if request.form.get('need_audio') == 'true':
            res = baidu_client.synthesis(advice, 'zh', 1, {'vol': 7, 'per': 0, 'spd': 4})
            if not isinstance(res, dict):
                audio_filename = f"advice_{int(time.time())}.mp3"
                with open(os.path.join(AUDIO_FOLDER, audio_filename), 'wb') as f: f.write(res)
                audio_url = build_file_url('static/audio', audio_filename)

        return jsonify({"advice": advice, "audioUrl": audio_url, "imageUrl": build_file_url('uploads', filename)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Grok 分析模块 ---
@app.route('/analyze-grok', methods=['POST'])
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
        completion = xai_client.chat.completions.create(
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

        return jsonify({
            "advice": advice,
            "imageUrl": build_file_url('uploads', filename),
            "model": "Grok"
        })
    except Exception as e:
        print(f"Grok API Error: {e}")
        return jsonify({"error": f"Grok 服务异常: {str(e)}"}), 500


# --- 生成自定义线稿接口 ---
@app.route('/generate-sketch', methods=['POST'])
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

    except Exception as e:
        print(f"Sketch generation error: {e}")
        return jsonify({"error": f"线稿生成失败: {str(e)}"}), 500


# --- 3. 环境分析模块 ---
@app.route('/analyze-env', methods=['POST'])
def analyze_env():
    file = request.files.get('file')
    if not file: return jsonify({"error": "未上传文件"}), 400

    filename = f"env_{int(time.time())}.jpg"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    with open(filepath, "rb") as f:
        img_base64 = base64.b64encode(f.read()).decode()

    try:
        completion = client.chat.completions.create(
            model="qwen-vl-plus",
            messages=[
                {"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}},
                    {"type": "text", "text": "分析环境照片，给出自拍构图、角度、光线建议，50字以内。"}
                ]},
            ]
        )
        advice = completion.choices[0].message.content.strip()
        return jsonify({"advice": advice, "imageUrl": build_file_url('uploads', filename)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 4. 图像评分与模板存取模块 ---
@app.route('/analyze-template', methods=['POST'])
def analyze_template():
    file = request.files.get('file')
    save_as_template = request.form.get('save_as_template') == 'true'
    if not file: return jsonify({"error": "未上传文件"}), 400

    filename = secure_filename(file.filename)
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
            insert_photo_analysis(filename, advice, score)

        return jsonify({
            "score": score, "advice": advice, "saved": save_as_template,
            "imageUrl": build_file_url('uploads', filename)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/templates', methods=['GET'])
def get_templates():
    try:
        templates = get_all_photo_analyses()
        for t in templates:
            t['imageUrl'] = build_file_url('uploads', t['filename'])
        return jsonify({"templates": templates})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/delete', methods=['DELETE'])
def delete_template():
    template_id = request.args.get('template_id', type=int)
    if not template_id: return jsonify({"error": "缺少ID"}), 400
    try:
        success, filename = delete_photo_analysis(template_id)
        if success:
            path = os.path.join(UPLOAD_FOLDER, filename)
            if os.path.exists(path): os.remove(path)
            return jsonify({"message": "删除成功"})
        return jsonify({"error": "删除失败"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 5. 静态资源路由 ---
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/static/audio/<filename>')
def serve_audio(filename):
    return send_from_directory(AUDIO_FOLDER, filename)


# --- 6. 我的模块 ---
@app.route('/api/user/info', methods=['GET'])
def get_user_profile():
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "缺少用户名参数"}), 400

    user_info = get_user_info(username)
    if user_info:
        if user_info.get('avatar'):
            user_info['avatar'] = build_file_url('uploads', user_info['avatar'])
        return jsonify({"user": user_info})
    return jsonify({"error": "用户不存在"}), 404


@app.route('/api/user/update', methods=['POST'])
def update_user_profile():
    data = request.form
    username = data.get('username')
    nickname = data.get('nickname')

    if not username:
        return jsonify({"error": "缺少用户名参数"}), 400

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
def change_password():
    data = request.json
    username = data.get('username')
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not username or not old_password or not new_password:
        return jsonify({"error": "缺少必要参数"}), 400

    is_valid_pwd, errors = password_validator.validate(new_password, username)
    if not is_valid_pwd:
        return jsonify({"error": "新密码不合规", "details": errors}), 400

    success, message = update_user_password(username, old_password, new_password)
    if success:
        return jsonify({"message": message})
    return jsonify({"error": message}), 400


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)