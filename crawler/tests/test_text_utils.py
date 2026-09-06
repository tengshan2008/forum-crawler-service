"""lib.text_utils 纯函数测试：内容哈希、<br> 转换、乱码检测"""

from bs4 import BeautifulSoup

from lib.text_utils import calculate_content_hash, extract_text_content, is_garbage_content


class TestCalculateContentHash:
    def test_相同内容哈希一致(self):
        assert calculate_content_hash('你好世界 hello') == calculate_content_hash('你好世界 hello')

    def test_不同内容哈希不同(self):
        assert calculate_content_hash('内容A') != calculate_content_hash('内容B')

    def test_前后空白被规范化(self):
        assert calculate_content_hash('  abc  ') == calculate_content_hash('abc')

    def test_连续空白折叠为单空格(self):
        assert (
            calculate_content_hash('a\n\n  b\tc')
            == calculate_content_hash('a b c')
        )

    def test_换行差异不影响哈希(self):
        # 去重语义：仅换行/空格不同的重复帖子视为相同
        assert calculate_content_hash('段落一\n\n段落二') == calculate_content_hash('段落一 段落二')

    def test_非法输入返回None(self):
        assert calculate_content_hash(None) is None


class TestExtractTextContent:
    def make_soup(self, html):
        return BeautifulSoup(html, 'html.parser')

    def test_br转换为换行符(self):
        div = self.make_soup('<div>第一行<br>第二行<br>第三行</div>').find('div')
        text = extract_text_content(div)
        assert '第一行\n第二行\n第三行' in text

    def test_多个br连续转换为换行(self):
        div = self.make_soup('<div>段落一<br><br>段落二</div>').find('div')
        text = extract_text_content(div)
        assert '段落一\n\n段落二' in text

    def test_段落间距规范化(self):
        div = self.make_soup('<div>段落一\n   \n\n\n段落二</div>').find('div')
        text = extract_text_content(div)
        assert '段落一\n\n段落二' in text

    def test_首尾空白被移除且保留内部换行(self):
        div = self.make_soup('<div>\n  正文第一行\n正文第二行\n  </div>').find('div')
        text = extract_text_content(div)
        assert text == '正文第一行\n正文第二行'

    def test_嵌套标签内的br也被处理(self):
        div = self.make_soup('<div>开头<span>嵌套<br>内容</span><br>结尾</div>').find('div')
        text = extract_text_content(div)
        assert '嵌套\n内容' in text
        assert '开头嵌套' in text

    def test_无br时原样提取(self):
        div = self.make_soup('<div>纯文本内容</div>').find('div')
        assert extract_text_content(div) == '纯文本内容'


class TestIsGarbageContent:
    def test_空内容判定为乱码(self):
        assert is_garbage_content('') is True
        assert is_garbage_content(None) is True

    def test_过短内容判定为乱码(self):
        assert is_garbage_content('<html><body>hi</body></html>') is True

    def test_正常中文HTML页面判定为正常(self):
        html = (
            '<html><head><title>论坛帖子</title></head><body>'
            '<div>' + '这是正常的中文帖子内容，包含标点符号。' * 20 + '</div>'
            '</body></html>'
        )
        assert is_garbage_content(html) is False

    def test_无HTML标签的纯文本判定为乱码(self):
        # 无任何常见标签 → 乱码（无论内容多长）
        garbage = '??????' * 500
        assert is_garbage_content(garbage) is True

    def test_大量替换字符判定为乱码(self):
        html = '<html><body>' + '\ufffd' * 100 + '</body></html>'
        assert is_garbage_content(html) is True

    def test_高比例不可打印字符判定为乱码(self):
        # 有标签但内容几乎全是不可打印字符
        html = '<html><body>' + '\x01\x02\x03' * 1000 + '</body></html>'
        assert is_garbage_content(html) is True
