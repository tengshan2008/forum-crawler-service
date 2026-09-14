"""lib/post_builder.py 帖子文档构建纯函数测试"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.post_builder import (  # noqa: E402
    build_media_and_content,
    build_post_document,
    build_upsert_updates,
    dedupe_by_source_url,
    derive_post_identity,
    image_content_override,
)
from lib.text_utils import calculate_content_hash  # noqa: E402

BASE_POST_DATA = {
    'title': '测试标题',
    'content': '正文内容',
    'author': '作者',
    'images': [],
}


def ok_result(url):
    return {'success': True, 'local_path': f'/images/{url}.jpg', 'error': None}


def fail_result(error):
    return {'success': False, 'local_path': None, 'error': error}


def make_download(results):
    return lambda urls, task_id: results


def test_novel_类型不下载图片且保留原文():
    media, content_override = build_media_and_content(BASE_POST_DATA, 'novel', 't1', make_download([]))
    assert media == []
    assert content_override is None


def test_image_类型有图时下载并映射_media_且替换正文():
    data = dict(BASE_POST_DATA, images=[{'url': 'a.jpg'}, {'url': 'b.jpg'}])
    called = {}

    def fake_download(urls, task_id):
        called['urls'] = urls
        called['task_id'] = task_id
        return [ok_result('a'), fail_result('timeout')]

    media, content_override = build_media_and_content(data, 'image', 't1', fake_download)

    assert called == {'urls': ['a.jpg', 'b.jpg'], 'task_id': 't1'}
    assert media == [
        {'url': '/images/a.jpg', 'originalUrl': 'a.jpg', 'description': '楼主图片 1'},
    ]
    assert content_override == '楼主发布了 2 张图片'


def test_image_类型无图时使用占位符():
    media, content_override = build_media_and_content(BASE_POST_DATA, 'image', 't1', make_download([]))
    assert media == [{
        'url': 'https://via.placeholder.com/300x200?text=No+Image',
        'description': '楼主未发布图片',
    }]
    assert content_override == '楼主发布了 0 张图片'


def test_mixed_类型有图时下载且不替换正文():
    data = dict(BASE_POST_DATA, images=[{'url': 'a.jpg'}])
    media, content_override = build_media_and_content(
        data, 'mixed', 't1', make_download([ok_result('a')])
    )
    assert media == [{'url': '/images/a.jpg', 'originalUrl': 'a.jpg', 'description': '楼主图片 1'}]
    assert content_override is None
    assert data['content'] == '正文内容'  # 不修改输入


def test_mixed_类型无图时_media_为空():
    media, content_override = build_media_and_content(BASE_POST_DATA, 'mixed', 't1', make_download([]))
    assert media == []
    assert content_override is None


def test_build_post_document_字段完整且条件字段按需写入():
    now = datetime(2026, 9, 6, tzinfo=timezone.utc)
    post = build_post_document(
        dict(BASE_POST_DATA, content='新正文'), 'http://post/1', 'novel', '507f1f77bcf86cd799439011', 'user1',
        'hash1', 100, now, [], now=now,
    )

    assert post['title'] == '测试标题'
    assert post['content'] == '新正文'
    assert post['sourceUrl'] == 'http://post/1'
    assert post['postType'] == 'novel'
    assert post['status'] == 'active'
    assert post['tags'] == ['novel', 't66y']
    assert str(post['taskId']) == '507f1f77bcf86cd799439011'
    assert post['userId'] == 'user1'
    assert post['createdAt'] == now
    assert post['contentHash'] == 'hash1'
    assert post['contentLength'] == 100
    assert post['forumLastPostTime'] == now
    # media 为空时落占位符
    assert post['media'] == [{
        'url': 'https://via.placeholder.com/300x200?text=No+Content',
        'description': '暂无媒体内容',
    }]


def test_build_post_document_任务类型映射与条件字段省略():
    post = build_post_document(BASE_POST_DATA, 'http://post/2', 'image', '507f1f77bcf86cd799439011', None,
                               None, None, None, [{'url': 'x'}])
    assert post['postType'] == 'image'
    assert 'contentHash' not in post
    assert 'contentLength' not in post
    assert 'forumLastPostTime' not in post
    assert post['media'] == [{'url': 'x'}]


def test_build_upsert_updates_载荷完整且时间戳一致():
    now = datetime(2026, 9, 6, tzinfo=timezone.utc)
    post = build_post_document(BASE_POST_DATA, 'http://p', 'novel', '507f1f77bcf86cd799439011', 'u1',
                               'h', 5, None, [])
    updates = build_upsert_updates(post, now)

    assert updates['$set']['title'] == '测试标题'
    assert updates['$set']['userId'] == 'u1'
    assert updates['$set']['contentHash'] == 'h'
    assert updates['$set']['updatedAt'] == now
    assert updates['$setOnInsert'] == {'createdAt': now}


def test_build_upsert_updates_缺省时间为当前_utc时间():
    post = build_post_document(BASE_POST_DATA, 'http://p', 'novel', '507f1f77bcf86cd799439011', 'u1',
                               None, None, None, [])
    updates = build_upsert_updates(post)

    assert updates['$set']['contentHash'] is None
    assert updates['$set']['updatedAt'].tzinfo is timezone.utc
    assert updates['$setOnInsert']['createdAt'] == updates['$set']['updatedAt']


def test_dedupe_by_source_url_保留后出现的同_url条目且维持首现顺序():
    items = [
        {'post': {'sourceUrl': 'http://a'}, 'title': 'a1'},
        {'post': {'sourceUrl': 'http://b'}, 'title': 'b'},
        {'post': {'sourceUrl': 'http://a'}, 'title': 'a2'},  # 重定向后同 URL，保留较新的 a2
    ]
    deduped = dedupe_by_source_url(items)

    assert [it['title'] for it in deduped] == ['a2', 'b']


def test_dedupe_by_source_url_无重复时原样返回():
    items = [
        {'post': {'sourceUrl': 'http://a'}, 'title': 'a'},
        {'post': {'sourceUrl': 'http://b'}, 'title': 'b'},
    ]
    assert dedupe_by_source_url(items) == items


def test_dedupe_by_source_url_空缓冲返回空列表():
    assert dedupe_by_source_url([]) == []


# ---------------------------------------------------------------------------
# derive_post_identity：去重身份必须按「实际存库内容」口径
# ---------------------------------------------------------------------------

def test_novel_身份取正文哈希与长度():
    content = '小说正文' * 10
    h, length = derive_post_identity('novel', content, [])
    assert h == calculate_content_hash(content)
    assert length == len(content)


def test_mixed_身份取正文哈希与长度_图片不影响指纹():
    content = '混合内容'
    h, length = derive_post_identity('mixed', content, [{'url': 'a.jpg'}])
    assert h == calculate_content_hash(content)
    assert length == len(content)


def test_image_有图时指纹为图片URL列表且长度为存库短文案():
    images = [{'url': 'http://x/1.jpg'}, {'url': 'http://x/2.jpg'}]
    h, length = derive_post_identity('image', '解析到的原始正文文本', images)
    assert h == calculate_content_hash('http://x/1.jpg\nhttp://x/2.jpg')
    assert length == len(image_content_override(images))
    assert length == len('楼主发布了 2 张图片')


def test_image_身份与解析正文无关_重爬同图哈希稳定():
    images = [{'url': 'http://x/1.jpg'}]
    h1, _ = derive_post_identity('image', '第一次解析的正文', images)
    h2, _ = derive_post_identity('image', '正文因楼层噪声完全不同', images)
    assert h1 == h2


def test_image_换图或调序后指纹改变():
    h1, _ = derive_post_identity('image', 'c', [{'url': 'http://x/1.jpg'}])
    h2, _ = derive_post_identity('image', 'c', [{'url': 'http://x/2.jpg'}])
    h3, _ = derive_post_identity(
        'image', 'c', [{'url': 'http://x/2.jpg'}, {'url': 'http://x/1.jpg'}]
    )
    assert h1 != h2
    assert h2 != h3  # URL 列表有序，顺序是身份的一部分


def test_image_长度与build_media_and_content替换的存库文案一致():
    images = [{'url': 'http://x/1.jpg'}, {'url': 'http://x/2.jpg'}, {'url': 'http://x/3.jpg'}]
    _, length = derive_post_identity('image', '正文', images)
    media, override = build_media_and_content(
        {'content': '正文', 'images': images}, 'image', 't1', make_download([])
    )
    assert override is not None
    assert length == len(override)


def test_image_无图时指纹退回正文_避免无图帖互相撞车():
    h, length = derive_post_identity('image', '各自不同的解析正文', [])
    assert h == calculate_content_hash('各自不同的解析正文')
    assert length == len('楼主发布了 0 张图片')

    h2, _ = derive_post_identity('image', '另一帖的正文', [])
    assert h != h2


def test_image_无图且无正文时指纹退回短文案():
    h, length = derive_post_identity('image', '', [])
    assert h == calculate_content_hash('楼主发布了 0 张图片')
    assert length == len('楼主发布了 0 张图片')
