#!/usr/bin/env python3
"""
图片下载工具
在爬虫执行时下载图片并保存到本地
"""

import os
import requests
import hashlib
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

def download_image(url, task_id):
    """
    下载单张图片
    
    Args:
        url: 图片URL
        task_id: 任务ID
    
    Returns:
        dict: { 'success': bool, 'local_path': str, 'error': str }
    """
    if not url or not url.startswith('http'):
        return {'success': False, 'error': '无效的URL'}
    
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
        
        # 下载图片
        response = requests.get(
            url,
            timeout=10,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://t66y.com/',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            verify=False  # 忽略 SSL 证书验证
        )
        response.raise_for_status()
        
        # 检查文件大小（限制为 50MB）
        if len(response.content) > 50 * 1024 * 1024:
            return {'success': False, 'error': '文件过大'}
        
        # 保存文件
        with open(file_path, 'wb') as f:
            f.write(response.content)
        
        local_path = f'/public/images/uploads/{task_id}/{file_name}'
        return {'success': True, 'local_path': local_path}
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def download_images(image_urls, task_id):
    """
    批量下载图片
    
    Args:
        image_urls: 图片URL列表
        task_id: 任务ID
    
    Returns:
        list: 下载结果列表
    """
    if not isinstance(image_urls, list) or len(image_urls) == 0:
        return []
    
    results = []
    batch_size = 5  # 并发下载数
    
    for i in range(0, len(image_urls), batch_size):
        batch = image_urls[i:i+batch_size]
        
        for url in batch:
            result = download_image(url, task_id)
            results.append(result)
        
        # 打印进度
        progress = min(i + batch_size, len(image_urls))
        print(f"[图片下载] 进度: {progress}/{len(image_urls)}", flush=True)
    
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
