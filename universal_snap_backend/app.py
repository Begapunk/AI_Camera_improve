import os
import base64
import time
import uuid
import random
import json
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont #引入pillow生成验证码
import cv2    # 引入 OpenCV 和 NumPy 用于图像处理
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from openai import OpenAI
from aip import AipSpeech
from volcengine.visual.VisualService import VisualService

# 引入数据库操作与配置
from db.db import (
    insert_photo_analysis, get_all_photo_analyses,
    delete_photo_analysis, register_user, verify_user
)
from settings import (
    BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY,
    ALIYUN_API_KEY, ALIYUN_BASE_URL,
    VOLC_IA_AK, VOLC_IA_SK,
    GROK_API_KEY
)
from security.password_validator import PasswordValidator

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# 基础路径配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
AUDIO_FOLDER = os.path.join(BASE_DIR, 'static', 'audio')

# make sure目录still存在
for folder in [UPLOAD_FOLDER, AUDIO_FOLDER]:
    os.makedirs(folder, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# 初始化各平台 SDK 客户端
baidu_client = AipSpeech(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY)#百度云
client = OpenAI(api_key=ALIYUN_API_KEY, base_url=ALIYUN_BASE_URL)  # 阿里云 Qwen-VL
xai_client = OpenAI(api_key=GROK_API_KEY, base_url="https://api.x.ai/v1")#grok

visual_service = VisualService()
visual_service.set_ak(VOLC_IA_AK)
visual_service.set_sk(VOLC_IA_SK)
password_validator = PasswordValidator()
CAPTCHA_STORE = {}#验证码存储


def cleanup_captchas():
    """clean过期的验证码（有效期 5 分钟）"""
    current_time = time.time()
    expired_keys = [k for k, v in CAPTCHA_STORE.items() if current_time > v['expires']]
    for k in expired_keys:
        del CAPTCHA_STORE[k]


def build_file_url(subpath, filename):
    base_url = request.host_url.rstrip('/')
    return f"{base_url}/{subpath}/{filename}"   # 构建文件地址


# 生成透明线稿（后期作为备用功能或免费开放功能）
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


# 校验验证码
def verify_captcha(captcha_id, captcha_answer):
    cleanup_captchas()  # 每次校验时清理过期数据
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


# 获取验证码接口
@app.route('/api/captcha', methods=['GET'])
def get_captcha():
    #  出一个小学生都会做的加减法
    num1 = random.randint(1, 10)#111
    num2 = random.randint(1, 10)
    operator = random.choice(['+', '*'])

    if operator == '+':
        answer = str(num1 + num2)
        text = f"{num1} + {num2} = ?"
    else:
        answer = str(num1 * num2)
        text = f"{num1} x {num2} = ?"

    # 生成图片
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
        "expires": time.time() + 300
    }

    return jsonify({
        "captcha_id": captcha_id,
        "captcha_image": img_data_url
    })


# 登录模块
@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username, password = data.get('username'), data.get('password')
    captcha_id = data.get('captcha_id')
    captcha_answer = data.get('captcha_answer')

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

    is_valid_captcha, captcha_msg = verify_captcha(captcha_id, captcha_answer)
    if not is_valid_captcha:
        return jsonify({"error": captcha_msg}), 400

    is_valid_pwd, errors = password_validator.validate(password, username)
    if not is_valid_pwd:
        return jsonify({"error": "密码不合规", "details": errors}), 400

    success, message = verify_user(username, password)
    return jsonify({"message": message}) if success else (jsonify({"error": message}), 401)


# 智能拍摄助手分析模块
@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        file = request.files.get('file')
        if not file: return jsonify({"error": "未上传文件"}), 400

        filename = f"snap_{int(time.time())}_{secure_filename(file.filename)}"  #防止文件名冲突
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        with open(filepath, "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode()
        img_data_url = f"data:image/jpeg;base64,{img_base64}"

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
                audio_url = build_file_url('static/audio', audio_filename) #audio generation

        return jsonify({"advice": advice, "audioUrl": audio_url, "imageUrl": build_file_url('uploads', filename)})
    except Exception as e:
        print(f"Analyze API Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/analyze-grok', methods=['POST'])
def analyze_grok():
    try:
        file = request.files.get('file')
        if not file: return jsonify({"error": "未上传文件"}), 400

        filename = f"grok_{int(time.time())}_{secure_filename(file.filename)}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        with open(filepath, "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode()
        img_data_url = f"data:image/jpeg;base64,{img_base64}"

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


# 细分人、物、景三种模式，针对不同的场景给出不同的建议（后续应改进相应方案）

# 在 Prompt 中让 AI 提取物理尺寸与画面占比，联动前端视觉测距算法！
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
    # 💡格式化 JSON 指令，告诉模型必须返回前端所需的计算参数
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

    completion = client.chat.completions.create(
        model="qwen-vl-plus",
        messages=[
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": img_data_url}},
                {"type": "text", "text": system_instruction}
            ]},
        ]
    )
    raw_content = completion.choices[0].message.content.strip()

    if raw_content.startswith("```json"):
        raw_content = raw_content[7:]
    elif raw_content.startswith("```"):
        raw_content = raw_content[3:]
    if raw_content.endswith("```"):
        raw_content = raw_content[:-3]

    return json.loads(raw_content.strip())


@app.route('/smart-analyze', methods=['POST'])
def smart_analyze():
    # ⚠️ 将文件读取和路径生成放入 try 块中，防止崩溃抛出 HTML
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({"error": "No image file provided"}), 400

        # 如果 filename 有一些日龙包字符，这里可能会报错，置放于try模块避免出错
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

        # 调用大模型
        ai_result = call_smart_vision_model(img_base64, formatted_prompt)

        # 将 AI 提取的占比和物理尺寸传回给前端，完成视觉测距。
        return jsonify({
            "code": 200,
            "data": {
                "mode": mode,
                "is_perfect": ai_result.get("is_perfect", False),
                "advice": ai_result.get("advice", "继续保持"),
                "subject_ratio": float(ai_result.get("subject_ratio", 0.0)),
                "subject_name": ai_result.get("subject_name", ""),
                "subject_real_width": float(ai_result.get("subject_real_width", 0.0))
            }
        })

    except Exception as e:
        error_msg = f"后端运行异常: {str(e)}"
        print(f"Smart AI Error: {error_msg}")
        return jsonify({
            "code": 500,
            "error": error_msg,
            "data": {
                "is_perfect": False,
                "advice": "系统开小差了，请稍后再试",
                "subject_ratio": 0.0,
                "subject_name": "",
                "subject_real_width": 0.0
            }
        }), 500


# 模板库管理一以及模版分析模块
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


@app.route('/analyze-env', methods=['POST'])
def analyze_env():
    file = request.files.get('file')
    if not file: return jsonify({"error": "未上传文件"}), 400

    try:
        filename = f"env_{int(time.time())}.jpg"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        with open(filepath, "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode()

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


@app.route('/analyze-template', methods=['POST'])
def analyze_template():
    file = request.files.get('file')
    save_as_template = request.form.get('save_as_template') == 'true'
    if not file: return jsonify({"error": "未上传文件"}), 400

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        with open(filepath, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode()

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


# 前端调试模块
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/static/audio/<filename>')
def serve_audio(filename):
    return send_from_directory(AUDIO_FOLDER, filename)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)