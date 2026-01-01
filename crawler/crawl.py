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
# 忽略urllib3的InsecureRequestWarning警告
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import re
import logging
import hashlib

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
    
    def _calculate_content_hash(self, content):
        """计算内容的 MD5 哈希值用于去重
        
        Args:
            content: 帖子内容字符串
            
        Returns:
            16位十六进制哈希值
        """
        try:
            # 规范化内容：去除前后空白，规范化换行
            normalized_content = content.strip()
            normalized_content = re.sub(r'\s+', ' ', normalized_content)
            
            # 计算 MD5 哈希
            content_hash = hashlib.md5(normalized_content.encode('utf-8')).hexdigest()
            return content_hash
        except Exception as e:
            print(f"⚠ 计算内容哈希失败: {e}", file=sys.stderr, flush=True)
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
    
    def fetch_page(self, url, max_retries=3, delay_range=(2, 4), request_timeout=30):
        """获取页面内容 - 带重试和反爬虫
        
        Args:
            url: 目标URL
            max_retries: 最大重试次数
            delay_range: 延迟范围(秒)
            request_timeout: HTTP请求超时时间(秒)，默认30秒
        """
        result = self.fetch_page_with_final_url(url, max_retries, delay_range, request_timeout)
        return result['html'] if result else None
    
    def fetch_page_with_final_url(self, url, max_retries=3, delay_range=(2, 4), request_timeout=30):
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
                    
                    # 进一步检查meta refresh或其他转向机制
                    # t66y的read.php?tid= 页面使用 meta refresh 来转向到实际的htm_data页面
                    try:
                        soup = BeautifulSoup(response.text, 'html.parser')
                        
                        # 检查 meta http-equiv="refresh" 标签
                        meta_refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
                        if meta_refresh and 'content' in meta_refresh.attrs:
                            # 提取URL，格式通常是: "2;url=......"
                            content = meta_refresh['content']
                            if 'url=' in content:
                                redirect_url = content.split('url=', 1)[1].strip().rstrip(';')
                                # 构建完整URL
                                meta_final_url = urljoin(final_url, redirect_url)
                                if meta_final_url != final_url:
                                    final_url = meta_final_url
                                    print(f"✓ 成功获取页面（已跟踪meta转向）: {url} → {final_url}", flush=True)
                                else:
                                    print(f"✓ 成功获取页面: {url}", flush=True)
                            else:
                                if final_url != url:
                                    print(f"✓ 成功获取页面（已跟踪重定向）: {url} → {final_url}", flush=True)
                                else:
                                    print(f"✓ 成功获取页面: {url}", flush=True)
                        else:
                            if final_url != url:
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
    
    def extract_page_numbers(self, html, max_allowed_pages=100):
        """从HTML中提取总页数 - 带最大页数限制"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            page_numbers = set()
            
            # 1. 查找分页导航区域内的链接（更精确）
            pagination_divs = soup.find_all(['div', 'ul', 'ol'], class_=re.compile(r'(page|pagenav|pagination|pages)', re.I))
            
            for pagination in pagination_divs:
                links = pagination.find_all('a')
                for link in links:
                    href = link.get('href', '')
                    match = re.search(r'page=(\d+)', href)
                    if match:
                        page_numbers.add(int(match.group(1)))
            
            # 2. 如果分页导航区域没找到，再尝试查找所有链接（兼容性）
            if not page_numbers:
                all_links = soup.find_all('a')
                for link in all_links:
                    href = link.get('href', '')
                    match = re.search(r'page=(\d+)', href)
                    if match:
                        page_numbers.add(int(match.group(1)))
            
            if page_numbers:
                max_page = max(page_numbers)
                # 3. 添加最大页数限制，避免采集过多页数
                return min(max_page, max_allowed_pages)
            return 1
        except Exception as e:
            print(f"⚠ 提取页码失败: {e}", file=sys.stderr, flush=True)
            return 1
    
    def has_next_page(self, html, current_page):
        """检查当前页是否有下一页链接（用于逐页采集）"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            next_page = current_page + 1
            
            # 查找所有可能的下一页链接
            all_links = soup.find_all('a')
            for link in all_links:
                href = link.get('href', '')
                # 检查是否存在指向下一页的链接
                match = re.search(r'page=(\d+)', href)
                if match and int(match.group(1)) == next_page:
                    return True
            
            return False
        except Exception as e:
            print(f"⚠ 检查下一页失败: {e}", file=sys.stderr, flush=True)
            return False
    
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
    
    def build_section_pagination_url(self, section_url, page_num):
        """为版块构建分页URL"""
        try:
            # 检查是否已有page参数
            if 'page=' in section_url:
                # 替换现有page参数
                return re.sub(r'page=\d+', f'page={page_num}', section_url)
            elif '?' in section_url:
                # 已有其他参数，添加page参数
                return f"{section_url}&page={page_num}"
            else:
                # 无参数，添加page参数
                return f"{section_url}?page={page_num}"
        except Exception as e:
            print(f"⚠ 构建版块分页URL失败: {e}", file=sys.stderr, flush=True)
            return section_url
    
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
                max_crawl_pages = min(total_pages, 20)
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
            
            # 1. 首先尝试 tpc_content 选择器（t66y 专用）
            divs = soup.find_all('div', class_='tpc_content')
            if divs:
                divs = [d for d in divs if len(d.get_text(strip=True)) > 100]
                if divs:
                    content_divs = divs
                    print(f"✓ 使用选择器: div.tpc_content (找到 {len(divs)} 个容器)", flush=True)
            
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
            if not content_divs:
                print(f"⚠ 标准选择器未找到内容，尝试按文本长度搜索...", flush=True)
                
                # 查找所有包含文本的 div
                all_divs = soup.find_all('div')
                divs_with_text = []
                for d in all_divs:
                    text_len = len(d.get_text(strip=True))
                    if 100 < text_len < 100000:  # 避免过大的容器（可能是整个页面）
                        divs_with_text.append((d, text_len))
                
                if divs_with_text:
                    divs_with_text.sort(key=lambda x: x[1], reverse=True)
                    print(f"  找到 {len(divs_with_text)} 个可能的内容容器", flush=True)
                    print(f"  最大容器大小: {divs_with_text[0][1]} 字符", flush=True)
                    
                    # 取前3-5个最大的 div（避免嵌套的重复）
                    candidates = []
                    for div, text_len in divs_with_text[:10]:
                        # 检查是否是其他候选的父节点
                        is_parent = False
                        for candidate_div, _ in candidates:
                            if candidate_div in div.descendants:
                                is_parent = True
                                break
                        if not is_parent:
                            candidates.append((div, text_len))
                        if len(candidates) >= 3:
                            break
                    
                    content_divs = [d[0] for d in candidates]
                    print(f"  使用备选容器: {len(content_divs)} 个", flush=True)
            
            # 提取内容
            if content_divs:
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
                        
                        # 过滤掉过短的内容（可能是导航等垃圾内容）
                        if len(text_content) > 50:
                            # 为小说类型添加楼层标识
                            if task_type == 'novel':
                                floor_header = f"\n【第{floor_idx}楼】\n"
                                text_content = floor_header + text_content
                            
                            print(f"  ✓ 楼层 {floor_idx}: 提取 {len(text_content)} 字符", flush=True)
                            content_parts.append(text_content)
                    
                    # 提取图片
                    img_elements = content_div.find_all('img')
                    for img_idx, img in enumerate(img_elements, 1):
                        # 尝试多个属性获取图片 URL
                        img_url = (
                            img.get('ess-data') or 
                            img.get('src') or 
                            img.get('data-src') or
                            img.get('data-original') or
                            img.get('data-lazy-src')
                        )
                        
                        if img_url and img_url.startswith('http'):
                            # 过滤掉明确的表情、头像等小图标
                            if any(x in img_url.lower() for x in ['emotion', 'icon', 'avatar', 'face', 'emoticon']):
                                continue
                            
                            # 避免重复添加同一张图片
                            if img_url not in [img['url'] for img in images]:
                                images.append({
                                    'url': img_url,
                                    'description': f'第{page_num}页 楼层{floor_idx} 图片{img_idx}'
                                })
            else:
                print(f"⚠ 页面 {page_num}: 未能找到任何内容容器，检查 HTML 结构", flush=True)
            
            return content_parts, images
        except Exception as e:
            print(f"⚠ 提取页面内容失败: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()
            return content_parts, images
    
    def _save_post(self, post_data, forum_url, task_type):
        """保存单个帖子到数据库"""
        try:
            # 初始化图片目录
            initialize_image_dirs()
            
            # 计算内容哈希值
            content_hash = self._calculate_content_hash(post_data['content'])
            if content_hash:
                print(f"✓ 内容哈希: {content_hash}", flush=True)
            
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
            
            # 添加内容哈希
            if content_hash:
                post['contentHash'] = content_hash
            
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
                            'contentHash': post.get('contentHash'),
                            'updatedAt': datetime.now(timezone.utc),
                        },
                        '$setOnInsert': {
                            'createdAt': datetime.now(timezone.utc),
                        }
                    },
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
    
    def _is_post_exist(self, post_url, content_hash=None):
        """检查帖子是否已经存在于数据库中（支持URL和内容哈希去重）
        
        Args:
            post_url: 帖子URL
            content_hash: 内容哈希值（如果提供，优先使用）
            
        Returns:
            {
                'exists': bool,
                'reason': str,  # duplicate|same_url|content_duplicate
                'message': str
            }
        """
        try:
            # 如果提供了内容哈希，先检查是否有相同内容的帖子
            if content_hash:
                # 查找相同内容的帖子（不同URL）
                content_duplicate = self.posts_collection.find_one({'contentHash': content_hash})
                if content_duplicate:
                    existing_url = content_duplicate.get('sourceUrl', '未知URL')
                    return {
                        'exists': True,
                        'reason': 'content_duplicate',
                        'message': f'相同内容已存在于: {existing_url}'
                    }
            
            # 然后检查URL是否存在
            url_duplicate = self.posts_collection.find_one({'sourceUrl': post_url})
            if url_duplicate:
                # URL存在，检查内容是否相同
                existing_hash = url_duplicate.get('contentHash')
                if content_hash and existing_hash and existing_hash == content_hash:
                    # 相同URL，相同内容
                    return {
                        'exists': True,
                        'reason': 'duplicate',
                        'message': '帖子已存在（相同URL和内容）'
                    }
                elif content_hash and existing_hash and existing_hash != content_hash:
                    # 相同URL，不同内容 - 允许更新
                    return {
                        'exists': False,
                        'reason': None,
                        'message': None,
                        'shouldUpdate': True  # 标记应该更新
                    }
                else:
                    # 无法验证内容，保守做法跳过
                    return {
                        'exists': True,
                        'reason': 'same_url',
                        'message': '相同URL的帖子已存在'
                    }
            
            return {
                'exists': False,
                'reason': None,
                'message': None
            }
        except Exception as e:
            print(f"⚠ 检查帖子是否存在失败: {e}", file=sys.stderr, flush=True)
            return {
                'exists': False,
                'reason': None,
                'message': None
            }
    
    def crawl_forum(self, forum_url, task_type='image', max_depth=1, max_pages=10, crawl_type='single'):
        """爬取论坛内容 - 支持单帖和批量采集"""
        try:
            print(f"开始爬虫任务 {self.task_id}", flush=True)
            print(f"URL: {forum_url}", flush=True)
            print(f"Type: {task_type}", flush=True)
            print(f"Max Pages: {max_pages}", flush=True)
            
            # 根据参数直接使用is_batch，而不是通过URL判断
            is_batch = (crawl_type == 'batch')
            
            total_posts = 0
            crawled_count = 0
            skipped_count = 0
            failed_count = 0
            skip_details = []  # 记录跳过原因
            
            if is_batch:
                print("🔄 批量采集模式: 开始逐页爬取版块帖子", flush=True)
                
                # 获取版块第一页（批量采集使用60秒超时以处理网络延迟）
                html = self.fetch_page(forum_url, request_timeout=60)
                if not html:
                    print(f"✗ 无法获取版块内容", file=sys.stderr, flush=True)
                    return {
                        'success': False,
                        'task_id': self.task_id,
                        'error': '无法获取版块内容',
                    }
                
                # 提取第一页的帖子链接
                all_post_links = self.extract_post_links_from_section(html)
                current_page = 1
                
                # 逐页采集，而不是一次性决定总页数
                print(f"📋 采用逐页采集模式，最多采集 {max_pages} 页", flush=True)
                
                # 循环采集多页，直到没有下一页或达到最大页数
                while current_page < max_pages:
                    # 检查当前页是否有下一页
                    has_next = self.has_next_page(html, current_page)
                    
                    if not has_next:
                        print(f"✓ 版块第 {current_page} 页没有下一页链接，采集完毕", flush=True)
                        break
                    
                    # 构建下一页URL并获取
                    next_page_num = current_page + 1
                    section_page_url = self.build_section_pagination_url(forum_url, next_page_num)
                    print(f"📄 开始爬取版块第 {next_page_num} 页: {section_page_url}", flush=True)
                    
                    section_page_html = self.fetch_page(section_page_url, request_timeout=60)
                    if not section_page_html:
                        print(f"⚠ 无法获取版块第 {next_page_num} 页，停止采集", flush=True)
                        break
                    
                    # 提取该页的帖子链接
                    page_links = self.extract_post_links_from_section(section_page_html)
                    
                    if not page_links:
                        print(f"⚠ 版块第 {next_page_num} 页没有帖子链接，停止采集", flush=True)
                        break
                    
                    all_post_links.extend(page_links)
                    html = section_page_html  # 更新为当前页内容，用于下次检查
                    current_page = next_page_num
                    
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
                    
                    # 现在进行基于内容哈希的检查
                    check_result = self._is_post_exist(actual_post_url, content_hash)
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
                
                # 检查帖子是否已存在（基于内容哈希）
                check_result = self._is_post_exist(actual_forum_url, content_hash)
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
        if self.client:
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
    
    args = parser.parse_args()
    
    # 获取 MongoDB URI
    mongodb_uri = os.environ.get(
        'MONGODB_URI',
        'mongodb://admin:admin123@mongo:27017/forum-crawler?authSource=admin'
    )
    
    crawler = None
    try:
        crawler = ForumCrawler(args.task_id, mongodb_uri)
        result = crawler.crawl_forum(args.url, args.type, args.max_depth, args.max_pages, args.crawl_type)
        
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
