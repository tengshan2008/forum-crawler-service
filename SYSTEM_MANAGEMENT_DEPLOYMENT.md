# 系统管理与配置 - 部署清单

## 部署步骤

### 1. 后端配置

#### 1.1 更新 `backend/src/index.js`

在数据库连接成功后，添加监控服务初始化代码：

```javascript
const SystemMonitoringService = require('./services/systemMonitoringService');

// 在 connectDB() 之后添加
await connectDB();

// 初始化系统配置
const SystemConfigService = require('./services/systemConfigService');
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
```

#### 1.2 验证模型已导入（可选）

检查 `backend/src/models` 目录中是否包含：
- ✅ SystemConfig.js
- ✅ SystemMonitor.js
- ✅ SystemAuditLog.js

#### 1.3 验证服务已导入（可选）

检查 `backend/src/services` 目录中是否包含：
- ✅ systemConfigService.js
- ✅ systemMonitoringService.js

#### 1.4 验证控制器已导入（可选）

检查 `backend/src/controllers` 目录中是否包含：
- ✅ adminController.js

#### 1.5 验证路由已注册

检查 `backend/src/routes/index.js` 中是否包含：
```javascript
const adminRoutes = require('./adminRoutes');
router.use('/api/admin', adminRoutes);
```

### 2. 前端配置

#### 2.1 更新主应用路由

在 `frontend/src/App.js` 或你的路由配置文件中，添加管理后台路由：

```javascript
import AdminPage from './pages/AdminPage';
import PrivateRoute from './components/PrivateRoute';

// 在路由配置中添加
{
  path: '/admin',
  element: (
    <PrivateRoute requiredRole="admin">
      <AdminPage />
    </PrivateRoute>
  )
}
```

#### 2.2 更新导航菜单（可选）

在应用导航栏中添加管理链接：

```javascript
// 仅对管理员显示
{user?.role === 'admin' && (
  <Link to="/admin" className="nav-link">
    系统管理
  </Link>
)}
```

#### 2.3 验证前端文件

检查以下文件是否存在于 `frontend/src/pages/` 目录中：
- ✅ AdminPage.js
- ✅ AdminDashboard.js
- ✅ AdminConfigPanel.js
- ✅ AdminUserManagement.js

检查以下文件是否存在于 `frontend/src/pages/` 目录中：
- ✅ AdminPage.css
- ✅ AdminDashboard.css
- ✅ AdminConfigPanel.css
- ✅ AdminUserManagement.css

#### 2.4 检查依赖

确保已安装必要的库：
```bash
npm list recharts
npm list antd
npm list axios
```

如果缺少 `recharts`，在 `frontend` 目录中运行：
```bash
npm install recharts
```

### 3. 环境变量配置

#### 3.1 后端环境变量（可选）

在 `.env` 或 `backend/.env` 中添加：

```env
# 监控配置
MONITORING_ENABLED=true
MONITORING_INTERVAL=60000
MONITORING_RETENTION=2592000000

# 存储配置
STORAGE_AUTO_CLEAN_ENABLED=false
STORAGE_RETENTION_DAYS=30
STORAGE_BASE_PATH=./public/uploads

# 日志配置
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
```

### 4. 数据库准备

系统会在第一次访问时自动创建以下集合：
- `systemconfigs` - 系统配置
- `systemmonitors` - 监控数据
- `systemauditlogs` - 审计日志

**无需手动创建，MongoDB会自动创建**

### 5. 启动服务

#### 使用Docker Compose启动

```bash
cd /workspaces/forum-crawler-service
docker-compose -f docker/docker-compose.dev.yml up -d
```

#### 使用本地启动

```bash
# 后端启动
cd backend
npm install
npm start

# 前端启动（新终端）
cd frontend
npm install
npm start
```

### 6. 验证部署

#### 6.1 检查后端API

