#!/usr/bin/env python3
"""
论坛爬虫启动脚本
真实爬虫实现，爬取论坛数据并保存到 MongoDB
"""

import sys
import os
import argparse
import json
import time
import requests
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import re
import logging

# 导入 MongoDB 客户端
from pymongo import MongoClient
from bson import ObjectId

# 导入图片下载器
from image_downloader import download_images, initialize_image_dirs

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

class ForumCrawler:
    """真实的论坛爬虫实现"""
    
    def __init__(self, task_id, mongodb_uri):
        self.task_id = task_id
        self.mongodb_uri = mongodb_uri
        self.client = None
        self.db = None
        self.posts_collection = None
        self.session = requests.Session()
        self.connect_db()
    
    def _get_headers(self):
        """获取反爬虫请求头"""
        import random
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ]
        
        return {
            'User-Agent': random.choice(user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
            'Referer': 'https://www.google.com/',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        }
    
    def connect_db(self):
        """连接 MongoDB"""
        try:
            self.client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            self.db = self.client['forum-crawler']
            self.posts_collection = self.db['posts']
            print(f"✓ MongoDB 连接成功", flush=True)
        except Exception as e:
            print(f"✗ MongoDB 连接失败: {e}", file=sys.stderr, flush=True)
            raise
    
    def fetch_page(self, url, max_retries=3):
        """获取页面内容 - 带重试和反爬虫"""
        for attempt in range(max_retries):
            try:
                # 随机延迟（1-3秒）
                if attempt > 0:
                    import time
                    import random
                    delay = random.uniform(1, 3)
                    print(f"⏳ 重试 {attempt}/{max_retries-1}，等待 {delay:.1f} 秒...", flush=True)
                    time.sleep(delay)
                
                # 获取反爬虫headers
                headers = self._get_headers()
                
                # 动态设置Referer
                if 't66y.com' in url:
                    headers['Referer'] = 'https://t66y.com/'
                elif 'tu.ymawv.la' in url:
                    headers['Referer'] = 'https://tu.ymawv.la/'
                
                response = self.session.get(
                    url, 
                    headers=headers,
                    timeout=15,
                    verify=False,  # 忽略SSL验证
                    allow_redirects=True
                )
                
                # 检查响应状态
                if response.status_code == 200:
                    response.encoding = 'utf-8'
                    print(f"✓ 成功获取页面: {url}", flush=True)
                    return response.text
                elif response.status_code == 403:
                    print(f"⚠ 访问被拒绝 (403): {url}，尝试重试...", flush=True)
                    continue
                elif response.status_code == 429:
                    print(f"⚠ 请求过于频繁 (429): {url}，等待更长时间...", flush=True)
                    time.sleep(5)
                    continue
                else:
                    print(f"⚠ HTTP错误 {response.status_code}: {url}", flush=True)
                    continue
                    
            except Exception as e:
                print(f"✗ 获取页面失败 (尝试 {attempt+1}/{max_retries}): {e}", file=sys.stderr, flush=True)
                if attempt == max_retries - 1:
                    return None
        
        print(f"✗ 所有重试失败: {url}", file=sys.stderr, flush=True)
        return None
    
    def extract_page_numbers(self, html):
        """从HTML中提取总页数"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            # 查找所有分页链接中的最大页码
            all_links = soup.find_all('a')
            page_numbers = set()
            for link in all_links:
                href = link.get('href', '')
                match = re.search(r'page=(\d+)', href)
                if match:
                    page_numbers.add(int(match.group(1)))
            
            if page_numbers:
                max_page = max(page_numbers)
                return max_page
            return 1
        except Exception as e:
            print(f"⚠ 提取页码失败: {e}", file=sys.stderr, flush=True)
            return 1
    
    def extract_tid_from_url(self, url):
        """从URL中提取 thread ID"""
        try:
            match = re.search(r'tid=(\d+)', url)
            if match:
                return match.group(1)
            # 也尝试从 htm_data 路径提取
            match = re.search(r'htm_data/\d+/\d+/(\d+)\.html', url)
            if match:
                return match.group(1)
            return None
        except Exception as e:
            print(f"⚠ 提取tid失败: {e}", file=sys.stderr, flush=True)
            return None
    
    def build_pagination_url(self, original_url, page_num):
        """为给定页码构建URL"""
        try:
            tid = self.extract_tid_from_url(original_url)
            if tid:
                # 使用标准分页URL格式
                return f"https://t66y.com/read.php?tid={tid}&page={page_num}"
            return None
        except Exception as e:
            print(f"⚠ 构建分页URL失败: {e}", file=sys.stderr, flush=True)
            return None
    
    def parse_t66y_post(self, url, html, task_type='image'):
        """解析 t66y 论坛帖子 - 提取所有页面和楼层的内容"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # 提取标题（仅从第一页）
            title = '未知标题'
            # 查找标题 - 通常在 h4.f16 中
            title_elem = soup.find('h4', class_='f16')
            if not title_elem:
                title_elem = soup.find('h1', class_='bbs-head-title')
            if not title_elem:
                title_elem = soup.find('h1')
            if not title_elem:
                title_elem = soup.find('title')
            
            if title_elem:
                title = title_elem.get_text(strip=True)
                # 清理标题
                if ' - t66y' in title or ' - ' in title:
                    title = title.split(' - ')[0].strip()
                if title.startswith('Re:'):
                    title = title[3:].strip()
            
            # 合并所有页面和楼层的内容和图片
            all_content_parts = []
            all_images = []
            
            # 第一步：提取第一页内容（已有HTML）
            print(f"📄 开始提取第一页内容...", flush=True)
            all_content_parts, all_images = self._extract_page_content(
                html, all_content_parts, all_images, page_num=1, task_type=task_type
            )
            
            # 第二步：检测是否有后续页面
            total_pages = self.extract_page_numbers(html)
            print(f"📊 检测到总页数: {total_pages}", flush=True)
            
            # 第三步：如果有多页，逐页获取内容
            if total_pages > 1:
                print(f"🔄 多分页模式：开始遍历第 2-{total_pages} 页...", flush=True)
                for page_num in range(2, total_pages + 1):
                    # 构建分页URL
                    page_url = self.build_pagination_url(url, page_num)
                    if not page_url:
                        print(f"⚠ 无法为页面 {page_num} 构建URL，跳过", flush=True)
                        continue
                    
                    # 获取该页内容
                    page_html = self.fetch_page(page_url)
                    if not page_html:
                        print(f"⚠ 页面 {page_num} 获取失败，继续下一页", flush=True)
                        continue
                    
                    # 提取内容
                    print(f"  → 第 {page_num} 页: 提取中...", flush=True)
                    all_content_parts, all_images = self._extract_page_content(
                        page_html, all_content_parts, all_images, page_num=page_num, task_type=task_type
                    )
            else:
                print(f"📄 单分页模式：仅提取第 1 页", flush=True)
            
            # 合并所有内容 - 用双换行分隔不同楼层和页面
            if all_content_parts:
                # 规范化内容段落间距
                formatted_parts = []
                for i, part in enumerate(all_content_parts):
                    # 为每个部分添加页面/楼层标识（仅在需要时）
                    if i > 0:
                        formatted_parts.append('\n\n--- 下一楼层/页面 ---\n\n')
                    formatted_parts.append(part)
                content = ''.join(formatted_parts)
            else:
                content = '暂无内容'
            
            return {
                'title': title,
                'content': content,
                'author': '楼主',
                'sourceUrl': url,
                'images': all_images,
            }
        except Exception as e:
            print(f"✗ 解析页面失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return None
    
    def _extract_page_content(self, html, content_parts, images, page_num=1, task_type='image'):
        """从单个页面HTML中提取内容和图片"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # 在 t66y 论坛中，每个楼层都是一个 div.tpc_content
            # 找所有的 tpc_content div（包括 id="conttpc", id="cont..." 等）
            content_divs = soup.find_all('div', class_='tpc_content')
            
            if content_divs:
                # 对于小说类任务，提取所有楼层的内容
                # 对于图片类任务，也提取所有楼层（可能多楼发图）
                for floor_idx, content_div in enumerate(content_divs, 1):
                    # 将所有 <br> 标签替换为换行符
                    for br in content_div.find_all('br'):
                        br.replace_with('\n')
                    # 提取文本内容 - 对于小说类型保留换行符
                    text_content = content_div.get_text(strip=False)
                    if text_content:
                        # 清理文本内容但保留换行符
                        text_content = re.sub(r'\n\s*\n', '\n\n', text_content)  # 规范化段落间距
                        text_content = text_content.strip()  # 只移除首尾空白
                        
                        # 为小说类型添加楼层标识
                        if task_type == 'novel':
                            floor_header = f"\n【第{floor_idx}楼】\n"
                            text_content = floor_header + text_content
                        
                        content_parts.append(text_content)
                    
                    # 提取图片
                    img_elements = content_div.find_all('img')
                    for img_idx, img in enumerate(img_elements, 1):
                        # t66y 论坛使用 ess-data 属性存储实际图片 URL
                        img_url = img.get('ess-data') or img.get('src') or img.get('data-src')
                        
                        if img_url and img_url.startswith('http'):
                            # 过滤掉明确的表情、头像等小图标
                            if any(x in img_url.lower() for x in ['emotion', 'icon', 'avatar', 'face']):
                                continue
                            
                            # 避免重复添加同一张图片
                            if img_url not in [img['url'] for img in images]:
                                images.append({
                                    'url': img_url,
                                    'description': f'第{page_num}页 楼层{floor_idx} 图片{img_idx}'
                                })
            else:
                # 备用方案：如果没找到标准的 tpc_content div，尝试其他选择器
                content_div = soup.find('div', id='conttpc')
                if content_div:
                    # 将所有 <br> 标签替换为换行符
                    for br in content_div.find_all('br'):
                        br.replace_with('\n')
                    # 提取文本内容 - 对于小说类型保留换行符
                    text_content = content_div.get_text(strip=False)
                    if text_content:
                        # 清理文本内容但保留换行符
                        text_content = re.sub(r'\n\s*\n', '\n\n', text_content)  # 规范化段落间距
                        text_content = text_content.strip()  # 只移除首尾空白
                        
                        # 为小说类型添加标识（备用方案使用默认楼层1）
                        if task_type == 'novel':
                            floor_header = f"\n【第1楼】\n"
                            text_content = floor_header + text_content
                        
                        content_parts.append(text_content)
                    
                    img_elements = content_div.find_all('img')
                    for img in img_elements:
                        img_url = img.get('ess-data') or img.get('src') or img.get('data-src')
                        if img_url and img_url.startswith('http'):
                            if any(x in img_url.lower() for x in ['emotion', 'icon', 'avatar', 'face']):
                                continue
                            if img_url not in [img['url'] for img in images]:
                                images.append({
                                    'url': img_url,
                                    'description': f'图片 {len(images) + 1}'
                                })
            
            return content_parts, images
        except Exception as e:
            print(f"⚠ 提取页面内容失败: {e}", file=sys.stderr, flush=True)
            return content_parts, images
        except Exception as e:
            print(f"✗ 解析页面失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return None
    
    def crawl_forum(self, forum_url, task_type='image', max_depth=1):
        """爬取论坛内容"""
        try:
            print(f"开始爬虫任务 {self.task_id}", flush=True)
            print(f"URL: {forum_url}", flush=True)
            print(f"Type: {task_type}", flush=True)
            
            # 获取页面
            html = self.fetch_page(forum_url)
            if not html:
                print(f"✗ 无法获取页面内容", file=sys.stderr, flush=True)
                return {
                    'success': False,
                    'task_id': self.task_id,
                    'error': '无法获取页面内容',
                }
            
            # 解析页面（获取所有页面的楼主内容）
            post_data = self.parse_t66y_post(forum_url, html, task_type)
            if not post_data:
                print(f"✗ 解析页面失败", file=sys.stderr, flush=True)
                return {
                    'success': False,
                    'task_id': self.task_id,
                    'error': '解析页面失败',
                }
            
            # 初始化图片目录
            initialize_image_dirs()
            
            # 根据任务类型决定是否保存内容
            if task_type == 'novel':
                # 文本类：只保存文本内容，不保存图片
                print(f"✓ 获取楼主文本内容: {len(post_data['content'])} 字符", flush=True)
                media = []
            elif task_type == 'image':
                # 图片类：只保存图片，清空文本内容
                if post_data['images']:
                    print(f"✓ 获取楼主图片: {len(post_data['images'])} 张", flush=True)
                    
                    # 下载所有图片
                    print(f"开始下载图片...", flush=True)
                    image_urls = [img['url'] for img in post_data['images']]
                    download_results = download_images(image_urls, self.task_id)
                    
                    # 将下载后的本地路径保存到 media
                    media = []
                    success_count = 0
                    for i, result in enumerate(download_results):
                        if result['success']:
                            media.append({
                                'url': result['local_path'],
                                'originalUrl': image_urls[i],
                                'description': f'楼主图片 {i + 1}'
                            })
                            success_count += 1
                        else:
                            print(f"⚠ 图片下载失败 {i + 1}: {result['error']}", flush=True)
                    
                    print(f"✓ 图片下载完成: {success_count}/{len(post_data['images'])} 成功", flush=True)
                else:
                    print(f"⚠ 楼主未发布图片，使用占位符", flush=True)
                    media = [{
                        'url': 'https://via.placeholder.com/300x200?text=No+Image',
                        'description': '楼主未发布图片'
                    }]
                # 图片类不保存文本，只保存标题
                post_data['content'] = f"楼主发布了 {len(post_data['images'])} 张图片"
            else:  # mixed
                # 混合类：既保存文本也保存图片
                print(f"✓ 获取楼主内容: {len(post_data['content'])} 字符, {len(post_data['images'])} 张图片", flush=True)
                
                if post_data['images']:
                    # 下载所有图片
                    print(f"开始下载图片...", flush=True)
                    image_urls = [img['url'] for img in post_data['images']]
                    download_results = download_images(image_urls, self.task_id)
                    
                    # 将下载后的本地路径保存到 media
                    media = []
                    success_count = 0
                    for i, result in enumerate(download_results):
                        if result['success']:
                            media.append({
                                'url': result['local_path'],
                                'originalUrl': image_urls[i],
                                'description': f'楼主图片 {i + 1}'
                            })
                            success_count += 1
                        else:
                            print(f"⚠ 图片下载失败 {i + 1}: {result['error']}", flush=True)
                    
                    print(f"✓ 图片下载完成: {success_count}/{len(post_data['images'])} 成功", flush=True)
                else:
                    media = []
            
            # 构建 MongoDB 文档
            post = {
                'title': post_data['title'],
                'content': post_data['content'],
                'author': post_data['author'],
                'sourceUrl': forum_url,
                'postType': 'image' if task_type == 'image' else 'novel' if task_type == 'novel' else 'text',
                'likes': 0,
                'views': 0,
                'replies': 0,
                'status': 'active',
                'tags': [task_type, 't66y'],
                'taskId': ObjectId(self.task_id),
                'createdAt': datetime.now(timezone.utc),
            }
            
            # 添加媒体信息
            if media:
                post['media'] = media
            else:
                # 如果没有媒体，添加占位符
                post['media'] = [{
                    'url': 'https://via.placeholder.com/300x200?text=No+Content',
                    'description': '暂无媒体内容'
                }]
            
            # 保存到数据库
            try:
                # 使用 upsert 方式，避免重复键错误
                result = self.posts_collection.update_one(
                    {'sourceUrl': forum_url},  # 查询条件
                    {
                        '$set': {
                            'title': post['title'],
                            'content': post['content'],
                            'author': post['author'],
                            'postType': post['postType'],
                            'likes': post['likes'],
                            'views': post['views'],
                            'replies': post['replies'],
                            'status': post['status'],
                            'tags': post['tags'],
                            'taskId': post['taskId'],
                            'media': post['media'],
                            'updatedAt': datetime.now(timezone.utc),
                        },
                        '$setOnInsert': {
                            'createdAt': datetime.now(timezone.utc),
                        }
                    },
                    upsert=True  # 如果不存在则插入
                )
                print(f"✓ 文章已保存: {post['title']}", flush=True)
                print(f"TITLE:{post['title']}", flush=True)
                print(f"PROGRESS:100", flush=True)
                print(f"CRAWLED:1", flush=True)
                
                return {
                    'success': True,
                    'task_id': self.task_id,
                    'total_posts': 1,
                    'message': '爬虫任务完成'
                }
            except Exception as e:
                print(f"✗ 保存数据库失败: {e}", file=sys.stderr, flush=True)
                import traceback
                traceback.print_exc()
                return {
                    'success': False,
                    'task_id': self.task_id,
                    'error': str(e),
                }
            
            # 根据任务类型决定是否保存内容
            if task_type == 'novel':
                # 文本类：只保存文本内容，不保存图片
                print(f"✓ 获取楼主文本内容: {len(post_data['content'])} 字符", flush=True)
                media = []
            elif task_type == 'image':
                # 图片类：只保存图片，清空文本内容
                if post_data['images']:
                    print(f"✓ 获取楼主图片: {len(post_data['images'])} 张", flush=True)
                    
                    # 下载所有图片
                    print(f"开始下载图片...", flush=True)
                    image_urls = [img['url'] for img in post_data['images']]
                    download_results = download_images(image_urls, self.task_id)
                    
                    # 将下载后的本地路径保存到 media
                    media = []
                    success_count = 0
                    for i, result in enumerate(download_results):
                        if result['success']:
                            media.append({
                                'url': result['local_path'],
                                'originalUrl': image_urls[i],
                                'description': f'楼主图片 {i + 1}'
                            })
                            success_count += 1
                        else:
                            print(f"⚠ 图片下载失败 {i + 1}: {result['error']}", flush=True)
                    
                    print(f"✓ 图片下载完成: {success_count}/{len(post_data['images'])} 成功", flush=True)
                else:
                    print(f"⚠ 楼主未发布图片，使用占位符", flush=True)
                    media = [{
                        'url': 'https://via.placeholder.com/300x200?text=No+Image',
                        'description': '楼主未发布图片'
                    }]
                # 图片类不保存文本，只保存标题
                post_data['content'] = f"楼主发布了 {len(post_data['images'])} 张图片"
            else:  # mixed
                # 混合类：既保存文本也保存图片
                print(f"✓ 获取楼主内容: {len(post_data['content'])} 字符, {len(post_data['images'])} 张图片", flush=True)
                
                if post_data['images']:
                    # 下载所有图片
                    print(f"开始下载图片...", flush=True)
                    image_urls = [img['url'] for img in post_data['images']]
                    download_results = download_images(image_urls, self.task_id)
                    
                    # 将下载后的本地路径保存到 media
                    media = []
                    success_count = 0
                    for i, result in enumerate(download_results):
                        if result['success']:
                            media.append({
                                'url': result['local_path'],
                                'originalUrl': image_urls[i],
                                'description': f'楼主图片 {i + 1}'
                            })
                            success_count += 1
                        else:
                            print(f"⚠ 图片下载失败 {i + 1}: {result['error']}", flush=True)
                    
                    print(f"✓ 图片下载完成: {success_count}/{len(post_data['images'])} 成功", flush=True)
                else:
                    media = []
            
            # 构建 MongoDB 文档
            post = {
                'title': post_data['title'],
                'content': post_data['content'],
                'author': post_data['author'],
                'sourceUrl': forum_url,
                'postType': 'image' if task_type == 'image' else 'novel' if task_type == 'novel' else 'text',
                'likes': 0,
                'views': 0,
                'replies': 0,
                'status': 'active',
                'tags': [task_type, 't66y'],
                'taskId': ObjectId(self.task_id),
                'createdAt': datetime.now(timezone.utc),
            }
            
            # 添加媒体信息
            if media:
                post['media'] = media
            else:
                # 如果没有媒体，添加占位符
                post['media'] = [{
                    'url': 'https://via.placeholder.com/300x200?text=No+Content',
                    'description': '暂无媒体内容'
                }]
            
            # 保存到数据库
            try:
                # 使用 upsert 方式，避免重复键错误
                result = self.posts_collection.update_one(
                    {'sourceUrl': forum_url},  # 查询条件
                    {
                        '$set': {
                            'title': post['title'],
                            'content': post['content'],
                            'author': post['author'],
                            'postType': post['postType'],
                            'likes': post['likes'],
                            'views': post['views'],
                            'replies': post['replies'],
                            'status': post['status'],
                            'tags': post['tags'],
                            'taskId': post['taskId'],
                            'media': post['media'],
                            'updatedAt': datetime.now(timezone.utc),
                        },
                        '$setOnInsert': {
                            'createdAt': datetime.now(timezone.utc),
                        }
                    },
                    upsert=True  # 如果不存在则插入
                )
                print(f"✓ 文章已保存: {post['title']}", flush=True)
                print(f"TITLE:{post['title']}", flush=True)
                print(f"PROGRESS:100", flush=True)
                print(f"CRAWLED:1", flush=True)
                
                return {
                    'success': True,
                    'task_id': self.task_id,
                    'total_posts': 1,
                    'message': '爬虫任务完成'
                }
            except Exception as e:
                print(f"✗ 保存数据库失败: {e}", file=sys.stderr, flush=True)
                import traceback
                traceback.print_exc()
                return {
                    'success': False,
                    'task_id': self.task_id,
                    'error': str(e),
                }
        
        except Exception as e:
            print(f"✗ 爬虫执行失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'task_id': self.task_id,
                'error': str(e),
            }
    
    def close(self):
        """关闭数据库连接"""
        if self.client:
            self.client.close()

def main():
    """主入口"""
    parser = argparse.ArgumentParser(description='Forum Crawler')
    parser.add_argument('--url', required=True, help='论坛 URL')
    parser.add_argument('--type', default='mixed', help='爬虫类型 (novel, image, mixed)')
    parser.add_argument('--task-id', required=True, help='任务 ID')
    parser.add_argument('--max-depth', type=int, default=1, help='最大深度')
    parser.add_argument('--delay', type=int, default=1000, help='请求延迟')
    parser.add_argument('--timeout', type=int, default=600000, help='超时时间 (ms)')
    
    args = parser.parse_args()
    
    # 获取 MongoDB URI
    mongodb_uri = os.environ.get(
        'MONGODB_URI',
        'mongodb://admin:admin123@mongo:27017/forum-crawler?authSource=admin'
    )
    
    crawler = None
    try:
        crawler = ForumCrawler(args.task_id, mongodb_uri)
        result = crawler.crawl_forum(args.url, args.type, args.max_depth)
        
        if result['success']:
            print(f"CRAWLED:{result.get('total_posts', 0)}", flush=True)
            sys.exit(0)
        else:
            print(f"ERROR:{result.get('error')}", file=sys.stderr, flush=True)
            sys.exit(1)
    
    except KeyboardInterrupt:
        print("爬虫被中断", file=sys.stderr, flush=True)
        sys.exit(130)
    except Exception as e:
        print(f"ERROR:{str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        if crawler:
            crawler.close()

if __name__ == '__main__':
    main()
