#!/bin/bash

# 创建 Admin 账号的 Docker 脚本
# 使用方法: ./create-admin-docker.sh

set -e

echo "╔════════════════════════════════════════════════════╗"
echo "║      在 Docker 中创建 Admin 账号                   ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# 检查是否指定了容器名称
BACKEND_CONTAINER="forum-crawler-backend-dev"

# 检查容器是否运行
if ! docker ps | grep -q "$BACKEND_CONTAINER"; then
    echo "❌ 容器 $BACKEND_CONTAINER 未运行"
    echo ""
    echo "请先运行以下命令启动容器:"
    echo "  docker compose -f docker/docker-compose.dev.yml up -d"
    exit 1
fi

echo "✅ 容器 $BACKEND_CONTAINER 正在运行"
echo ""
echo "在容器内执行创建 Admin 账号脚本..."
echo ""

# 在容器内执行脚本
docker exec -it "$BACKEND_CONTAINER" node /app/backend/scripts/create-admin.js

echo ""
echo "✅ 完成！"
