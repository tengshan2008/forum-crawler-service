#!/usr/bin/env python3
"""
为现有帖子计算并添加 contentHash 字段
这是一个数据库迁移脚本
"""

import sys
import os
import hashlib
import re
from pymongo import MongoClient
from datetime import datetime

def calculate_content_hash(content):
    """计算内容的 MD5 哈希值用于去重"""
    try:
        # 规范化内容：去除前后空白，规范化换行
        normalized_content = content.strip()
        normalized_content = re.sub(r'\s+', ' ', normalized_content)
        
        # 计算 MD5 哈希
        content_hash = hashlib.md5(normalized_content.encode('utf-8')).hexdigest()
        return content_hash
    except Exception as e:
        print(f"⚠ 计算内容哈希失败: {e}", file=sys.stderr)
        return None

def migrate():
    """执行迁移"""
    try:
        # 获取 MongoDB URI
        mongodb_uri = os.environ.get(
            'MONGODB_URI',
            'mongodb://admin:admin123@mongo:27017/forum-crawler?authSource=admin'
        )
        
        # 连接数据库
        client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        db = client['forum-crawler']
        posts_collection = db['posts']
        
        print("📊 开始为现有帖子计算 contentHash...", flush=True)
        
        # 查找所有没有 contentHash 的帖子
        posts_without_hash = list(posts_collection.find({'contentHash': {'$exists': False}}))
        total = len(posts_without_hash)
        
        if total == 0:
            print("✓ 所有帖子都已有 contentHash，无需迁移", flush=True)
            client.close()
            return True
        
        print(f"📋 找到 {total} 个需要计算 contentHash 的帖子", flush=True)
        
        updated_count = 0
        duplicate_count = 0
        failed_count = 0
        
        # 逐个计算并更新
        for i, post in enumerate(posts_without_hash, 1):
            post_id = post.get('_id')
            content = post.get('content', '')
            source_url = post.get('sourceUrl', '未知')
            
            if not content:
                print(f"⚠ {i}/{total} 帖子无内容，跳过: {source_url}", flush=True)
                failed_count += 1
                continue
            
            # 计算哈希
            content_hash = calculate_content_hash(content)
            if not content_hash:
                print(f"✗ {i}/{total} 计算哈希失败: {source_url}", flush=True)
                failed_count += 1
                continue
            
            # 检查是否有重复的内容哈希
            existing = posts_collection.find_one({
                'contentHash': content_hash,
                '_id': {'$ne': post_id}
            })
            
            if existing:
                print(f"⚠ {i}/{total} 检测到重复内容: {source_url} (与 {existing.get('sourceUrl')} 相同)", flush=True)
                duplicate_count += 1
            
            # 更新帖子
            try:
                result = posts_collection.update_one(
                    {'_id': post_id},
                    {
                        '$set': {
                            'contentHash': content_hash,
                            'migratedAt': datetime.utcnow()
                        }
                    }
                )
                
                if result.modified_count > 0:
                    print(f"✓ {i}/{total} 已更新: {source_url} (哈希: {content_hash[:8]}...)", flush=True)
                    updated_count += 1
                else:
                    print(f"⚠ {i}/{total} 未能更新: {source_url}", flush=True)
                    failed_count += 1
            except Exception as e:
                print(f"✗ {i}/{total} 更新失败: {source_url} - {e}", flush=True)
                failed_count += 1
        
        print(f"\n🎉 迁移完成!", flush=True)
        print(f"📊 成功更新: {updated_count}/{total}", flush=True)
        print(f"📊 检测到重复: {duplicate_count} 个", flush=True)
        print(f"📊 失败: {failed_count} 个", flush=True)
        
        # 验证所有帖子都有 contentHash
        final_count = posts_collection.count_documents({'contentHash': {'$exists': True}})
        print(f"✓ 验证: 共 {final_count} 个帖子有 contentHash", flush=True)
        
        client.close()
        return True
        
    except Exception as e:
        print(f"✗ 迁移失败: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = migrate()
    sys.exit(0 if success else 1)
