"""
密码验证模块
"""
import re
from typing import List, Tuple


class PasswordValidator:
    """密码验证器"""

    # 常见弱密码列表
    COMMON_WEAK_PASSWORDS = {
        '123456', 'password', '12345678', 'qwerty', 'abc123',
        '123456789', '111111', '1234567', '123123', '000000'
    }

    def __init__(self, min_length: int = 8, require_special: bool = True):
        self.min_length = min_length
        self.require_special = require_special

    def validate(self, password: str, username: str = None) -> Tuple[bool, List[str]]:
        """验证密码强度"""
        errors: List[str] = []

        if not password:
            return False, ["密码不能为空"]

        # 1. 长度检查
        if len(password) < self.min_length:
            errors.append(f"密码长度至少 {self.min_length} 位")

        # 2. 复杂度检查
        checks = {
            '大写字母': bool(re.search(r'[A-Z]', password)),
            '小写字母': bool(re.search(r'[a-z]', password)),
            '数字': bool(re.search(r'\d', password)),
        }

        if self.require_special:
            checks['特殊字符'] = bool(
                re.search(r'[!@#$%^&*(),.?":{}|<>]', password)
            )

        satisfied = sum(checks.values())
        if satisfied < 3:
            missing = [k for k, v in checks.items() if not v]
            errors.append(f"需要至少 3 种字符类型，缺少：{'、'.join(missing)}")

        # 3. 弱密码检查
        if password.lower() in self.COMMON_WEAK_PASSWORDS:
            errors.append("密码过于简单，请避免使用常见密码")

        # 4. 用户名相关性检查
        if username and username.lower() in password.lower():
            errors.append("密码不应包含用户名")

        return len(errors) == 0, errors

    def get_strength_score(self, password: str) -> int:
        """计算密码强度分数（0-100）"""
        if not password:
            return 0

        score = 0
        length = len(password)

        # 长度评分（与 min_length 对齐）
        if length >= self.min_length:
            score += 20
        if length >= self.min_length + 4:
            score += 10
        if length >= self.min_length + 8:
            score += 10

        # 复杂度评分
        checks = [
            bool(re.search(r'[A-Z]', password)),
            bool(re.search(r'[a-z]', password)),
            bool(re.search(r'\d', password)),
            bool(re.search(r'[!@#$%^&*(),.?":{}|<>]', password)),
        ]

        score += sum(checks) * 15

        # 弱密码扣分
        if password.lower() in self.COMMON_WEAK_PASSWORDS:
            score -= 50

        return max(0, min(100, score))

