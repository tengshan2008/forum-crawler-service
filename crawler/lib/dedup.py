"""去重判定纯函数库（从 crawl.py 下沉，供 pytest 直接测试）。

数据库查询由调用方完成，本模块只做决策，保证逻辑可测。
判定语义与原 crawl.py._is_post_exist 完全一致（含原有的保守处理路径）。
"""


def evaluate_duplicate(url_post, content_duplicate, content_hash=None, content_length=None):
    """基于已有记录判断新内容是跳过、覆盖更新还是保存。

    Args:
        url_post: 按 sourceUrl 查到的已有帖子文档（可为 None）
        content_duplicate: 按 contentHash 查到的重复文档（可为 None，仅 URL 未命中时由调用方查询）
        content_hash: 新内容哈希值
        content_length: 新爬取的内容长度（字符数）

    Returns:
        {'exists': bool, 'reason': str|None, 'message': str|None, 'shouldUpdate': bool?}
    """
    if url_post:
        # URL存在，进行内容长度判断
        if content_length is not None:
            existing_length = url_post.get('contentLength')

            # 如果现有记录没有contentLength，尝试从content字段计算
            if existing_length is None and url_post.get('content'):
                existing_length = len(url_post.get('content', ''))
                # 都有长度信息，进行比较
                print(f"📏 内容长度对比（旧：{existing_length} → 新：{content_length}）", flush=True)
                if content_length > existing_length:
                    # 新内容更长，需要更新
                    print(f"📏 新内容更长，准备覆盖更新", flush=True)
                    return {
                        'exists': False,
                        'reason': None,
                        'message': None,
                        'shouldUpdate': True
                    }
                elif content_length == existing_length:
                    # 内容长度相同，判断为重复
                    print(f"📏 内容长度相同，帖子未更新，快速跳过", flush=True)
                    return {
                        'exists': True,
                        'reason': 'unchanged',
                        'message': f'帖子未更新（内容长度相同：{content_length}）'
                    }
                else:
                    # 新内容更短，保留原来的
                    print(f"📏 新内容更短，保留原内容", flush=True)
                    return {
                        'exists': True,
                        'reason': 'shorter_content',
                        'message': f'新内容更短（旧：{existing_length}字 → 新：{content_length}字），保留原内容'
                    }
            else:
                # 现有记录没有长度信息，可能是旧数据
                print(f"⚠ 现有记录无长度信息（旧数据），新内容长度：{content_length} 字符，将继续用内容哈希进行检查", flush=True)

        # 进行内容哈希检查
        if content_hash:
            existing_hash = url_post.get('contentHash')
            if existing_hash and existing_hash == content_hash:
                # 相同URL，相同内容
                return {
                    'exists': True,
                    'reason': 'duplicate',
                    'message': '帖子已存在（相同URL和内容）'
                }
            elif existing_hash and existing_hash != content_hash:
                # 相同URL，不同内容 - 如果没有内容长度信息，允许更新
                if content_length is None:
                    return {
                        'exists': False,
                        'reason': None,
                        'message': None,
                        'shouldUpdate': True
                    }

        # 无法通过哈希验证，保守处理
        return {
            'exists': True,
            'reason': 'same_url',
            'message': '相同URL的帖子已存在'
        }

    # URL不存在，检查内容哈希是否重复
    if content_duplicate:
        existing_url = content_duplicate.get('sourceUrl', '未知URL')
        return {
            'exists': True,
            'reason': 'content_duplicate',
            'message': f'相同内容已存在于: {existing_url}'
        }

    return {
        'exists': False,
        'reason': None,
        'message': None
    }
