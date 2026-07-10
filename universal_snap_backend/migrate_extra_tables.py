import pymysql
import sys
import os

root_path = os.path.dirname(os.path.abspath(__file__))
if root_path not in sys.path:
    sys.path.insert(0, root_path)

from settings import DB_CONFIG


def migrate_extra_tables():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # --- photo_analysis 归属用户，修复"我的模板"跨用户可见/可删问题 ---
        cursor.execute("DESCRIBE photo_analysis")
        columns = [col[0] for col in cursor.fetchall()]
        if 'user_id' not in columns:
            cursor.execute("ALTER TABLE photo_analysis ADD COLUMN user_id INT NULL, ADD INDEX idx_user_id (user_id)")
            print("Added user_id column to photo_analysis")

        # --- analysis_record：自拍建议(analyze/analyze-grok)与环境分析(analyze-env)的历史记录 ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analysis_record (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                type VARCHAR(20) NOT NULL COMMENT 'selfie=自拍建议 environment=环境分析',
                filename VARCHAR(255) NOT NULL,
                advice TEXT,
                audio_filename VARCHAR(255) NULL,
                create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_type (user_id, type)
            )
        """)

        # --- user_activity_log：记录用户每天是否有分析行为，用于计算连续天数 ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_activity_log (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                activity_date DATE NOT NULL,
                UNIQUE KEY uk_user_date (user_id, activity_date)
            )
        """)

        conn.commit()
        print("Extra tables migration completed successfully")

    except Exception as e:
        print(f"Extra tables migration failed: {e}")
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass


if __name__ == '__main__':
    migrate_extra_tables()
