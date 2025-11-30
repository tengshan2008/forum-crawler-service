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
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.connect_db()
    
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
    
    def fetch_page(self, url):
        """获取页面内容"""
        try:
            response = self.session.get(url, timeout=10)
            response.encoding = 'utf-8'
            return response.text
        except Exception as e:
            print(f"✗ 获取页面失败 {url}: {e}", file=sys.stderr, flush=True)
            return None
    
    def parse_t66y_post(self, url, html, task_type='image'):
        """解析 t66y 论坛帖子 - 只提取楼主（第一楼）的内容"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # 提取标题
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
            
            # 查找楼主内容区域
            # 根据 t66y 论坛的 HTML 结构，楼主内容在第一个 id="conttpc" 的 div 中
            content_div = None
            
            # 尝试查找 id="conttpc" (楼主内容的标准 ID)
            content_div = soup.find('div', id='conttpc')
            
            # 如果找不到，尝试其他选择器
            if not content_div:
                content_div = soup.find('div', class_='tpc_content')
            
            if not content_div:
                # 查找第一个包含 class="tpc_content do_not_catch" 的 div
                content_div = soup.find('div', {'class': 'tpc_content do_not_catch'})
            
            content = '暂无内容'
            author = '楼主'
            images = []
            
            if content_div:
                # 提取文本内容（只从楼主部分）
                text_content = content_div.get_text(strip=True)
                if text_content:
                    # 只取前 1000 个字符
                    content = text_content[:1000]
                
                # 提取图片（楼主的所有图片）
                img_elements = content_div.find_all('img')
                for idx, img in enumerate(img_elements):
                    # t66y 论坛使用 ess-data 属性存储实际图片 URL
                    img_url = img.get('ess-data') or img.get('src') or img.get('data-src')
                    
                    if img_url and img_url.startswith('http'):
                        # 过滤掉明确的表情、头像等小图标（iyl-data 只是占位符属性，不影响真实图片）
                        if any(x in img_url.lower() for x in ['emotion', 'icon', 'avatar', 'face']):
                            continue
                        
                        # 成功提取一张有效图片
                        images.append({
                            'url': img_url,
                            'description': f'楼主图片 {len(images) + 1}'
                        })
            
            return {
                'title': title,
                'content': content,
                'author': author,
                'sourceUrl': url,
                'images': images,
            }
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
            
            # 解析页面（只获取楼主内容）
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
    parser.add_argument('--timeout', type=int, default=30000, help='超时时间')
    
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
