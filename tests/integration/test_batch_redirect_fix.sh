#!/bin/bash

# 测试批量采集重定向跟踪修复

echo "🧪 测试批量采集重定向跟踪修复"
echo "========================================"
echo ""

# 获取令牌
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
echo ""

# 创建批量采集任务
echo "📝 创建批量采集任务..."
TASK=$(curl -s -X POST http://127.0.0.1:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "重定向跟踪测试 - 批量采集",
    "sectionUrl": "https://t66y.com/htm_data/2511/20/index.php",
    "crawlType": "batch",
    "taskType": "novel",
    "config": {
      "maxPages": 1
    }
  }')

TASK_ID=$(echo "$TASK" | jq -r '.data._id')
echo "✅ 任务已创建: $TASK_ID"
echo ""

# 启动任务
echo "▶️  启动爬虫..."
curl -s -X POST "http://127.0.0.1:5000/api/tasks/$TASK_ID/start" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "✅ 爬虫已启动"
echo ""

# 监控日志（后台）
echo "📊 实时日志输出:"
echo "========================================"

# 获取爬虫的输出（最多等待90秒）
for i in {1..90}; do
  # 检查任务状态
  TASK_STATUS=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.data.status')
  
  if [ "$TASK_STATUS" = "completed" ] || [ "$TASK_STATUS" = "failed" ]; then
    echo ""
    echo "✅ 爬虫已完成（状态: $TASK_STATUS）"
    break
  fi
  
  sleep 1
done

echo "========================================"
echo ""

# 查询采集到的帖子
echo "📄 验证采集结果..."
POSTS=$(curl -s -X GET "http://127.0.0.1:5000/api/posts?taskId=$TASK_ID&limit=3" \
  -H "Authorization: Bearer $TOKEN")

POSTS_COUNT=$(echo "$POSTS" | jq '.data | length')

if [ "$POSTS_COUNT" -gt 0 ]; then
  echo "✅ 成功采集 $POSTS_COUNT 个帖子"
  echo ""
  
  echo "🔗 帖子URL验证:"
  echo "========================================"
  
  # 验证所有采集的帖子的 sourceUrl
  echo "$POSTS" | jq '.data[] | {
    title: .title,
    sourceUrl: .sourceUrl,
    contentLength: (.content | length)
  }' | head -50
  
  echo ""
  echo "✨ URL 格式检查:"
  
  # 检查是否有转向页URL（read.php格式）
  redirect_urls=$(echo "$POSTS" | jq '[.data[] | select(.sourceUrl | contains("read.php"))]')
  redirect_count=$(echo "$redirect_urls" | jq 'length')
  
  # 检查是否有最终URL（htm_data格式）
  final_urls=$(echo "$POSTS" | jq '[.data[] | select(.sourceUrl | contains("htm_data"))]')
  final_count=$(echo "$final_urls" | jq 'length')
  
  echo "  - htm_data格式（正确）: $final_count 个 ✅"
  echo "  - read.php格式（转向页）: $redirect_count 个"
  
  if [ $redirect_count -gt 0 ]; then
    echo ""
    echo "⚠️  还有转向页URL未被跟踪："
    echo "$redirect_urls" | jq '.[] | .sourceUrl'
  else
    echo ""
    echo "✅ 所有URL都是最终地址，重定向跟踪修复成功！"
  fi
else
  echo "⚠️  未采集到任何帖子"
  
  # 显示任务错误日志
  ERROR=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
    -H "Authorization: Bearer $TOKEN" | jq '.data.errorLog[0].error // "无"')
  
  echo "错误: $ERROR"
fi

echo ""
echo "========================================"
echo "✨ 测试完成"
