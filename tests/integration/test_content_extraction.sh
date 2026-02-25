#!/bin/bash

# 测试内容提取改进

echo "🧪 测试内容提取功能..."
echo ""

# 先注册或登录
echo "🔐 进行身份认证..."
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@12345"
  }')

# 检查是否需要注册
if echo "$LOGIN_RESPONSE" | grep -q "用户不存在"; then
  echo "📝 用户不存在，进行注册..."
  REG_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "username": "testuser",
      "password": "Test@12345",
      "confirmPassword": "Test@12345"
    }')
  
  echo "注册结果: $REG_RESPONSE"
  
  # 注册后再次登录
  LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "Test@12345"
    }')
fi

# 提取认证令牌
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // .accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ 登录失败"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 认证成功，令牌: ${TOKEN:0:20}..."
echo ""

# 创建爬虫任务
echo "📝 创建爬虫任务..."
TASK_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "内容提取测试 - 多选择器支持",
    "forumUrl": "https://t66y.com/htm_data/2511/20/7027882.html",
    "taskType": "novel"
  }')

echo "$TASK_RESPONSE" | jq .

# 提取任务ID
TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.data._id // .data.id')

if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "null" ]; then
  echo "❌ 创建任务失败"
  exit 1
fi

echo ""
echo "✅ 任务已创建: $TASK_ID"
echo ""

# 启动任务
echo "🚀 启动爬虫任务..."
START_RESPONSE=$(curl -s -X POST "http://127.0.0.1:5000/api/tasks/$TASK_ID/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")

echo "$START_RESPONSE" | jq '.data.status'
echo ""

# 等待任务完成
echo "⏳ 等待任务完成 (最多 120 秒)..."
for i in {1..120}; do
  TASK_RESPONSE=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID")
  
  STATUS=$(echo "$TASK_RESPONSE" | jq -r '.data.status // .status')
  
  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo "✅ 任务已完成!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo ""
    echo "❌ 任务失败"
    ERROR=$(echo "$TASK_RESPONSE" | jq -r '.data.error // .error')
    echo "错误: $ERROR"
    exit 1
  fi
  
  # 显示进度
  if [ $((i % 10)) -eq 0 ]; then
    echo "  状态: $STATUS (${i}s)"
  fi
  
  sleep 1
done

echo ""
echo "📊 任务详情:"
echo "$TASK_RESPONSE" | jq '.data | {
  _id,
  name,
  status,
  forumUrl,
  taskType,
  posts: (.posts | length),
  totalContent: (.posts | map(.content | length) | add)
}'

echo ""
echo "📄 提取的内容统计:"
POSTS_COUNT=$(echo "$TASK_RESPONSE" | jq '.data.posts | length')
if [ "$POSTS_COUNT" -gt 0 ]; then
  echo "✓ 成功提取 $POSTS_COUNT 个帖子"
  
  # 显示第一篇帖子的内容摘要
  FIRST_POST=$(echo "$TASK_RESPONSE" | jq '.data.posts[0]')
  CONTENT=$(echo "$FIRST_POST" | jq -r '.content')
  CONTENT_LENGTH=${#CONTENT}
  
  echo "✓ 第一篇帖子: ${CONTENT_LENGTH} 字符"
  
  if [ "$CONTENT_LENGTH" -gt 100 ]; then
    echo "✅ 内容提取成功 ✓"
    echo ""
    echo "内容预览（前 200 字）:"
    echo "${CONTENT:0:200}..."
  else
    echo "⚠️  内容较短或为空"
  fi
  
  # 统计所有帖子的内容
  TOTAL_CONTENT=$(echo "$TASK_RESPONSE" | jq '.data.posts | map(.content | length) | add')
  echo ""
  echo "📊 总内容字符数: $TOTAL_CONTENT"
else
  echo "⚠️  未提取到任何帖子"
fi

echo ""
echo "✨ 测试完成!"
