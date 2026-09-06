"""lib/dedup.py 去重判定纯函数测试（语义与原 crawl.py._is_post_exist 一致）"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.dedup import evaluate_duplicate  # noqa: E402


def test_url_不存在且无内容撞车时判定为新帖():
    result = evaluate_duplicate(None, None)
    assert result == {'exists': False, 'reason': None, 'message': None}


def test_url_不存在但内容哈希撞车时按内容重复跳过():
    result = evaluate_duplicate(None, {'sourceUrl': 'http://other/post'}, content_hash='h1')
    assert result['exists'] is True
    assert result['reason'] == 'content_duplicate'
    assert 'http://other/post' in result['message']


def test_url_存在且哈希相同判定为重复():
    url_post = {'contentLength': 100, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=100)
    assert result == {'exists': True, 'reason': 'duplicate', 'message': '帖子已存在（相同URL和内容）'}


def test_旧记录无长度但有正文且新内容更长时应覆盖更新():
    url_post = {'contentLength': None, 'content': '旧' * 10, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h2', content_length=20)
    assert result == {'exists': False, 'reason': None, 'message': None, 'shouldUpdate': True}


def test_旧记录无长度但有正文且长度相同时快速跳过():
    url_post = {'contentLength': None, 'content': 'a' * 10}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=10)
    assert result['exists'] is True
    assert result['reason'] == 'unchanged'
    assert '内容长度相同：10' in result['message']


def test_旧记录无长度但有正文且新内容更短时保留原内容():
    url_post = {'contentLength': None, 'content': 'a' * 30}
    result = evaluate_duplicate(url_post, None, content_length=10)
    assert result['exists'] is True
    assert result['reason'] == 'shorter_content'
    assert '旧：30字 → 新：10字' in result['message']


def test_双方都有长度但哈希不同时保守跳过_保持原行为():
    url_post = {'contentLength': 100, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h2', content_length=200)
    assert result == {'exists': True, 'reason': 'same_url', 'message': '相同URL的帖子已存在'}


def test_哈希不同且新内容无长度信息时允许更新():
    url_post = {'contentLength': 100, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h2', content_length=None)
    assert result == {'exists': False, 'reason': None, 'message': None, 'shouldUpdate': True}


def test_无长度信息且无哈希时保守跳过():
    url_post = {'content': ''}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=50)
    assert result == {'exists': True, 'reason': 'same_url', 'message': '相同URL的帖子已存在'}


def test_url_存在且无任何比对信息时保守跳过():
    result = evaluate_duplicate({'content': ''}, None)
    assert result == {'exists': True, 'reason': 'same_url', 'message': '相同URL的帖子已存在'}
