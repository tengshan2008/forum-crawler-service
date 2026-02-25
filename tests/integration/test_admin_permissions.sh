#!/bin/bash

# 测试管理员权限 - 可以查看所有任务和数据

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== 测试管理员权限功能 ===${NC}"
echo ""

# 1. 等待后端启动
echo -e "${YELLOW}等待后端启动...${NC}"
sleep 3

# 2. 创建普通用户 1（创建一些任务）
echo -e "${YELLOW}创建普通用户 1...${NC}"
USER1_EMAIL="user1_$(date +%s)@example.com"
USER1_PASSWORD="TestPassword123"
USER1_USERNAME="user1_$(date +%s)"

REGISTER1=$(curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER1_EMAIL\",
    \"username\": \"$USER1_USERNAME\",
    \"password\": \"$USER1_PASSWORD\",
    \"confirmPassword\": \"$USER1_PASSWORD\"
  }")

echo "用户 1 注册: $REGISTER1" | grep -o "success.*true" && echo "✓ 用户 1 注册成功" || exit 1

# 登录用户 1
LOGIN1=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER1_EMAIL\",
    \"password\": \"$USER1_PASSWORD\"
  }")

TOKEN1=$(echo $LOGIN1 | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
USER1_ID=$(echo $LOGIN1 | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)

echo -e "${GREEN}✓ 用户 1 登录成功，ID: $USER1_ID${NC}"
echo ""

# 3. 用户 1 创建一个任务
echo -e "${YELLOW}用户 1 创建任务...${NC}"
CREATE_TASK1=$(curl -s -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN1" \
  -d '{
    "name": "User 1 Task",
    "description": "Task created by user 1",
    "forumUrl": "https://example.com/forum/post/1",
    "sectionUrl": "https://example.com/forum/section/1",
    "crawlType": "single",
    "taskType": "novel"
  }')

TASK1_ID=$(echo $CREATE_TASK1 | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)
echo -e "${GREEN}✓ 用户 1 创建任务成功，ID: $TASK1_ID${NC}"
echo ""

# 4. 创建普通用户 2
echo -e "${YELLOW}创建普通用户 2...${NC}"
USER2_EMAIL="user2_$(date +%s)@example.com"
USER2_PASSWORD="TestPassword123"
USER2_USERNAME="user2_$(date +%s)"

REGISTER2=$(curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER2_EMAIL\",
    \"username\": \"$USER2_USERNAME\",
    \"password\": \"$USER2_PASSWORD\",
    \"confirmPassword\": \"$USER2_PASSWORD\"
  }")

# 登录用户 2
LOGIN2=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER2_EMAIL\",
    \"password\": \"$USER2_PASSWORD\"
  }")

