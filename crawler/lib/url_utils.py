"""URL 解析与构造纯函数：meta 转向、tid 提取、分页 URL。"""

import re
import sys
from urllib.parse import urljoin

from bs4 import BeautifulSoup


def extract_meta_refresh_url(html, base_url):
    """提取 meta http-equiv="refresh" 指向的跳转 URL（绝对地址）。

    t66y 的 read.php?tid= 页面使用 meta refresh 转向到实际的 htm_data 页面。

    Args:
        html: 页面HTML内容
        base_url: 用于拼接相对跳转地址的基准URL（通常为 HTTP 重定向后的最终URL）

    Returns:
        跳转目标绝对URL；无 meta 转向或格式异常时返回 None
    """
    if not html:
        return None
    try:
        soup = BeautifulSoup(html, 'html.parser')
        meta_refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
        if not meta_refresh or 'content' not in meta_refresh.attrs:
            return None

        # 提取URL，格式通常是: "2;url=......"
        content = meta_refresh['content']
        if 'url=' not in content:
            return None
        redirect_url = content.split('url=', 1)[1].strip().rstrip(';')
        if not redirect_url:
            return None
        return urljoin(base_url, redirect_url)
    except Exception as e:
        print(f"⚠ 解析meta转向失败: {e}", file=sys.stderr, flush=True)
        return None


def extract_tid_from_url(url):
    """从URL中提取 thread ID。

    支持两种格式：
    - read.php?tid=123456
    - htm_data/年份/版块/123456.html
    """
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


def build_pagination_url(original_url, page_num):
    """为给定页码构建帖子分页URL（标准 read.php 格式）。

    Args:
        original_url: 帖子的任意格式URL
        page_num: 目标页码

    Returns:
        分页URL；无法提取tid时返回 None
    """
    try:
        tid = extract_tid_from_url(original_url)
        if tid:
            return f"https://t66y.com/read.php?tid={tid}&page={page_num}"
        return None
    except Exception as e:
        print(f"⚠ 构建分页URL失败: {e}", file=sys.stderr, flush=True)
        return None


def extract_page_numbers(html, max_allowed_pages=1000):
    """从HTML中提取总页数 - 带最大页数限制。

    优先在分页导航区域（class 含 page/pagenav 等）内查找，
    找不到时回退到全页面链接。

    Returns:
        最大页码（不超过 max_allowed_pages）；无分页线索时返回 1
    """
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


def has_next_page(html, current_page):
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


def build_section_pagination_url(section_url, page_num):
    """为版块构建分页URL（替换或追加 page 参数）"""
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


def extract_page_from_url(url):
    """从URL中提取page参数值。

    Returns:
        页码；如果没有page参数则返回 None
    """
    try:
        # 查找 page=数字 模式
        match = re.search(r'page=(\d+)', url)
        if match:
            return int(match.group(1))
        return None
    except Exception as e:
        print(f"⚠ 提取URL中的page参数失败: {e}", file=sys.stderr, flush=True)
        return None


def find_htm_data_links(html, base_url='https://t66y.com/'):
    """从页面中查找所有 htm_data 格式的帖子链接（绝对地址）。

    用于 read.php 转向页兜底定位实际帖子URL。
    """
    if not html:
        return []
    try:
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            if 'htm_data' in href:
                links.append(urljoin(base_url, href))
        return links
    except Exception as e:
        print(f"⚠ 查找htm_data链接失败: {e}", file=sys.stderr, flush=True)
        return []
