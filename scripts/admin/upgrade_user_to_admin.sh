#!/bin/bash

# 将用户升级为管理员

set -e

USER_EMAIL=$1
NEW_ROLE=${2:-admin}

if [ -z "$USER_EMAIL" ]; then
  echo "用法: $0 <user_email> [new_role]"
  echo "示例: $0 user1_1234567@example.com admin"
  exit 1
fi

echo "将用户 $USER_EMAIL 升级为 $NEW_ROLE..."

# 使用 Python 脚本通过 PyMongo 更新用户角色
python3 << EOF
import pymongo
import sys

try:
    client = pymongo.MongoClient('mongodb://mongo:27017/')
    db = client['forum-crawler-db']
    result = db.users.update_one(
        {'email': '$USER_EMAIL'},
        {'\$set': {'role': '$NEW_ROLE'}}
    )
    if result.modified_count > 0:
        print(f'✓ 用户 $USER_EMAIL 已升级为 {$NEW_ROLE}')
    else:
        print(f'用户 $USER_EMAIL 未找到或未修改')
except Exception as e:
    print(f'错误: {e}')
    sys.exit(1)
EOF

echo "✓ 用户升级完成"
