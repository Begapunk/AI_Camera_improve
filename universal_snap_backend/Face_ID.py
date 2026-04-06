import base64
from aip import AipFace
from settings import BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY

class FaceIDManager:
    def __init__(self):
        """
        初始化百度人脸识别客户端
        复用 settings.py 中已有的百度 AI 密钥
        """
        self.client = AipFace(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY)
        self.group_id = "user_group_main"  # 默认人脸库分组名

    def _clean_base64(self, image_data):
        """处理前端传来的 DataURL，提取纯净的 Base64 字符串"""
        if "," in image_data:
            return image_data.split(",")[1]
        return image_data

    def register_user_face(self, user_id, image_base64):
        """
        将用户人脸注册到云端人脸库
        :param user_id: 用户的唯一标识（通常用用户名或数据库ID）
        :param image_base64: 图像 base64 字符串
        :return: (bool, message)
        """
        image = self._clean_base64(image_base64)
        image_type = "BASE64"

        # 注册人脸，options 可以添加更多用户信息
        options = {"user_info": str(user_id)}

        try:
            result = self.client.addUser(image, image_type, self.group_id, user_id, options)
            if result.get('error_code') == 0:
                return True, "人脸注册成功"
            else:
                return False, result.get('error_msg', '注册失败')
        except Exception as e:
            return False, str(e)

    def verify_login_face(self, image_base64):
        """
        1:N 人脸搜索，用于登录验证
        :param image_base64: 实时拍摄的人脸图像
        :return: (bool, user_id/error_message)
        """
        image = self._clean_base64(image_base64)
        image_type = "BASE64"

        # 活体检测控制 (LOW: 较低的防御力，防止照片攻击)
        # 这里的 score > 80 是识别阈值，通常 80 分以上可认为是同一人
        options = {
            "liveness_control": "LOW",
            "max_user_num": 1
        }

        try:
            result = self.client.search(image, image_type, self.group_id, options)
            if result.get('error_code') == 0:
                user_list = result['result'].get('user_list', [])
                if user_list and user_list[0]['score'] > 80:
                    return True, user_list[0]['user_id']
                return False, "人脸不匹配，请重试"
            else:
                return False, result.get('error_msg', '搜索失败')
        except Exception as e:
            return False, str(e)


# 实例化对象，方便在 app.py 中直接导入使用
face_manager = FaceIDManager()