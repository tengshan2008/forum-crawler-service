#!/bin/bash

# 系统管理API测试脚本
# 使用方法: ./test_admin_api.sh <jwt_token>

if [ -z "$1" ]; then
  echo "使用方法: ./test_admin_api.sh <jwt_token>"
  exit 1
fi

JWT_TOKEN="$1"
BASE_URL="http://localhost:5000/api/admin"

echo "============ 系统管理API测试 ============"
echo "JWT Token: ${JWT_TOKEN:0:20}..."
echo ""

# 测试1: 获取系统配置
echo "测试1: 获取系统配置"
curl -X GET "$BASE_URL/config" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.' \
  || echo "FAILED"
echo ""

# 测试2: 获取实时系统状态
echo "测试2: 获取实时系统状态"
curl -X GET "$BASE_URL/monitor/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.' \
  || echo "FAILED"
echo ""

# 测试3: 获取存储统计
echo "测试3: 获取存储统计"
curl -X GET "$BASE_URL/storage/stats" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.' \
  || echo "FAILED"
echo ""

# 测试4: 获取用户列表
echo "测试4: 获取用户列表"
curl -X GET "$BASE_URL/users?limit=10&skip=0" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.' \
  || echo "FAILED"
echo ""

# 测试5: 更新爬虫配置
echo "测试5: 更新爬虫配置"
curl -X PUT "$BASE_URL/config/crawler" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rateLimit": {
      "enabled": true,
      "globalLimit": 150,
      "ipLimit": 15
    },
    "timeout": 35000
  }' \
  | jq '.' \
  || echo "FAILED"
echo ""

# 测试6: 获取监控历史数据
echo "测试6: 获取监控历史数据"
curl -X GET "$BASE_URL/monitor/history?timeRange=hour" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.data | length' \
  || echo "FAILED"
echo ""

# 测试7: 获取审计日志
echo "测试7: 获取审计日志"
curl -X GET "$BASE_URL/audit-logs?limit=10&skip=0" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.' \
  || echo "FAILED"
echo ""

# 测试8: 生成性能报告
echo "测试8: 生成性能报告"
curl -X GET "$BASE_URL/monitor/report?timeRange=day" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.' \
  || echo "FAILED"
echo ""

echo "============ 测试完成 ============"
