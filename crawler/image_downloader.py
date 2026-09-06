#!/usr/bin/env python3
"""
图片下载工具
在爬虫执行时下载图片并保存到本地
"""

import os
import requests
# 忽略urllib3的InsecureRequestWarning警告
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import hashlib
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
import logging

logger = logging.getLogger(__name__)

# 定义图片存储目录
# 支持两种运行环境：Docker 容器和本地开发
if os.path.exists('/app/public'):
    # Docker 容器环境
    IMAGES_BASE_DIR = '/app/public/images'
    IMAGES_UPLOAD_DIR = '/app/public/images/uploads'
else:
    # 本地开发环境
    IMAGES_BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../public/images')
    IMAGES_UPLOAD_DIR = os.path.join(IMAGES_BASE_DIR, 'uploads')

def initialize_image_dirs():
    """初始化图片目录"""
    try:
        os.makedirs(IMAGES_UPLOAD_DIR, exist_ok=True)
        print(f"✓ 图片目录已初始化: {IMAGES_UPLOAD_DIR}", flush=True)
    except Exception as e:
        print(f"✗ 初始化图片目录失败: {e}", flush=True)

def get_extension_from_url(url):
    """从URL提取文件扩展名"""
    try:
        parsed = urlparse(url)
        path = parsed.path
        # 获取最后一个点后的字符
        if '.' in path:
            ext = path.split('.')[-1].lower()[:10]  # 限制长度
            # 过滤掉不合法的扩展名
            valid_exts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
            return ext if ext in valid_exts else 'jpg'
    except:
        pass
    return 'jpg'

def generate_file_name(url, extension=None):
    """生成唯一的文件名"""
    if not extension:
        extension = get_extension_from_url(url)
    
    # 使用URL的MD5哈希作为文件名
    hash_obj = hashlib.md5(url.encode())
    file_hash = hash_obj.hexdigest()[:16]
    
    return f"{file_hash}.{extension}"

def download_image(url, task_id, max_retries=3):
    """
    下载单张图片 - 带重试和反爬虫对抗
    
    Args:
        url: 图片URL
        task_id: 任务ID
        max_retries: 最大重试次数
    
    Returns:
        dict: { 'success': bool, 'local_path': str, 'error': str }
    """
    if not url or not url.startswith('http'):
        return {'success': False, 'error': '无效的URL'}
    
    for attempt in range(max_retries):
        try:
            # 获取文件扩展名
            extension = get_extension_from_url(url)
            file_name = generate_file_name(url, extension)
            
            # 创建任务特定的目录
            task_image_dir = os.path.join(IMAGES_UPLOAD_DIR, task_id)
            os.makedirs(task_image_dir, exist_ok=True)
            
            file_path = os.path.join(task_image_dir, file_name)
            
            # 如果文件已经存在，直接返回
            if os.path.exists(file_path):
                local_path = f'/public/images/uploads/{task_id}/{file_name}'
                return {'success': True, 'local_path': local_path}
            
            # 随机延迟（重试时）
            if attempt > 0:
                import time
                import random
                delay = random.uniform(2, 5)
                print(f"⏳ 图片重试 {attempt}/{max_retries-1}，等待 {delay:.1f} 秒: {url}", flush=True)
                time.sleep(delay)
            
            # 下载图片 - 增强反爬虫能力
            session = requests.Session()
            
            # 轮换 User-Agent
            user_agents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
            ]
            
            import random
            headers = {
                'User-Agent': random.choice(user_agents),
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8,application/json,text/html',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"'
            }
            
            # 动态生成 Referer
            if 't66y.com' in url:
                headers['Referer'] = 'https://t66y.com/'
            elif 'tu.ymawv.la' in url:
                headers['Referer'] = 'https://tu.ymawv.la/'
            else:
                headers['Referer'] = 'https://www.google.com/'
                
            response = session.get(
                url,
                headers=headers,
                timeout=60,
                verify=False,  # 忽略 SSL 证书验证
                allow_redirects=True,
                stream=False
            )
            
            # 检查响应状态
            if response.status_code == 200:
                # 检查文件大小（限制为 50MB）
                content_length = len(response.content)
                if content_length > 50 * 1024 * 1024:
                    return {'success': False, 'error': '文件过大'}
                
                if content_length == 0:
                    print(f"⚠ 下载图片内容为空: {url}", flush=True)
                    return {'success': False, 'error': '图片内容为空'}

                # 保存文件
                with open(file_path, 'wb') as f:
                    f.write(response.content)
                
                print(f"✓ 下载成功 ({content_length} bytes): {url}", flush=True)
                local_path = f'/public/images/uploads/{task_id}/{file_name}'
                return {'success': True, 'local_path': local_path}
            elif response.status_code == 403:
                print(f"⚠ 图片访问被拒绝 (403): {url}，尝试重试...", flush=True)
                continue
            elif response.status_code == 429:
                print(f"⚠ 图片请求过于频繁 (429): {url}，等待更长时间...", flush=True)
                time.sleep(5)
                continue
            else:
                print(f"⚠ 图片HTTP错误 {response.status_code}: {url}", flush=True)
                continue
        
        except Exception as e:
            print(f"✗ 下载图片失败 (尝试 {attempt+1}/{max_retries}): {e}", flush=True)
            if attempt == max_retries - 1:
                break
    
    return {'success': False, 'error': f'重试{max_retries}次后仍然失败'}

def download_images(image_urls, task_id, max_workers=5):
    """
    批量并发下载图片（C3：批量内 ThreadPoolExecutor 并发，结果顺序与输入一致）

    Args:
        image_urls: 图片URL列表
        task_id: 任务ID
        max_workers: 并发下载数

    Returns:
        list: 下载结果列表（顺序与 image_urls 一一对应，供按索引映射媒体）
    """
    if not isinstance(image_urls, list) or len(image_urls) == 0:
        return []

    results = []
    batch_size = max_workers

    for i in range(0, len(image_urls), batch_size):
        batch = image_urls[i:i+batch_size]

        # 批量内并发下载；按提交顺序收集结果，保证与输入顺序一致
        with ThreadPoolExecutor(max_workers=min(max_workers, len(batch))) as executor:
            futures = [executor.submit(download_image, url, task_id) for url in batch]
            for future in futures:
                results.append(future.result())

        # 打印进度 (同时输出百分比格式供 Node.js 解析)
        progress = min(i + batch_size, len(image_urls))
        progress_percent = int((progress / len(image_urls)) * 100)
        print(f"[图片下载] 进度: {progress}/{len(image_urls)}", flush=True)
        print(f"PROGRESS:{progress_percent}", flush=True)

    return results

def delete_task_images(task_id):
    """删除任务的所有图片"""
    try:
        task_image_dir = os.path.join(IMAGES_UPLOAD_DIR, task_id)
        if os.path.exists(task_image_dir):
            import shutil
            shutil.rmtree(task_image_dir)
            print(f"✓ 已删除任务图片: {task_id}", flush=True)
    except Exception as e:
        print(f"✗ 删除任务图片失败: {e}", flush=True)

if __name__ == '__main__':
    initialize_image_dirs()
