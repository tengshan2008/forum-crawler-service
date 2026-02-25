#!/bin/bash

# 测试重复帖子处理改进

set -e

echo "========================================"
echo "测试: 重复帖子处理改进"
echo "========================================"
echo ""

# 获取认证令牌
echo "1️⃣ 获取认证令牌..."
TOKEN=$(curl -s -X POST "http://127.0.0.1:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ 登录失败"
  exit 1
fi

echo "✅ 获得令牌: ${TOKEN:0:20}..."
echo ""

# 创建任务 1 - 采集一个帖子
echo "2️⃣ 创建任务 1: 采集单个帖子..."
TASK_1=$(curl -s -X POST "http://127.0.0.1:5000/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试重复处理 - 首次采集",
    "forumUrl": "https://t66y.com/htm_data/2512/20/7083270.html",
    "taskType": "mixed",
    "crawlType": "single"
  }' | jq -r '.data._id')

if [ -z "$TASK_1" ] || [ "$TASK_1" = "null" ]; then
  echo "❌ 创建任务失败"
  exit 1
fi

echo "✅ 创建任务 1: $TASK_1"
echo ""

# 启动任务 1
echo "3️⃣ 启动任务 1..."
curl -s -X POST "http://127.0.0.1:5000/api/tasks/$TASK_1/start" \
  -H "Authorization: Bearer $TOKEN" > /dev/null

echo "⏳ 等待任务完成 (最多 60 秒)..."
for i in {1..60}; do
  TASK_1_STATUS=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_1" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.data.status')
  
  if [ "$TASK_1_STATUS" = "completed" ] || [ "$TASK_1_STATUS" = "failed" ]; then
    echo "✅ 任务 1 已完成，状态: $TASK_1_STATUS"
    break
  fi
  
  echo -n "."
  sleep 1
done

# 获取任务 1 详情
TASK_1_INFO=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_1" \
  -H "Authorization: Bearer $TOKEN")

echo ""
echo "📊 任务 1 统计:"
echo "$TASK_1_INFO" | jq '{
  status: .data.status,
  crawledItems: .data.crawledItems,
  skippedItems: .data.skippedItems,
  failedItems: .data.failedItems,
  skipReasonsCount: (.data.skipReasons | length)
}'

echo ""

# 创建任务 2 - 再次采集同一个帖子（应该被跳过）
echo "4️⃣ 创建任务 2: 采集相同帖子（应该被跳过）..."
TASK_2=$(curl -s -X POST "http://127.0.0.1:5000/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试重复处理 - 重复采集",
    "forumUrl": "https://t66y.com/htm_data/2512/20/7083270.html",
    "taskType": "mixed",
    "crawlType": "single"
  }' | jq -r '.data._id')

echo "✅ 创建任务 2: $TASK_2"
echo ""

# 启动任务 2
echo "5️⃣ 启动任务 2..."
curl -s -X POST "http://127.0.0.1:5000/api/tasks/$TASK_2/start" \
  -H "Authorization: Bearer $TOKEN" > /dev/null

echo "⏳ 等待任务完成 (最多 30 秒)..."
for i in {1..30}; do
  TASK_2_STATUS=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_2" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.data.status')
  
  if [ "$TASK_2_STATUS" = "completed" ] || [ "$TASK_2_STATUS" = "failed" ]; then
    echo "✅ 任务 2 已完成，状态: $TASK_2_STATUS"
    break
  fi
  
  echo -n "."
  sleep 1
done

# 获取任务 2 详情
TASK_2_INFO=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_2" \
  -H "Authorization: Bearer $TOKEN")

echo ""
echo "📊 任务 2 统计（应该显示被跳过）:"
echo "$TASK_2_INFO" | jq '{
  status: .data.status,
  crawledItems: .data.crawledItems,
  skippedItems: .data.skippedItems,
  failedItems: .data.failedItems,
  skipReasonsCount: (.data.skipReasons | length),
  skipReasons: .data.skipReasons[0:3]
}'

echo ""
echo "========================================"
echo "✨ 测试完成"
echo "========================================"
echo ""
echo "📋 关键指标说明:"
echo "  - crawledItems: 本次新采集的帖子数"
echo "  - skippedItems: 本次跳过的帖子数（已存在）"
echo "  - failedItems: 本次失败的帖子数"
echo "  - skipReasons: 跳过原因详情"
echo ""
echo "✅ 改进点:"
echo "  1. 任务 2 的 skippedItems 应该为 1，清楚显示这是跳过而非采集"
echo "  2. skipReasons 包含详细的跳过原因（'duplicate'）"
echo "  3. 前端可以区分采集成功 vs 重复跳过"
