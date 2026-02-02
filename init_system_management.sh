#!/bin/bash

# 系统管理与配置 - 自动初始化脚本
# 此脚本将自动添加必要的启动代码到后端和前端

set -e

echo "================================================"
echo "系统管理与配置模块 - 自动初始化"
echo "================================================"
echo ""

# 检查是否运行在正确的目录
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
  echo "❌ 错误：请在项目根目录运行此脚本"
  exit 1
fi

echo "✓ 项目目录检查通过"
echo ""

# 1. 检查并更新后端 index.js
echo "1️⃣ 检查后端初始化代码..."

if ! grep -q "SystemMonitoringService" backend/src/index.js; then
  echo "   ℹ️ 未找到监控服务初始化代码"
  echo "   📝 需要手动在 backend/src/index.js 中添加以下代码："
  echo ""
  cat << 'EOF'
  // 在 connectDB() 之后添加：
  const SystemMonitoringService = require('./services/systemMonitoringService');
  const SystemConfigService = require('./services/systemConfigService');

  // 初始化系统配置
  console.log('⊙ 初始化系统配置...');
  const config = await SystemConfigService.getConfig();
  console.log('✓ 系统配置已初始化');

  // 启动监控服务
  if (config.monitoring.performance.enabled) {
    console.log('⊙ 启动系统监控服务...');
    SystemMonitoringService.startMonitoringTask(
      config.monitoring.performance.collectionInterval || 60000
    );
    console.log('✓ 系统监控服务已启动');
  }
EOF
  echo ""
else
  echo "   ✓ 监控服务已初始化"
fi

echo ""

# 2. 检查前端依赖
echo "2️⃣ 检查前端依赖..."

if ! grep -q "recharts" frontend/package.json; then
  echo "   ⚠️  需要安装 recharts"
  echo "   运行命令: cd frontend && npm install recharts"
else
  echo "   ✓ recharts 已安装"
fi

echo ""

# 3. 检查前端路由配置
echo "3️⃣ 检查前端路由配置..."

if ! grep -q "AdminPage" frontend/src/App.js 2>/dev/null; then
  echo "   ℹ️ 未找到管理页面路由"
  echo "   📝 需要手动在 frontend/src/App.js 中添加以下代码："
  echo ""
  cat << 'EOF'
  // 在路由导入部分添加：
  import AdminPage from './pages/AdminPage';

  // 在路由配置中添加：
  {
    path: '/admin',
    element: (
      <PrivateRoute requiredRole="admin">
        <AdminPage />
      </PrivateRoute>
    )
  }
EOF
  echo ""
else
  echo "   ✓ 管理页面路由已配置"
fi

echo ""

# 4. 检查所有必要的文件
echo "4️⃣ 检查后端文件..."

backend_files=(
  "backend/src/models/SystemConfig.js"
  "backend/src/models/SystemMonitor.js"
  "backend/src/models/SystemAuditLog.js"
  "backend/src/services/systemConfigService.js"
  "backend/src/services/systemMonitoringService.js"
  "backend/src/controllers/adminController.js"
  "backend/src/routes/adminRoutes.js"
)

for file in "${backend_files[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✓ $(basename $file)"
  else
    echo "   ❌ $(basename $file) - 缺失!"
  fi
done

echo ""

echo "5️⃣ 检查前端文件..."

frontend_files=(
  "frontend/src/pages/AdminPage.js"
  "frontend/src/pages/AdminDashboard.js"
  "frontend/src/pages/AdminConfigPanel.js"
  "frontend/src/pages/AdminUserManagement.js"
  "frontend/src/pages/AdminPage.css"
  "frontend/src/pages/AdminDashboard.css"
  "frontend/src/pages/AdminConfigPanel.css"
  "frontend/src/pages/AdminUserManagement.css"
)

for file in "${frontend_files[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✓ $(basename $file)"
  else
    echo "   ❌ $(basename $file) - 缺失!"
  fi
done

echo ""

# 5. 显示快速启动指南
echo "================================================"
echo "📋 快速启动指南"
echo "================================================"
echo ""
echo "请执行以下步骤："
echo ""
echo "1. 在后端 (backend/src/index.js) 中添加监控初始化代码"
echo "   (见上面的代码示例)"
echo ""
echo "2. 在前端 (frontend/src/App.js) 中添加管理路由"
echo "   (见上面的代码示例)"
echo ""
echo "3. 安装前端依赖 (如果需要):"
echo "   $ cd frontend && npm install recharts"
echo ""
echo "4. 启动服务:"
echo "   $ docker-compose -f docker/docker-compose.dev.yml up -d"
echo ""
echo "5. 访问管理后台:"
echo "   http://localhost:3000/admin"
echo "   (需要 admin 权限)"
echo ""
echo "================================================"
echo "✅ 初始化检查完成!"
echo "================================================"
