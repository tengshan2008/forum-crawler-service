"""文本处理纯函数：内容哈希、<br> 转换、乱码检测。"""

import hashlib
import re
import sys


def calculate_content_hash(content):
    """计算内容的 MD5 哈希值用于去重。

    规范化：去除前后空白，并将连续空白（含换行）折叠为单个空格。

    Args:
        content: 帖子内容字符串

    Returns:
        32位十六进制哈希值；内容不可用时返回 None
    """
    try:
        normalized_content = content.strip()
        normalized_content = re.sub(r'\s+', ' ', normalized_content)
        content_hash = hashlib.md5(normalized_content.encode('utf-8')).hexdigest()
        return content_hash
    except Exception as e:
        print(f"⚠ 计算内容哈希失败: {e}", file=sys.stderr, flush=True)
        return None


def extract_text_content(element):
    """从 BeautifulSoup 元素提取正文文本。

    1. 将所有 <br> 标签替换为换行符（保留小说等内容的换行结构）
    2. 提取文本（strip=False，保留内部换行）
    3. 规范化段落间距（连续空行折叠为一个空行）
    4. 移除首尾空白

    Args:
        element: BeautifulSoup Tag 元素

    Returns:
        处理后的文本；空内容返回空字符串
    """
    for br in element.find_all('br'):
        br.replace_with('\n')

    text_content = element.get_text(strip=False)
    if not text_content:
        return ''

    text_content = re.sub(r'\n\s*\n', '\n\n', text_content)  # 规范化段落间距
    return text_content.strip()  # 只移除首尾空白


def is_garbage_content(html):
    """检测内容是否为不可解析的乱码。

    当网站返回某种加密或防御机制导致的乱码内容时，需要识别出来进行重试。
    典型的乱码特征：包含大量不可打印字符、中文字符极少、缺乏HTML结构。

    Args:
        html: 页面HTML内容

    Returns:
        bool: True 表示是乱码内容，需要重试
    """
    if not html:
        return True

    try:
        # 检查内容长度，过短可能是乱码
        if len(html) < 100:
            print(f"⚠ 检测到内容过短 ({len(html)} 字符)，可能是乱码", flush=True)
            return True

        # 取样分析（分析前10000个字符，增加采样范围）
        sample = html[:10000]

        # 1. 关键：检查是否存在常见的HTML标签
        # 正常的网页不可能连一个常用标签都没有
        common_tags = ['<html', '<body', '<head', '<div', '<span', '<table', '<script', '<meta', '<link', '<title']
        tags_found = sum(1 for tag in common_tags if tag in sample.lower())

        if tags_found == 0:
            print(f"⚠ 未检测到任何常见HTML标签，判定为乱码", flush=True)
            # 打印开头部分以便调试
            safe_preview = ''.join(c if c.isprintable() else '?' for c in sample[:200])
            print(f"  内容预览: {safe_preview}...", flush=True)
            return True

        # 2. 检查 Unicode 替换字符（\ufffd）
        # requests在解码失败时可能会产生大量替换字符
        replacement_char_count = sample.count('\ufffd')
        if replacement_char_count > 50:  # 阈值
            print(f"⚠ 检测到大量替换字符 ({replacement_char_count} 个)，判定为乱码", flush=True)
            return True

        # 3. 统计可打印ASCII字符（排除控制字符）
        printable_chars = sum(1 for c in sample if c.isprintable() or c in '\n\r\t')
        printable_ratio = printable_chars / len(sample) if sample else 0

        # 4. 统计中文字符数量
        chinese_chars = sum(1 for c in sample if '\u4e00' <= c <= '\u9fff')

        # 5. 统计HTML标签数量（单纯的 < 和 >）
        html_angle_brackets = sample.count('<') + sample.count('>')

        # 判断逻辑：
        # A. 可打印字符比例极低
        if printable_ratio < 0.6:
            print(f"⚠ 可打印字符比例过低 ({printable_ratio:.1%})，判定为乱码", flush=True)
            return True

        # B. 几乎没有HTML结构符 且 中文也很少
        if html_angle_brackets < 10 and chinese_chars < 5:
            print(f"⚠ 缺乏HTML结构 (<>数量: {html_angle_brackets}) 且中文字符极少 ({chinese_chars})，判定为乱码", flush=True)
            return True

        # C. 看起来像文本但没有中文也没有HTML结构（对于中文论坛来说是不正常的）
        if printable_ratio < 0.8 and chinese_chars < 10 and html_angle_brackets < 20:
            print(f"⚠ 内容缺乏特征 ({printable_ratio:.1%} 可打印, {chinese_chars} 中文, {html_angle_brackets} 括号)，判定为乱码", flush=True)
            return True

        return False

    except Exception as e:
        print(f"⚠ 检测内容时出错: {e}", file=sys.stderr, flush=True)
        return False  # 出错时不判定为乱码，继续正常处理
