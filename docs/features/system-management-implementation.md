# 系统管理与配置 - 实现指南

本文档详细说明了系统管理与配置功能的实现，包括爬虫配置管理、存储管理、系统监控和用户管理。

## 目录

1. [功能概述](#功能概述)
2. [后端实现](#后端实现)
3. [前端实现](#前端实现)
4. [API文档](#api文档)
5. [使用指南](#使用指南)

---

## 功能概述

### 核心功能模块

#### 1. 爬虫配置管理
- **请求限流**：配置全局和IP级别的请求限制
- **代理管理**：添加/删除代理，支持自动轮换
- **User-Agent管理**：启用User-Agent轮换，支持自定义列表
- **Cookies管理**：存储和管理登录状态（规划中）
- **超时和重试**：配置请求超时和重试策略

#### 2. 存储管理
- **本地存储配置**：配置存储路径、最大大小
- **自动清理**：按照保留期自动删除过期数据
- **存储统计**：实时获取数据库和媒体文件大小
- **云存储集成**：支持S3/OSS/COS（规划中）

#### 3. 系统监控
- **性能指标**：实时采集CPU、内存、磁盘使用率
- **爬虫指标**：任务数、请求数、错误率统计
- **数据库指标**：查询时间、连接数、慢查询统计
- **告警系统**：自动检测异常情况并生成告警
- **性能报告**：生成日/周/月性能报告

#### 4. 用户管理
- **用户列表**：查看所有用户及其信息
- **角色管理**：分配admin/editor/user/guest角色
- **状态管理**：启用/禁用用户账户
- **密码重置**：管理员重置用户密码

---

## 后端实现

### 新增模型

#### 1. SystemConfig（系统配置模型）
位置：`backend/src/models/SystemConfig.js`

存储系统的所有配置参数，包含以下主要部分：
- `crawler`：爬虫配置（代理、User-Agent、限流等）
- `storage`：存储配置（本地、云存储、统计等）
- `monitoring`：监控配置（性能、错误、告警等）
- `system`：系统设置（日志、维护模式等）

#### 2. SystemMonitor（监控指标模型）
位置：`backend/src/models/SystemMonitor.js`

记录系统监控数据的时间序列，包含：
- `crawler`：爬虫性能指标
- `system`：系统资源指标（CPU、内存、磁盘、网络）
- `database`：数据库指标
- `cache`：缓存指标
- `errors`：错误统计
- `alerts`：告警记录

自动TTL索引，30天后过期删除。

#### 3. SystemAuditLog（审计日志模型）
位置：`backend/src/models/SystemAuditLog.js`

记录所有配置变更操作的审计日志，包含：
- 操作类型、资源类型
- 操作者信息（用户ID、IP地址等）
- 变更前后的值
- 操作结果和错误信息

### 新增服务

#### 1. SystemConfigService（系统配置服务）
位置：`backend/src/services/systemConfigService.js`

主要功能：
```javascript
// 配置管理
getConfig()                                // 获取当前配置
initializeDefaultConfig()                 // 初始化默认配置
updateCrawlerConfig(config, operator)    // 更新爬虫配置
updateStorageConfig(config, operator)    // 更新存储配置
updateMonitoringConfig(config, operator) // 更新监控配置
updateSystemConfig(config, operator)     // 更新系统设置

// 代理管理
addProxy(proxyUrl, description, operator)    // 添加代理
removeProxy(proxyUrl, operator)              // 删除代理

// 存储管理
calculateStorageStats()        // 计算存储统计
autoCleanExpiredData()        // 自动清理过期数据

// 审计日志
recordAuditLog(logData)                      // 记录审计日志
getAuditLogs(filters, limit, skip)          // 查询审计日志
```

#### 2. SystemMonitoringService（系统监控服务）
位置：`backend/src/services/systemMonitoringService.js`

主要功能：
```javascript
// 指标采集
collectMetrics()                              // 采集所有系统指标
collectCrawlerMetrics()                      // 采集爬虫指标
collectSystemMetrics()                       // 采集系统资源指标
collectDatabaseMetrics()                     // 采集数据库指标
collectCacheMetrics()                        // 采集缓存指标
collectErrorMetrics()                        // 采集错误统计

// 数据查询
getMetricsHistory(timeRange)                 // 获取历史数据
getRealTimeStatus()                          // 获取实时状态
checkAlertConditions(metrics, config)        // 检查告警条件

// 报告生成
generatePerformanceReport(timeRange)         // 生成性能报告
startMonitoringTask(interval)                // 启动定期监控任务
```

### 新增控制器

#### AdminController（管理员控制器）
位置：`backend/src/controllers/adminController.js`

主要方法：
```javascript
// 配置管理
getSystemConfig()              // GET /api/admin/config
updateCrawlerConfig()          // PUT /api/admin/config/crawler
updateStorageConfig()          // PUT /api/admin/config/storage
updateMonitoringConfig()       // PUT /api/admin/config/monitoring
updateSystemConfig()           // PUT /api/admin/config/system

// 代理管理
addProxy()                     // POST /api/admin/config/proxies
removeProxy()                  // DELETE /api/admin/config/proxies/:url

// 存储管理
getStorageStats()              // GET /api/admin/storage/stats
autoClean()                    // POST /api/admin/storage/clean

// 监控管理
getRealTimeStatus()            // GET /api/admin/monitor/status
getMetricsHistory()            // GET /api/admin/monitor/history
generatePerformanceReport()    // GET /api/admin/monitor/report

// 审计日志
getAuditLogs()                 // GET /api/admin/audit-logs

// 用户管理
getUserList()                  // GET /api/admin/users
updateUserRole()               // PUT /api/admin/users/:id/role
toggleUserStatus()             // PATCH /api/admin/users/:id/status
resetUserPassword()            // POST /api/admin/users/:id/reset-password
```

### 新增路由

位置：`backend/src/routes/adminRoutes.js`

所有管理员API都使用 `/api/admin` 前缀，需要认证且用户角色为 `admin`。

---

## 前端实现

### 新增页面组件

#### 1. AdminPage（主页面）
位置：`frontend/src/pages/AdminPage.js`

这是管理后台的主容器，包含侧边栏菜单和内容区域，可切换不同的管理页面。

#### 2. AdminDashboard（监控仪表板）
位置：`frontend/src/pages/AdminDashboard.js`

展示系统实时监控数据：
- 关键指标统计（CPU、内存、磁盘、活跃任务）
- 爬虫性能统计（总请求、失败、响应时间等）
- 数据库指标（操作/秒、连接数、查询时间等）
- 存储统计（媒体文件数、大小等）
- 系统资源趋势图表（CPU、内存使用率）
- 性能指标趋势图表（请求数、查询时间）
- 告警列表
- 日期性能报告

#### 3. AdminConfigPanel（配置管理）
位置：`frontend/src/pages/AdminConfigPanel.js`

系统配置管理界面：
- **爬虫配置标签**
  - 基本设置：限流、超时、重试等
  - 代理管理：添加/删除/查看代理列表
  - User-Agent管理：启用轮换、使用默认列表
- **存储管理标签**
  - 本地存储：配置路径、大小、自动清理
  - 云存储：配置存储提供商和参数
- **监控配置标签**
  - 性能监控：采集间隔、数据保留时间
  - 错误监控：告警阈值、告警渠道
- **系统设置标签**
  - 日志设置：日志级别、保留期
  - 维护模式：启用/禁用、提示信息

#### 4. AdminUserManagement（用户管理）
位置：`frontend/src/pages/AdminUserManagement.js`

用户管理界面：
- 用户列表（分页显示）
- 用户信息：用户名、邮箱、角色、状态、验证状态
- 操作功能：
  - 修改角色（admin/editor/user/guest）
  - 禁用/启用用户
  - 重置密码

### 样式文件

- `AdminPage.css`：主页面样式，响应式布局
- `AdminDashboard.css`：仪表板样式，卡片和图表样式
- `AdminConfigPanel.css`：配置面板样式，表单样式
- `AdminUserManagement.css`：用户管理样式，表格样式

---

## API文档

### 系统配置API

#### 获取系统配置
```
GET /api/admin/config

响应：
{
  "success": true,
  "data": {
    "crawler": { ... },
    "storage": { ... },
    "monitoring": { ... },
    "system": { ... }
  }
}
```

#### 更新爬虫配置
```
PUT /api/admin/config/crawler

请求体：
{
  "rateLimit": {
    "enabled": true,
    "globalLimit": 100,
    "ipLimit": 10,
    "adaptiveDelay": true,
    "minDelay": 500,
    "maxDelay": 3000
  },
  "timeout": 30000,
  "retryAttempts": 3,
  "maxConcurrentRequests": 5
}

响应：
{
  "success": true,
  "message": "爬虫配置已更新",
  "data": { ... }
}
```

#### 添加代理
```
POST /api/admin/config/proxies

请求体：
{
  "proxyUrl": "http://proxy.example.com:8080",
  "description": "代理描述"
}

响应：
{
  "success": true,
  "message": "代理已添加",
  "data": {
    "url": "http://proxy.example.com:8080",
    "active": true,
    "failureCount": 0,
    "description": "代理描述"
  }
}
```

#### 删除代理
```
DELETE /api/admin/config/proxies/:proxyUrl

响应：
{
  "success": true,
  "message": "代理已删除",
  "data": { ... }
}
```

### 监控API

#### 获取实时系统状态
```
GET /api/admin/monitor/status

响应：
{
  "success": true,
  "data": {
    "metrics": {
      "crawler": { ... },
      "system": { ... },
      "database": { ... },
      "errors": { ... }
    },
    "alerts": [ ... ],
    "timestamp": "2024-01-27T10:30:00Z"
  }
}
```

#### 获取监控历史数据
```
GET /api/admin/monitor/history?timeRange=hour|day|week|month

响应：
{
  "success": true,
  "data": [ ... metrics array ... ]
}
```

#### 生成性能报告
```
GET /api/admin/monitor/report?timeRange=day|week|month

响应：
{
  "success": true,
  "data": {
    "timeRange": "day",
    "period": {
      "start": "2024-01-26T10:30:00Z",
      "end": "2024-01-27T10:30:00Z"
    },
    "summary": {
      "avgCpuUsage": "45.50",
      "avgMemoryUsage": "62.30",
      "avgQueryTime": "125.40",
      "errorRate": "2.30",
      "totalRequests": 10000,
      "totalErrors": 230
    },
    "metrics": [ ... ]
  }
}
```

### 用户管理API

#### 获取用户列表
```
GET /api/admin/users?limit=20&skip=0

响应：
{
  "success": true,
  "data": {
    "users": [ ... ],
    "total": 100,
    "limit": 20,
    "skip": 0
  }
}
```

#### 更新用户角色
```
PUT /api/admin/users/:userId/role

请求体：
{
  "role": "editor|user|guest"
}

响应：
{
  "success": true,
  "message": "用户角色已更新",
  "data": { ... user object ... }
}
```

#### 禁用/启用用户
```
PATCH /api/admin/users/:userId/status

响应：
{
  "success": true,
  "message": "用户已启用/禁用",
  "data": { ... user object ... }
}
```

#### 重置用户密码
```
POST /api/admin/users/:userId/reset-password

请求体：
{
  "newPassword": "newPassword123"
}

响应：
{
  "success": true,
  "message": "用户密码已重置"
}
```

---

## 使用指南

### 后端启用监控服务

在 `backend/src/index.js` 中添加监控服务的启动：

```javascript
const SystemMonitoringService = require('./services/systemMonitoringService');

// 在数据库连接后启动监控
await connectDB();
SystemMonitoringService.startMonitoringTask(60000); // 每60秒收集一次
```

### 前端集成

在主应用路由中添加管理页面：

```javascript
import AdminPage from './pages/AdminPage';
import PrivateRoute from './components/PrivateRoute';

// 在路由配置中添加
<Route
  path="/admin"
  element={
    <PrivateRoute requiredRole="admin">
      <AdminPage />
    </PrivateRoute>
  }
/>
```

### 数据库初始化

首次启动时，系统会自动创建默认配置：

```javascript
// 在任何需要配置的地方调用
const config = await SystemConfigService.getConfig();
```

### 环境变量配置（可选）

在 `.env` 文件中添加以下环保变量：

```env
# 监控配置
MONITORING_ENABLED=true
MONITORING_INTERVAL=60000
MONITORING_RETENTION=604800000

# 存储清理配置
STORAGE_AUTO_CLEAN_ENABLED=false
STORAGE_RETENTION_DAYS=30

# 日志配置
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
```

---

## 性能优化建议

1. **监控数据存储**：使用TTL索引自动清理旧数据，防止数据库过大
2. **代理轮换**：实现加权轮换策略，优先使用失败次数少的代理
3. **缓存配置**：使用Redis缓存配置数据，减少数据库查询
4. **批量操作**：支持用户批量更新、批量导出等操作
5. **告警聚合**：相同告警在短时间内只发送一次，避免告警风暴

---

## 注意事项

1. **权限控制**：所有管理API都需要 `admin` 角色，确保安全性
2. **数据备份**：定期备份配置数据，特别是代理和敏感配置
3. **审计日志**：所有配置变更都会记录审计日志，便于追踪问题
4. **密码安全**：用户密码必须通过bcrypt加密存储
5. **告警处理**：建议配置告警通知（邮件/webhook）及时响应问题

---

**最后更新**：2024年1月27日  
**版本**：1.0.0