```bash
# 获取系统配置
curl -X GET http://localhost:5000/api/admin/config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 获取实时状态
curl -X GET http://localhost:5000/api/admin/monitor/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 6.2 访问前端管理页面

1. 打开浏览器访问：`http://localhost:3000/admin`
2. 确保当前用户拥有 `admin` 角色
3. 应该看到管理后台界面

#### 6.3 检查监控数据

在 MongoDB 中查询监控数据：

```javascript
// 连接到MongoDB
db = connect("mongodb://localhost:27017/forum-crawler")

// 查看最新监控数据
db.systemmonitors.findOne({}, { sort: { timestamp: -1 } })

// 查看系统配置
db.systemconfigs.findOne()

// 查看审计日志
db.systemauditlogs.find().limit(5)
```

### 7. 功能验证清单

#### 爬虫配置管理
- [ ] 访问配置页面 → 爬虫配置标签
- [ ] 修改限流设置并保存
- [ ] 添加代理IP
- [ ] 删除代理IP
- [ ] 修改User-Agent设置

#### 存储管理
- [ ] 访问配置页面 → 存储管理标签
- [ ] 查看存储统计信息（媒体文件数、大小）
- [ ] 修改存储配置
- [ ] 执行自动清理（如果启用）

#### 系统监控
- [ ] 访问仪表板页面
- [ ] 查看实时指标（CPU、内存、磁盘）
- [ ] 查看爬虫统计（活跃任务、请求数等）
- [ ] 查看趋势图表
- [ ] 生成性能报告

#### 用户管理
- [ ] 访问用户管理页面
- [ ] 查看用户列表（分页）
- [ ] 修改用户角色
- [ ] 禁用/启用用户
- [ ] 重置用户密码

### 8. 常见问题解决

#### Q: 无法访问 /api/admin/* 端点？

**A:** 检查：
1. 是否正确添加了 `adminRoutes` 到主路由
2. 是否在请求头中包含有效的 JWT token
3. 用户角色是否为 `admin`

#### Q: 监控数据为0或不更新？

**A:** 检查：
1. 是否在 `index.js` 中启动了监控服务
2. MongoDB 连接是否成功
3. 检查系统配置中监控是否启用

#### Q: 图表在前端不显示？

**A:** 检查：
1. 是否安装了 `recharts` 库
2. 是否正确导入了 recharts 组件
3. 浏览器控制台是否有错误

#### Q: 管理后台页面出现403错误？

**A:** 检查：
1. 当前登录用户的角色是否为 `admin`
2. JWT token 是否过期
3. 后端是否正确配置了权限检查

### 9. 性能优化建议

1. **监控数据清理**
   - 启用 TTL 索引自动删除30天前的数据
   - 避免数据库无限增长

2. **缓存配置**
   ```javascript
   // 使用 Redis 缓存配置
   const cacheKey = 'system:config';
   const cached = await redis.get(cacheKey);
   ```

3. **监控间隔调整**
   - 生产环境建议 60-120 秒
   - 开发环境可以设置为 30 秒

4. **数据采样**
   - 生产环境可以每5分钟采样一次，而不是每次
   - 减少数据库写入压力

### 10. 安全建议

1. **权限检查**
   - 所有管理API都需要 `admin` 权限
   - 不要在前端路由中放宽权限检查

2. **审计日志**
   - 所有配置变更都会被记录
   - 定期检查审计日志

3. **密码安全**
   - 密码必须通过 bcrypt 加密
   - 支持密码重置但不支持查看

4. **网络安全**
   - 生产环境使用 HTTPS
   - 使用防火墙限制管理接口访问

---

## 快速启动命令

```bash
# 完整启动（Docker）
docker-compose -f docker/docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker/docker-compose.dev.yml logs -f backend frontend

# 重启服务
docker-compose -f docker/docker-compose.dev.yml restart

# 停止服务
docker-compose -f docker/docker-compose.dev.yml down
```

---

**最后更新**：2024年1月27日  
**版本**：1.0.0
