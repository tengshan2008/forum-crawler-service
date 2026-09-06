#!/usr/bin/env python3
"""
论坛爬虫启动脚本
真实爬虫实现，爬取论坛数据并保存到 MongoDB
"""

import sys
import os
import argparse
from logging.handlers import RotatingFileHandler
from pathlib import Path
import json
import time
import requests
# 忽略urllib3的InsecureRequestWarning警告
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import re
import logging

# 导入纯函数库（可被 pytest 直接测试，见 crawler/tests/）
from lib.text_utils import calculate_content_hash, extract_text_content, is_garbage_content
from lib.url_utils import (
    build_pagination_url,
    build_section_pagination_url,
    extract_meta_refresh_url,
    extract_page_from_url,
    extract_page_numbers,
    extract_tid_from_url,
    has_next_page,
)

# 导入 MongoDB 客户端
from pymongo import MongoClient
from bson import ObjectId

# 导入图片下载器
from image_downloader import download_images, initialize_image_dirs
from lib.dedup import evaluate_duplicate
from lib.post_builder import build_media_and_content, build_post_document, build_upsert_updates

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(message)s')


class _Tee:
    """将写入同时分发到多个流（C4：把 stdout 进度输出镜像落盘，格式保持不变）"""

    def __init__(self, *streams):
        self._streams = streams

    def write(self, data):
        for stream in self._streams:
            stream.write(data)

    def flush(self):
        for stream in self._streams:
            try:
                stream.flush()
            except ValueError:
                # 解释器退出阶段流可能已关闭，忽略即可
                pass


def setup_task_logging(task_id):
    """任务日志统一落盘（C4）：
    - stdout 输出（PROGRESS/CRAWLED/TITLE 等被 backend crawlerExecutor 解析的行）保持原样
    - 同时镜像写入 crawler/logs/task_<task_id>.log（5MB x 2 轮转，*.log 已被 .gitignore 覆盖）
    """
    logs_dir = Path(__file__).resolve().parent / 'logs'
    logs_dir.mkdir(exist_ok=True)
    log_path = logs_dir / f'task_{task_id}.log'

    file_handler = RotatingFileHandler(
        log_path, maxBytes=5 * 1024 * 1024, backupCount=2, encoding='utf-8'
    )
    file_handler.setFormatter(logging.Formatter('%(message)s'))
    logging.getLogger().addHandler(file_handler)

    sys.stdout = _Tee(sys.__stdout__, file_handler.stream)
    print(f"📝 任务日志落盘: {log_path}", flush=True)
logger = logging.getLogger(__name__)

