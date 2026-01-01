#!/bin/bash

# 测试单帖采集中的meta转向URL跟踪修复

echo "🧪 测试单帖采集 Meta转向 URL 跟踪修复"
echo "========================================"
echo ""

# 检查后端是否运行
if ! curl -s http://127.0.0.1:5000/api/health &>/dev/null; then
  echo "❌ 后端服务未运行，请先启动Docker"
  exit 1
fi

# 获取令牌
echo "🔐 获取认证令牌..."
TOKEN=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@12345"
  }' | jq -r '.data.accessToken // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ 无法获取认证令牌"
  exit 1
fi

echo "✅ 认证成功"
echo ""

# 创建单帖采集任务（使用redirect格式的URL）
echo "📝 创建单帖采集任务..."
echo "  URL: https://t66y.com/read.php?tid=7075205"
echo "  模式: 单帖采集 (single)"
echo ""

TASK=$(curl -s -X POST http://127.0.0.1:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Meta转向跟踪测试 - 单帖采集 (转向页)",
    "forumUrl": "https://t66y.com/read.php?tid=7075205",
    "crawlType": "single",
    "taskType": "novel",
    "config": {}
  }')

TASK_ID=$(echo "$TASK" | jq -r '.data._id // empty')
if [ -z "$TASK_ID" ]; then
  echo "❌ 任务创建失败"
  echo "$TASK" | jq '.'
  exit 1
fi

echo "✅ 任务已创建: $TASK_ID"
echo ""

# 启动任务
echo "▶️  启动爬虫..."
curl -s -X POST "http://127.0.0.1:5000/api/tasks/$TASK_ID/start" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "✅ 爬虫已启动"
echo ""

# 监控爬虫进度
echo "📊 监控爬虫进度..."
echo "========================================"

for i in {1..120}; do
  # 检查任务状态
  TASK_STATUS=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.data.status // "unknown"')
  
  if [ "$TASK_STATUS" = "completed" ] || [ "$TASK_STATUS" = "failed" ]; then
    echo "✅ 爬虫已完成（状态: $TASK_STATUS）"
    break
  fi
  
  sleep 1
done

echo "========================================"
echo ""

# 查询采集到的帖子
echo "📄 验证采集结果..."
POSTS=$(curl -s -X GET "http://127.0.0.1:5000/api/posts?taskId=$TASK_ID&limit=1" \
  -H "Authorization: Bearer $TOKEN")

POSTS_COUNT=$(echo "$POSTS" | jq '.data | length')

if [ "$POSTS_COUNT" -gt 0 ]; then
  echo "✅ 成功采集 $POSTS_COUNT 个帖子"
  echo ""
  
  echo "📋 采集的帖子信息:"
  echo "========================================"
  
  SOURCE_URL=$(echo "$POSTS" | jq -r '.data[0].sourceUrl')
  TITLE=$(echo "$POSTS" | jq -r '.data[0].title')
  CONTENT_LENGTH=$(echo "$POSTS" | jq -r '.data[0].content | length')
  
  echo "  标题: $TITLE"
  echo "  来源URL: $SOURCE_URL"
  echo "  内容长度: $CONTENT_LENGTH 字符"
  
  echo ""
  echo "🔗 URL 格式检查:"
  if echo "$SOURCE_URL" | grep -q "htm_data"; then
    echo "  ✅ URL格式: htm_data (正确) - Meta转向跟踪成功！"
  elif echo "$SOURCE_URL" | grep -q "read.php"; then
    echo "  ❌ URL格式: read.php (转向页) - Meta转向跟踪失败"
  else
    echo "  ⚠️  URL格式: 其他"
  fi
  
  echo ""
  echo "【完整URL信息】"
  echo "  输入URL: https://t66y.com/read.php?tid=7075205"
  echo "  保存URL: $SOURCE_URL"
  
else
  echo "⚠️  未采集到任何帖子"
  
  # 显示任务信息
  TASK_INFO=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  echo ""
  echo "📋 任务状态:"
  echo "$TASK_INFO" | jq '{
    status: .data.status,
    errorLog: .data.errorLog[0:1]
  }'
fi

echo ""
echo "========================================"
echo "✨ 测试完成"
