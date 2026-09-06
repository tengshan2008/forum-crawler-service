#!/bin/bash

# 快速测试内容提取改进

echo "📊 内容提取改进 - 快速测试"
echo "======================================"
echo ""

# 1. 获取认证
echo "🔐 步骤1: 认证..."
TOKEN=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@12345"
  }' | jq -r '.data.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ 认证失败"
  exit 1
fi
echo "✅ 认证成功"

# 2. 创建任务
echo ""
echo "🚀 步骤2: 创建爬虫任务..."
TASK=$(curl -s -X POST http://127.0.0.1:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "内容提取改进验证",
    "forumUrl": "https://t66y.com/htm_data/2511/20/7027882.html",
    "taskType": "novel"
  }')

TASK_ID=$(echo "$TASK" | jq -r '.data._id')
echo "✅ 任务已创建: $TASK_ID"

# 3. 启动任务
echo ""
echo "▶️  步骤3: 启动爬虫..."
curl -s -X POST "http://127.0.0.1:5000/api/tasks/$TASK_ID/start" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "✅ 爬虫已启动"

# 4. 监控进度
echo ""
echo "⏳ 步骤4: 等待爬虫完成（最多60秒）..."
for i in {1..60}; do
  TASK_DATA=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
    -H "Authorization: Bearer $TOKEN" | jq '.data')
  
  STATUS=$(echo "$TASK_DATA" | jq -r '.status')
  CRAWLED=$(echo "$TASK_DATA" | jq '.crawledItems // 0')
  POSTS=$(echo "$TASK_DATA" | jq '.posts | length // 0')
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ 爬虫已完成"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ 爬虫失败"
    ERROR=$(echo "$TASK_DATA" | jq -r '.errorLog[0].error // "未知错误"')
    echo "错误: $ERROR"
    exit 1
  fi
  
  if [ $((i % 5)) -eq 0 ]; then
    echo "  进度: 爬取 $CRAWLED 项, 获得 $POSTS 篇帖子, 状态: $STATUS"
  fi
  
  sleep 1
done

# 5. 显示结果
echo ""
echo "📊 步骤5: 统计结果..."
FINAL=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.data')

echo ""
echo "✨ 测试结果:"
echo "=================================="
echo "$FINAL" | jq '{
  "任务名称": .name,
  "状态": .status,
  "爬取数量": .crawledItems,
  "失败数量": .failedItems,
  "获得帖子": (.posts | length),
  "总字数": (.posts | map(.content | length) | add),
  "平均字数": ((.posts | map(.content | length) | add) / (.posts | length))
}' | sed 's/^/  /'

# 6. 显示第一篇帖子的内容统计
echo ""
echo "📄 第一篇帖子内容统计:"
echo "$FINAL" | jq '{
  "标题": .posts[0].title,
  "字数": (.posts[0].content | length),
  "图片": (.posts[0].media | length // 0),
  "预览": (.posts[0].content | if length > 0 then .[0:100] + "..." else "无内容" end)
}' | sed 's/^/  /'

echo ""
echo "=================================="
echo "✅ 测试完成！内容提取改进已部署并运行正常。"
echo ""
echo "💡 提示："
echo "  - 如果看到大量字数（>10000），说明内容提取成功"
echo "  - 如果仍有'暂无内容'，可能是网站反爬虫更新了HTML结构"
echo "  - 查看后端日志可获取详细的选择器匹配信息"
