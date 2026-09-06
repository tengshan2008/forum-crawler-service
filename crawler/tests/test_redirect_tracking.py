"""回归测试：meta refresh 转向跟踪（原 tests/data/test_redirect_tracking.py 改写）。

原脚本通过真实网络请求验证转向跟踪；现改为对纯函数 lib.url_utils.extract_meta_refresh_url
的单测，覆盖 HTTP 重定向后 meta 转向的核心解析逻辑，无需联网。
"""

from lib.url_utils import extract_meta_refresh_url

BASE = 'https://t66y.com/read.php?tid=7075205'


def make_page(content_attr):
    return f'<html><head><meta http-equiv="refresh" content="{content_attr}"></head><body></body></html>'


def test_标准meta转向提取绝对地址():
    html = make_page('2;url=https://t66y.com/htm_data/2401/20/7075205.html')
    assert (
        extract_meta_refresh_url(html, BASE)
        == 'https://t66y.com/htm_data/2401/20/7075205.html'
    )


def test_相对路径转向拼接base_url():
    html = make_page('0;url=htm_data/2401/20/7075205.html')
    assert (
        extract_meta_refresh_url(html, BASE)
        == 'https://t66y.com/htm_data/2401/20/7075205.html'
    )


def test_相对根路径转向():
    html = make_page('1; url=/htm_data/2401/20/7075205.html')
    assert (
        extract_meta_refresh_url(html, BASE)
        == 'https://t66y.com/htm_data/2401/20/7075205.html'
    )


def test_无meta转向返回None():
    html = '<html><head><title>正常页面</title></head><body></body></html>'
    assert extract_meta_refresh_url(html, BASE) is None


def test_meta无url参数返回None():
    html = make_page('5')  # 仅延时刷新，无跳转目标
    assert extract_meta_refresh_url(html, BASE) is None


def test_空HTML返回None():
    assert extract_meta_refresh_url('', BASE) is None
    assert extract_meta_refresh_url(None, BASE) is None


def test_尾部分号被清理():
    html = make_page('2;url=https://t66y.com/htm_data/2401/20/7075205.html;')
    assert (
        extract_meta_refresh_url(html, BASE)
        == 'https://t66y.com/htm_data/2401/20/7075205.html'
    )
