import pymysql
import sys
import os

root_path = os.path.dirname(os.path.abspath(__file__))
if root_path not in sys.path:
    sys.path.insert(0, root_path)

from settings import DB_CONFIG

def migrate_users_table():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()

        # 【关键修复】users.id 原来是恒为 NULL 的 varchar 列，没有主键。
        # 所有依赖 user_id 做数据隔离/外键关联的功能（模板、分析记录、活跃日志）都建立在这个假设上，
        # 必须先把它变成真正自增唯一的整数主键，否则所有用户的 user_id 都会退化成同一个 NULL。
        cursor.execute("SHOW KEYS FROM users WHERE Key_name = 'PRIMARY'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE users DROP COLUMN id")
            cursor.execute("ALTER TABLE users ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY FIRST")
            print("Rebuilt users.id as auto-increment primary key")

        cursor.execute("SHOW KEYS FROM users WHERE Key_name = 'uk_username'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE users ADD UNIQUE KEY uk_username (username)")
            print("Added unique constraint on username")

        cursor.execute("DESCRIBE users")
        columns = [col[0] for col in cursor.fetchall()]

        if 'nickname' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN nickname VARCHAR(50) NULL")
            print("Added nickname column")
        
        if 'avatar' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) NULL")
            print("Added avatar column")
        
        if 'create_time' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            print("Added create_time column")

        if 'face_registered' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN face_registered TINYINT DEFAULT 0 COMMENT '是否已绑定人脸 0=否 1=是'")
            print("Added face_registered column")

        conn.commit()
        print("Migration completed successfully")
        
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        try:
            cursor.close()
            conn.close()
        except:
            pass

if __name__ == '__main__':
    migrate_users_table()