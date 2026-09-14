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

# 确保爬虫脚本所在目录在 sys.path 中：
# 后端经 child_process.spawn 从 /app/backend 启动本脚本时，
# 部分容器/解释器组合不会把脚本目录加入 sys.path[0]，导致 `from lib.xxx` 报 ModuleNotFoundError。
# 这里显式插入，保证本地直跑、Docker、任意 cwd 下均可解析 lib 包与 image_downloader。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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
from pymongo import MongoClient, UpdateOne
from pymongo.errors import BulkWriteError
from bson import ObjectId

# 导入图片下载器
from image_downloader import download_images, initialize_image_dirs
from lib.dedup import evaluate_duplicate, SKIP, UPDATE, LEGACY_NO_LENGTH
from lib.post_builder import build_media_and_content, build_post_document, build_upsert_updates, dedupe_by_source_url, derive_post_identity
from lib.pause_gate import wait_while_paused

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(message)s')

# 批量写库缓冲大小（C2）：攒够一批后 bulk_write，减少逐条 update_one 的网络往返
POST_WRITE_BATCH_SIZE = 20

# 暂停闸门轮询间隔（秒）：任务被暂停后，爬虫在帖子/分页边界阻塞，按此间隔轮询恢复状态
PAUSE_POLL_INTERVAL = 3


