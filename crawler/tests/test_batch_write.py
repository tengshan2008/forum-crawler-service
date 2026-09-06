"""crawl.py 批量写库（C2）测试：_flush_post_buffer / _save_post 单帖路径。

通过 ForumCrawler.__new__ 跳过 __init__（避免连接 MongoDB），
用 FakeCollection 记录 bulk_write 调用来验证行为。
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import crawl  # noqa: E402
from lib.post_builder import build_post_document  # noqa: E402
from pymongo import ReplaceOne  # noqa: E402
from pymongo.errors import BulkWriteError  # noqa: E402


class FakeCollection:
    """记录 bulk_write 调用的假集合，可注入部分失败"""

    def __init__(self, bulk_error=None):
        self.calls = []
        self.bulk_error = bulk_error

    def bulk_write(self, operations, ordered=True):
        self.calls.append({'operations': operations, 'ordered': ordered})
        if self.bulk_error is not None:
            raise self.bulk_error
        return types.SimpleNamespace(upserted_count=len(operations))


def make_crawler(bulk_error=None):
    crawler = crawl.ForumCrawler.__new__(crawl.ForumCrawler)
    crawler.task_id = '507f1f77bcf86cd799439011'
    crawler.user_id = 'u1'
    crawler.posts_collection = FakeCollection(bulk_error)
    return crawler


def make_item(url, title):
    post = build_post_document(
        {'title': title, 'content': 'c', 'author': 'a', 'images': []},
        url, 'novel', '507f1f77bcf86cd799439011', 'u1', None, None, None, [],
    )
    return {'post': post, 'title': title}


def partial_error(index):
    return BulkWriteError({'writeErrors': [{'index': index, 'errmsg': 'E11000'}], 'nInserted': index})


def test_flush_全部成功_一次写库且按序回调():
    crawler = make_crawler()
    saved_titles = []
    buffered = [make_item('http://a', '标题A'), make_item('http://b', '标题B')]

    saved = crawler._flush_post_buffer(
        buffered, on_saved=lambda item: saved_titles.append(item['title'])
    )

    assert len(saved) == 2
    assert saved_titles == ['标题A', '标题B']
    assert len(crawler.posts_collection.calls) == 1
    call = crawler.posts_collection.calls[0]
    assert call['ordered'] is False  # 同批互不阻塞
    assert len(call['operations']) == 2
    op = call['operations'][0]
    assert isinstance(op, ReplaceOne)
    assert op._filter == {'sourceUrl': 'http://a'}
    assert op._doc['$set']['title'] == '标题A'
    assert op._upsert is True


def test_flush_同_url只写一条且保留较新条目():
    crawler = make_crawler()
    buffered = [make_item('http://a', '旧标题'), make_item('http://b', '标题B'), make_item('http://a', '新标题')]

    saved = crawler._flush_post_buffer(buffered)

    assert [item['title'] for item in saved] == ['新标题', '标题B']
    assert len(crawler.posts_collection.calls[0]['operations']) == 2  # 去重后只剩 2 条


def test_flush_部分失败_失败条目不计入成功():
    crawler = make_crawler(bulk_error=partial_error(1))  # 第 2 条失败
    saved_titles = []
    buffered = [make_item('http://a', 'A'), make_item('http://b', 'B'), make_item('http://c', 'C')]

    saved = crawler._flush_post_buffer(
        buffered, on_saved=lambda item: saved_titles.append(item['title'])
    )

    assert [item['title'] for item in saved] == ['A', 'C']
    assert saved_titles == ['A', 'C']


def test_flush_空缓冲_不触发写库():
    crawler = make_crawler()

    saved = crawler._flush_post_buffer([])

    assert saved == []
    assert crawler.posts_collection.calls == []


def test_save_post_单帖路径_准备并立即写库返回True(monkeypatch):
    crawler = make_crawler()
    monkeypatch.setattr(crawl, 'initialize_image_dirs', lambda: None)
    monkeypatch.setattr(crawler, '_calculate_content_hash', lambda content: 'hash1')
    monkeypatch.setattr(
        crawl, 'build_media_and_content',
        lambda post_data, task_type, task_id, download: ([], None),
    )

    post_data = {'title': '标题', 'content': '正文', 'author': '作者', 'images': []}
    result = crawler._save_post(post_data, 'http://p', 'novel')

    assert result is True
    assert len(crawler.posts_collection.calls) == 1
    op = crawler.posts_collection.calls[0]['operations'][0]
    assert op._filter == {'sourceUrl': 'http://p'}
    assert op._doc['$set']['contentHash'] == 'hash1'


def test_save_post_准备阶段异常返回False且不写库(monkeypatch):
    crawler = make_crawler()

    def boom(content):
        raise ValueError('hash failed')

    monkeypatch.setattr(crawl, 'initialize_image_dirs', lambda: None)
    monkeypatch.setattr(crawler, '_calculate_content_hash', boom)

    post_data = {'title': '标题', 'content': '正文', 'author': '作者', 'images': []}
    result = crawler._save_post(post_data, 'http://p', 'novel')

    assert result is False
    assert crawler.posts_collection.calls == []
