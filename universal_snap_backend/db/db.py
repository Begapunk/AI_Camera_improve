import pymysql
import sys
import os

# --- 核心修复代码：将项目根目录加入搜索路径 ---
# 获取当前文件的绝对路径，再取两层父目录（即回到 universal_snap_backend）
root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_path not in sys.path:
    sys.path.insert(0, root_path)
# ------------------------------------------

# 如果你已经改名为 settings.py，这里就写 settings
try:
    from settings import DB_CONFIG
except ImportError:
    # 如果没改名，依然叫 config
    from config import DB_CONFIG

from werkzeug.security import generate_password_hash, check_password_hash

# ... 剩下的代码保持不变 ...

def insert_photo_analysis(filename, advice, score):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        sql = "INSERT INTO photo_analysis (filename, advice, score) VALUES (%s, %s, %s)"
        cursor.execute(sql, (filename, advice, score))
        conn.commit()
        return True
    except Exception as e:
        print("数据库插入失败:", e)
        return False
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def get_all_photo_analyses():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor(pymysql.cursors.DictCursor)  # 这样返回字典而非元组
        sql = "SELECT id, filename, advice, create_time, score FROM photo_analysis ORDER BY create_time DESC"
        cursor.execute(sql)
        results = cursor.fetchall()
        return results
    except Exception as e:
        print("数据库查询失败:", e)
        return []
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass

def delete_photo_analysis(template_id):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        # 先获取要删除的文件名
        cursor.execute("SELECT filename FROM photo_analysis WHERE id = %s", (template_id,))
        result = cursor.fetchone()
        if not result:
            return False, None  # 没找到记录
        filename = result[0]
        # 删除数据库记录
        cursor.execute("DELETE FROM photo_analysis WHERE id = %s", (template_id,))
        conn.commit()
        return True, filename
    except Exception as e:
        print("数据库删除失败:", e)
        return False, None
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass

#注册和登陆
def register_user(username, password):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        # 先查重
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cursor.fetchone():
            return False, "用户名已存在"
        pwd_hash = generate_password_hash(password)
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s)", (username, pwd_hash))
        conn.commit()
        return True, "注册成功"
    except Exception as e:
        print("注册失败:", e)
        return False, str(e)
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass

def verify_user(username, password):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE username = %s", (username,))
        result = cursor.fetchone()
        if not result:
            return False, "用户不存在"
        pwd_hash = result[0]
        if check_password_hash(pwd_hash, password):
            return True, "登录成功"
        else:
            return False, "密码错误"
    except Exception as e:
        print("登录验证失败:", e)
        return False, str(e)
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def get_user_info(username):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute(
            "SELECT id, username, nickname, avatar, face_registered, create_time FROM users WHERE username = %s",
            (username,)
        )
        result = cursor.fetchone()
        return result
    except Exception as e:
        print("获取用户信息失败:", e)
        return None
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def update_user_info(username, nickname=None, avatar=None):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        if nickname is not None:
            updates.append("nickname = %s")
            params.append(nickname)
        if avatar is not None:
            updates.append("avatar = %s")
            params.append(avatar)
        
        if not updates:
            return False, "没有需要更新的字段"
        
        params.append(username)
        sql = f"UPDATE users SET {', '.join(updates)} WHERE username = %s"
        cursor.execute(sql, tuple(params))
        conn.commit()
        
        return True, "更新成功"
    except Exception as e:
        print("更新用户信息失败:", e)
        return False, str(e)
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def update_user_password(username, old_password, new_password):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        cursor.execute("SELECT password_hash FROM users WHERE username = %s", (username,))
        result = cursor.fetchone()
        if not result:
            return False, "用户不存在"
        
        pwd_hash = result[0]
        if not check_password_hash(pwd_hash, old_password):
            return False, "旧密码错误"
        
        new_pwd_hash = generate_password_hash(new_password)
        cursor.execute("UPDATE users SET password_hash = %s WHERE username = %s", (new_pwd_hash, username))
        conn.commit()
        
        return True, "密码修改成功"
    except Exception as e:
        print("修改密码失败:", e)
        return False, str(e)
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def get_user_by_id(user_id):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute("SELECT id, username, nickname, avatar, create_time FROM users WHERE id = %s", (user_id,))
        result = cursor.fetchone()
        return result
    except Exception as e:
        print("根据ID获取用户信息失败:", e)
        return None
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def get_face_registered(username):
    """查询用户是否已绑定人脸"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT face_registered FROM users WHERE username = %s", (username,))
        result = cursor.fetchone()
        return bool(result and result[0])
    except Exception as e:
        print("查询人脸注册状态失败:", e)
        return False
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def mark_face_registered(username, registered=True):
    """更新用户人脸绑定状态"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET face_registered = %s WHERE username = %s",
                       (1 if registered else 0, username))
        conn.commit()
        return True
    except Exception as e:
        print("更新人脸注册状态失败:", e)
        return False
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass