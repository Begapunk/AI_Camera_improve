"""
本地人脸识别备用引擎
算法：OpenCV LBPH（局部二值模式直方图）
依赖：opencv-contrib-python（含 cv2.face 子模块）
存储：local_face_db/
        faces/          ← 每个用户的人脸灰度图
        lbph.yml        ← 训练好的 LBPH 模型
        labels.json     ← username ↔ int_label 映射
"""

import os
import json
import base64
import threading

import cv2
import numpy as np


class LocalFaceManager:
    _DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'local_face_db')

    def __init__(self):
        faces_dir = os.path.join(self._DB_DIR, 'faces')
        os.makedirs(faces_dir, exist_ok=True)

        self._model_path = os.path.join(self._DB_DIR, 'lbph.yml')
        self._labels_path = os.path.join(self._DB_DIR, 'labels.json')
        self._lock = threading.Lock()

        # 尝试加载 cv2.face（需要 opencv-contrib-python）
        try:
            self._recognizer = cv2.face.LBPHFaceRecognizer_create(
                radius=1, neighbors=8, grid_x=8, grid_y=8
            )
            self._cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )
            self._available = True
        except AttributeError:
            self._available = False
            print('[LocalFace] opencv-contrib-python 未安装，本地备用引擎已禁用')
            return

        self._u2l = {}   # username -> int label
        self._l2u = {}   # int label -> username
        self._trained = False
        self._load_state()

    # ── 内部工具 ──────────────────────────────────────────────

    def _load_state(self):
        if os.path.exists(self._labels_path):
            with open(self._labels_path, encoding='utf-8') as f:
                data = json.load(f)
            self._u2l = data.get('u2l', {})
            self._l2u = {int(k): v for k, v in data.get('l2u', {}).items()}
        if os.path.exists(self._model_path) and self._u2l:
            try:
                self._recognizer.read(self._model_path)
                self._trained = True
            except Exception as e:
                print(f'[LocalFace] 模型加载失败: {e}')

    def _save_state(self):
        with open(self._labels_path, 'w', encoding='utf-8') as f:
            json.dump(
                {'u2l': self._u2l, 'l2u': {str(k): v for k, v in self._l2u.items()}},
                f, ensure_ascii=False
            )

    def _decode_face(self, image_base64):
        """base64 → 200×200 灰度人脸 ROI，失败返回 None"""
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]
        try:
            img_bytes = base64.b64decode(image_base64)
        except Exception:
            return None, '图像 base64 解码失败'

        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None, '图像解码失败'

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # 均衡化改善光线不均
        gray = cv2.equalizeHist(gray)

        faces = self._cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )
        if len(faces) == 0:
            return None, '未检测到人脸，请正对摄像头并保持光线充足'

        # 取面积最大的人脸
        x, y, w, h = sorted(faces, key=lambda r: r[2] * r[3], reverse=True)[0]
        roi = cv2.resize(gray[y:y + h, x:x + w], (200, 200))
        return roi, None

    def _retrain(self):
        """从磁盘全量重新训练 LBPH 模型（幂等，训练后存盘）"""
        faces_dir = os.path.join(self._DB_DIR, 'faces')
        faces, labels = [], []

        for fname in sorted(os.listdir(faces_dir)):
            if not fname.endswith('.jpg'):
                continue
            img = cv2.imread(os.path.join(faces_dir, fname), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            username = fname.rsplit('_', 1)[0]
            label = self._u2l.get(username)
            if label is not None:
                faces.append(img)
                labels.append(label)

        if not faces:
            return

        self._recognizer.train(faces, np.array(labels, dtype=np.int32))
        self._recognizer.save(self._model_path)
        self._trained = True

    # ── 公开接口 ──────────────────────────────────────────────

    @property
    def available(self):
        return self._available

    def register_face(self, username, image_base64):
        """注册/更新用户人脸（覆盖旧图，重新训练模型）"""
        if not self._available:
            return False, '本地引擎不可用（缺少 opencv-contrib-python）'

        face, err = self._decode_face(image_base64)
        if face is None:
            return False, err

        with self._lock:
            # 分配 label
            if username not in self._u2l:
                label = len(self._u2l)
                self._u2l[username] = label
                self._l2u[label] = username

            # 删除旧人脸图，保存新图（1 人 1 张，保持简洁）
            faces_dir = os.path.join(self._DB_DIR, 'faces')
            for fname in os.listdir(faces_dir):
                if fname.startswith(f'{username}_'):
                    os.remove(os.path.join(faces_dir, fname))

            cv2.imwrite(os.path.join(faces_dir, f'{username}_0.jpg'), face)
            self._save_state()
            self._retrain()

        return True, '本地人脸注册成功'

    def verify_face(self, image_base64):
        """1:N 本地人脸搜索，返回 (True, username) 或 (False, error_msg)"""
        if not self._available:
            return False, '本地引擎不可用'
        if not self._trained or not self._l2u:
            return False, '本地人脸库为空，请先绑定人脸'

        face, err = self._decode_face(image_base64)
        if face is None:
            return False, err

        with self._lock:
            try:
                label, confidence = self._recognizer.predict(face)
            except Exception as e:
                return False, f'本地识别异常: {e}'

        # LBPH：0=完美，<80 为可接受阈值
        if confidence < 80:
            username = self._l2u.get(label)
            if username:
                return True, username

        return False, f'本地识别失败（置信度 {confidence:.1f}，需 <80）'

    def delete_face(self, username):
        """删除用户的本地人脸数据并重新训练"""
        if not self._available:
            return False, '本地引擎不可用'

        with self._lock:
            faces_dir = os.path.join(self._DB_DIR, 'faces')
            for fname in os.listdir(faces_dir):
                if fname.startswith(f'{username}_'):
                    os.remove(os.path.join(faces_dir, fname))

            label = self._u2l.pop(username, None)
            if label is not None:
                self._l2u.pop(label, None)

            self._save_state()

            if self._u2l:
                self._retrain()
            else:
                self._trained = False
                if os.path.exists(self._model_path):
                    os.remove(self._model_path)

        return True, '本地人脸已删除'


local_face_manager = LocalFaceManager()
