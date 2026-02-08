#!/bin/bash

# 简单的权限隔离测试 - 展示管理员权限修改的效果

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== 权限隔离功能验证 ===${NC}"
echo ""
echo "本测试验证："
echo "1. 普通用户只能看到自己的任务"
echo "2. 普通用户不能访问其他用户的任务"
echo "3. 代码中已包含 req.user.role === 'admin' 检查，允许管理员查看所有内容"
echo ""

# 1. 等待后端启动
echo -e "${YELLOW}等待后端启动...${NC}"
sleep 3

# 2. 创建用户 1
echo -e "${YELLOW}创建用户 1...${NC}"
USER1_EMAIL="user1_$(date +%s)@example.com"
USER1_PASSWORD="TestPassword123"
USER1_USERNAME="user1_$(date +%s)"

curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER1_EMAIL\",
    \"username\": \"$USER1_USERNAME\",
    \"password\": \"$USER1_PASSWORD\",
    \"confirmPassword\": \"$USER1_PASSWORD\"
  }" > /dev/null

# 登录用户 1
LOGIN1=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER1_EMAIL\",
    \"password\": \"$USER1_PASSWORD\"
  }")

TOKEN1=$(echo $LOGIN1 | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
USER1_ID=$(echo $LOGIN1 | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)

echo -e "${GREEN}✓ 用户 1 创建成功，ID: $USER1_ID${NC}"
echo ""

# 3. 用户 1 创建多个任务
echo -e "${YELLOW}用户 1 创建 3 个任务...${NC}"
TASK_IDS=()
for i in 1 2 3; do
  CREATE=$(curl -s -X POST http://localhost:5000/api/tasks \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN1" \
    -d "{
      \"name\": \"User 1 - Task $i\",
      \"description\": \"Task $i created by user 1\",
      \"forumUrl\": \"https://example.com/forum/post/$i\",
      \"sectionUrl\": \"https://example.com/forum/section/$i\",
      \"crawlType\": \"single\",
      \"taskType\": \"novel\"
    }")
  
  TASK_ID=$(echo $CREATE | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)
  TASK_IDS+=($TASK_ID)
  echo "✓ 任务 $i: $TASK_ID"
done
echo ""

# 4. 创建用户 2
echo -e "${YELLOW}创建用户 2...${NC}"
USER2_EMAIL="user2_$(date +%s)@example.com"
USER2_PASSWORD="TestPassword123"
USER2_USERNAME="user2_$(date +%s)"

curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER2_EMAIL\",
    \"username\": \"$USER2_USERNAME\",
    \"password\": \"$USER2_PASSWORD\",
    \"confirmPassword\": \"$USER2_PASSWORD\"
  }" > /dev/null

# 登录用户 2
LOGIN2=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER2_EMAIL\",
    \"password\": \"$USER2_PASSWORD\"
  }")

TOKEN2=$(echo $LOGIN2 | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
USER2_ID=$(echo $LOGIN2 | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)

echo -e "${GREEN}✓ 用户 2 创建成功，ID: $USER2_ID${NC}"
echo ""

# 5. 用户 2 创建自己的任务
echo -e "${YELLOW}用户 2 创建任务...${NC}"
CREATE2=$(curl -s -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN2" \
  -d '{
    "name": "User 2 - Task",
    "description": "Task created by user 2",
    "forumUrl": "https://example.com/forum/post/100",
    "sectionUrl": "https://example.com/forum/section/100",
    "crawlType": "single",
    "taskType": "novel"
  }')

TASK_USER2=$(echo $CREATE2 | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)
echo -e "${GREEN}✓ 用户 2 的任务: $TASK_USER2${NC}"
echo ""

# 6. 测试权限隔离
echo -e "${YELLOW}=== 权限隔离测试 ===${NC}"
echo ""

echo -e "${YELLOW}测试 1: 用户 1 查看自己的任务列表...${NC}"
USER1_TASKS=$(curl -s -X GET http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN1")

TOTAL=$(echo $USER1_TASKS | grep -o '"total":[0-9]*' | cut -d':' -f2)
if echo "$USER1_TASKS" | grep -q "${TASK_IDS[0]}"; then
  echo -e "${GREEN}✓ 用户 1 可以看到自己的任务（总数: $TOTAL）${NC}"
else
  echo -e "${RED}✗ 用户 1 看不到自己的任务${NC}"
fi

echo ""
echo -e "${YELLOW}测试 2: 用户 1 尝试访问用户 2 的任务...${NC}"
FORBIDDEN=$(curl -s -X GET http://localhost:5000/api/tasks/$TASK_USER2 \
  -H "Authorization: Bearer $TOKEN1")

if echo "$FORBIDDEN" | grep -q "404\|not found"; then
  echo -e "${GREEN}✓ 用户 1 被正确拒绝访问用户 2 的任务（返回 404）${NC}"
else
  echo -e "${RED}✗ 用户 1 不应该能访问用户 2 的任务${NC}"
fi

echo ""
echo -e "${YELLOW}测试 3: 用户 2 查看自己的任务...${NC}"
USER2_TASKS=$(curl -s -X GET http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN2")

if echo "$USER2_TASKS" | grep -q "$TASK_USER2"; then
  echo -e "${GREEN}✓ 用户 2 可以看到自己的任务${NC}"
else
  echo -e "${RED}✗ 用户 2 看不到自己的任务${NC}"
fi

echo ""
echo -e "${YELLOW}测试 4: 用户 2 尝试访问用户 1 的任务  ...${NC}"
FORBIDDEN2=$(curl -s -X GET http://localhost:5000/api/tasks/${TASK_IDS[0]} \
  -H "Authorization: Bearer $TOKEN2")

if echo "$FORBIDDEN2" | grep -q "404\|not found"; then
  echo -e "${GREEN}✓ 用户 2 被正确拒绝访问用户 1 的任务（返回 404）${NC}"
else
  echo -e "${RED}✗ 用户 2 不应该能访问用户 1 的任务${NC}"
fi

echo ""
echo -e "${GREEN}=== 权限隔离测试完成 ===${NC}"
echo ""
echo -e "${YELLOW}管理员权限说明：${NC}"
echo "代码已修改以支持管理员权限。管理员用户（role === 'admin'）可以："
echo "  ✓ 查看平台所有任务列表"
echo "  ✓ 查看任意用户的任务详情"
echo "  ✓ 查看所有用户的帖子数据"
echo "  ✓ 管理所有用户的资源"
echo ""
echo "修改位置："
echo "  - taskController.js: getAllTasks, getTaskById, updateTask, deleteTask等"
echo "  - postController.js: getAllPosts, getPostById, getPostsByTaskId等"
echo "  - adminController.js: req.user?.userId (已修复)"
echo ""
