#!/usr/bin/env python3
"""
从 read.php 页面中提取实际的 htm_data URL
"""

import requests
import urllib3
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# 忽略SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 测试URL（redirect格式）
test_url = "https://t66y.com/read.php?tid=7075205"

print(f"从转向页获取实际URL: {test_url}")
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
    response = session.get(
        test_url,
        headers=headers,
        timeout=15,
        verify=False,
        allow_redirects=True
    )
    
    print(f"✓ 获取页面成功 (HTTP {response.status_code})")
    
    # 解析HTML
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 方法1: 查找所有链接，找到 htm_data 格式的链接
    print(f"\n【方法1】查找html中的htm_data链接...")
    htm_data_links = []
    for link in soup.find_all('a', href=True):
        href = link['href']
        if 'htm_data' in href:
            full_url = urljoin(test_url, href)
            htm_data_links.append(full_url)
            print(f"  ✓ 找到: {full_url}")
    
    if htm_data_links:
        print(f"  最可能的实际URL: {htm_data_links[0]}")
    else:
        print(f"  ❌ 未找到htm_data链接")
    
    # 方法2: 查找JavaScript中的重定向信息
    print(f"\n【方法2】查找JS重定向信息...")
    scripts = soup.find_all('script')
    for script in scripts:
        if script.string and 'location' in script.string:
            print(f"  发现JS: {script.string[:100]}...")
            
    # 方法3: 查找meta标签
    print(f"\n【方法3】查找meta转向标签...")
    meta_refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
    if meta_refresh:
        print(f"  发现meta refresh: {meta_refresh}")
    
    # 方法4: 检查文档中的其他线索
    print(f"\n【方法4】 Checkpoint URL...")
    # 某些网站会在HTML注释或特定属性中储存目标URL
    for element in soup.find_all(attrs={'data-url': True}):
        print(f"  找到data-url: {element['data-url']}")
    
    for element in soup.find_all(attrs={'data-target': True}):
        print(f"  找到data-target: {element['data-target']}")
    
    # 检查是否是一个标准的HTML结构
    print(f"\n【页面分析】")
    print(f"  页面标题: {soup.title.string if soup.title else 'N/A'}")
    print(f"  页面大小: {len(response.text)} 字节")
    
    # 显示前1000个字符
    print(f"\n【HTML片段】")
    print(response.text[:1000])

except Exception as e:
    print(f"✗ 请求失败: {e}")

print("=" * 80)
