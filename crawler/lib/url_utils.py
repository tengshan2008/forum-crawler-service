"""URL 解析与构造纯函数：meta 转向、tid 提取、分页 URL。"""

import re
import sys
from urllib.parse import urljoin, urlparse

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


def _extract_page_number(href):
    """从链接中提取页码，兼容 t66y (?page=N) 与 crazyhome (/page/N/) 两种格式。"""
    match = re.search(r'page=(\d+)', href)
    if match:
        return int(match.group(1))
    match = re.search(r'/page/(\d+)/?', href)
    if match:
        return int(match.group(1))
    return None


def extract_page_numbers(html, max_allowed_pages=1000):
    """从HTML中提取总页数 - 带最大页数限制。

    优先在分页导航区域（class 含 page/pagenav 等）内查找，
    找不到时回退到全页面链接。
    兼容 t66y (?page=N) 与 crazyhome (/page/N/) 两种分页格式。

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
                num = _extract_page_number(href)
                if num:
                    page_numbers.add(num)

        # 2. 如果分页导航区域没找到，再尝试查找所有链接（兼容性）
        if not page_numbers:
            all_links = soup.find_all('a')
            for link in all_links:
                href = link.get('href', '')
                num = _extract_page_number(href)
                if num:
                    page_numbers.add(num)

        if page_numbers:
            max_page = max(page_numbers)
            # 3. 添加最大页数限制，避免采集过多页数
            return min(max_page, max_allowed_pages)
        return 1
    except Exception as e:
        print(f"⚠ 提取页码失败: {e}", file=sys.stderr, flush=True)
        return 1


def has_next_page(html, current_page):
    """检查当前页是否有下一页链接（用于逐页采集）。

    优先在分页导航容器（class 含 pagination/pagenav/pages 等）内判定，
    避免正文/侧栏中恰好含 /page/N/ 的链接被误判；容器内找不到再回退到全页面。

    判定为有下一页（满足其一）：
    1. 存在指向下一页页码（current_page+1）的链接；
    2. 分页容器内存在 class 含 next/older 的「下一页/较旧文章」按钮（crazyhome 该按钮文本为空）。

    兼容 t66y (?page=N) 与 crazyhome (/page/N/) 两种分页格式。
    """
    try:
        soup = BeautifulSoup(html, 'html.parser')
        next_page = current_page + 1

        def _container_has_next(scope):
            for link in scope.find_all('a', href=True):
                href = link.get('href', '')
                if _extract_page_number(href) == next_page:
                    return True
                # 显式的「下一页」按钮（crazyhome 为 <li class="next"><a></a></li>，文本可能为空）
                parent_cls = ' '.join(link.parent.get('class', []) if link.parent else [])
                link_cls = ' '.join(link.get('class', []))
                if re.search(r'\b(next|older)\b', f'{parent_cls} {link_cls}', re.I) and href.strip():
                    return True
            return False

        # 1. 优先在分页导航容器内判定
        for scope in soup.find_all(['nav', 'div', 'ul', 'ol'],
                                   class_=re.compile(r'(pagination|pagenav|pages|page-nav|wp-pagenavi)', re.I)):
            if _container_has_next(scope):
                return True
        # 2. 回退：全页面扫描（兼容非标准分页结构）
        return _container_has_next(soup)
    except Exception as e:
        print(f"⚠ 检查下一页失败: {e}", file=sys.stderr, flush=True)
        return False


def _uses_wordpress_path_pagination(section_url):
    """判断版块 URL 是否使用 WordPress 的 /page/N/ 路径分页。

    crazyhome（WordPress 站点）的分类页 /category/<x>/、标签页 /tag/<x>/、
    首页等所有归档页统一用 /page/N/，而不是 ?page=N。
    判定信号：域名为 crazyhome2000.com，或路径含 /category/、/tag/ 段。
    """
    try:
        parsed = urlparse(section_url)
        if 'crazyhome2000.com' in (parsed.netloc or ''):
            return True
        path = parsed.path or ''
        return '/category/' in path or '/tag/' in path
    except Exception:
        return '/category/' in section_url or '/tag/' in section_url


def build_section_pagination_url(section_url, page_num):
    """为版块构建分页URL（替换或追加分页段）。

    兼容两类格式：
    - WordPress 路径分页（crazyhome 的分类/标签/首页）：/page/{page_num}/
    - 查询串分页（t66y 等）：?page={page_num}

    - URL 中已有 /page/N/ → 替换为 /page/{page_num}/
    - URL 中已有 ?page=N → 替换为 ?page={page_num}
    - 无分页段：page_num==1 原样返回；
      WordPress 归档页（crazyhome / /category/ / /tag/）追加 /page/{page_num}/，
      其余追加 ?page={page_num}
    """
    try:
        # WordPress /page/N/ 或 t66y ?page=N 已存在：直接替换页码
        if re.search(r'/page/\d+/?', section_url):
            return re.sub(r'/page/\d+/?', f'/page/{page_num}/', section_url)
        if 'page=' in section_url:
            return re.sub(r'page=\d+', f'page={page_num}', section_url)
        # 无现有分页段
        if page_num == 1:
            return section_url
        # WordPress 归档页（crazyhome 分类/标签/首页）：追加 /page/N/
        if _uses_wordpress_path_pagination(section_url):
            base = section_url.split('?', 1)[0].rstrip('/')
            return f"{base}/page/{page_num}/"
        # 默认：?page=N（已有其他 query 时用 & 拼接）
        if '?' in section_url:
            return f"{section_url}&page={page_num}"
        return f"{section_url}?page={page_num}"
    except Exception as e:
        print(f"⚠ 构建版块分页URL失败: {e}", file=sys.stderr, flush=True)
        return section_url


def extract_page_from_url(url):
    """从URL中提取页码。

    兼容 t66y (?page=N) 与 crazyhome (/page/N/) 两种格式。

    Returns:
        页码；如果没有分页段则返回 None
    """
    try:
        num = _extract_page_number(url)
        return num
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
