"""登录态令牌签发与校验：基于 itsdangerous 的无状态签名 token（非 JWT，但等价效果）。"""
from functools import wraps

from flask import request, jsonify, g
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

TOKEN_SALT = "cz-camera-auth"
TOKEN_MAX_AGE = 30 * 24 * 3600  # 30 天有效期

_serializer = None


def init_auth(secret_key):
    global _serializer
    if not secret_key:
        raise RuntimeError("SECRET_KEY 未配置，无法初始化登录态签发")
    _serializer = URLSafeTimedSerializer(secret_key, salt=TOKEN_SALT)


def generate_token(username):
    return _serializer.dumps({"username": username})


def verify_token(token):
    try:
        data = _serializer.loads(token, max_age=TOKEN_MAX_AGE)
        return data.get("username")
    except (BadSignature, SignatureExpired):
        return None


def require_auth(f):
    """要求请求头携带 Authorization: Bearer <token>，校验通过后把用户名放到 g.current_user"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "未登录或登录已过期"}), 401

        username = verify_token(auth_header[7:])
        if not username:
            return jsonify({"error": "登录已过期，请重新登录"}), 401

        g.current_user = username
        return f(*args, **kwargs)
    return wrapper
