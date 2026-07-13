import pymysql
import sys
import os

# 将后端根目录加入搜索路径，保证从任意工作目录都能 import settings
root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_path not in sys.path:
    sys.path.insert(0, root_path)

from settings import DB_CONFIG
from werkzeug.security import generate_password_hash, check_password_hash

def insert_photo_analysis(filename, advice, score, user_id):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        sql = "INSERT INTO photo_analysis (filename, advice, score, user_id) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (filename, advice, score, user_id))
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


def get_all_photo_analyses(user_id):
    """只返回属于该用户自己的模板，避免跨用户数据泄露"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor(pymysql.cursors.DictCursor)  # 这样返回字典而非元组
        sql = "SELECT id, filename, advice, create_time, score FROM photo_analysis WHERE user_id = %s ORDER BY create_time DESC"
        cursor.execute(sql, (user_id,))
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

def delete_photo_analysis(template_id, user_id):
    """删除前校验归属，防止越权删除他人模板"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT filename, user_id FROM photo_analysis WHERE id = %s", (template_id,))
        result = cursor.fetchone()
        if not result:
            return False, None  # 没找到记录
        filename, owner_id = result
        if owner_id != user_id:
            return False, None  # 不属于当前用户，拒绝删除
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
        return False, "注册失败，请稍后重试"
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
        return False, "更新失败，请稍后重试"
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
        return False, "修改失败，请稍后重试"
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


# --- 用户中心：分析记录（自拍建议 / 环境分析）与统计 ---

def insert_analysis_record(user_id, record_type, filename, advice, audio_filename=None):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO analysis_record (user_id, type, filename, advice, audio_filename) VALUES (%s, %s, %s, %s, %s)",
            (user_id, record_type, filename, advice, audio_filename)
        )
        conn.commit()
        return True
    except Exception as e:
        print("写入分析记录失败:", e)
        return False
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def get_analysis_records(user_id, record_type):
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute(
            "SELECT id, type, filename, advice, audio_filename, create_time FROM analysis_record "
            "WHERE user_id = %s AND type = %s ORDER BY create_time DESC",
            (user_id, record_type)
        )
        return cursor.fetchall()
    except Exception as e:
        print("查询分析记录失败:", e)
        return []
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def log_user_activity(user_id):
    """记录用户今天有过分析行为，用于计算连续使用天数；同一天重复调用是幂等的"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT IGNORE INTO user_activity_log (user_id, activity_date) VALUES (%s, CURDATE())",
            (user_id,)
        )
        conn.commit()
    except Exception as e:
        print("记录用户活跃日期失败:", e)
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def get_user_stats(user_id):
    """照片数 / 平均评分 / 连续使用天数，供"我的"页头部展示"""
    stats = {"photoCount": 0, "score": 0, "days": 0}
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*), AVG(score) FROM photo_analysis WHERE user_id = %s", (user_id,))
        count, avg_score = cursor.fetchone()
        stats["photoCount"] = count or 0
        stats["score"] = round(float(avg_score), 1) if avg_score else 0

        cursor.execute(
            "SELECT activity_date FROM user_activity_log WHERE user_id = %s ORDER BY activity_date DESC",
            (user_id,)
        )
        dates = [row[0] for row in cursor.fetchall()]
        stats["days"] = _calc_streak(dates)

        return stats
    except Exception as e:
        print("统计用户数据失败:", e)
        return stats
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


def _calc_streak(sorted_dates_desc):
    """dates 需按日期降序排列；从今天或昨天开始，往前数连续无间断的天数"""
    import datetime
    if not sorted_dates_desc:
        return 0

    today = datetime.date.today()
    if sorted_dates_desc[0] not in (today, today - datetime.timedelta(days=1)):
        return 0  # 今天/昨天都没有活跃记录，连续天数清零

    streak = 1
    expected = sorted_dates_desc[0] - datetime.timedelta(days=1)
    for d in sorted_dates_desc[1:]:
        if d == expected:
            streak += 1
            expected -= datetime.timedelta(days=1)
        elif d == expected + datetime.timedelta(days=1):
            continue  # 同一天重复（理论上 UNIQUE 约束已避免），跳过
        else:
            break
    return streak