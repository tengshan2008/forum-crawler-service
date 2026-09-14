"""crazyhome 归档页文章链接提取测试。

离线构造最小 HTML：主内容区 <main> 内含 rel=bookmark 的当前归档文章，
侧栏「近期文章」推荐位链接不带 rel=bookmark。
断言只提取主列表文章，不把跨版块推荐内容混入采集任务。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import crawl  # noqa: E402

BASE = 'https://www.crazyhome2000.com'


def _crawler():
    # 绕过 __init__（避免连库/建会话），仅需实例上的未绑定方法
    return crawl.ForumCrawler.__new__(crawl.ForumCrawler)


def _category_html():
    # 分类页：section.sec-panel-list > ul.post-loop-list > li.item > a[rel=bookmark]
    items = ''.join(
        f'<li class="item"><a href="{BASE}/{slug}/" rel="bookmark"><span>{title}</span></a>'
        f'<span class="date">2026年9月13日</span></li>'
        for slug, title in [('shu-1', '玄幻书 1'), ('shu-2', '玄幻书 2'), ('shu-3', '玄幻书 3')]
    )
    # 侧栏「近期文章」推荐：跨版块链接，无 rel=bookmark
    recs = ''.join(
        f'<li><a href="{BASE}/{slug}/">{title}</a></li>'
        for slug, title in [('tui-jian-a', '推荐书甲'), ('tui-jian-b', '推荐书乙')]
    )
    return f'''
    <html><body>
      <main class="main">
        <section class="sec-panel sec-panel-list">
          <div class="sec-panel-body">
            <ul class="post-loop post-loop-list cols-0">{items}</ul>
          </div>
        </section>
      </main>
      <aside class="sidebar">
        <h3 class="widget-title"><span>近期文章</span></h3>
        <ul>{recs}</ul>
      </aside>
    </body></html>
    '''


def _tag_html():
    # 标签页：ul.post-loop-post-loop-default-cols-0 > li.item > h3.item-title > a[rel=bookmark]
    items = ''.join(
        '<li class="item"><div class="item-content">'
        f'<h3 class="item-title"><a href="{BASE}/woyouyijian-{n}/" rel="bookmark">我有一剑 {n}</a></h3>'
        '</div></li>'
        for n in range(1, 6)
    )
    recs = ''.join(
        f'<li><a href="{BASE}/other-{n}/">无关推荐 {n}</a></li>'
        for n in range(1, 4)
    )
    return f'''
    <html><body>
      <main><ul class="post-loop-post-loop-default-cols-0">{items}</ul>
        <ul class="pagination">
          <li class="active"><a href="{BASE}/tag/x/">1</a></li>
          <li><a href="{BASE}/tag/x/page/2/">2</a></li>
          <li class="next"><a href="{BASE}/tag/x/page/2/"></a></li>
        </ul>
      </main>
      <aside><span>近期文章</span><ul>{recs}</ul></aside>
    </body></html>
    '''


def test_分类页只提取主列表文章排除近期推荐():
    links = _crawler()._extract_crazyhome_post_links(_category_html())
    assert links == [f'{BASE}/shu-1/', f'{BASE}/shu-2/', f'{BASE}/shu-3/']
    assert all('tui-jian' not in u for u in links)


def test_标签页只提取本书章节排除近期推荐():
    links = _crawler()._extract_crazyhome_post_links(_tag_html())
    assert len(links) == 5
    assert all('woyouyijian' in u for u in links)
    assert all('other-' not in u for u in links)


def test_主选择器失效时回退启发式仍排除功能页():
    # 无 rel=bookmark、无 main：回退启发式，保留文章链接，排除 category/page/tag 等功能路径
    html = f'''
    <html><body><ul>
      <li><a href="{BASE}/article-a/">文章甲标题</a></li>
      <li><a href="{BASE}/category/x/">分类入口标题</a></li>
      <li><a href="{BASE}/tag/y/page/2/">标签分页标题</a></li>
    </ul></body></html>
    '''
    links = _crawler()._extract_crazyhome_post_links(html)
    assert links == [f'{BASE}/article-a/']


def test_空页面返回空列表不抛异常():
    assert _crawler()._extract_crazyhome_post_links('<html><body></body></html>') == []
