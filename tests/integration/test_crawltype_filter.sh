#!/bin/bash

# 测试采集类型筛选功能

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== 测试采集类型筛选功能 ===${NC}"
echo ""

# 1. 等待后端启动
echo -e "${YELLOW}等待后端启动...${NC}"
sleep 3

# 2. 创建测试用户
echo -e "${YELLOW}创建测试用户...${NC}"
USER_EMAIL="test_user_$(date +%s)@example.com"
USER_PASSWORD="TestPassword123"
USER_USERNAME="test_user_$(date +%s)"

curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER_EMAIL\",
    \"username\": \"$USER_USERNAME\",
    \"password\": \"$USER_PASSWORD\",
    \"confirmPassword\": \"$USER_PASSWORD\"
  }" > /dev/null

# 登录用户
LOGIN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER_EMAIL\",
    \"password\": \"$USER_PASSWORD\"
  }")

TOKEN=$(echo $LOGIN | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
USER_ID=$(echo $LOGIN | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)

echo -e "${GREEN}✓ 用户创建并登录成功，ID: $USER_ID${NC}"
echo ""

# 3. 创建不同采集类型的任务
echo -e "${YELLOW}创建不同采集类型的任务...${NC}"

# 创建 2 个单帖采集任务
echo "创建单帖采集任务..."
for i in 1 2; do
  curl -s -X POST http://localhost:5000/api/tasks \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"name\": \"单帖采集任务 $i\",
      \"description\": \"Single post crawl $i\",
      \"forumUrl\": \"https://example.com/forum/post/$i\",
      \"sectionUrl\": \"https://example.com/forum/section/$i\",
      \"crawlType\": \"single\",
      \"taskType\": \"novel\"
    }" > /dev/null
  echo "✓ 单帖采集任务 $i 创建成功"
done

echo ""

# 创建 3 个批量采集任务
echo "创建批量采集任务..."
for i in 1 2 3; do
  curl -s -X POST http://localhost:5000/api/tasks \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"name\": \"批量采集任务 $i\",
      \"description\": \"Batch crawl $i\",
      \"forumUrl\": \"https://example.com/forum/section/batch$i\",
      \"sectionUrl\": \"https://example.com/forum/section/batch$i\",
      \"crawlType\": \"batch\",
      \"taskType\": \"novel\"
    }" > /dev/null
  echo "✓ 批量采集任务 $i 创建成功"
done

echo ""

# 4. 测试筛选功能
echo -e "${YELLOW}=== 测试筛选功能 ===${NC}"
echo ""

# 测试获取所有任务
echo "测试 1: 获取所有任务"
ALL_TASKS=$(curl -s -X GET http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN")

TOTAL=$(echo $ALL_TASKS | grep -o '"total":[0-9]*' | cut -d':' -f2)
echo -e "${GREEN}✓ 所有任务数: $TOTAL${NC}"
echo ""

# 测试筛选单帖采集
echo "测试 2: 筛选单帖采集任务"
SINGLE_TASKS=$(curl -s -X GET "http://localhost:5000/api/tasks?crawlType=single" \
  -H "Authorization: Bearer $TOKEN")

SINGLE_TOTAL=$(echo $SINGLE_TASKS | grep -o '"total":[0-9]*' | cut -d':' -f2)
if [ "$SINGLE_TOTAL" -eq 2 ]; then
  echo -e "${GREEN}✓ 单帖采集任务数正确: $SINGLE_TOTAL${NC}"
else
  echo -e "${RED}✗ 单帖采集任务数错误，期望 2，得到 $SINGLE_TOTAL${NC}"
fi

if echo "$SINGLE_TASKS" | grep -q "单帖采集任务"; then
  echo -e "${GREEN}✓ 任务名称包含"单帖采集"${NC}"
else
  echo -e "${RED}✗ 任务名称不包含"单帖采集" ${NC}"
fi
echo ""

# 测试筛选批量采集
echo "测试 3: 筛选批量采集任务"
BATCH_TASKS=$(curl -s -X GET "http://localhost:5000/api/tasks?crawlType=batch" \
  -H "Authorization: Bearer $TOKEN")

BATCH_TOTAL=$(echo $BATCH_TASKS | grep -o '"total":[0-9]*' | cut -d':' -f2)
if [ "$BATCH_TOTAL" -eq 3 ]; then
  echo -e "${GREEN}✓ 批量采集任务数正确: $BATCH_TOTAL${NC}"
else
  echo -e "${RED}✗ 批量采集任务数错误，期望 3，得到 $BATCH_TOTAL${NC}"
fi

if echo "$BATCH_TASKS" | grep -q "批量采集任务"; then
  echo -e "${GREEN}✓ 任务名称包含"批量采集"${NC}"
else
  echo -e "${RED}✗ 任务名称不包含"批量采集"${NC}"
fi
echo ""

# 测试组合筛选（采集类型 + 状态）
echo "测试 4: 组合筛选（单帖采集 + pending 状态）"
COMBINED=$(curl -s -X GET "http://localhost:5000/api/tasks?crawlType=single&status=pending" \
  -H "Authorization: Bearer $TOKEN")

COMBINED_TOTAL=$(echo $COMBINED | grep -o '"total":[0-9]*' | cut -d':' -f2)
if [ "$COMBINED_TOTAL" -eq 2 ]; then
  echo -e "${GREEN}✓ 组合筛选结果正确: $COMBINED_TOTAL${NC}"
else
  echo -e "${RED}✗ 组合筛选结果错误，期望 2，得到 $COMBINED_TOTAL${NC}"
fi
echo ""

echo -e "${GREEN}=== 采集类型筛选功能测试完成 ===${NC}"
echo ""
echo "功能说明："
echo "  • 后端支持通过 crawlType 查询参数筛选任务"
echo "  • 前端增加了采集类型 Select 控件"
echo "  • 表格中新增"采集类型"列，显示 single 或 batch"
echo "  • 可以与其他筛选条件（如 status）组合使用"
echo ""