class ForumCrawler:
    """真实的论坛爬虫实现"""
    
    # 置顶规则帖子的黑名单ID（跳过采集）
    PINNED_POST_BLACKLIST = {
        '5877',      # https://t66y.com/htm_data/0612/9/5877.html
        '932276',    # https://t66y.com/htm_data/2010/20/932276.html
        '131469',    # https://t66y.com/htm_data/0805/20/131469.html
        '183193',    # https://t66y.com/htm_data/0810/20/183193.html
        '46242',     # https://t66y.com/htm_data/0707/20/46242.html
    }
    
    def __init__(self, task_id, mongodb_uri):
        self.task_id = task_id
        self.mongodb_uri = mongodb_uri
        self.client = None
        self.db = None
        self.posts_collection = None
        self.session = requests.Session()
        self.user_id = None  # 存储任务所属的用户ID
        self.connect_db()
        self._get_task_user_id()  # 获取任务的用户ID
    
    def _get_task_user_id(self):
        """获取任务关联的用户ID"""
        try:
            if self.db is None:
                print(f"⚠ 数据库连接失败，无法获取任务用户ID", file=sys.stderr, flush=True)
                return
            
            # 任务集合名称通常是 crawlertasks（Mongoose将CrawlerTask模型转换为crawlertasks集合）
            tasks_collection = self.db['crawlertasks']
            task = tasks_collection.find_one({'_id': ObjectId(self.task_id)})
            
            if not task:
                print(f"⚠ 任务不存在于数据库中: {self.task_id}", file=sys.stderr, flush=True)
            elif 'userId' in task and task['userId']:
                self.user_id = task['userId']
                print(f"✓ 获取到任务用户ID: {self.user_id}", flush=True)
            else:
                print(f"⚠ 任务中userId字段缺失或为空（旧数据）", file=sys.stderr, flush=True)
                # 尝试查找任意一个管理员用户作为默认 fallback
                users_collection = self.db['users']
                admin = users_collection.find_one({'role': 'admin'})
                if admin:
                    self.user_id = admin['_id']
                    print(f"⚠ 使用管理员ID作为默认值: {self.user_id}", flush=True)
                    # 同时尝试更新任务，为其补充userId
                    try:
                        tasks_collection.update_one(
                            {'_id': ObjectId(self.task_id)},
                            {'$set': {'userId': self.user_id}}
                        )
                        print(f"✓ 已为任务添加userId字段: {self.user_id}", flush=True)
                    except Exception as e:
                        print(f"⚠ 为任务添加userId失败: {e}", file=sys.stderr, flush=True)
                else:
                    # 如果没有管理员，创建一个默认用户或使用系统用户
                    print(f"⚠ 找不到管理员用户，尝试使用系统默认用户", file=sys.stderr, flush=True)
                    # 生成一个 ObjectId 作为系统用户（用于保证爬虫能继续运行）
                    from bson import ObjectId as BsonObjectId
                    system_user_id = BsonObjectId()
                    self.user_id = system_user_id
                    print(f"⚠ 使用系统默认用户ID: {self.user_id}", flush=True)
                    # 尝试为任务添加 userId
                    try:
                        tasks_collection.update_one(
                            {'_id': ObjectId(self.task_id)},
                            {'$set': {'userId': self.user_id}}
                        )
                        print(f"✓ 已为任务添加系统用户ID", flush=True)
                    except Exception as e:
                        print(f"⚠ 为任务添加userId失败: {e}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"⚠ 获取任务用户信息失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
    
    def _calculate_content_hash(self, content):
        """计算内容的 MD5 哈希值用于去重（实现见 lib/text_utils.calculate_content_hash）"""
        return calculate_content_hash(content)
    
    def _extract_forum_last_post_time(self, html):
        """从论坛列表页面的一条记录中提取最后发表时间
        
        查找 data-timestamp 属性的时间戳，例：
        <a href="/read.php?tid=6861796&page=e&fpage=6#a" class="f10" data-timestamp="1755443268">2025-08-17 23:07</a>
        
        Returns:
            datetime 对象或 None
        """
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # 查找所有包含 data-timestamp 属性的元素
            timestamp_elements = soup.find_all(attrs={'data-timestamp': True})
            
            if timestamp_elements:
                for elem in timestamp_elements:
                    timestamp_str = elem.get('data-timestamp', '')
                    if timestamp_str:
                        # 去除末尾的 's' 字符（如果有）
                        timestamp_str = timestamp_str.rstrip('s')
                        try:
                            # 将 Unix 时间戳转换为 datetime
                            timestamp_int = int(float(timestamp_str))
                            from datetime import datetime, timezone
                            dt = datetime.fromtimestamp(timestamp_int, tz=timezone.utc)
                            print(f"✓ 提取论坛最后发表时间: {dt}", flush=True)
                            return dt
                        except (ValueError, OSError):
                            continue
            
            return None
        except Exception as e:
            print(f"⚠ 提取论坛最后发表时间失败: {e}", file=sys.stderr, flush=True)
            return None
    
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
    
    def is_pinned_post(self, post_id):
        """检查是否是置顶规则帖子（黑名单中的帖子）
        
        Args:
            post_id: 帖子ID（tid）
            
        Returns:
            bool: True 如果在黑名单中
        """
        return str(post_id) in self.PINNED_POST_BLACKLIST
    
    def add_to_blacklist(self, post_id):
        """动态添加帖子到黑名单
        
        Args:
            post_id: 帖子ID（tid）
        """
        self.PINNED_POST_BLACKLIST.add(str(post_id))
        print(f"✓ 已将帖子 {post_id} 添加到黑名单", flush=True)
    
    def remove_from_blacklist(self, post_id):
        """从黑名单中移除帖子
        
        Args:
            post_id: 帖子ID（tid）
        """
        post_id_str = str(post_id)
        if post_id_str in self.PINNED_POST_BLACKLIST:
            self.PINNED_POST_BLACKLIST.remove(post_id_str)
            print(f"✓ 已将帖子 {post_id} 从黑名单中移除", flush=True)
        else:
            print(f"⚠ 帖子 {post_id} 不在黑名单中", flush=True)
    
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
    
    def fetch_page(self, url, max_retries=3, delay_range=(1, 2), request_timeout=30):
        """获取页面内容 - 带重试和反爬虫
        
        Args:
            url: 目标URL
            max_retries: 最大重试次数
            delay_range: 延迟范围(秒)
            request_timeout: HTTP请求超时时间(秒)，默认30秒
        """
        result = self.fetch_page_with_final_url(url, max_retries, delay_range, request_timeout)
        return result['html'] if result else None
    
    def fetch_page_with_final_url(self, url, max_retries=3, delay_range=(1, 2), request_timeout=30):
        """获取页面内容和最终URL（跟踪重定向和meta refresh）
        
        Args:
            url: 目标URL
            max_retries: 最大重试次数
            delay_range: 延迟范围(秒)
            request_timeout: HTTP请求超时时间(秒)，批量采集建议30-60秒
        """
        for attempt in range(max_retries):
            try:
                # 每次请求前都添加随机延迟（2-4秒）
                import time
                import random
                delay = random.uniform(delay_range[0], delay_range[1])
                if attempt > 0:
                    print(f"⏳ 重试 {attempt}/{max_retries-1}，等待 {delay:.1f} 秒...", flush=True)
                else:
                    print(f"⏳ 等待 {delay:.1f} 秒后请求...", flush=True)
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
                    timeout=request_timeout,  # 可配置的HTTP超时，默认30秒
                    verify=False,  # 忽略SSL验证
                    allow_redirects=True
                )
                
                # 检查响应状态
                if response.status_code == 200:
                    response.encoding = 'utf-8'
                    final_url = response.url  # 获取最终URL（经过HTTP重定向）
                    
                    if self._is_garbage_content(response.text):
                        print(f"✗ 页面内容疑似乱码，重试: {url}", flush=True)
                        continue

                    # 进一步检查meta refresh或其他转向机制
                    # t66y的read.php?tid= 页面使用 meta refresh 来转向到实际的htm_data页面
                    try:
                        meta_final_url = extract_meta_refresh_url(response.text, final_url)
                        if meta_final_url and meta_final_url != final_url:
                            final_url = meta_final_url
                            print(f"✓ 成功获取页面（已跟踪meta转向）: {url} → {final_url}", flush=True)
                        elif final_url != url:
                            print(f"✓ 成功获取页面（已跟踪重定向）: {url} → {final_url}", flush=True)
                        else:
                            print(f"✓ 成功获取页面: {url}", flush=True)
                    except Exception as parse_error:
                        # 如果解析失败，继续使用HTTP重定向的URL
                        if final_url != url:
                            print(f"✓ 成功获取页面（已跟踪重定向）: {url} → {final_url}", flush=True)
                        else:
                            print(f"✓ 成功获取页面: {url}", flush=True)
                    
                    return {
                        'html': response.text,
                        'url': final_url
                    }
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
    
    def extract_page_numbers(self, html, max_allowed_pages=1000):
        """从HTML中提取总页数 - 带最大页数限制（实现见 lib/url_utils）"""
        return extract_page_numbers(html, max_allowed_pages)

    def has_next_page(self, html, current_page):
        """检查当前页是否有下一页链接（实现见 lib/url_utils）"""
        return has_next_page(html, current_page)

    def extract_tid_from_url(self, url):
        """从URL中提取 thread ID（实现见 lib/url_utils）"""
        return extract_tid_from_url(url)

    def build_pagination_url(self, original_url, page_num):
        """为给定页码构建URL（实现见 lib/url_utils）"""
        return build_pagination_url(original_url, page_num)
    
    def _is_garbage_content(self, html):
        """检测内容是否为不可解析的乱码（实现见 lib/text_utils.is_garbage_content）"""
        return is_garbage_content(html)

    def extract_post_links_from_section(self, html):
        """从版块页面中提取所有帖子链接（优先提取h3中的帖子入口链接）"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            post_links = []
            
            # 策略：优先查找 <h3><a> 中的帖子入口链接
            # 这样可以直接获取 /htm_data/ 格式的实际页面URL，与单贴采集保持一致
            h3_links = soup.find_all('h3')
            
            for h3 in h3_links:
                a_tag = h3.find('a', href=True)
                if a_tag:
                    href = a_tag.get('href', '')
                    # 帖子入口链接格式通常是 /htm_data/xxxx/yy/zzzzzzzz.html
                    if href and (href.startswith('/htm_data/') or href.startswith('htm_data/')):
                        # 构建完整URL
                        full_url = urljoin('https://t66y.com/', href)
                        # 提取tid以确保唯一性
                        tid = self.extract_tid_from_url(full_url)
                        if tid:
                            # 检查是否在黑名单中（置顶规则帖子）
                            if tid in self.PINNED_POST_BLACKLIST:
                                print(f"  ⏭ 跳过置顶规则帖子: {full_url}", flush=True)
                                continue
                            
                            post_links.append(full_url)
                            print(f"  ✓ 从<h3>中提取帖子链接: {full_url}", flush=True)
            
            # 备选方案：如果<h3>中没有找到足够的链接，再扫描其他<a>标签
            # （这样可以处理论坛HTML结构变化的情况）
            if len(post_links) < 5:
                print(f"  ℹ <h3>中仅找到{len(post_links)}个链接，扫描其他位置...", flush=True)
                link_elements = soup.find_all('a', href=True)
                
                for link in link_elements:
                    # 跳过已经在post_links中的
                    href = link.get('href', '')
                    if not href:
                        continue
                    
                    full_url = urljoin('https://t66y.com/', href)
                    
                    # 查找 /read.php?tid= 格式的转向链接（这些会重定向到实际页面）
                    if href.startswith('/read.php?tid='):
                        # 检查是否已经有对应的htm_data版本
                        tid = self.extract_tid_from_url(full_url)
                        if tid:
                            # 检查是否在黑名单中（置顶规则帖子）
                            if tid in self.PINNED_POST_BLACKLIST:
                                print(f"  ⏭ 跳过置顶规则帖子: {full_url}", flush=True)
                                continue
                            
                            # 检查是否已存在
                            already_exists = any(f'/{tid}.' in link for link in post_links)
                            if not already_exists:
                                print(f"  ℹ 检测到转向链接 {full_url}，使用fetch_page跟踪重定向...", flush=True)
                                # 通过 fetch_page 获取实际的HTML
                                post_page_html = self.fetch_page(full_url)
                                if post_page_html:
                                    post_links.append(full_url)
                                    print(f"    ✓ 已记录转向链接: {full_url}", flush=True)
                    elif (href.startswith('/htm_data/') or href.startswith('htm_data/')):
                        # 直接 htm_data 格式链接
                        tid = self.extract_tid_from_url(full_url)
                        if tid:
                            # 检查是否在黑名单中（置顶规则帖子）
                            if tid in self.PINNED_POST_BLACKLIST:
                                print(f"  ⏭ 跳过置顶规则帖子: {full_url}", flush=True)
                                continue
                            
                            # 避免重复
                            if full_url not in post_links:
                                post_links.append(full_url)
            
            # 去重
            unique_links = list(set(post_links))
            print(f"✓ 从版块提取到 {len(unique_links)} 个帖子链接（直接获取htm_data入口）", flush=True)
            return unique_links
        except Exception as e:
            print(f"⚠ 提取帖子链接失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return []
    
    def fetch_section_page_with_retry(self, url, max_garbage_retries=5, request_timeout=60):
        """获取版块页面内容，带乱码检测和重试机制
        
        当网站返回不可解析的乱码内容时，自动重试获取页面。
        
        Args:
            url: 版块页面URL
            max_garbage_retries: 检测到乱码时的最大重试次数，默认5次
            request_timeout: HTTP请求超时时间(秒)
            
        Returns:
            str: 页面HTML内容，如果所有重试都失败则返回 None
        """
        import time
        import random
        
        for retry_count in range(max_garbage_retries + 1):  # +1 包括初始请求
            if retry_count > 0:
                # 重试时使用更长的等待时间
                retry_delay = random.uniform(3, 8)
                print(f"🔄 乱码重试 {retry_count}/{max_garbage_retries}，等待 {retry_delay:.1f} 秒后重新请求...", flush=True)
                time.sleep(retry_delay)
            
            # 获取页面
            html = self.fetch_page(url, request_timeout=request_timeout)
            
            if not html:
                print(f"⚠ 获取页面失败: {url}", flush=True)
                continue
            
            # 检测是否为乱码内容
            if self._is_garbage_content(html):
                if retry_count < max_garbage_retries:
                    print(f"⚠ 检测到乱码内容，将进行重试...", flush=True)
                    continue
                else:
                    print(f"✗ 已达到最大重试次数 ({max_garbage_retries})，仍然是乱码内容", file=sys.stderr, flush=True)
                    return None
            
            # 内容正常，返回
            if retry_count > 0:
                print(f"✓ 第 {retry_count} 次重试成功获取有效内容", flush=True)
            return html
        
        return None
    
    def build_section_pagination_url(self, section_url, page_num):
        """为版块构建分页URL（实现见 lib/url_utils）"""
        return build_section_pagination_url(section_url, page_num)

    def extract_page_from_url(self, url):
        """从URL中提取page参数值（实现见 lib/url_utils）"""
        return extract_page_from_url(url)
    
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
            
            # 检查URL是否包含page=e（最后一页）或具体页码
            current_page_num = 1
            if 'page=e' in url:
                # 这是最后一页，需要获取总页数并从第一页开始
                print(f"⚠ 检测到URL是最后一页（page=e），先获取总页数", flush=True)
                total_pages = self.extract_page_numbers(html)
                print(f"📊 检测到总页数: {total_pages}", flush=True)
                
                # 构建第一页URL
                first_page_url = self.build_pagination_url(url, 1)
                if first_page_url:
                    print(f"⏳ 等待 2.0 秒后请求第一页...", flush=True)
                    import time
                    time.sleep(2.0)
                    first_page_html = self.fetch_page(first_page_url)
                    if first_page_html:
                        print(f"📄 开始提取第一页内容...", flush=True)
                        all_content_parts, all_images = self._extract_page_content(
                            first_page_html, all_content_parts, all_images, page_num=1, task_type=task_type
                        )
                    else:
                        print(f"⚠ 无法获取第一页内容，使用当前页作为第一页", flush=True)
                        print(f"📄 开始提取第一页内容...", flush=True)
                        all_content_parts, all_images = self._extract_page_content(
                            html, all_content_parts, all_images, page_num=1, task_type=task_type
                        )
                else:
                    print(f"⚠ 无法构建第一页URL，使用当前页作为第一页", flush=True)
                    print(f"📄 开始提取第一页内容...", flush=True)
                    all_content_parts, all_images = self._extract_page_content(
                        html, all_content_parts, all_images, page_num=1, task_type=task_type
                    )
            else:
                # 正常情况，当前页是第一页
                print(f"📄 开始提取第一页内容...", flush=True)
                all_content_parts, all_images = self._extract_page_content(
                    html, all_content_parts, all_images, page_num=1, task_type=task_type
                )

            
            # 检测总页数
            total_pages = self.extract_page_numbers(html)
            print(f"📊 检测到总页数: {total_pages}", flush=True)
            
            # 如果有多页，逐页获取内容
            if total_pages > 1:
                print(f"🔄 多分页模式：开始遍历第 2-{total_pages} 页...", flush=True)
                # 限制最大遍历页数，避免过多请求
                max_crawl_pages = min(total_pages, 1000)
                for page_num in range(2, max_crawl_pages + 1):
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
                    print(f"  → 第 {page_num}/{total_pages} 页: 提取中...", flush=True)
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
                content = f"{title}\n" + ''.join(formatted_parts)
            else:
                content = title + ' 暂无内容'
            
            # 输出标题，供后端解析并更新任务名称
            print(f"TITLE:{title}", flush=True)
            
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
        """从单个页面HTML中提取内容和图片 - 支持多种选择器"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            content_divs = []
            
            # 对于 t66y 论坛，优先使用 tpc_content 选择器（t66y 专用）- 这是最可靠的
            divs = soup.find_all('div', class_='tpc_content')
            if divs:
                divs = [d for d in divs if len(d.get_text(strip=True)) > 0]
                if divs:
                    content_divs = divs
                    print(f"✓ 使用选择器: div.tpc_content (找到 {len(divs)} 个容器)", flush=True)
            
            # 1. 如果没找到，尝试  id="conttpc" 
            if not content_divs:
                div = soup.find('div', id='conttpc')
                if div and len(div.get_text(strip=True)) > 1:  # 图片帖子内容可能较少，降低阈值
                    content_divs = [div]
                    print(f"✓ 使用选择器: div#conttpc (t66y 专用)", flush=True)
            
            # 2. 尝试通过 id 属性查找
            if not content_divs:
                id_selectors = ['conttpc', 'content', 'post-content', 'main-content', 'article-content', 'tpc_content']
                for id_name in id_selectors:
                    div = soup.find('div', id=id_name)
                    if div and len(div.get_text(strip=True)) > 100:
                        content_divs = [div]
                        print(f"✓ 使用选择器: div#{id_name}", flush=True)
                        break
            
            # 3. 尝试其他常见的class选择器
            if not content_divs:
                class_selectors = ['post-content', 'content', 'message', 'article-content', 
                                  'post-body', 'post-text', 'thread-content', 'reply-content']
                for class_name in class_selectors:
                    divs = soup.find_all('div', class_=class_name)
                    if divs:
                        divs = [d for d in divs if len(d.get_text(strip=True)) > 100]
                        if divs:
                            content_divs = divs
                            print(f"✓ 使用选择器: div.{class_name} (找到 {len(divs)} 个容器)", flush=True)
                            break
            
            # 4. 尝试通过 data-* 属性查找
            if not content_divs:
                divs = soup.find_all('div', attrs={'data-content': True})
                if divs:
                    divs = [d for d in divs if len(d.get_text(strip=True)) > 100]
                    if divs:
                        content_divs = divs
                        print(f"✓ 使用选择器: div[data-content] (找到 {len(divs)} 个容器)", flush=True)
            
            # 5. 尝试 HTML5 语义标签
            if not content_divs:
                for tag in ['article', 'main', 'section']:
                    divs = soup.find_all(tag)
                    if divs:
                        divs = [d for d in divs if len(d.get_text(strip=True)) > 100]
                        if divs:
                            content_divs = divs
                            print(f"✓ 使用选择器: {tag} (找到 {len(divs)} 个容器)", flush=True)
                            break
            
            # 6. 作为最后手段，按文本长度查找最大的容器
            # if not content_divs:
            #     print(f"⚠ 标准选择器未找到内容，尝试按文本长度搜索...", flush=True)
                
            #     # 查找所有包含文本的 div
            #     all_divs = soup.find_all('div')
            #     divs_with_text = []
            #     for d in all_divs:
            #         text_len = len(d.get_text(strip=True))
            #         if 100 < text_len < 100000:  # 避免过大的容器（可能是整个页面）
            #             divs_with_text.append((d, text_len))
                
            #     if divs_with_text:
            #         divs_with_text.sort(key=lambda x: x[1], reverse=True)
            #         print(f"  找到 {len(divs_with_text)} 个可能的内容容器", flush=True)
            #         print(f"  最大容器大小: {divs_with_text[0][1]} 字符", flush=True)
                    
            #         # 取前3-5个最大的 div（避免嵌套的重复）
            #         candidates = []
            #         for div, text_len in divs_with_text[:10]:
            #             # 检查是否是其他候选的父节点
            #             is_parent = False
            #             for candidate_div, _ in candidates:
            #                 if candidate_div in div.descendants:
            #                     is_parent = True
            #                     break
            #             if not is_parent:
            #                 candidates.append((div, text_len))
            #             if len(candidates) >= 3:
            #                 break
                    
            #         content_divs = [d[0] for d in candidates]
            #         print(f"  使用备选容器: {len(content_divs)} 个", flush=True)
            
            # 提取内容
            if content_divs:
                for floor_idx, content_div in enumerate(content_divs, 1):
                    # 提取文本内容（<br>→换行、段落规范化，见 lib/text_utils）
                    text_content = extract_text_content(content_div)

                    if text_content:
                        
                        # 过滤掉过短的内容（可能是导航等垃圾内容）
                        if len(text_content) > 50:
                            # 为小说类型添加楼层标识
                            if task_type == 'novel':
                                floor_header = f"\n【第{floor_idx}楼】\n"
                                text_content = floor_header + text_content
                            
                            print(f"  ✓ 楼层 {floor_idx}: 提取 {len(text_content)} 字符", flush=True)
                            content_parts.append(text_content)
                        else:
                            print(f" × 楼层 {floor_idx}: 提取 {len(text_content)} 字符，不足 50 字符，被过滤", flush=True)
                    
                    # 提取图片
                    img_elements = content_div.find_all('img')
                    for img_idx, img in enumerate(img_elements, 1):
                        # 检查图片是否在用户卡片中（用户卡片特征：<th width="230">）
                        # 这样可以过滤掉头像而不破坏HTML结构
                        if img.find_parent('th', attrs={'width': '230'}):
                            print(f"    ⊘ 图片 {img_idx} 被过滤 (在用户卡片中): {img.get('src', '')[:80]}...", flush=True)
                            continue
                        
                        # 尝试多个属性获取图片 URL
                        img_url = (
                            img.get('ess-data') or 
                            img.get('src') or 
                            img.get('data-src') or
                            img.get('data-original') or
                            img.get('data-lazy-src')
                        )
                        
                        if img_url and img_url.startswith('http'):
                            # 过滤掉明确的表情、头像、图标等无关图片
                            # 只过滤明确的小图片URL特征，避免误杀
                            unwanted_patterns = [
                                r'emotion[/._-]',      # 表情文件夹
                                r'emoticon[/._-]',     # 表情符号
                                r'icon[/._-]',         # 图标
                                r'avatar[/._-]',       # 头像
                                r'face[/._-]',         # 脸部
                                r'emoji[/._-]',        # emoji
                                r'/avatar/',           # 头像文件夹
                                r'/static/.*avatar',   # 静态头像
                                r'avatar\.',           # avatar.png 等
                            ]
                            
                            should_skip = False
                            for pattern in unwanted_patterns:
                                if re.search(pattern, img_url, re.IGNORECASE):
                                    print(f"    ⊘ 图片 {img_idx} 被过滤 (URL 匹配无关特征): {img_url[:80]}...", flush=True)
                                    should_skip = True
                                    break
                            
                            if should_skip:
                                continue
                            
                            # 检查图片尺寸属性，如果明确标注为很小的图片则过滤
                            width = img.get('width', '')
                            height = img.get('height', '')
                            try:
                                # 尝试提取数值
                                width_val = int(width) if width and width.isdigit() else 0
                                height_val = int(height) if height and height.isdigit() else 0
                                # 如果图片宽高都很小（小于 100px），认为是小图标
                                if width_val > 0 and height_val > 0 and width_val < 100 and height_val < 100:
                                    print(f"    ⊘ 图片 {img_idx} 被过滤 (尺寸过小 {width_val}x{height_val}): {img_url[:80]}...", flush=True)
                                    continue
                            except:
                                pass
                            
                            # 避免重复添加同一张图片
                            if img_url not in [img['url'] for img in images]:
                                images.append({
                                    'url': img_url,
                                    'description': f'第{page_num}页 楼层{floor_idx} 图片{img_idx}'
                                })
                                print(f"    ✓ 图片 {img_idx}: {img_url[:80]}...", flush=True)
            else:
                print(f"⚠ 页面 {page_num}: 未能找到任何内容容器，检查 HTML 结构；内容预览：{html[:100]}", flush=True)
            
            return content_parts, images
        except Exception as e:
            print(f"⚠ 提取页面内容失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return content_parts, images
    
    def _save_post(self, post_data, forum_url, task_type, forum_last_post_time=None):
        """保存单个帖子到数据库
        
        Args:
            post_data: 帖子数据
            forum_url: 帖子URL
            task_type: 任务类型
            forum_last_post_time: 论坛上该帖最后一条回复的时间
        """
        try:
            # 初始化图片目录
            initialize_image_dirs()

            # 计算内容哈希值
            content_hash = self._calculate_content_hash(post_data['content'])
            content_length = len(post_data['content'])
            if content_hash:
                print(f"✓ 内容哈希: {content_hash}", flush=True)
            print(f"✓ 内容长度: {content_length} 字符", flush=True)

            # 媒体处理与内容替换（纯逻辑委托 lib/post_builder，下载函数注入）
            media, content_override = build_media_and_content(
                post_data, task_type, self.task_id, download_images
            )
            if content_override is not None:
                post_data['content'] = content_override

            # 构建 MongoDB 文档与 upsert 载荷（纯逻辑委托 lib/post_builder）
            post = build_post_document(
                post_data, forum_url, task_type, self.task_id, self.user_id,
                content_hash, content_length, forum_last_post_time, media,
            )

            # 保存到数据库（upsert 方式，避免重复键错误）
            try:
                self.posts_collection.update_one(
                    {'sourceUrl': forum_url},  # 查询条件
                    build_upsert_updates(post),
                    upsert=True  # 如果不存在则插入
                )
                print(f"✓ 文章已保存: {post['title']}", flush=True)
                return True
            except Exception as e:
                print(f"✗ 保存数据库失败: {e}", file=sys.stderr, flush=True)
                import traceback
                traceback.print_exc()
                return False
        except Exception as e:
            print(f"✗ 保存帖子失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return False
    
    def _is_post_exist(self, post_url, content_hash=None, content_length=None):
        """检查帖子是否已经存在于数据库中（支持内容长度判断和内容哈希去重）
        
        Args:
            post_url: 帖子URL
            content_hash: 内容哈希值（如果提供，优先使用）
            content_length: 新爬取的内容长度（字符数）
            
        Returns:
            {
                'exists': bool,
                'reason': str,  # duplicate|same_url|content_duplicate|shorter_content
                'message': str,
                'shouldUpdate': bool?  # 是否应该覆盖更新
            }
        """
        try:
            url_post = self.posts_collection.find_one({'sourceUrl': post_url})

            # 内容哈希撞车查询仅在 URL 未命中时进行（保持原有语义）
            content_duplicate = None
            if not url_post and content_hash:
                content_duplicate = self.posts_collection.find_one({'contentHash': content_hash})

            # 判定逻辑下沉 lib/dedup（纯函数，语义与原实现一致）
            return evaluate_duplicate(url_post, content_duplicate, content_hash, content_length)
        except Exception as e:
            print(f"⚠ 检查帖子是否存在失败: {e}", file=sys.stderr, flush=True)
            return {
                'exists': False,
                'reason': None,
                'message': None
            }
    
    def crawl_forum(self, forum_url, task_type='image', max_depth=1, max_pages=10, crawl_type='single', start_page=1):
        """爬取论坛内容 - 支持单帖和批量采集"""
        try:
            print(f"开始爬虫任务 {self.task_id}", flush=True)
            print(f"URL: {forum_url}", flush=True)
            print(f"Type: {task_type}", flush=True)
            print(f"Max Pages: {max_pages}", flush=True)
            print(f"Start Page: {start_page}", flush=True)
            
            # 根据参数直接使用is_batch，而不是通过URL判断
            is_batch = (crawl_type == 'batch')
            
            total_posts = 0
            crawled_count = 0
            skipped_count = 0
            failed_count = 0
            skip_details = []  # 记录跳过原因
            
            if is_batch:
                print("🔄 批量采集模式: 开始逐页爬取版块帖子", flush=True)
                
                # 智能提取起始页码：优先使用显式参数，否则从URL中提取
                # 如果 start_page 是默认值1且URL中有page参数，则使用URL中的页码
                current_page = start_page
                if start_page == 1:
                    # 检查URL中是否有page参数
                    url_page = self.extract_page_from_url(forum_url)
                    if url_page is not None:
                        current_page = url_page
                        print(f"📍 从URL中提取页码: {url_page}，作为起始页", flush=True)
                
                # 获取版块指定起始页面（批量采集使用60秒超时以处理网络延迟）
                # 始终使用 build_section_pagination_url 来正确处理 page 参数
                # 即使是第一页也要调用，确保URL中的 page 参数被正确替换或添加
                start_url = self.build_section_pagination_url(forum_url, current_page)
                
                print(f"📄 从第 {current_page} 页开始爬取: {start_url}", flush=True)
                
                html = self.fetch_section_page_with_retry(start_url, request_timeout=60)
                if not html:
                    print(f"✗ 无法获取版块第 {current_page} 页内容（重试后失败）", file=sys.stderr, flush=True)
                    return {
                        'success': False,
                        'task_id': self.task_id,
                        'error': f'无法获取版块第 {current_page} 页内容（重试后失败）',
                    }
                
                # 提取起始页的帖子链接
                all_post_links = self.extract_post_links_from_section(html)
                
                # 逐页采集，而不是一次性决定总页数
                print(f"📋 采用逐页采集模式，从第 {start_page} 页开始，最多采集 {max_pages} 页", flush=True)
                
                # 循环采集多页，直到没有下一页或达到最大页数
                pages_crawled = 1  # 已经爬取的页数（包括起始页）
                while pages_crawled < max_pages:
                    # 检查当前页是否有下一页
                    has_next = self.has_next_page(html, current_page)
                    
                    if not has_next:
                        print(f"✓ 版块第 {current_page} 页没有下一页链接，采集完毕", flush=True)
                        break
                    
                    # 构建下一页URL并获取
                    next_page_num = current_page + 1
                    section_page_url = self.build_section_pagination_url(forum_url, next_page_num)
                    print(f"📄 开始爬取版块第 {next_page_num} 页: {section_page_url}", flush=True)
                    
                    section_page_html = self.fetch_section_page_with_retry(section_page_url, request_timeout=60)
                    if not section_page_html:
                        print(f"⚠ 无法获取版块第 {next_page_num} 页（重试后失败），停止采集", flush=True)
                        break
                    
                    # 提取该页的帖子链接
                    page_links = self.extract_post_links_from_section(section_page_html)
                    
                    if not page_links:
                        print(f"⚠ 版块第 {next_page_num} 页没有帖子链接，停止采集", flush=True)
                        break
                    
                    all_post_links.extend(page_links)
                    html = section_page_html  # 更新为当前页内容，用于下次检查
                    current_page = next_page_num
                    pages_crawled += 1
                    
                    # 随机延迟避免被封（延长到3-5秒）
                    import time
                    import random
                    delay = random.uniform(3, 5)
                    print(f"⏳ 处理完版块第 {current_page} 页后等待 {delay:.1f} 秒...", flush=True)
                    time.sleep(delay)
                
                print(f"📊 共采集版块 {current_page} 页", flush=True)
                
                # 去重
                unique_post_links = list(set(all_post_links))
                total_posts = len(unique_post_links)
                print(f"📋 准备爬取 {total_posts} 个帖子", flush=True)
                
                # 爬取每个帖子
                for i, post_url in enumerate(unique_post_links, 1):
                    print(f"\n🔍 正在处理帖子 {i}/{total_posts}: {post_url}", flush=True)
                    
                    # 先进行快速的URL检查
                    quick_check = self.posts_collection.find_one({'sourceUrl': post_url})
                    if quick_check and quick_check.get('contentHash'):
                        # URL存在且有内容哈希，直接检查是否真正重复
                        print(f"📋 帖子URL已存在，先获取内容计算哈希进行完整检查...", flush=True)
                    else:
                        print(f"📋 帖子未存在或无哈希信息，继续采集...", flush=True)
                    
                    # 更新进度
                    progress = int((i / total_posts) * 100)
                    print(f"PROGRESS:{progress}", flush=True)
                    
                    # 获取帖子页面，并跟踪重定向后的最终URL（批量采集使用60秒超时）
                    result = self.fetch_page_with_final_url(post_url, request_timeout=60)
                    if not result:
                        print(f"⚠ 无法获取帖子内容，跳过: {post_url}", flush=True)
                        failed_count += 1
                        skip_details.append({
                            'url': post_url,
                            'reason': 'network_error',
                            'message': '无法获取页面内容'
                        })
                        continue
                    
                    post_html = result['html']
                    final_post_url = result['url']  # 获取重定向后的最终URL
                    
                    if final_post_url != post_url:
                        print(f"📌 使用重定向后的最终URL: {final_post_url}", flush=True)
                        actual_post_url = final_post_url
                    else:
                        actual_post_url = post_url
                    
                    # 解析帖子
                    post_data = self.parse_t66y_post(actual_post_url, post_html, task_type)
                    if not post_data:
                        print(f"⚠ 解析帖子失败，跳过: {actual_post_url}", flush=True)
                        failed_count += 1
                        skip_details.append({
                            'url': actual_post_url,
                            'reason': 'parse_failed',
                            'message': '解析帖子失败'
                        })
                        continue
                    
                    # 计算内容哈希值
                    content_hash = self._calculate_content_hash(post_data['content'])
                    content_length = len(post_data['content'])
                    
                    # 现在进行基于内容长度和哈希的检查
                    check_result = self._is_post_exist(actual_post_url, content_hash, content_length)
                    if check_result['exists']:
                        print(f"📋 帖子已存在（原因: {check_result['reason']}），跳过: {actual_post_url}", flush=True)
                        skipped_count += 1
                        skip_details.append({
                            'url': actual_post_url,
                            'reason': check_result['reason'],
                            'message': check_result['message']
                        })
                        # 跳过也要延迟
                        import time
                        import random
                        delay = random.uniform(2, 4)
                        print(f"⏳ 跳过帖子后等待 {delay:.1f} 秒...", flush=True)
                        time.sleep(delay)
                        continue
                    
                    # 检查是否需要更新
                    if check_result.get('shouldUpdate'):
                        print(f"📝 检测到URL相同但内容更新，准备覆盖更新: {actual_post_url}", flush=True)
                    
                    # 保存帖子时使用最终的URL
                    if self._save_post(post_data, actual_post_url, task_type):
                        crawled_count += 1
                        print(f"CRAWLED:{crawled_count}", flush=True)
                        
                        # 批量模式下，使用第一个帖子的标题作为任务名称
                        if total_posts > 1 and crawled_count == 1:
                            print(f"TITLE:{post_data['title']}", flush=True)
                    
                    # 随机延迟避免被封（延长到3-5秒）
                    import time
                    import random
                    delay = random.uniform(3, 5)
                    print(f"⏳ 处理完帖子后等待 {delay:.1f} 秒...", flush=True)
                    time.sleep(delay)
            else:
                print("📄 单帖采集模式: 开始爬取单个帖子", flush=True)
                total_posts = 1
                
                # 获取页面，并跟踪最终URL
                result = self.fetch_page_with_final_url(forum_url)
                if not result:
                    print(f"✗ 无法获取页面内容", file=sys.stderr, flush=True)
                    return {
                        'success': False,
                        'task_id': self.task_id,
                        'error': '无法获取页面内容',
                    }
                
                post_html = result['html']
                final_forum_url = result['url']  # 获取重定向后的最终URL
                
                if final_forum_url != forum_url:
                    print(f"📌 使用转向后的最终URL: {final_forum_url}", flush=True)
                    actual_forum_url = final_forum_url
                else:
                    actual_forum_url = forum_url
                
                # 解析页面（获取所有页面的楼主内容）
                post_data = self.parse_t66y_post(actual_forum_url, post_html, task_type)
                if not post_data:
                    print(f"✗ 解析页面失败", file=sys.stderr, flush=True)
                    return {
                        'success': False,
                        'task_id': self.task_id,
                        'error': '解析页面失败',
                    }
                
                # 计算内容哈希值
                content_hash = self._calculate_content_hash(post_data['content'])
                content_length = len(post_data['content'])
                
                # 检查帖子是否已存在（基于内容长度和哈希）
                check_result = self._is_post_exist(actual_forum_url, content_hash, content_length)
                if check_result['exists']:
                    print(f"📋 帖子已存在（原因: {check_result['reason']}），跳过: {actual_forum_url}", flush=True)
                    return {
                        'success': True,
                        'task_id': self.task_id,
                        'total_posts': 1,
                        'crawled_posts': 0,
                        'skipped_posts': 1,
                        'skip_details': [{
                            'url': actual_forum_url,
                            'reason': check_result['reason'],
                            'message': check_result['message']
                        }],
                        'message': '帖子已存在，跳过爬取'
                    }
                
                # 检查是否需要更新
                if check_result.get('shouldUpdate'):
                    print(f"📝 检测到URL相同但内容更新，准备覆盖更新: {actual_forum_url}", flush=True)
                
                # 保存帖子时使用最终的URL
                if self._save_post(post_data, actual_forum_url, task_type):
                    crawled_count = 1
                    print(f"CRAWLED:1", flush=True)
            
            print(f"\n🎉 爬虫任务完成!", flush=True)
            print(f"📊 总帖子数: {total_posts}, 成功爬取: {crawled_count}, 跳过已存在: {skipped_count}, 失败: {failed_count}", flush=True)
            
            return {
                'success': True,
                'task_id': self.task_id,
                'total_posts': total_posts,
                'crawled_posts': crawled_count,
                'skipped_posts': skipped_count,
                'failed_posts': failed_count,
                'skip_details': skip_details,
                'message': '爬虫任务完成'
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
        if self.client is not None:
            self.client.close()

def main():
    """主入口"""
    parser = argparse.ArgumentParser(description='Forum Crawler')
    parser.add_argument('--url', required=True, help='论坛 URL')
    parser.add_argument('--type', default='mixed', help='爬虫类型 (novel, image, mixed)')
    parser.add_argument('--task-id', required=True, help='任务 ID')
    parser.add_argument('--crawl-type', default='single', help='采集类型 (single, batch)')
    parser.add_argument('--max-depth', type=int, default=1, help='最大深度')
    parser.add_argument('--delay', type=int, default=1000, help='请求延迟')
    parser.add_argument('--timeout', type=int, default=600000, help='超时时间 (ms)')
    parser.add_argument('--max-pages', type=int, default=10, help='最大爬取页数 (针对批量采集)')
    parser.add_argument('--start-page', type=int, default=1, help='起始页码 (针对批量采集，默认为1)')
    
    args = parser.parse_args()
    # C4：任务日志统一落盘
    setup_task_logging(args.task_id)

    
    # 获取 MongoDB URI
    mongodb_uri = os.environ.get(
        'MONGODB_URI',
        'mongodb://admin:admin123@mongo:27017/forum-crawler?authSource=admin'
    )
    
    crawler = None
    try:
        crawler = ForumCrawler(args.task_id, mongodb_uri)
        result = crawler.crawl_forum(args.url, args.type, args.max_depth, args.max_pages, args.crawl_type, args.start_page)
        
        if result['success']:
            print(f"CRAWLED:{result.get('crawled_posts', 0)}", flush=True)
            # 输出 JSON 格式的结果，以便后端解析详细信息
            import json
            print(f"RESULT:{json.dumps(result)}", flush=True)
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
