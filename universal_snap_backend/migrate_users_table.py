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