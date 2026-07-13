"""地铁模式数据层：转辙机设备登记 + 检测记录（证据链）。

沿用 db.py 的 pymysql 直连风格；检测记录写后视为不可篡改证据，
仅允许 confirm 字段在人工复核时补写。
"""

import json
import pymysql

from settings import DB_CONFIG


def _conn():
    return pymysql.connect(**DB_CONFIG)


# =========================================================================
# 转辙机设备 metro_device
# =========================================================================
def upsert_device(device_code, family, model, station=None, location=None,
                  baseline_image=None, baseline_version=None):
    """登记或更新转辙机。传 baseline_image 时同时推进 baseline_version。"""
    conn = None
    cursor = None
    try:
        conn = _conn()
        cursor = conn.cursor()
        cursor.execute("SELECT id, baseline_version FROM metro_device WHERE device_code=%s",
                       (device_code,))
        row = cursor.fetchone()
        if row:
            sets = ["family=%s", "model=%s", "station=%s", "location=%s"]
            params = [family, model, station, location]
            if baseline_image is not None:
                new_ver = (row[1] or 0) + 1 if baseline_version is None else baseline_version
                sets += ["baseline_image=%s", "baseline_version=%s"]
                params += [baseline_image, new_ver]
            params.append(device_code)
            cursor.execute(f"UPDATE metro_device SET {', '.join(sets)} WHERE device_code=%s",
                           tuple(params))
        else:
            ver = 0 if baseline_image is None else (baseline_version or 1)
            cursor.execute(
                "INSERT INTO metro_device "
                "(device_code, family, model, station, location, baseline_image, baseline_version) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (device_code, family, model, station, location, baseline_image, ver))
        conn.commit()
        return True, "保存成功"
    except Exception as e:
        print("设备登记失败:", e)
        return False, "设备登记失败，请稍后重试"
    finally:
        try:
            cursor.close(); conn.close()
        except Exception:
            pass


def get_device(device_code):
    conn = None
    cursor = None
    try:
        conn = _conn()
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute("SELECT * FROM metro_device WHERE device_code=%s", (device_code,))
        return cursor.fetchone()
    except Exception as e:
        print("查询设备失败:", e)
        return None
    finally:
        try:
            cursor.close(); conn.close()
        except Exception:
            pass


# =========================================================================
# 检测记录 metro_inspection（证据链）
# =========================================================================
def insert_inspection(rec):
    """插入一条检测记录。rec 为 dict，detections 自动序列化为 JSON。"""
    conn = None
    cursor = None
    try:
        conn = _conn()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO metro_inspection "
            "(trace_id, worker_id, device_code, device_model, station, "
            " image_file, annotated_file, result, quality_score, detections_json, "
            " baseline_version, offline_flag, captured_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                rec.get("trace_id"), rec.get("worker_id"), rec.get("device_code"),
                rec.get("device_model"), rec.get("station"),
                rec.get("image_file"), rec.get("annotated_file"), rec.get("result"),
                rec.get("quality_score"), json.dumps(rec.get("detections", []), ensure_ascii=False),
                rec.get("baseline_version", 0), 1 if rec.get("offline_flag") else 0,
                rec.get("captured_at"),
            ))
        conn.commit()
        return True, cursor.lastrowid
    except Exception as e:
        print("检测记录写入失败:", e)
        return False, str(e)
    finally:
        try:
            cursor.close(); conn.close()
        except Exception:
            pass


def confirm_inspection(trace_id, confirmed_by, confirm_action):
    """人工复核回写（REVIEW/BLOCKED 闭环）。"""
    conn = None
    cursor = None
    try:
        conn = _conn()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE metro_inspection "
            "SET confirmed_by=%s, confirm_action=%s, confirmed_at=NOW() "
            "WHERE trace_id=%s",
            (confirmed_by, confirm_action, trace_id))
        conn.commit()
        if cursor.rowcount == 0:
            return False, "记录不存在"
        return True, "复核已记录"
    except Exception as e:
        print("复核回写失败:", e)
        return False, "复核写入失败，请稍后重试"
    finally:
        try:
            cursor.close(); conn.close()
        except Exception:
            pass


def list_inspections(device_code=None, worker_id=None, result=None, limit=100):
    """审计查询，支持按设备/人/结果过滤。"""
    conn = None
    cursor = None
    try:
        conn = _conn()
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        where = []
        params = []
        if device_code:
            where.append("device_code=%s"); params.append(device_code)
        if worker_id:
            where.append("worker_id=%s"); params.append(worker_id)
        if result:
            where.append("result=%s"); params.append(result)
        sql = "SELECT * FROM metro_inspection"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY created_at DESC LIMIT %s"
        params.append(int(limit))
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()
        for r in rows:
            try:
                r["detections"] = json.loads(r.pop("detections_json") or "[]")
            except Exception:
                r["detections"] = []
        return rows
    except Exception as e:
        print("审计查询失败:", e)
        return []
    finally:
        try:
            cursor.close(); conn.close()
        except Exception:
            pass
