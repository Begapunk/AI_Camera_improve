"""
人脸识别管理器
主路：百度云 AipFace（1:N 搜索 + 活体检测）
备用：本地 LBPH（face_local.py）

切换逻辑：
  注册/更新 → 百度 + 本地 双写（百度失败不影响本地存储）
  验证登录  → 先百度；遇到服务级错误（网络/鉴权/限流）自动切本地
"""

import re
from aip import AipFace
from settings import BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY
from face_local import local_face_manager

# 百度服务级错误码（表示 API 本身不可用，而非业务上找不到人脸）
_BAIDU_SERVICE_ERRORS = {1, 4, 6, 17, 18, 19, 100, 110, 111, 282000, 282001}


class FaceIDManager:
    def __init__(self):
        self.client = AipFace(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY)
        self.group_id = 'user_group_main'

    # ── 内部工具 ──────────────────────────────────────────────

    def _clean_base64(self, image_data):
        if ',' in image_data:
            return image_data.split(',')[1]
        return image_data

    def _safe_user_id(self, username):
        """百度 user_id 只允许 [a-zA-Z0-9_-]，中文用户名转为安全形式"""
        safe = re.sub(r'[^a-zA-Z0-9_\-]', '', username)
        if not safe:
            import hashlib
            safe = 'u_' + hashlib.md5(username.encode()).hexdigest()[:12]
        return safe

    def _baidu_add(self, user_id, image, safe_id):
        options = {'user_info': user_id}
        return self.client.addUser(image, 'BASE64', self.group_id, safe_id, options)

    def _baidu_update(self, user_id, image, safe_id):
        options = {'user_info': user_id}
        return self.client.updateUser(image, 'BASE64', self.group_id, safe_id, options)

    # ── 公开接口 ──────────────────────────────────────────────

    def register_user_face(self, user_id, image_base64):
        """
        注册人脸：先写百度云，再写本地（无论百度是否成功都写本地）。
        返回 (bool, message)，只要有一方成功就算成功。
        """
        image = self._clean_base64(image_base64)
        safe_id = self._safe_user_id(str(user_id))

        baidu_ok, baidu_msg = False, ''
        try:
            result = self._baidu_add(user_id, image, safe_id)
            if result.get('error_code') == 0:
                baidu_ok, baidu_msg = True, '人脸注册成功（百度云）'
            else:
                baidu_msg = result.get('error_msg', '百度注册失败')
        except Exception as e:
            baidu_msg = f'百度云连接失败: {e}'

        # 本地始终写入，不依赖百度结果
        local_ok, local_msg = local_face_manager.register_face(user_id, image_base64)

        if baidu_ok:
            return True, baidu_msg
        if local_ok:
            return True, f'人脸注册成功（本地备用，百度: {baidu_msg}）'
        return False, f'注册失败 | 百度: {baidu_msg} | 本地: {local_msg}'

    def verify_login_face(self, image_base64):
        """
        人脸登录验证：先百度；遇服务级错误自动切本地。
        返回 (True, username) 或 (False, error_msg)。
        """
        image = self._clean_base64(image_base64)
        options = {'liveness_control': 'LOW', 'max_user_num': 1}

        use_local = False
        try:
            result = self.client.search(image, 'BASE64', self.group_id, options)
            error_code = result.get('error_code', -1)

            if error_code == 0:
                user_list = result.get('result', {}).get('user_list', [])
                if user_list and user_list[0]['score'] > 80:
                    matched = user_list[0]
                    # user_info 存的是原始 username，优先用
                    username = matched.get('user_info') or matched['user_id']
                    return True, username
                return False, '人脸不匹配，请重试'

            if error_code in _BAIDU_SERVICE_ERRORS:
                use_local = True
            else:
                return False, result.get('error_msg', f'百度错误 {error_code}')

        except Exception:
            use_local = True

        if use_local:
            return local_face_manager.verify_face(image_base64)

        return False, '识别失败'

    def update_user_face(self, user_id, image_base64):
        """
        更新人脸：百度用 updateUser 替换旧数据；本地同步覆盖。
        """
        image = self._clean_base64(image_base64)
        safe_id = self._safe_user_id(str(user_id))

        baidu_ok, baidu_msg = False, ''
        try:
            result = self._baidu_update(user_id, image, safe_id)
            if result.get('error_code') == 0:
                baidu_ok, baidu_msg = True, '人脸更新成功（百度云）'
            elif result.get('error_code') in (220, 222, 223):
                # 用户在百度库不存在，改为注册
                result2 = self._baidu_add(user_id, image, safe_id)
                if result2.get('error_code') == 0:
                    baidu_ok, baidu_msg = True, '人脸注册成功（百度云）'
                else:
                    baidu_msg = result2.get('error_msg', '百度注册失败')
            else:
                baidu_msg = result.get('error_msg', '百度更新失败')
        except Exception as e:
            baidu_msg = f'百度云连接失败: {e}'

        local_ok, local_msg = local_face_manager.register_face(user_id, image_base64)

        if baidu_ok:
            return True, baidu_msg
        if local_ok:
            return True, f'人脸更新成功（本地备用，百度: {baidu_msg}）'
        return False, f'更新失败 | 百度: {baidu_msg} | 本地: {local_msg}'


face_manager = FaceIDManager()
