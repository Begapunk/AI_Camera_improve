"""地铁模式建表迁移：在现有库上创建 metro_device / metro_inspection。

用法： python migrate_metro_tables.py
"""
import pymysql
import sys
import os

root_path = os.path.dirname(os.path.abspath(__file__))
if root_path not in sys.path:
    sys.path.insert(0, root_path)

from settings import DB_CONFIG

DDL_DEVICE = """
CREATE TABLE IF NOT EXISTS metro_device (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_code VARCHAR(64) NOT NULL UNIQUE,
    family VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    station VARCHAR(128),
    location VARCHAR(255),
    baseline_image VARCHAR(255),
    baseline_version INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) DEFAULT CHARSET=utf8mb4;
"""

DDL_INSPECTION = """
CREATE TABLE IF NOT EXISTS metro_inspection (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trace_id VARCHAR(40) NOT NULL UNIQUE,
    worker_id VARCHAR(64),
    device_code VARCHAR(64),
    device_model VARCHAR(64),
    station VARCHAR(128),
    image_file VARCHAR(255),
    annotated_file VARCHAR(255),
    result VARCHAR(16) NOT NULL,
    quality_score FLOAT,
    detections_json MEDIUMTEXT,
    baseline_version INT DEFAULT 0,
    offline_flag TINYINT DEFAULT 0,
    work_order_id VARCHAR(64),
    confirmed_by VARCHAR(64),
    confirm_action VARCHAR(255),
    confirmed_at TIMESTAMP NULL,
    captured_at VARCHAR(40),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device (device_code),
    INDEX idx_worker (worker_id),
    INDEX idx_result (result)
) DEFAULT CHARSET=utf8mb4;
"""


def migrate():
    conn = None
    cursor = None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(DDL_DEVICE)
        print("metro_device ready")
        cursor.execute(DDL_INSPECTION)
        print("metro_inspection ready")
        conn.commit()
        print("Metro migration completed successfully")
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        try:
            cursor.close()
            conn.close()
        except Exception:
            pass


if __name__ == '__main__':
    migrate()
