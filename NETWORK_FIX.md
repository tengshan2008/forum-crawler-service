# 前端网络连接错误 - 解决方案

## 问题描述

打开前端时出现错误提示：
- "网络连接失败，请检查服务器是否运行"
- "获取任务列表失败"

但后端接口实际上是有返回的（验证: `curl http://localhost:5000/api/tasks` 正常）

## 根本原因

前端代码硬编码了 API 基础 URL 为 `http://localhost:5000/api`：
```javascript
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
```

**问题所在**：
- 当用户在浏览器中访问 `http://localhost:3000` 时
- 浏览器（在本地主机或远程客户端）尝试连接 `localhost:5000`
- 但 `localhost` 在浏览器中指向**用户的计算机**，而不是 Docker 容器网络
- 结果是连接失败（后端实际上是在容器内部）

## 解决方案

使用 **Nginx 反向代理** 和 **相对 URL** 来解决跨域和网络隔离问题：

### 1. 更新前端 API 服务 (`frontend/src/services/api.js`)

改为使用相对路径 `/api` 代替硬编码的绝对 URL：

```javascript
const getApiBaseUrl = () => {
  // 如果定义了环境变量，使用它
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL;
  }
  
  // 否则使用相对路径，通过 Nginx 代理访问
  // 这样 /api 请求会被 Nginx 代理到 http://backend:5000/api
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();
```

### 2. Nginx 反向代理（已配置）

`docker/nginx.conf` 中已有正确的代理配置：

```nginx
# API proxy
location /api {
    proxy_pass http://backend:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

这个配置：
- 将所有 `/api/*` 请求代理到容器内部的 `backend:5000`
- 保留必要的 HTTP 头部用于正确的路由和升级连接
- 确保浏览器只需要与 Nginx 通信

## 工作流程

现在的请求流程：

```
浏览器 (localhost:3000)
   ↓
   请求: GET /api/tasks
   ↓
Nginx (port 3000)
   ↓
   代理到: http://backend:5000/api/tasks (Docker 网络内部)
   ↓
后端 API (port 5000)
   ↓
   返回: { success: true, data: [...] }
   ↓
Nginx 返回响应给浏览器
```

### 好处

✅ **跨域问题解决** - 所有请求来自同一个来源 (localhost:3000)
✅ **Docker 网络兼容** - 使用容器内部的 DNS 名称 (backend)
✅ **本地开发支持** - 相对路径在本地开发时也能工作
✅ **生产环境灵活** - 可通过环境变量覆盖 API URL

## 验证

### 1. 后端 API 直接访问
```bash
curl http://localhost:5000/api/tasks
# 返回: {"success":true,"data":[...]}
```

### 2. 通过 Nginx 代理访问
```bash
curl http://localhost:3000/api/tasks
# 返回: {"success":true,"data":[...]}
```

### 3. 前端浏览器访问
- 打开: http://localhost:3000
- 应该看到任务列表正常加载
- 不再出现 "网络连接失败" 的错误提示

## 修改的文件

### `frontend/src/services/api.js`
```diff
- const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
+ const getApiBaseUrl = () => {
+   if (process.env.REACT_APP_API_BASE_URL) {
+     return process.env.REACT_APP_API_BASE_URL;
+   }
+   return '/api';  // 使用相对路径，通过 Nginx 代理
+ };
+ const API_BASE_URL = getApiBaseUrl();
```

## 环境变量支持

如果需要在本地开发或特定环境中使用不同的 API 地址，可以设置环境变量：

```bash
# 开发环境 (.env.local)
REACT_APP_API_BASE_URL=http://localhost:5000/api

# 或通过 Docker 环境变量
docker run -e REACT_APP_API_BASE_URL=http://api.example.com/api ...
```

## 故障排除

### 症状：仍然出现 "网络连接失败"

**检查项**：
1. 确保后端容器在运行
   ```bash
   docker ps | grep backend
   ```

2. 确保 Nginx 配置正确
   ```bash
   curl http://localhost:3000/api/health
   ```

3. 查看浏览器开发工具网络标签
   - 检查 XHR 请求是否被发送到 `/api/tasks`
   - 查看响应状态码和内容

4. 查看 Nginx 日志
   ```bash
   docker logs forum-crawler-frontend | grep api
   ```

5. 查看后端日志
   ```bash
   docker logs forum-crawler-backend
   ```

### 症状：请求被拦截 (CORS 错误)

**解决方案**：
- CORS 应该已在后端配置中处理
- 如果仍有问题，检查 `backend/src/middlewares/cors.js`

```javascript
// 应该包含:
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
```

## 最佳实践

### 开发环境
使用相对路径 `/api` (生产和开发都适用)

### 本地开发（不用 Docker）
```bash
# .env.local
REACT_APP_API_BASE_URL=http://localhost:5000/api
```

### 生产环境
通过 Nginx 代理，前端和后端在同一域名下：
- Frontend: `https://example.com/` (Nginx 静态文件)
- Backend: `https://example.com/api/` (Nginx 代理到后端)

## 相关配置文件

| 文件 | 用途 | 关键配置 |
|------|------|--------|
| `frontend/src/services/api.js` | API 客户端 | baseURL: '/api' |
| `docker/nginx.conf` | 反向代理 | location /api → proxy_pass http://backend:5000 |
| `docker/docker-compose.yml` | 容器编排 | 定义 backend 服务和 forum-crawler-network |
| `backend/src/index.js` | 后端服务 | express.json(), express.urlencoded() 中间件 |

---

**修改时间**: 2025-11-29  
**版本**: 1.0.2 (with API URL fix)  
**状态**: ✅ 完成 - 网络连接问题已解决