def _log_duplicate_decision(url_post, result, content_length):
    """输出去重判定的人工排查日志（lib.dedup 是无副作用纯函数，日志由调用方负责）。"""
    # 旧记录既无 contentLength 也无正文可推算长度（回填前历史数据）
    if result.get('detail') == LEGACY_NO_LENGTH:
        print(f"⚠ 现有记录无长度信息（旧数据），新内容长度：{content_length} 字符，将继续用内容哈希进行检查", flush=True)

    # 旧记录缺 contentLength 时才走的正文长度兜底比对（正常记录只信哈希）
    if (
        content_length is not None
        and url_post
        and url_post.get('contentLength') is None
        and url_post.get('content')
    ):
        old_length = len(url_post['content'])
        print(f"📏 内容长度对比（旧：{old_length} → 新：{content_length}）", flush=True)
        if result['action'] == UPDATE:
            print(f"📏 新内容更长，准备覆盖更新", flush=True)
        elif result['reason'] == 'unchanged':
            print(f"📏 内容长度相同，帖子未更新，快速跳过", flush=True)
        elif result['reason'] == 'shorter_content':
            print(f"📏 新内容更短，保留原内容", flush=True)


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

    def _read_pause_state(self):
        """暂停闸门状态读取：返回 (exists, status)
        - 任务不存在：(False, None)
        - 读取异常：(True, None)——入口按非暂停放行，等待期间下周期复查
        """
        try:
            task = self.db['crawlertasks'].find_one(
                {'_id': ObjectId(self.task_id)}, {'status': 1}
            )
            if task is None:
                return False, None
            return True, task.get('status')
        except Exception as e:
            print(f"⚠ 读取任务暂停状态失败: {e}", file=sys.stderr, flush=True)
            return True, None

    def wait_if_paused(self):
        """暂停闸门：任务 paused 时在当前安全边界（帖子/分页之间）挂起，
        恢复（running）后继续。阻塞期间不发起任何抓取请求；纯逻辑见 lib/pause_gate.py。
        PAUSED:/RESUMED: 行同时供后端 crawlerExecutor 冻结/恢复执行超时计时。
        """
        wait_while_paused(
            self._read_pause_state,
            poll_interval=PAUSE_POLL_INTERVAL,
            on_pause=lambda: print(
                "⏸ PAUSED:任务已暂停，爬虫在安全边界挂起，等待恢复...", flush=True
            ),
            on_resume=lambda: print("▶ RESUMED:暂停已解除，继续采集", flush=True),
        )

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
            'Accept-Encoding': 'gzip, deflate',
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
    
    @staticmethod
    def _detect_site(url):
        """根据 URL 域名识别采集站点。

        Returns:
            'crazyhome' | 't66y'（未知站点默认 t66y，保持原有行为）
        """
        if not url:
            return 't66y'
        if 'crazyhome2000.com' in url:
            return 'crazyhome'
        return 't66y'

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
                elif 'crazyhome2000.com' in url:
                    headers['Referer'] = 'https://www.crazyhome2000.com/'
                
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

    def extract_post_links_from_section(self, html, section_url=None):
        """从版块/分类页面中提取所有帖子/文章链接。

        按站点分发：crazyhome 走 _extract_crazyhome_post_links，其余走 t66y 逻辑。
        section_url 用于站点识别；未提供时回退到从 HTML 内容识别。
        """
        # 站点识别
        site = self._detect_site(section_url) if section_url else (
            'crazyhome' if (html and 'crazyhome2000.com' in html) else 't66y'
        )
        if site == 'crazyhome':
            return self._extract_crazyhome_post_links(html)

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
            
            # 去重（保序：上游已按页面顺序追加，dict.fromkeys 兜底且不打乱顺序）
            unique_links = list(dict.fromkeys(post_links))
            print(f"✓ 从版块提取到 {len(unique_links)} 个帖子链接（直接获取htm_data入口）", flush=True)
            return unique_links
        except Exception as e:
            print(f"⚠ 提取帖子链接失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return []

    def _extract_crazyhome_post_links(self, html):
        """从 crazyhome 分类/标签归档页提取文章链接列表。

        仅提取主内容区（<main>）内的文章固定链接 a[rel=bookmark]：
        主题在 li.item > h3.item-title > a[rel=bookmark] 中渲染当前归档的文章，
        而侧栏「近期文章」等推荐位的链接没有 rel=bookmark，天然被排除，
        避免把跨版块的推荐文章误采进当前任务。

        文章 URL 形如 https://www.crazyhome2000.com/<标题slug>/
        主选择器失效（主题改版）时，逐级回退到全页 bookmark、再到旧的启发式扫描。
        """
        try:
            soup = BeautifulSoup(html, 'html.parser')

            # 1) 首选：<main> 内的文章固定链接（分类页/标签页均命中，推荐位无 rel=bookmark）
            anchors = []
            main = soup.find('main')
            if main:
                anchors = main.select("a[rel~='bookmark']")
            # 2) 回退：全页 rel=bookmark
            if not anchors:
                anchors = soup.select("a[rel~='bookmark']")

            post_links = []
            seen = set()
            for a in anchors:
                href = (a.get('href') or '').strip()
                if not href or 'crazyhome2000.com/' not in href:
                    continue
                txt = a.get_text(strip=True)
                if not txt or len(txt) < 2:
                    continue
                if href in seen:
                    continue
                seen.add(href)
                post_links.append(href)

            # 3) 兜底：主题改版导致 rel=bookmark 缺失时，沿用旧的启发式（排除功能页/分页/标签路径）
            if not post_links:
                print("⚠ crazyhome: 未命中 rel=bookmark 主选择器，回退到启发式扫描", flush=True)
                post_links = self._extract_crazyhome_post_links_fallback(soup)

            print(f"✓ crazyhome: 从分类页提取到 {len(post_links)} 个文章链接", flush=True)
            return post_links
        except Exception as e:
            print(f"⚠ crazyhome: 提取文章链接失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return []

    def _extract_crazyhome_post_links_fallback(self, soup):
        """启发式兜底：扫描全页链接并排除功能页/分页/标签/工具页路径。"""
        from urllib.parse import unquote
        exclude_prefixes = (
            'category/', 'tag/', 'tag-page', 'page/', 'profile/',
            'mybookmarks', 'login/', 'register/', 'account-setting',
            'lost-password', '?', '#',
        )
        exclude_names = {'阅读记录', '书库列表', '我的书签'}
        post_links = []
        seen = set()
        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'crazyhome2000.com/' not in href:
                continue
            path = href.split('crazyhome2000.com/', 1)[-1]
            if not path or path.startswith(exclude_prefixes):
                continue
            if unquote(path).strip('/') in exclude_names:
                continue
            txt = a.get_text(strip=True)
            if not txt or len(txt) < 2 or href in seen:
                continue
            seen.add(href)
            post_links.append(href)
        return post_links

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
                    # 暂停闸门：单帖多分页遍历前的安全边界
                    self.wait_if_paused()
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
                'site': 't66y',
            }
        except Exception as e:
            print(f"✗ 解析页面失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return None

    def _parse_post(self, url, html, task_type='image'):
        """帖子解析分发器：按站点调用对应的解析方法。

        保持返回结构与 parse_t66y_post 一致：
        {title, content, author, sourceUrl, images}
        """
        site = self._detect_site(url)
        if site == 'crazyhome':
            return self.parse_crazyhome_post(url, html, task_type)
        return self.parse_t66y_post(url, html, task_type)

    def parse_crazyhome_post(self, url, html, task_type='novel'):
        """解析 crazyhome2000.com 小说文章（单页、纯文本、无图片）。

        结构：
        - 标题：<h1>
        - 作者：正文段落中「作者：xxx」
        - 正文容器：div.entry-content
          - 跳过：书签弹窗 div（class 含 cbxwpbkmark）、作者行 <p>、
                  末尾分类链接 div.entry-copyright
          - 其余 <p> 拼接为正文
        """
        try:
            soup = BeautifulSoup(html, 'html.parser')

            # 标题
            title = '未知标题'
            h1 = soup.find('h1')
            if h1:
                title = h1.get_text(strip=True)

            entry = soup.find('div', class_='entry-content')
            if not entry:
                print(f"⚠ crazyhome: 未找到 div.entry-content 容器", flush=True)
                return None

            # 遍历 entry-content 的直接子元素，剔除噪音并收集正文段落
            author = '匿名'
            content_parts = []
            for child in entry.find_all(['p', 'div'], recursive=False):
                classes = child.get('class') or []
                # 书签/登录弹窗
                if any('cbxwpbkmark' in c for c in classes):
                    continue
                # 末尾分类链接
                if 'entry-copyright' in classes:
                    continue
                if child.name == 'p':
                    txt = child.get_text(strip=True)
                    if not txt:
                        continue
                    # 作者行：提取作者但不纳入正文
                    if '作者：' in txt:
                        m = re.search(r'作者：\s*(.+)', txt)
                        if m:
                            author = m.group(1).strip()
                        continue
                    content_parts.append(txt)

            content = '\n\n'.join(content_parts) if content_parts else title
            # 兜底：正文过短时用 entry 全文
            if len(content) < 50:
                content = entry.get_text('\n', strip=True)

            # 解析系列名与章节号：标题形如 "超萌机娘大奸淫 16" 或 "师尊的禁脔 38-51"
            # 章节号恒在末尾，取首个数字；系列名为末尾 space+digits 之前的部分
            series = title
            chapter_no = None
            ch_match = re.search(r'\s+(\d{1,4})(?:-(\d{1,4}))?\s*$', title)
            if ch_match:
                chapter_no = int(ch_match.group(1))
                series = title[:ch_match.start()].strip()

            # 输出标题，供后端解析并更新任务名称
            print(f"TITLE:{title}", flush=True)

            return {
                'title': title,
                'content': content,
                'author': author,
                'sourceUrl': url,
                'images': [],
                'site': 'crazyhome',
                'series': series,
                'chapterNo': chapter_no,
            }
        except Exception as e:
            print(f"✗ 解析 crazyhome 文章失败: {e}", file=sys.stderr, flush=True)
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
    
    def _derive_post_identity(self, post_data, task_type):
        """按存库口径计算去重身份（content_hash, content_length），判定与文档构建共用。"""
        return derive_post_identity(task_type, post_data['content'], post_data.get('images') or [])

    def _prepare_post_document(self, post_data, forum_url, task_type, forum_last_post_time=None):
        """准备待保存的帖子文档（哈希计算/媒体处理/文档构建），不写库；失败返回 None"""
        try:
            # 初始化图片目录
            initialize_image_dirs()

            # 计算去重身份（image：指纹取图片 URL 列表，长度取存库短文案；其余取正文）
            content_hash, content_length = self._derive_post_identity(post_data, task_type)
            if content_hash:
                print(f"✓ 内容哈希: {content_hash}", flush=True)
            print(f"✓ 内容长度: {content_length} 字符", flush=True)

            # 媒体处理与内容替换（纯逻辑委托 lib/post_builder，下载函数注入）
            media, content_override = build_media_and_content(
                post_data, task_type, self.task_id, download_images
            )
            if content_override is not None:
                post_data['content'] = content_override

            # 构建 MongoDB 文档（纯逻辑委托 lib/post_builder）
            return build_post_document(
                post_data, forum_url, task_type, self.task_id, self.user_id,
                content_hash, content_length, forum_last_post_time, media,
            )
        except Exception as e:
            print(f"✗ 保存帖子失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return None

    def _flush_post_buffer(self, buffered, on_saved=None):
        """批量写库（C2）：UpdateOne upsert + ordered=False，减少逐条写库的网络往返。

        必须用 UpdateOne：build_upsert_updates 产出 $set/$setOnInsert 更新载荷，
        ReplaceOne 的 replacement 文档不允许 $ 操作符（真库 bulk_write 才校验）。

        Args:
            buffered: [{'post': 文档, 'title': 标题}, ...] 待保存缓冲
            on_saved: 每条成功写入后的回调（用于进度输出）

        Returns:
            成功写入的条目列表
        """
        buffered = dedupe_by_source_url(buffered)
        if not buffered:
            return []

        try:
            operations = [
                UpdateOne(
                    # upsert 过滤同样按用户隔离，配合 {sourceUrl,userId} 复合唯一索引
                    {'sourceUrl': item['post']['sourceUrl'], 'userId': item['post']['userId']},
                    build_upsert_updates(item['post']),
                    upsert=True,
                )
                for item in buffered
            ]
            error_indexes = set()
            try:
                self.posts_collection.bulk_write(operations, ordered=False)
            except BulkWriteError as bwe:
                # 部分失败时其余文档仍已写入，仅统计失败条目
                error_indexes = {e.get('index') for e in bwe.details.get('writeErrors', [])}
                print(f"⚠ 批量写库部分失败: {len(error_indexes)}/{len(operations)} 条", file=sys.stderr, flush=True)

            saved_items = [item for i, item in enumerate(buffered) if i not in error_indexes]
            # 协调系列代表帖：每个系列仅章节号最小的一章 isSeriesHead=True
            self._reconcile_series_heads(saved_items)
            for item in saved_items:
                print(f"✓ 文章已保存: {item['post']['title']}", flush=True)
                if on_saved:
                    on_saved(item)
            return saved_items
        except Exception as e:
            print(f"✗ 批量保存失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return []

    def _reconcile_series_heads(self, saved_items):
        """协调系列代表帖：每个系列仅章节号最小的一章 isSeriesHead=True。

        批量 upsert 时所有帖子都被置为 isSeriesHead=True，此处对涉及到的
        系列重新选定 head，保证列表查询每本书只出现一条。
        """
        series_names = {item['post'].get('series') for item in saved_items if item['post'].get('series')}
        for name in series_names:
            try:
                head = self.posts_collection.find_one(
                    {'series': name}, {'chapterNo': 1}, sort=[('chapterNo', 1)]
                )
                if not head:
                    continue
                self.posts_collection.update_many(
                    {'series': name}, {'$set': {'isSeriesHead': False}}
                )
                self.posts_collection.update_one(
                    {'_id': head['_id']}, {'$set': {'isSeriesHead': True}}
                )
            except Exception as e:
                print(f"⚠ 协调系列 head 失败 [{name}]: {e}", file=sys.stderr, flush=True)

    def _save_post(self, post_data, forum_url, task_type, forum_last_post_time=None):
        """保存单个帖子到数据库（单帖模式路径：准备文档后立即批量写库）

        Args:
            post_data: 帖子数据
            forum_url: 帖子URL
            task_type: 任务类型
            forum_last_post_time: 论坛上该帖最后一条回复的时间
        """
        post = self._prepare_post_document(post_data, forum_url, task_type, forum_last_post_time)
        if post is None:
            return False

        saved = self._flush_post_buffer([{'post': post, 'title': post_data['title']}])
        return len(saved) > 0
    
    def _is_post_exist(self, post_url, content_hash=None, content_length=None):
        """检查帖子是否已经存在于数据库中（内容长度判断 + 内容哈希去重）

        Args:
            post_url: 帖子URL
            content_hash: 内容哈希值（参与哈希判定）
            content_length: 新爬取的内容长度（字符数）

        Returns:
            lib.dedup.evaluate_duplicate 的决策 dict：
            {'action': 'save'|'update'|'skip',
             'reason': str|None, 'message': str|None, 'detail': str|None}
        """
        try:
            # 去重按用户隔离：同一 sourceUrl/contentHash 不同用户各存一份
            url_post = self.posts_collection.find_one(
                {'sourceUrl': post_url, 'userId': self.user_id}
            )

            # 内容哈希撞车查询仅在 URL 未命中时进行，同样限定本用户范围
            content_duplicate = None
            if not url_post and content_hash:
                content_duplicate = self.posts_collection.find_one(
                    {'contentHash': content_hash, 'userId': self.user_id}
                )

            result = evaluate_duplicate(url_post, content_duplicate, content_hash, content_length)
            _log_duplicate_decision(url_post, result, content_length)
            return result
        except Exception as e:
            print(f"⚠ 检查帖子是否存在失败: {e}", file=sys.stderr, flush=True)
            # 检查失败不阻断爬取（沿用历史放行策略）
            return {'action': 'save', 'reason': None, 'message': None, 'detail': None}
    
    def crawl_forum(self, forum_url, task_type='image', max_depth=1, max_pages=10, crawl_type='single', start_page=1):
        """爬取论坛内容 - 支持单帖和批量采集"""
        try:
            print(f"开始爬虫任务 {self.task_id}", flush=True)
            print(f"URL: {forum_url}", flush=True)
            print(f"Type: {task_type}", flush=True)
            print(f"Max Pages: {max_pages}", flush=True)
            print(f"Start Page: {start_page}", flush=True)

            # 启动闸门：job 因服务重启被 Bull 重新派发、或启动与暂停并发时，任务可能已是 paused
            self.wait_if_paused()

            # 根据参数直接使用is_batch，而不是通过URL判断
            is_batch = (crawl_type == 'batch')
            
            total_posts = 0
            crawled_count = 0
            skipped_count = 0
            failed_count = 0
            skip_details = []  # 记录跳过原因

            # 批量写库缓冲（C2）：文档攒够一批后 bulk_write，写库成功再计入进度
            post_buffer = []

            def count_saved(item):
                nonlocal crawled_count
                crawled_count += 1
                print(f"CRAWLED:{crawled_count}", flush=True)
                # 批量模式下，使用第一个帖子的标题作为任务名称
                if total_posts > 1 and crawled_count == 1:
                    print(f"TITLE:{item['title']}", flush=True)
            
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
                all_post_links = self.extract_post_links_from_section(html, start_url)
                
                # 逐页采集，而不是一次性决定总页数
                print(f"📋 采用逐页采集模式，从第 {start_page} 页开始，最多采集 {max_pages} 页", flush=True)
                
                # 循环采集多页，直到没有下一页或达到最大页数
                pages_crawled = 1  # 已经爬取的页数（包括起始页）
                while pages_crawled < max_pages:
                    # 暂停闸门：翻页前的安全边界
                    self.wait_if_paused()
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
                    page_links = self.extract_post_links_from_section(section_page_html, section_page_url)
                    
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
                
                # 去重（保序：set 会打乱爬取顺序，dict.fromkeys 保留首次出现顺序）
                unique_post_links = list(dict.fromkeys(all_post_links))
                total_posts = len(unique_post_links)
                print(f"📋 准备爬取 {total_posts} 个帖子", flush=True)
                
                # 爬取每个帖子
                for i, post_url in enumerate(unique_post_links, 1):
                    # 暂停闸门：每个帖子处理前的安全边界
                    self.wait_if_paused()
                    print(f"\n🔍 正在处理帖子 {i}/{total_posts}: {post_url}", flush=True)

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
                    post_data = self._parse_post(actual_post_url, post_html, task_type)
                    if not post_data:
                        print(f"⚠ 解析帖子失败，跳过: {actual_post_url}", flush=True)
                        failed_count += 1
                        skip_details.append({
                            'url': actual_post_url,
                            'reason': 'parse_failed',
                            'message': '解析帖子失败'
                        })
                        continue
                    
                    # 计算去重身份（image 按图片 URL 指纹，长度按存库口径）
                    content_hash, content_length = self._derive_post_identity(post_data, task_type)
                    
                    # 现在进行基于内容长度和哈希的检查
                    check_result = self._is_post_exist(actual_post_url, content_hash, content_length)
                    if check_result['action'] == SKIP:
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
                    if check_result['action'] == UPDATE:
                        print(f"📝 检测到URL相同但内容更新，准备覆盖更新: {actual_post_url}", flush=True)
                    
                    # 准备文档并攒批，写库成功后由 count_saved 计入进度（C2 批量写库）
                    doc = self._prepare_post_document(post_data, actual_post_url, task_type)
                    if doc:
                        post_buffer.append({'post': doc, 'title': post_data['title']})

                    if len(post_buffer) >= POST_WRITE_BATCH_SIZE:
                        self._flush_post_buffer(post_buffer, on_saved=count_saved)
                        post_buffer = []
                    
                    # 随机延迟避免被封（延长到3-5秒）
                    import time
                    import random
                    delay = random.uniform(3, 5)
                    print(f"⏳ 处理完帖子后等待 {delay:.1f} 秒...", flush=True)
                    time.sleep(delay)

                # 冲刷剩余缓冲（C2 批量写库）
                if post_buffer:
                    self._flush_post_buffer(post_buffer, on_saved=count_saved)
                    post_buffer = []
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
                post_data = self._parse_post(actual_forum_url, post_html, task_type)
                if not post_data:
                    print(f"✗ 解析页面失败", file=sys.stderr, flush=True)
                    return {
                        'success': False,
                        'task_id': self.task_id,
                        'error': '解析页面失败',
                    }
                
                # 计算去重身份（image 按图片 URL 指纹，长度按存库口径）
                content_hash, content_length = self._derive_post_identity(post_data, task_type)
                
                # 检查帖子是否已存在（基于内容长度和哈希）
                check_result = self._is_post_exist(actual_forum_url, content_hash, content_length)
                if check_result['action'] == SKIP:
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
                if check_result['action'] == UPDATE:
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
