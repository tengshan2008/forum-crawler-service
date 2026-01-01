#!/bin/bash

# 测试批量采集meta转向URL跟踪修复

echo "🧪 测试批量采集 Meta转向 URL 跟踪修复"
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
  # 尝试注册新用户
  echo "⚠️  登录失败，尝试注册..."
  REG_RESULT=$(curl -s -X POST http://127.0.0.1:5000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "username": "testuser",
      "email": "test@example.com",
      "password": "Test@12345"
    }')
  
  TOKEN=$(echo "$REG_RESULT" | jq -r '.data.accessToken // empty')
  if [ -z "$TOKEN" ]; then
    echo "❌ 无法获取认证令牌"
    exit 1
  fi
fi

echo "✅ 认证成功"
echo ""

# 创建批量采集任务
echo "📝 创建批量采集任务..."
echo "  URL: https://t66y.com/htm_data/2511/20/"
echo "  模式: 批量采集 (batch)"
echo "  数量: 最多3个帖子"
echo ""

TASK=$(curl -s -X POST http://127.0.0.1:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Meta转向跟踪测试 - 批量采集",
    "sectionUrl": "https://t66y.com/htm_data/2511/20/",
    "crawlType": "batch",
    "taskType": "novel",
    "config": {
      "maxPages": 1
    }
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

for i in {1..180}; do
  # 检查任务状态
  TASK_STATUS=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.data.status // "unknown"')
  
  # 显示进度
  if [ $((i % 10)) -eq 0 ]; then
    echo "⏱️  已等待 ${i}秒，状态: $TASK_STATUS"
  fi
  
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
POSTS=$(curl -s -X GET "http://127.0.0.1:5000/api/posts?taskId=$TASK_ID&limit=5" \
  -H "Authorization: Bearer $TOKEN")

POSTS_COUNT=$(echo "$POSTS" | jq '.data | length')

if [ "$POSTS_COUNT" -gt 0 ]; then
  echo "✅ 成功采集 $POSTS_COUNT 个帖子"
  echo ""
  
  echo "📋 采集的帖子信息:"
  echo "========================================"
  
  echo "$POSTS" | jq -r '.data[] | 
    "【\(.title)】\n" +
    "  来源: \(.sourceUrl)\n" +
    "  格式: \(if (.sourceUrl | contains("htm_data")) then "✅ htm_data (正确)" elif (.sourceUrl | contains("read.php")) then "❌ read.php (转向页)" else "⚠️  其他" end)\n" +
    "  内容: \((.content | length)) 字符\n"'
  
  echo "========================================"
  echo ""
  
  # 统计URL格式
  echo "🔗 URL 格式统计:"
  
  # 检查是否有转向页URL（read.php格式）
  redirect_count=$(echo "$POSTS" | jq '[.data[] | select(.sourceUrl | contains("read.php"))] | length')
  
  # 检查是否有最终URL（htm_data格式）
  final_count=$(echo "$POSTS" | jq '[.data[] | select(.sourceUrl | contains("htm_data"))] | length')
  
  # 检查其他格式
  other_count=$((POSTS_COUNT - redirect_count - final_count))
  
  echo "  - htm_data格式（正确）: $final_count 个"
  if [ $final_count -gt 0 ]; then
    echo "    ✅ Meta转向跟踪成功！"
  fi
  
  echo "  - read.php格式（转向页）: $redirect_count 个"
  if [ $redirect_count -gt 0 ]; then
    echo "    ❌ 还有未被转向的URL"
  fi
  
  echo "  - 其他格式: $other_count 个"
  
  echo ""
  
  if [ $final_count -gt 0 ] && [ $redirect_count -eq 0 ]; then
    echo "✨ 【成功】所有URL都已正确转向到htm_data格式！"
  elif [ $final_count -gt 0 ]; then
    echo "⚠️  【部分成功】大部分URL已正确转向，但还有 $redirect_count 个未转向"
  else
    echo "❌ 【失败】没有URL被转向到htm_data格式"
  fi
  
else
  echo "⚠️  未采集到任何帖子"
  
  # 显示任务错误信息
  TASK_INFO=$(curl -s -X GET "http://127.0.0.1:5000/api/tasks/$TASK_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  echo ""
  echo "📋 任务信息:"
  echo "$TASK_INFO" | jq '{
    status: .data.status,
    createdAt: .data.createdAt,
    totalPosts: .data.totalPosts,
    crawledPosts: .data.crawledPosts,
    errorLog: .data.errorLog[0:2]
  }'
fi

echo ""
echo "========================================"
echo "✨ 测试完成"
