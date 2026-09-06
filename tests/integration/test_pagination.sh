#!/bin/bash

# 多分页爬虫测试脚本
# 用法: ./test_pagination.sh [URL] [TASK_TYPE]

URL="${1:-https://t66y.com/htm_data/2511/20/7027882.html}"
TASK_TYPE="${2:-novel}"

echo "================================"
echo "多分页内容提取测试"
echo "================================"
echo ""
echo "📋 测试参数:"
echo "  URL: $URL"
echo "  任务类型: $TASK_TYPE"
echo ""

# 创建任务
echo "📝 创建爬虫任务..."
RESPONSE=$(curl -s http://localhost:5000/api/tasks -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"多分页测试\",
    \"forumUrl\": \"$URL\",
    \"taskType\": \"$TASK_TYPE\"
  }")

TASK_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['_id'])" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
  echo "❌ 任务创建失败"
  echo "$RESPONSE" | python3 -m json.tool
  exit 1
fi

echo "✅ 任务已创建: $TASK_ID"
echo ""

# 启动任务
echo "🚀 启动任务..."
curl -s http://localhost:5000/api/tasks/$TASK_ID/start -X POST \
  -H "Content-Type: application/json" >/dev/null 2>&1

echo "⏳ 任务运行中，等待完成..."

# 等待任务完成
TIMEOUT=60
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(curl -s http://localhost:5000/api/tasks/$TASK_ID -H "Content-Type: application/json" | \
    python3 -c "import sys, json; d=json.load(sys.stdin); print(d['data']['status'])" 2>/dev/null)
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ 任务已完成"
    break
  fi
  
  echo -n "."
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo ""
echo ""

# 获取结果
echo "📊 任务结果:"
curl -s http://localhost:5000/api/tasks/$TASK_ID -H "Content-Type: application/json" | \
  python3 -m json.tool | head -30

echo ""
echo "📥 查询MongoDB中的内容..."
docker exec forum-crawler-mongo mongosh -u admin -p admin123 --eval "
const db = db.getSiblingDB('forum-crawler');
const post = db.posts.findOne({'sourceUrl': '$URL'});
if (post) {
  console.log('✅ 帖子已保存');
  console.log('标题: ' + post.title);
  console.log('');
  console.log('内容统计:');
  console.log('  总字数: ' + post.content.length);
  
  const parts = post.content.split('\\n\\n');
  console.log('  楼层数: ' + parts.length);
  console.log('');
  
  console.log('楼层详情:');
  for (let i = 0; i < parts.length; i++) {
    const len = parts[i].length;
    const preview = parts[i].substring(0, 50).replace(/\\n/g, ' ');
    console.log('  楼层' + (i+1) + ': ' + len + ' 字符 - ' + preview + '...');
  }
} else {
  console.log('❌ 未找到帖子');
}
" 2>&1 | grep -v "MongoServerError"

echo ""
echo "================================"
echo "✨ 测试完成！"
echo "================================"
