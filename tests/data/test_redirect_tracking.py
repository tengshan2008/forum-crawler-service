#!/usr/bin/env python3
"""
测试URL重定向跟踪
"""

import requests
import urllib3

# 忽略SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 测试URL（redirect格式）
test_url = "https://t66y.com/read.php?tid=7075205&page=e&fpage=1"

print(f"测试URL: {test_url}")
print("=" * 80)

# 创建session
session = requests.Session()

# 设置headers
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://t66y.com/',
}

try:
    # 发起请求（allow_redirects=True是默认值）
    response = session.get(
        test_url,
        headers=headers,
        timeout=15,
        verify=False,
        allow_redirects=True
    )
    
    print(f"✓ 请求成功")
    print(f"  最终URL: {response.url}")
    print(f"  HTTP状态码: {response.status_code}")
    print(f"  重定向链数: {len(response.history)}")
    
    if response.history:
        print(f"\n重定向链：")
        for i, resp in enumerate(response.history):
            print(f"  {i+1}. {resp.status_code} {resp.url}")
    
    print(f"\n✓ URL格式检查:")
    if "htm_data" in response.url:
        print(f"  最终URL是htm_data格式: ✅")
    elif "read.php" in response.url:
        print(f"  最终URL仍是read.php格式: ❌")
    else:
        print(f"  最终URL格式未知: ⚠️ ")

except Exception as e:
    print(f"✗ 请求失败: {e}")

print("=" * 80)
