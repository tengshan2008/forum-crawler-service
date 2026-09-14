"""去重判定纯函数库（从 crawl.py 下沉，供 pytest 直接测试）。

数据库查询与日志输出均由调用方完成，本模块只做决策（无 I/O、无副作用）。

判定语义（与历史 crawl.py._is_post_exist 完全一致）：

1. URL 未命中：contentHash 撞车 → 内容重复跳过；否则保存为新帖。
2. URL 命中但旧记录缺 contentLength（回填前的历史数据）：用正文长度兜底
   比对——新内容更长→覆盖更新；等长→跳过；更短→保留原内容。
3. URL 命中且记录正常（有 contentLength）：只信 contentHash——哈希相同→
   重复跳过；哈希不同或信息不全→保守跳过（same_url），仅当新内容连长度
   都没有时才允许覆盖更新（历史宽松路径）。
"""

SAVE = 'save'
UPDATE = 'update'
SKIP = 'skip'

# detail 提示码：旧记录既无 contentLength 也无正文可推算长度
LEGACY_NO_LENGTH = 'legacy_no_length'


def _decision(action, reason=None, message=None, detail=None):
    return {
        'action': action,
        'reason': reason,
        'message': message,
        'detail': detail,
    }


def evaluate_duplicate(url_post, content_duplicate, content_hash=None, content_length=None):
    """基于已有记录判断新内容是保存、覆盖更新还是跳过。

    Args:
        url_post: 按 sourceUrl 查到的已有帖子文档（可为 None）
        content_duplicate: 按 contentHash 查到的重复文档（可为 None，
            仅 URL 未命中时由调用方查询）
        content_hash: 新内容哈希值
        content_length: 新爬取的内容长度（字符数）

    Returns:
        {'action': SAVE|UPDATE|SKIP, 'reason': str|None,
         'message': str|None, 'detail': str|None}
        action=SKIP 时 reason 取值：duplicate | same_url |
        content_duplicate | unchanged | shorter_content（该枚举受
        backend Task 模型 skipReasons 约束，勿随意改名）。
    """
    # 1. URL 未命中：仅靠内容哈希判断是否与其他帖子撞车
    if not url_post:
        if content_duplicate:
            return _decision(
                SKIP, 'content_duplicate',
                f"相同内容已存在于: {content_duplicate.get('sourceUrl', '未知URL')}"
            )
        return _decision(SAVE)

    # 2. 历史记录无 contentLength 时，用正文长度兜底比对
    #    （v2.16.1 已全库回填 contentLength，正常记录不会走此分支）
    existing_length = url_post.get('contentLength')
    if content_length is not None and existing_length is None and url_post.get('content'):
        old_length = len(url_post['content'])
        if content_length > old_length:
            return _decision(UPDATE)
        if content_length == old_length:
            return _decision(
                SKIP, 'unchanged',
                f'帖子未更新（内容长度相同：{content_length}）'
            )
        return _decision(
            SKIP, 'shorter_content',
            f'新内容更短（旧：{old_length}字 → 新：{content_length}字），保留原内容'
        )

    # 3. 旧记录既无长度也无正文可推算：标记给调用方提示，随后继续走哈希
    detail = None
    if (
        content_length is not None
        and existing_length is None
        and not url_post.get('content')
    ):
        detail = LEGACY_NO_LENGTH

    # 4. 正常记录只信内容哈希
    existing_hash = url_post.get('contentHash')
    if content_hash and existing_hash:
        if existing_hash == content_hash:
            return _decision(
                SKIP, 'duplicate', '帖子已存在（相同URL和内容）', detail=detail
            )
        if content_length is None:
            # 同 URL 不同内容，且新内容没有长度信息，沿用历史宽松策略允许更新
            return _decision(UPDATE)

    # 5. 哈希不一致或信息不全，无法确认安全更新 → 保守跳过
    return _decision(SKIP, 'same_url', '相同URL的帖子已存在', detail=detail)
