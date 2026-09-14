"""帖子文档构建纯函数库（从 crawl.py 下沉，供 pytest 直接测试）。

职责：任务类型的媒体处理决策、MongoDB 文档构建与 upsert 载荷构建。
下载动作通过注入的 download_images_func 完成，便于测试时替换为桩。
"""
from datetime import datetime, timezone

from bson import ObjectId

from lib.text_utils import calculate_content_hash

IMAGE_PLACEHOLDER = 'https://via.placeholder.com/300x200?text=No+Image'
EMPTY_PLACEHOLDER = 'https://via.placeholder.com/300x200?text=No+Content'

# image 任务存库正文模板（媒体处理与去重身份计算共用，避免两处文案漂移）
IMAGE_CONTENT_TEMPLATE = '楼主发布了 {} 张图片'


def image_content_override(images):
    """image 任务替换进文档的短文案"""
    return IMAGE_CONTENT_TEMPLATE.format(len(images))


def derive_post_identity(task_type, content, images):
    """按「实际存库内容」口径计算去重身份 (content_hash, content_length)。

    - image：存库正文会被替换成固定短文案，contentLength 取短文案长度（与
      v2.16.1 存量回填的 len(content) 口径一致）；内容指纹取楼主图片原始 URL
      的有序列表——重爬同帖同图哈希不变，换图/加图哈希改变；无图时指纹退回
      解析正文，避免所有无图帖互相撞 contentHash
    - novel/mixed/其他：存库正文即解析正文，直接哈希取长（与历史口径一致）
    """
    if task_type == 'image':
        images = images or []
        stored_content = image_content_override(images)
        urls = [img['url'] for img in images]
        fingerprint = '\n'.join(urls) if urls else (content or stored_content)
        return calculate_content_hash(fingerprint), len(stored_content)

    return calculate_content_hash(content), len(content)


def _download_and_map(images, task_id, download_images_func):
    """下载图片并将结果映射为 media 列表"""
    print(f"开始下载图片...", flush=True)
    image_urls = [img['url'] for img in images]
    download_results = download_images_func(image_urls, task_id)

    media = []
    success_count = 0
    for i, result in enumerate(download_results):
        if result['success']:
            media.append({
                'url': result['local_path'],
                'originalUrl': image_urls[i],
                'description': f'楼主图片 {i + 1}'
            })
            success_count += 1
        else:
            print(f"⚠ 图片下载失败 {i + 1}: {result['error']}", flush=True)

    print(f"✓ 图片下载完成: {success_count}/{len(images)} 成功", flush=True)
    return media


def build_media_and_content(post_data, task_type, task_id, download_images_func):
    """根据任务类型决定 media 与文本内容。

    Returns:
        (media, content_override)：content_override 非 None 时调用方需以其替换 post_data['content']
    """
    images = post_data['images']

    if task_type == 'novel':
        # 文本类：只保存文本内容，不保存图片
        print(f"✓ 获取楼主文本内容: {len(post_data['content'])} 字符", flush=True)
        return [], None

    if task_type == 'image':
        # 图片类：只保存图片，清空文本内容
        if images:
            print(f"✓ 获取楼主图片: {len(images)} 张", flush=True)
            media = _download_and_map(images, task_id, download_images_func)
            return media, image_content_override(images)

        print(f"⚠ 楼主未发布图片，使用占位符", flush=True)
        placeholder = [{
            'url': IMAGE_PLACEHOLDER,
            'description': '楼主未发布图片'
        }]
        return placeholder, image_content_override(images)

    # mixed：既保存文本也保存图片
    print(f"✓ 获取楼主内容: {len(post_data['content'])} 字符, {len(images)} 张图片", flush=True)
    if images:
        return _download_and_map(images, task_id, download_images_func), None
    return [], None


def build_post_document(post_data, forum_url, task_type, task_id, user_id,
                        content_hash, content_length, forum_last_post_time, media, now=None):
    """构建 MongoDB 帖子文档"""
    now = now or datetime.now(timezone.utc)
    # 站点标签：t66y（默认）/ crazyhome 等，由解析器写入 post_data['site']
    site = post_data.get('site') or 't66y'
    post = {
        'title': post_data['title'],
        'content': post_data['content'],
        'author': post_data['author'],
        'sourceUrl': forum_url,
        'postType': 'image' if task_type == 'image' else 'novel' if task_type == 'novel' else 'text',
        'likes': 0,
        'views': 0,
        'replies': 0,
        'status': 'active',
        'tags': [task_type, site],
        'taskId': ObjectId(task_id),
        'userId': user_id,
        'createdAt': now,
    }

    if content_hash:
        post['contentHash'] = content_hash
    if content_length is not None:
        post['contentLength'] = content_length
    if forum_last_post_time:
        post['forumLastPostTime'] = forum_last_post_time
    # 系列信息（crazyhome 等分章站点）：series 为系列名，chapterNo 为章节起始号
    if post_data.get('series'):
        post['series'] = post_data['series']
    if post_data.get('chapterNo') is not None:
        post['chapterNo'] = post_data['chapterNo']
    # 系列代表帖：默认置 True，批量写库后由协调逻辑把同系列其余章节置 False
    post['isSeriesHead'] = True

    if media:
        post['media'] = media
    else:
        # 如果没有媒体，添加占位符
        post['media'] = [{
            'url': EMPTY_PLACEHOLDER,
            'description': '暂无媒体内容'
        }]
    return post


def build_upsert_updates(post, now=None):
    """构建 update_one(upsert=True) 的更新载荷"""
    now = now or datetime.now(timezone.utc)
    updates = {
        '$set': {
            'title': post['title'],
            'content': post['content'],
            'author': post['author'],
            'postType': post['postType'],
            'likes': post['likes'],
            'views': post['views'],
            'replies': post['replies'],
            'status': post['status'],
            'tags': post['tags'],
            'taskId': post['taskId'],
            'userId': post['userId'],  # 确保更新也包含 userId
            'media': post['media'],
            'contentHash': post.get('contentHash'),
            'contentLength': post.get('contentLength'),
            'forumLastPostTime': post.get('forumLastPostTime'),
            'updatedAt': now,
        },
        '$setOnInsert': {
            'createdAt': now,
        }
    }
    # 系列字段：存在则更新，不存在则从文档中清除（避免重爬时残留旧值）
    if post.get('series'):
        updates['$set']['series'] = post['series']
    else:
        updates.setdefault('$unset', {})['series'] = ''
    if post.get('chapterNo') is not None:
        updates['$set']['chapterNo'] = post['chapterNo']
    else:
        updates.setdefault('$unset', {})['chapterNo'] = ''
    # 始终写入 isSeriesHead；写库后协调逻辑会把同系列非首章置 False
    updates['$set']['isSeriesHead'] = post.get('isSeriesHead', True)
    return updates


def dedupe_by_source_url(buffered):
    """批量写库前按 sourceUrl 去重（纯函数）。

    批量写库使用 ordered=False，同批出现两个相同 sourceUrl 的 upsert 会因
    sourceUrl 唯一索引触发重复键错误；此处保留后出现的条目（内容更新鲜），
    并维持首次出现的顺序。条目形如 {'post': {...文档含 sourceUrl}, ...}。
    """
    seen = {}
    result = []
    for item in buffered:
        url = item['post']['sourceUrl']
        if url in seen:
            # 同 URL 重复：保留较新条目，位置维持首次出现处
            result[seen[url]] = item
        else:
            seen[url] = len(result)
            result.append(item)
    return result
