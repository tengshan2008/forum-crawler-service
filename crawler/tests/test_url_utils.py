"""lib.url_utils 纯函数测试：tid 提取、分页 URL、页码解析"""

from lib.url_utils import (
    build_pagination_url,
    build_section_pagination_url,
    extract_page_from_url,
    extract_page_numbers,
    extract_tid_from_url,
    has_next_page,
)


class TestExtractTidFromUrl:
    def test_read_php格式(self):
        assert extract_tid_from_url('https://t66y.com/read.php?tid=7075205') == '7075205'

    def test_htm_data格式(self):
        assert extract_tid_from_url('https://t66y.com/htm_data/2401/20/7075205.html') == '7075205'

    def test_htm_data多级目录格式(self):
        assert extract_tid_from_url('https://t66y.com/htm_data/0612/9/5877.html') == '5877'

    def test_带其他参数的read_php(self):
        assert (
            extract_tid_from_url('https://t66y.com/read.php?tid=7075205&page=2&fpage=1')
            == '7075205'
        )

    def test_无tid返回None(self):
        assert extract_tid_from_url('https://t66y.com/thread0806.php?fid=20') is None


class TestBuildPaginationUrl:
    def test_从read_php构建(self):
        assert (
            build_pagination_url('https://t66y.com/read.php?tid=7075205', 3)
            == 'https://t66y.com/read.php?tid=7075205&page=3'
        )

    def test_从htm_data构建(self):
        assert (
            build_pagination_url('https://t66y.com/htm_data/2401/20/7075205.html', 2)
            == 'https://t66y.com/read.php?tid=7075205&page=2'
        )

    def test_无法提取tid时返回None(self):
        assert build_pagination_url('https://t66y.com/index.php', 1) is None


class TestSectionPaginationUrl:
    def test_无参数版块追加page(self):
        assert (
            build_section_pagination_url('https://t66y.com/thread0806.php?fid=20', 2)
            == 'https://t66y.com/thread0806.php?fid=20&page=2'
        )

    def test_已有page参数时替换(self):
        assert (
            build_section_pagination_url('https://t66y.com/thread0806.php?fid=20&page=2', 5)
            == 'https://t66y.com/thread0806.php?fid=20&page=5'
        )

    def test_已有其他参数时追加(self):
        assert (
            build_section_pagination_url('https://example.com/list?f=1', 3)
            == 'https://example.com/list?f=1&page=3'
        )


class TestExtractPageFromUrl:
    def test_有page参数(self):
        assert extract_page_from_url('https://t66y.com/read.php?tid=1&page=7') == 7

    def test_无page参数返回None(self):
        assert extract_page_from_url('https://t66y.com/read.php?tid=1') is None


class TestExtractPageNumbers:
    def test_从分页导航提取最大页码(self):
        html = '''
        <div class="pages">
            <a href="read.php?tid=1&page=1">1</a>
            <a href="read.php?tid=1&page=2">2</a>
            <a href="read.php?tid=1&page=5">5</a>
        </div>
        '''
        assert extract_page_numbers(html) == 5

    def test_无分页时返回1(self):
        assert extract_page_numbers('<html><body><p>没有链接</p></body></html>') == 1

    def test_最大页数限制生效(self):
        html = '<div class="pagination"><a href="?page=99999">尾页</a></div>'
        assert extract_page_numbers(html, max_allowed_pages=100) == 100


class TestHasNextPage:
    def test_存在下一页链接(self):
        html = '<div><a href="read.php?tid=1&page=3">下一页</a></div>'
        assert has_next_page(html, 2) is True

    def test_不存在下一页链接(self):
        html = '<div><a href="read.php?tid=1&page=2">上一页</a></div>'
        assert has_next_page(html, 2) is False
