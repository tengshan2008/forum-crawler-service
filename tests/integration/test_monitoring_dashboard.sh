#!/bin/bash

# 系统监控仪表板测试脚本

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "系统监控仪表板诊断脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

API_BASE_URL="http://localhost:5000/api"
HEADERS="Content-Type: application/json"

echo ""
echo "📊 测试步骤："
echo ""

# 1. 获取实时状态
echo "1️⃣  获取实时系统状态..."
echo "   请求: GET $API_BASE_URL/admin/monitor/status"
STATUS_RESPONSE=$(curl -s -X GET "$API_BASE_URL/admin/monitor/status" \
  -H "$HEADERS")

echo "   响应: $STATUS_RESPONSE"
echo ""

# 解析响应中的成功状态
SUCCESS=$(echo "$STATUS_RESPONSE" | grep -o '"success":true' | head -1)
if [ -n "$SUCCESS" ]; then
  echo "   ✅ 实时状态接口正常"
  
  # 检查是否有metrics数据
  METRICS=$(echo "$STATUS_RESPONSE" | grep -o '"metrics"' | head -1)
  if [ -n "$METRICS" ]; then
    echo "   ✅ 监控数据存在"
  else
    echo "   ⚠️  监控数据为空或不存在"
  fi
else
  echo "   ❌ 实时状态接口返回失败"
fi

echo ""

# 2. 获取监控历史数据
echo "2️⃣  获取监控历史数据 (过去1小时)..."
echo "   请求: GET $API_BASE_URL/admin/monitor/history?timeRange=hour"
HISTORY_RESPONSE=$(curl -s -X GET "$API_BASE_URL/admin/monitor/history?timeRange=hour" \
  -H "$HEADERS")

echo "   响应长度: ${#HISTORY_RESPONSE} 字符"

# 检查数据数量
DATA_COUNT=$(echo "$HISTORY_RESPONSE" | grep -o '"_id"' | wc -l)
if [ "$DATA_COUNT" -gt 0 ]; then
  echo "   ✅ 历史数据存在 : $DATA_COUNT 条记录"
else
  echo "   ⚠️  历史数据为空"
fi

echo ""

# 3. 获取性能报告
echo "3️⃣  生成性能报告 (过去1天)..."
echo "   请求: GET $API_BASE_URL/admin/monitor/report?timeRange=day"
REPORT_RESPONSE=$(curl -s -X GET "$API_BASE_URL/admin/monitor/report?timeRange=day" \
  -H "$HEADERS")

echo "   响应长度: ${#REPORT_RESPONSE} 字符"

REPORT_SUCCESS=$(echo "$REPORT_RESPONSE" | grep -o '"success":true' | head -1)
if [ -n "$REPORT_SUCCESS" ]; then
  echo "   ✅ 性能报告接口正常"
else
  echo "   ❌ 性能报告接口返回失败"
fi

echo ""

# 4. 获取存储统计
echo "4️⃣  获取存储统计信息..."
echo "   请求: GET $API_BASE_URL/admin/storage/stats"
STORAGE_RESPONSE=$(curl -s -X GET "$API_BASE_URL/admin/storage/stats" \
  -H "$HEADERS")

echo "   响应: $STORAGE_RESPONSE"
echo ""

STORAGE_SUCCESS=$(echo "$STORAGE_RESPONSE" | grep -o '"success":true' | head -1)
if [ -n "$STORAGE_SUCCESS" ]; then
  echo "   ✅ 存储统计接口正常"
else
  echo "   ⚠️  存储统计接口无响应"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "诊断总结："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "如果历史数据为空，说明:"
echo "1. ✅ 已修复: SystemMonitoringService 已在后端启动"
echo "2. ⏳ 需要等待: 监控服务需要时间收集数据 (每60秒一次)"
echo "3. 💡 建议: 请等待2-3分钟后刷新仪表板"
echo ""
echo "如果仍然为空，请检查:"
echo "- 后端日志: docker logs forum-crawler-backend-dev"
echo "- 数据库连接: MongoDB 是否正常运行"
echo "- SystemMonitor 集合: 是否已在 MongoDB 中创建"
echo ""
