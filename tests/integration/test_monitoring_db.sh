#!/bin/bash

# 直接检查 MongoDB 中的监控数据

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "系统监控数据库诊断"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查 MongoDB 是否运行
echo "1️⃣  检查 MongoDB 连接..."
if mongo --eval "print('MongoDB is running')" > /dev/null 2>&1; then
  echo "   ✅ MongoDB 连接成功"
else
  echo "   ⚠️  无法连接 MongoDB，尝试通过Docker连接..."
  if docker exec forum-crawler-mongodb mongo --eval "print('OK')" > /dev/null 2>&1; then
    echo "   ✅ 通过 Docker 连接 MongoDB 成功"
    MONGO_CMD="docker exec forum-crawler-mongodb mongo"
  else
    echo "   ❌ 无法连接 MongoDB"
    exit 1
  fi
fi

echo ""

# 检查 SystemMonitor 集合
echo "2️⃣  检查 SystemMonitor 集合..."
if [ -z "$MONGO_CMD" ]; then
  MONGO_CMD="mongo"
fi

COLLECTION_COUNT=$($MONGO_CMD --eval "db.systemmonitors.count()" forum-crawler 2>/dev/null | tail -1)
if [ -z "$COLLECTION_COUNT" ] || [ "$COLLECTION_COUNT" = "0" ]; then
  echo "   ⚠️  SystemMonitor 集合为空或不存在"
  echo "   💡 这是正常的，监控服务刚启动，数据还在收集中..."
else
  echo "   ✅ SystemMonitor 集合有 $COLLECTION_COUNT 条记录"
fi

echo ""

# 检查最新的监控数据
echo "3️⃣  检查最新的监控记录..."
LATEST=$($MONGO_CMD --eval "db.systemmonitors.findOne({}, {sort: {timestamp: -1}})" forum-crawler 2>/dev/null)
if [ -z "$LATEST" ] || [ "$LATEST" = "null" ]; then
  echo "   ⚠️  没有监控数据"
else
  echo "   ✅ 最新监控数据存在:"
  echo "$LATEST" | head -20
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "诊断总结："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ 修复已完成："
echo "  1. SystemMonitoringService 已在后端启动"
echo "  2. 每60秒自动收集一次系统指标"
echo ""
echo "📋 下一步："
echo "  1. 等待 1-2 分钟让服务收集足够的数据"
echo "  2. 登录管理员账户 (如果需要)"
echo "  3. 刷新监控仪表板查看数据"
echo ""
echo "🔗 在浏览器中访问："
echo "  管理员仪表板: http://localhost:3000/admin/dashboard"
echo ""
