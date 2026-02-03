# 监控仪表盘认证错误修复

## 问题描述
访问监控仪表盘（Admin Dashboard）页面时，出现错误：
```json
{
  "success": false,
  "message": "未提供认证令牌"
}
```

## 根本原因
[AdminDashboard.js](../frontend/src/pages/AdminDashboard.js) 直接使用 `axios` 库来调用后端API，而不是使用配置好的 `api` 服务实例。

问题代码：
```javascript
// 这些调用没有包含认证令牌
axios.get('/api/admin/monitor/status')
axios.get('/api/admin/monitor/history?timeRange=hour')
axios.get('/api/admin/monitor/report?timeRange=day')
axios.get('/api/admin/storage/stats')
```

因为直接使用 `axios` 不会经过 [api.js](../frontend/src/services/api.js) 中配置的请求拦截器，后者负责自动添加认证令牌。

## 解决方案

### 1. 导入正确的api服务
修改 AdminDashboard.js 的导入语句，添加：
```javascript
import api from '../services/api';
```

### 2. 使用api实例调用API
将所有 `axios.get()` 调用替换为 `api.get()`：

**修改前**：
```javascript
const [statusRes, metricsRes, reportRes, storageRes] = await Promise.all([
  axios.get('/api/admin/monitor/status'),
  axios.get('/api/admin/monitor/history?timeRange=hour'),
  axios.get('/api/admin/monitor/report?timeRange=day'),
  axios.get('/api/admin/storage/stats'),
]);
```

**修改后**：
```javascript
const [statusRes, metricsRes, reportRes, storageRes] = await Promise.all([
  api.get('/admin/monitor/status'),
  api.get('/admin/monitor/history?timeRange=hour'),
  api.get('/admin/monitor/report?timeRange=day'),
  api.get('/admin/storage/stats'),
]);
```

注意：URL从 `/api/...` 改为 `/...`，因为 `api` 实例已经设置了 `baseURL: '/api'`。

### 3. 移除不必要的导入
删除不再使用的 `axios` 导入：
```javascript
// 移除这一行
import axios from 'axios';
```

## API请求拦截器工作原理

[api.js](../frontend/src/services/api.js) 中的请求拦截器会在每个请求发送前：
1. 从 `localStorage` 中获取 `accessToken`
2. 将其添加到 `Authorization` header 中：`Bearer {token}`
3. 发送请求

这样就确保了所有API请求都自动携带认证令牌。

## 受影响的端点
- ✅ GET `/api/admin/monitor/status` - 获取实时系统状态
- ✅ GET `/api/admin/monitor/history` - 获取监控历史数据
- ✅ GET `/api/admin/monitor/report` - 生成性能报告
- ✅ GET `/api/admin/storage/stats` - 获取存储统计

## 测试验证
所有API端点都已测试并工作正常：
```
✓ 步骤 2: 测试 GET /api/admin/monitor/status - 成功
✓ 步骤 3: 测试 GET /api/admin/monitor/history - 成功
✓ 步骤 4: 测试 GET /api/admin/monitor/report - 成功
✓ 步骤 5: 测试 GET /api/admin/storage/stats - 成功
```

## 最佳实践建议

为了避免类似问题，所有前端API调用应该：
1. **优先使用 `api` 服务** - 从 `services/api.js` 导入并使用
2. **使用相对路径** - 利用 `baseURL` 配置，而不是完整路径
3. **避免直接使用 `axios`** - 除非特殊情况下不需要认证

### 正确的做法
```javascript
import api from '../services/api';

// 使用api实例，URL无需 /api 前缀
api.get('/admin/monitor/status')
api.post('/tasks', data)
api.put('/users/1', data)
```

### 避免的做法
```javascript
import axios from 'axios';

// ❌ 这样会跳过拦截器和认证
axios.get('/api/admin/monitor/status')
axios.get('http://localhost:5000/api/admin/tasks')
```

## 文件修改记录
- [frontend/src/pages/AdminDashboard.js](../frontend/src/pages/AdminDashboard.js) - 更新API调用方式
