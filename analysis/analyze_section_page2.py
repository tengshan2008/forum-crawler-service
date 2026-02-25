#!/usr/bin/env python3
"""
用更真实的浏览器headers访问论坛
"""

import requests
import urllib3
from bs4 import BeautifulSoup
import time

# 忽略SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

url = 'https://t66y.com/htm_data/2511/20/'

print(f"分析URL: {url}")
print("=" * 80)

# 创建session保持cookie
session = requests.Session()

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/*;q=0.8,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://t66y.com/',
}

try:
    print(f"第1次请求（获取首页）...")
    response = session.get('https://t66y.com/', headers=headers, timeout=15, verify=False)
    print(f"  ✓ HTTP {response.status_code}")
    print(f"  内容长度: {len(response.text)} 字符")
    
    time.sleep(2)
    
    print(f"\n第2次请求（访问版块）...")
    response = session.get(url, headers=headers, timeout=15, verify=False)
    print(f"  ✓ HTTP {response.status_code}")
    print(f"  内容长度: {len(response.text)} 字符")
    
    if response.text:
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 检查页面中所有的<a>标签
        all_links = soup.find_all('a', href=True)
        print(f"  找到 {len(all_links)} 个链接")
        
        # 分类链接
        post_links = [l for l in all_links if 'tid=' in l['href'] or 'htm_data' in l['href']]
        print(f"  帖子链接: {len(post_links)} 个")
        
        for i, link in enumerate(post_links[:3]):
            print(f"    {i+1}. {link['href']}")
        
        # 显示HTML片段
        print(f"\n【HTML片段】")
        print(response.text[:800])
    else:
        print(f"  ✗ 返回空内容")
    
except Exception as e:
    print(f"✗ 获取失败: {e}")
    import traceback
    traceback.print_exc()

print("=" * 80)
