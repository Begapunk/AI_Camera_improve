import requests

print("=== 测试我的模块 API ===")

print("\n1. 测试获取用户信息接口 (GET /api/user/info)")
try:
    response = requests.get("http://localhost:5001/api/user/info", params={"username": "test"})
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.text}")
except Exception as e:
    print(f"请求失败: {e}")

print("\n2. 测试修改密码接口 (POST /api/user/change-password)")
try:
    response = requests.post("http://localhost:5001/api/user/change-password", json={
        "username": "test",
        "old_password": "123456",
        "new_password": "1234567"
    })
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.text}")
except Exception as e:
    print(f"请求失败: {e}")

print("\n3. 测试缺少参数的情况")
try:
    response = requests.get("http://localhost:5001/api/user/info")
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.text}")
except Exception as e:
    print(f"请求失败: {e}")

print("\n测试完成")