TOKEN2=$(echo $LOGIN2 | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
USER2_ID=$(echo $LOGIN2 | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)

echo -e "${GREEN}✓ 用户 2 登录成功，ID: $USER2_ID${NC}"
echo ""

# 5. 用户 2 创建自己的任务
echo -e "${YELLOW}用户 2 创建任务...${NC}"
CREATE_TASK2=$(curl -s -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN2" \
  -d '{
    "name": "User 2 Task",
    "description": "Task created by user 2",
    "forumUrl": "https://example.com/forum/post/2",
    "sectionUrl": "https://example.com/forum/section/2",
    "crawlType": "single",
    "taskType": "novel"
  }')

TASK2_ID=$(echo $CREATE_TASK2 | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)
echo -e "${GREEN}✓ 用户 2 创建任务成功，ID: $TASK2_ID${NC}"
echo ""

# 6. 测试普通用户 1 能否看到自己的任务但不能看到用户 2 的任务
echo -e "${YELLOW}测试普通用户权限隔离...${NC}"
USER1_TASKS=$(curl -s -X GET http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN1")

if echo "$USER1_TASKS" | grep -q "$TASK1_ID"; then
  echo -e "${GREEN}✓ 用户 1 可以看到自己的任务${NC}"
else
  echo -e "${RED}✗ 用户 1 看不到自己的任务${NC}"
  exit 1
fi

if echo "$USER1_TASKS" | grep -q "$TASK2_ID"; then
  echo -e "${RED}✗ 用户 1 不应该看到用户 2 的任务${NC}"
  exit 1
else
  echo -e "${GREEN}✓ 用户 1 正确看不到用户 2 的任务${NC}"
fi
echo ""

# 7. 创建管理员账户（通过升级普通用户）
echo -e "${YELLOW}创建管理员账户...${NC}"
ADMIN_EMAIL="admin_test_$(date +%s)@example.com"
ADMIN_PASSWORD="AdminPassword123"
ADMIN_USERNAME="admin_test_$(date +%s)"

# 注册管理员账户（初始为普通用户）
ADMIN_REGISTER=$(curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"username\": \"$ADMIN_USERNAME\",
    \"password\": \"$ADMIN_PASSWORD\",
    \"confirmPassword\": \"$ADMIN_PASSWORD\"
  }")

# 登录管理员账户
ADMIN_LOGIN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"password\": \"$ADMIN_PASSWORD\"
  }")

ADMIN_TOKEN=$(echo $ADMIN_LOGIN | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
ADMIN_ID=$(echo $ADMIN_LOGIN | grep -o '"_id":"[^"]*' | cut -d'"' -f4 | head -n1)

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}✗ 管理员登录失败${NC}"
  exit 1
fi

echo -e "${GREEN}✓ 管理员账户创建成功，ID: $ADMIN_ID${NC}"

# 升级用户为管理员角色
echo -e "${YELLOW}将用户升级为管理员角色...${NC}"
chmod +x /workspaces/forum-crawler-service/upgrade_user_to_admin.sh
/workspaces/forum-crawler-service/upgrade_user_to_admin.sh "$ADMIN_EMAIL" admin

echo -e "${GREEN}✓ 用户已升级为管理员${NC}"
echo ""

# 8. 测试管理员可以看到所有任务
echo -e "${YELLOW}测试管理员权限 - 查看所有任务...${NC}"
ADMIN_TASKS=$(curl -s -X GET http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $ADMIN_TOKEN")

TOTAL_TASKS=$(echo $ADMIN_TASKS | grep -o '"total":[0-9]*' | cut -d':' -f2)

echo "任务总数: $TOTAL_TASKS"

if echo "$ADMIN_TASKS" | grep -q "$TASK1_ID"; then
  echo -e "${GREEN}✓ 管理员可以看到用户 1 的任务${NC}"
else
  echo -e "${RED}✗ 管理员看不到用户 1 的任务${NC}"
  exit 1
fi

if echo "$ADMIN_TASKS" | grep -q "$TASK2_ID"; then
  echo -e "${GREEN}✓ 管理员可以看到用户 2 的任务${NC}"
else
  echo -e "${RED}✗ 管理员看不到用户 2 的任务${NC}"
  exit 1
fi
echo ""

# 9. 测试管理员可以查看任意任务详情
echo -e "${YELLOW}测试管理员权限 - 查看任意任务详情...${NC}"
ADMIN_TASK_DETAIL=$(curl -s -X GET http://localhost:5000/api/tasks/$TASK2_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$ADMIN_TASK_DETAIL" | grep -q "$TASK2_ID"; then
  echo -e "${GREEN}✓ 管理员可以查看用户 2 的任务详情${NC}"
else
  echo -e "${RED}✗ 管理员看不到用户 2 的任务详情${NC}"
  exit 1
fi
echo ""

# 10. 测试普通用户不能访问其他用户的任务详情
echo -e "${YELLOW}测试普通用户权限隔离 - 访问其他用户任务...${NC}"
USER1_ACCESS_TASK2=$(curl -s -X GET http://localhost:5000/api/tasks/$TASK2_ID \
  -H "Authorization: Bearer $TOKEN1")

if echo "$USER1_ACCESS_TASK2" | grep -q "404"; then
  echo -e "${GREEN}✓ 用户 1 正确被拒绝访问用户 2 的任务${NC}"
else
  if ! echo "$USER1_ACCESS_TASK2" | grep -q "$TASK2_ID"; then
    echo -e "${GREEN}✓ 用户 1 正确看不到用户 2 的任务${NC}"
  else
    echo -e "${RED}✗ 用户 1 不应该看到用户 2 的任务${NC}"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}=== 所有管理员权限测试通过！==${NC}"
