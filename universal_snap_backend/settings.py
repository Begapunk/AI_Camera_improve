import os
from dotenv import load_dotenv

load_dotenv()

# 百度语音合成 / 人脸识别
BAIDU_APP_ID = os.getenv("BAIDU_APP_ID", "")
BAIDU_API_KEY = os.getenv("BAIDU_API_KEY", "")
BAIDU_SECRET_KEY = os.getenv("BAIDU_SECRET_KEY", "")

# 阿里云百炼模型配置
ALIYUN_API_KEY = os.getenv("ALIYUN_API_KEY", "")
ALIYUN_BASE_URL = os.getenv("ALIYUN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")

# 火山引擎视觉智能
VOLC_IA_AK = os.getenv("VOLC_IA_AK", "")
VOLC_IA_SK = os.getenv("VOLC_IA_SK", "")

# Grok 模型配置
GROK_API_KEY = os.getenv("GROK_API_KEY", "")
GROK_BASE_URL = os.getenv("GROK_BASE_URL", "https://api.x.ai/v1")

# PaliGemma 本地模型路径 (HuggingFace model ID 或本地绝对路径)
# 例: "google/paligemma-3b-mix-448"  或  "D:/models/paligemma-3b-mix-448"
PALIGEMMA_MODEL_PATH = os.getenv("PALIGEMMA_MODEL_PATH", "google/paligemma-3b-mix-448")

# 数据库
DB_CONFIG = {
    'host': os.getenv("DB_HOST", "localhost"),
    'user': os.getenv("DB_USER", "root"),
    'password': os.getenv("DB_PASSWORD", ""),
    'database': os.getenv("DB_NAME", "snap_db"),
    'port': int(os.getenv("DB_PORT", "3306"))
}
