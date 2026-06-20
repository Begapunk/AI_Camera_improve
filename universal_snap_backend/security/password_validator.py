class PasswordValidator:
    def validate(self, password, username=None):
        # 简单示例：密码长度至少6位
        errors = []
        if len(password) < 6:
            errors.append("密码长度不能少于6位")
        # 可添加其他规则，比如包含数字、字母等
        return len(errors) == 0, errors