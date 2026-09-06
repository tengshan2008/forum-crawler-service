#!/usr/bin/env python3
"""
分析t66y论坛列表页的HTML结构
"""

import requests
import urllib3
from bs4 import BeautifulSoup

# 忽略SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

url = 'https://t66y.com/htm_data/2511/20/'

print(f"分析URL: {url}")
print("=" * 80)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://t66y.com/',
}

try:
    response = requests.get(url, headers=headers, timeout=15, verify=False)
    print(f"✓ HTTP {response.status_code}")
    print(f"  内容长度: {len(response.text)} 字符")
    print("")
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 检查页面中所有的<a>标签
    all_links = soup.find_all('a', href=True)
    print(f"【全部链接】找到 {len(all_links)} 个 <a> 标签")
    
    # 分类链接
    read_php_links = []
    htm_data_links = []
    other_links = []
    
    for link in all_links:
        href = link['href']
        text = link.get_text(strip=True)[:50]
        if 'read.php?tid=' in href:
            read_php_links.append({'href': href, 'text': text})
        elif 'htm_data' in href:
            htm_data_links.append({'href': href, 'text': text})
        else:
            other_links.append({'href': href, 'text': text})
    
    print(f"\n【read.php?tid= 格式】: {len(read_php_links)} 个")
    for i, link in enumerate(read_php_links[:3]):
        print(f"  {i+1}. {link['text']}")
        print(f"     → {link['href']}")
    if len(read_php_links) > 3:
        print(f"  ... 共 {len(read_php_links)} 个")
    
    print(f"\n【htm_data 格式】: {len(htm_data_links)} 个")
    for i, link in enumerate(htm_data_links[:3]):
        print(f"  {i+1}. {link['text']}")
        print(f"     → {link['href']}")
    if len(htm_data_links) > 3:
        print(f"  ... 共 {len(htm_data_links)} 个")
    
    print(f"\n【其他格式】: {len(other_links)} 个")
    for i, link in enumerate(other_links[:3]):
        print(f"  {i+1}. {link['text']}")
        print(f"     → {link['href'][:60]}...")
    
    # 检查是否是转向页
    print(f"\n【页面类型检查】")
    meta_refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
    if meta_refresh:
        print(f"  页面是转向页（meta refresh）")
    else:
        print(f"  页面不是转向页")
    
    # 显示HTML片段
    print(f"\n【HTML片段】")
    print(response.text[:500])
    
except Exception as e:
    print(f"✗ 获取失败: {e}")
    import traceback
    traceback.print_exc()

print("=" * 80)
