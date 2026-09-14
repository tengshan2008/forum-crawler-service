"""去重按用户隔离测试（v2.18.3）。

不连真库：用假 self 直接调用 ForumCrawler 的未绑定方法，假集合记录查询过滤，
断言 sourceUrl/contentHash 查询与 upsert 过滤都携带 userId。
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bson import ObjectId  # noqa: E402

import crawl  # noqa: E402
from lib.dedup import SAVE, SKIP  # noqa: E402
from lib.post_builder import build_post_document  # noqa: E402

USER_A = ObjectId()
USER_B = ObjectId()


class FakeCollection:
    """按 (url/hash, userId) 存放文档，查询过滤缺 userId 或用户不匹配都视为未命中"""

    def __init__(self):
        self.url_docs = {}  # (url, userId) -> doc
        self.hash_docs = {}  # (hash, userId) -> doc
        self.queries = []
        self.bulk_filters = []

    def add_url_doc(self, url, user_id, doc):
        self.url_docs[(url, user_id)] = doc

    def add_hash_doc(self, h, user_id, doc):
        self.hash_docs[(h, user_id)] = doc

    def find_one(self, query):
        self.queries.append(query)
        assert 'userId' in query, f'去重查询必须携带 userId：{query}'
        if 'sourceUrl' in query:
            return self.url_docs.get((query['sourceUrl'], query['userId']))
        if 'contentHash' in query:
            return self.hash_docs.get((query['contentHash'], query['userId']))
        raise AssertionError(f'未预期的查询形态：{query}')

    def bulk_write(self, operations, ordered=False):
        self.bulk_filters = [op._filter for op in operations]
        return SimpleNamespace(upserted_count=len(operations))


def make_crawler(user_id, collection):
    return SimpleNamespace(
        user_id=user_id,
        posts_collection=collection,
        # _flush_post_buffer 写库后会协调系列 head；用户隔离用例用 no-op 桩即可
        _reconcile_series_heads=lambda saved_items: None,
    )


def test_url查询携带userId且他人同帖不影响本用户判定():
    coll = FakeCollection()
    # 用户 A 已爬过该 URL
    coll.add_url_doc('http://x/post', USER_A, {'contentLength': 10, 'contentHash': 'ha'})

    # 用户 B 重爬同一 URL：查无（隔离），应保存
    crawler_b = make_crawler(USER_B, coll)
    result = crawl.ForumCrawler._is_post_exist(crawler_b, 'http://x/post', 'hb', 10)
    assert result['action'] == SAVE
    assert all(q['userId'] == USER_B for q in coll.queries)
    assert any(q.get('sourceUrl') == 'http://x/post' for q in coll.queries)

    # 用户 A 再爬：命中自己的记录，哈希一致 → 跳过
    crawler_a = make_crawler(USER_A, coll)
    result_a = crawl.ForumCrawler._is_post_exist(crawler_a, 'http://x/post', 'ha', 10)
    assert result_a['action'] == SKIP
    assert result_a['reason'] == 'duplicate'


def test_url未命中时内容哈希撞车查询也限定本用户():
    coll = FakeCollection()
    # 同样内容只存在于用户 A 名下（不同 URL）
    coll.add_hash_doc('h-same', USER_A, {'sourceUrl': 'http://a/post'})

    # 用户 B 抓新 URL：哈希撞车查询限本用户 → 不命中 → 保存
    crawler_b = make_crawler(USER_B, coll)
    result = crawl.ForumCrawler._is_post_exist(crawler_b, 'http://b/post', 'h-same', 5)
    assert result['action'] == SAVE
    hash_queries = [q for q in coll.queries if 'contentHash' in q]
    assert hash_queries and all(q['userId'] == USER_B for q in hash_queries)

    # 用户 A 抓另一个新 URL：本用户内容撞车 → 跳过
    crawler_a = make_crawler(USER_A, coll)
    result_a = crawl.ForumCrawler._is_post_exist(crawler_a, 'http://c/post', 'h-same', 5)
    assert result_a['action'] == SKIP
    assert result_a['reason'] == 'content_duplicate'


def test_批量upsert过滤携带userId配合复合唯一索引():
    coll = FakeCollection()
    crawler = make_crawler(USER_A, coll)
    task_id = str(ObjectId())
    post1 = build_post_document(
        {'title': 't1', 'content': 'c', 'author': 'a', 'images': [], 'site': 't66y'},
        'http://x/1', 'novel', task_id, USER_A, None, None, None, [],
    )
    post2 = build_post_document(
        {'title': 't2', 'content': 'c', 'author': 'a', 'images': [], 'site': 't66y'},
        'http://x/2', 'novel', task_id, USER_A, None, None, None, [],
    )
    buffered = [
        {'post': post1, 'title': 't1'},
        {'post': post2, 'title': 't2'},
    ]
    saved = crawl.ForumCrawler._flush_post_buffer(crawler, buffered)
    assert len(saved) == 2
    assert coll.bulk_filters == [
        {'sourceUrl': 'http://x/1', 'userId': USER_A},
        {'sourceUrl': 'http://x/2', 'userId': USER_A},
    ]
