"""回归测试：<br> 标签转换（原 tests/data/test_br_conversion.py 改写）。

原脚本以 print 输出、复制被测逻辑；现改为 import 爬虫真实模块 lib.text_utils，
样本保留自原始论坛页面的真实 HTML 片段（含全角空格、连续 <br>）。
"""

from bs4 import BeautifulSoup

from lib.text_utils import extract_text_content

# 原始测试样本：转自书剑别传帖子，含 <br>、全角空格、缩进
TEST_HTML = """<div class="tpc_content do_not_catch" id="conttpc">转自书剑别传-蔺石，已搜索查重。<br>序章 一、二<br>序章　损兵折将红花会众虎隐龙潜<br>　<br>　　祭奠完香香公主之后，红花会群雄带着福安康离开了京师。在离开京师之前，众人特地讨论了一下今后行止，众人都一致认为，既然福安康的安置地点是第一要务，那么讨论清楚就是必要的。</div>"""


def make_element():
    return BeautifulSoup(TEST_HTML, 'html.parser').find('div', id='conttpc')


def test_单br替换为换行():
    text = extract_text_content(make_element())
    assert '转自书剑别传-蔺石，已搜索查重。\n序章 一、二' in text


def test_全角空格缩进被保留():
    text = extract_text_content(make_element())
    # 全角空格缩进（\u3000）不属于 strip 目标，正文中应保留
    assert '　　祭奠完香香公主之后' in text


def test_仅空白的行为被折叠为空行():
    text = extract_text_content(make_element())
    # "<br>　<br>" 产生 "行\n　\n行" → 段落规范化折叠为空行
    assert '\n\n' in text
    assert '\n　\n' not in text


def test_结果无首尾空白():
    text = extract_text_content(make_element())
    assert text == text.strip()
    assert text.startswith('转自书剑别传')


def test_空元素返回空字符串():
    element = BeautifulSoup('<div></div>', 'html.parser').find('div')
    assert extract_text_content(element) == ''
