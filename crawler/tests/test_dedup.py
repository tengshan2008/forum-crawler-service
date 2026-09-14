"""lib/dedup.py 去重判定纯函数测试。

决策语义与历史 crawl.py._is_post_exist 完全一致；函数无 I/O 和日志副作用，
人工排查日志由调用方 crawl.py._log_duplicate_decision 负责。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.dedup import evaluate_duplicate, SAVE, UPDATE, SKIP, LEGACY_NO_LENGTH  # noqa: E402


def test_url_不存在且无内容撞车时判定为新帖():
    assert evaluate_duplicate(None, None) == {
        'action': SAVE, 'reason': None, 'message': None, 'detail': None
    }


def test_url_不存在但内容哈希撞车时按内容重复跳过():
    result = evaluate_duplicate(None, {'sourceUrl': 'http://other/post'}, content_hash='h1')
    assert result['action'] == SKIP
    assert result['reason'] == 'content_duplicate'
    assert 'http://other/post' in result['message']
    assert result['detail'] is None


def test_url_存在且哈希相同判定为重复():
    url_post = {'contentLength': 100, 'contentHash': 'h1'}
    assert evaluate_duplicate(url_post, None, content_hash='h1', content_length=100) == {
        'action': SKIP,
        'reason': 'duplicate',
        'message': '帖子已存在（相同URL和内容）',
        'detail': None,
    }


def test_旧记录无长度但有正文且新内容更长时应覆盖更新():
    url_post = {'contentLength': None, 'content': '旧' * 10, 'contentHash': 'h1'}
    assert evaluate_duplicate(url_post, None, content_hash='h2', content_length=20) == {
        'action': UPDATE, 'reason': None, 'message': None, 'detail': None
    }


def test_旧记录无长度但有正文且长度相同时快速跳过():
    url_post = {'contentLength': None, 'content': 'a' * 10}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=10)
    assert result['action'] == SKIP
    assert result['reason'] == 'unchanged'
    assert '内容长度相同：10' in result['message']
    assert result['detail'] is None


def test_旧记录无长度但有正文且新内容更短时保留原内容():
    url_post = {'contentLength': None, 'content': 'a' * 30}
    result = evaluate_duplicate(url_post, None, content_length=10)
    assert result['action'] == SKIP
    assert result['reason'] == 'shorter_content'
    assert '旧：30字 → 新：10字' in result['message']
    assert result['detail'] is None


def test_双方都有长度但哈希不同时保守跳过_保持原行为():
    url_post = {'contentLength': 100, 'contentHash': 'h1'}
    assert evaluate_duplicate(url_post, None, content_hash='h2', content_length=200) == {
        'action': SKIP,
        'reason': 'same_url',
        'message': '相同URL的帖子已存在',
        'detail': None,
    }


def test_哈希不同且新内容无长度信息时允许更新():
    url_post = {'contentLength': 100, 'contentHash': 'h1'}
    assert evaluate_duplicate(url_post, None, content_hash='h2', content_length=None) == {
        'action': UPDATE, 'reason': None, 'message': None, 'detail': None
    }


def test_无长度无正文且有新长度时保守跳过并带旧数据提示():
    url_post = {'content': ''}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=50)
    assert result == {
        'action': SKIP,
        'reason': 'same_url',
        'message': '相同URL的帖子已存在',
        'detail': LEGACY_NO_LENGTH,
    }


def test_url_存在且无任何比对信息时保守跳过():
    assert evaluate_duplicate({'content': ''}, None) == {
        'action': SKIP,
        'reason': 'same_url',
        'message': '相同URL的帖子已存在',
        'detail': None,
    }


def test_已有contentLength且哈希相同时不误报旧数据提示():
    """已有 contentLength 的记录走哈希快判，detail 必须为 None"""
    url_post = {'contentLength': 12345, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=12345)
    assert result['action'] == SKIP
    assert result['reason'] == 'duplicate'
    assert result['detail'] is None


def test_已有contentLength且哈希不同时保守跳过且不误报提示():
    url_post = {'contentLength': 12345, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h2', content_length=54321)
    assert result['action'] == SKIP
    assert result['reason'] == 'same_url'
    assert result['detail'] is None


def test_无长度无正文但哈希恰好相同时判重复且保留旧数据提示():
    """警告先于哈希判定产生：即使哈希相同，旧数据提示也要透传给调用方"""
    url_post = {'content': '', 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=50)
    assert result['action'] == SKIP
    assert result['reason'] == 'duplicate'
    assert result['detail'] == LEGACY_NO_LENGTH


def test_纯函数不产生任何标准输出(capsys):
    """日志职责已上移调用方，evaluate_duplicate 自身不得 print"""
    evaluate_duplicate(
        {'contentLength': None, 'content': 'a' * 30}, None,
        content_hash='h2', content_length=10
    )
    evaluate_duplicate({'content': ''}, None, content_hash='h1', content_length=50)
    captured = capsys.readouterr()
    assert captured.out == ''
    assert captured.err == ''


# ---------------------------------------------------------------------------
# 边界矩阵补测：以下组合在决策矩阵中存在出口但此前无测试守卫
# ---------------------------------------------------------------------------

def test_url_未命中但带哈希长度查询无撞车时保存():
    """调用方给了 hash/length，但 contentHash 也查无 → 新帖保存"""
    assert evaluate_duplicate(None, None, content_hash='h1', content_length=50)['action'] == SAVE


def test_撞车文档缺sourceUrl键时消息回退未知URL():
    # 注意：撞车文档须为 truthy（find_one 命中必带字段，空 dict 会被当未命中）
    result = evaluate_duplicate(None, {'_id': 'x'}, content_hash='h1')
    assert result['action'] == SKIP
    assert result['reason'] == 'content_duplicate'
    assert '未知URL' in result['message']


def test_历史记录有正文但新内容长度为0时按更短保留():
    """nl=0 不可能大于/等于任何非空正文长度，必落 shorter_content"""
    url_post = {'contentLength': None, 'content': 'abc'}
    result = evaluate_duplicate(url_post, None, content_hash='h2', content_length=0)
    assert result['action'] == SKIP
    assert result['reason'] == 'shorter_content'


def test_历史记录有正文但新内容无长度且哈希不同时允许更新():
    """长度兜底分支因 nl=None 跳过，哈希不同 → 历史宽松 update"""
    url_post = {'contentLength': None, 'content': 'x' * 10, 'contentHash': 'h1'}
    assert evaluate_duplicate(url_post, None, content_hash='h2', content_length=None) == {
        'action': UPDATE, 'reason': None, 'message': None, 'detail': None
    }


def test_历史记录有正文新内容无长度且哈希相同时判重复():
    url_post = {'contentLength': None, 'content': 'x' * 10, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=None)
    assert result['action'] == SKIP
    assert result['reason'] == 'duplicate'
    assert result['detail'] is None


def test_无正文旧记录且旧哈希缺失时保守跳过并带提示():
    """旧记录 CH 缺失：即使信息不全也不放宽为 update"""
    result = evaluate_duplicate({'contentLength': None, 'content': ''}, None,
                                content_hash='h2', content_length=50)
    assert result['action'] == SKIP
    assert result['reason'] == 'same_url'
    assert result['detail'] == LEGACY_NO_LENGTH


def test_无正文旧记录且新哈希缺失时保守跳过并带提示():
    """新 hash=None（计算失败）：保守跳过，不进入任何更新路径"""
    url_post = {'contentLength': None, 'content': '', 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash=None, content_length=50)
    assert result['action'] == SKIP
    assert result['reason'] == 'same_url'
    assert result['detail'] == LEGACY_NO_LENGTH


def test_无正文旧记录新长度缺失且哈希不同时允许更新():
    """detail 与该 update 出口互斥（detail 要求 nl 有值，update 要求 nl=None）"""
    url_post = {'contentLength': None, 'content': '', 'contentHash': 'h1'}
    assert evaluate_duplicate(url_post, None, content_hash='h2', content_length=None) == {
        'action': UPDATE, 'reason': None, 'message': None, 'detail': None
    }


def test_正常记录缺contentHash时一律保守跳过():
    """旧记录有长度但无哈希字段：宽松 update 路径要求双方哈希都为真值"""
    url_post = {'contentLength': 100}
    assert evaluate_duplicate(url_post, None, content_hash='h2', content_length=200) == {
        'action': SKIP, 'reason': 'same_url', 'message': '相同URL的帖子已存在', 'detail': None
    }
    # 即使新内容连长度都没有，旧哈希缺失也不放宽
    assert evaluate_duplicate(url_post, None, content_hash='h2', content_length=None)['action'] == SKIP


def test_正常记录但新哈希为None时保守跳过():
    url_post = {'contentLength': 100, 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash=None, content_length=200)
    assert result['action'] == SKIP
    assert result['reason'] == 'same_url'
    assert result['detail'] is None


def test_旧记录长度为0且哈希相同时判重复():
    """CL=0（空内容旧帖）属于正常记录，走哈希快判"""
    url_post = {'contentLength': 0, 'contentHash': 'h0', 'content': ''}
    result = evaluate_duplicate(url_post, None, content_hash='h0', content_length=0)
    assert result['action'] == SKIP
    assert result['reason'] == 'duplicate'


def test_旧记录长度字段类型畸形时不抛异常且哈希快判仍有效():
    """脏数据（CL 为字符串）：present 即跳过数值比较，全程无 TypeError"""
    url_post = {'contentLength': '100', 'contentHash': 'h1'}
    result = evaluate_duplicate(url_post, None, content_hash='h1', content_length=100)
    assert result['action'] == SKIP
    assert result['reason'] == 'duplicate'
