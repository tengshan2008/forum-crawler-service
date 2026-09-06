"""回归测试：从 read.php 转向页提取实际 htm_data URL（原 tests/data/test_extract_actual_url.py 改写）。

原脚本通过真实网络请求探测转向页；现改为对纯函数的单测，
覆盖 meta 转向提取与页面内 htm_data 链接查找两条路径，无需联网。
"""

from lib.url_utils import extract_meta_refresh_url, extract_tid_from_url, find_htm_data_links

REDIRECT_PAGE_HTML = """
<html>
<head><title>read.php</title>
<meta http-equiv="refresh" content="0;url=htm_data/2401/20/7075205.html">
</head>
<body>
<a href="htm_data/2401/20/7075205.html">帖子入口</a>
<a href="/thread0806.php?fid=20">版块</a>
</body>
</html>
"""

FALLBACK_PAGE_HTML = """
<html>
<head><title>无meta转向的页面</title></head>
<body>
<a href="htm_data/2401/20/111111.html">另一帖</a>
<a href="https://t66y.com/htm_data/2401/20/222222.html">绝对地址帖</a>
</body>
</html>
"""


def test_meta转向可直接提取实际URL():
    url = extract_meta_refresh_url(REDIRECT_PAGE_HTML, 'https://t66y.com/read.php?tid=7075205')
    assert url == 'https://t66y.com/htm_data/2401/20/7075205.html'


def test_无meta时兜底查找htm_data链接():
    links = find_htm_data_links(FALLBACK_PAGE_HTML)
    assert links == [
        'https://t66y.com/htm_data/2401/20/111111.html',
        'https://t66y.com/htm_data/2401/20/222222.html',
    ]


def test_转向页无htm_data链接时返回空列表():
    assert find_htm_data_links('<html><body><p>空</p></body></html>') == []


def test_提取的实际URL可解析出tid():
    url = extract_meta_refresh_url(REDIRECT_PAGE_HTML, 'https://t66y.com/read.php?tid=7075205')
    # htm_data 路径与 read.php?tid= 指向同一主题，tid 提取结果一致
    assert extract_tid_from_url(url) == '7075205'
    assert extract_tid_from_url('https://t66y.com/read.php?tid=7075205') == '7075205'
