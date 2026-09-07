# API 文档

## 基础信息

- **基础 URL**: `http://localhost:5000/api`（生产环境经前端 nginx 同源代理 `/api`）
- **认证方式**: JWT Bearer Token。除 `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/refresh`、`POST /api/auth/logout`、`GET /health` 外，所有接口均需在请求头携带 `Authorization: Bearer <accessToken>`
- **限流**: 认证相关接口（register/login/refresh）按 IP 限流，每 15 分钟 20 次，超限返回 429
- **令牌存储（F4 风险记录，v2.4.0）**: accessToken 存于浏览器 localStorage（存在 XSS 窃取面，短期接受该风险），refreshToken 走 httpOnly Cookie，数据库仅存 SHA-256 哈希且单用户上限 10 个（超出裁剪最旧）；长期方向为评估 accessToken 收敛至 httpOnly Cookie + CSRF 防护
- **静态资源跨域（S5，v2.4.0）**: `/public` 不再单独放开 `Access-Control-Allow-Origin: *`，与 API 一致走 CORS 白名单（`<img>` 引用不受 CORS 限制，CORP 头由 helmet 全局提供）
- **响应格式**: JSON（统一成功/错误结构见下）
- **角色**: 普通用户仅可访问本人数据；管理员接口（如 `GET /api/tasks/crawler/stats`、`/api/admin/*`）要求 `admin` 角色，越权返回 403

## 统一响应约定

所有 API 响应都遵循以下结构（后端由 `utils/respond.js` 的 `sendSuccess` 统一产出，未迁移的 controller 亦为同构手工写法）：

### 成功响应
```json
{
  "success": true,
  "data": {},
  "message": "操作成功（可选，仅在提供时出现）",
  "pagination": { "total": 100, "page": 1, "limit": 10, "pages": 10 }
}
```
- `data`：主体数据（对象、数组或 `null`）
- `pagination`：仅列表接口出现，与 `data` 平级
- `message`：可选提示文案

### 错误响应
```json
{
  "success": false,
  "message": "错误信息描述"
}
```
- 由全局错误中间件统一产出；`NODE_ENV=development` 时额外附带 `stack` 字段
- **例外（历史遗留）**：认证接口的表单校验失败返回 `400` 与 `{ "errors": [ { "msg": "...", "param": "..." } ] }`（express-validator 结构，无 `success` 字段）

### 常见状态码

| 状态码 | 含义 | 典型场景 |
|--------|------|----------|
| 200 | 成功 | 请求成功 |
| 201 | 创建成功 | 资源创建成功（注册、创建任务等） |
| 400 | 请求错误 | 参数校验失败、非法状态转换（如 running 任务取消） |
| 401 | 未认证 | 缺失/过期/无效 JWT |
| 403 | 无权限 | 非所有者且非管理员访问他人资源 |
| 404 | 未找到 | 资源不存在或无权可见（所有权约束下对他人资源返回 404） |
| 429 | 请求过频 | 认证接口触发限流 |
| 500 | 服务器错误 | 服务器内部错误 |

---

## 认证 API

### 注册
```
POST /api/auth/register
```
请求体：`{ "email": "a@b.c", "username": "user", "password": "至少8位", "confirmPassword": "..." }`
成功 `201`：`{ "success": true, "message": "注册成功", "data": { ... } }`
限流：20 次 / 15 分钟 / IP。

### 登录
```
POST /api/auth/login
```
请求体：`{ "email": "a@b.c", "password": "..." }`
成功 `200`：
```json
{
  "success": true,
  "message": "登录成功",
  "data": { "user": { "...": "用户资料" }, "accessToken": "JWT", "expiresIn": 900 }
}
```
同时通过 `Set-Cookie` 下发 httpOnly 的 `refreshToken`（生产环境 secure，sameSite=strict，30 天）。

### 刷新令牌
```
POST /api/auth/refresh
```
从 cookie 或请求体 `refreshToken` 读取；成功返回新的 accessToken。限流同登录。

### 登出
```
POST /api/auth/logout
```
清除 refreshToken cookie，无需认证（令牌过期时也可调）。

### 当前用户 / 资料 / 密码
```
GET  /api/auth/me          # 获取当前登录用户
PUT  /api/auth/profile     # 更新资料：{ username(3-30, 可选), email(可选, 唯一性校验), avatar(可选) }，成功后前端同步刷新本地用户缓存
PUT  /api/auth/password    # 修改密码：{ oldPassword, newPassword(≥8), confirmPassword }
```
> 修改密码端点为 `PUT /api/auth/password`，前端统一经 `authService.changePassword` 调用该端点（v2.3.1 修复端到端不可用问题；实现已合并，api.js 不再有重复导出）。

---

## 任务管理 API

### 1. 获取所有任务

**请求**
```
GET /api/tasks
```

**查询参数**
- `page` (integer, optional): 页码，默认为 1
- `limit` (integer, optional): 每页数量，默认为 10
- `status` (string, optional): 任务状态过滤 (pending, running, paused, completed, failed)
- `crawlType` (string, optional): 采集类型过滤 (single, batch)
- `sort` (string, optional): 排序字段，默认为 -createdAt

> 普通用户仅返回本人任务；管理员返回全部。

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "_id": "65d1234567890abcdef12345",
      "name": "论坛爬虫任务1",
      "description": "爬取示例论坛",
      "forumUrl": "https://example.com/forum",
      "taskType": "mixed",
      "status": "completed",
      "progress": 100,
      "totalItems": 150,
      "crawledItems": 150,
      "failedItems": 0,
      "config": {
        "maxDepth": 3,
        "delay": 1000,
        "timeout": 30000
      },
      "createdAt": "2024-02-20T10:00:00Z",
      "updatedAt": "2024-02-20T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "pages": 1
  }
}
```

---

### 2. 获取单个任务

**请求**
```
GET /api/tasks/:id
```

**参数**
- `id` (string): 任务 ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "_id": "65d1234567890abcdef12345",
    "name": "论坛爬虫任务1",
    // ... 其他字段
  }
}
```

---

### 3. 创建任务

**请求**
```
POST /api/tasks
Content-Type: application/json
```

**请求体**
```json
{
  "name": "新任务（可选，留空自动命名）",
  "description": "任务描述",
  "crawlType": "single",
  "forumUrl": "https://example.com/post/123",
  "sectionUrl": "https://example.com/section/1",
  "taskType": "mixed",
  "config": { "maxPages": 10 },
  "schedule": { "enabled": false }
}
```

**字段规则**
- `crawlType` (string, 必填): `single`（单帖）或 `batch`（批量）
- `forumUrl` (string, 条件必填): 单帖采集时必填
- `sectionUrl` (string, 条件必填): 批量采集时必填
- `name` (string, 可选): 留空时按类型自动生成（`单帖/批量采集_<时间戳>`），批量任务也可由爬虫返回的标题补全
- `taskType` (string, 可选): novel / image / mixed
- `description` / `config` / `schedule` (object, 可选)

创建成功后任务状态固定为 `pending`（客户端传入的 status/userId 等字段被忽略）。

**响应示例**
```json
{
  "success": true,
  "data": {
    "_id": "65d1234567890abcdef12345",
    "name": "新任务",
    "status": "pending",
    "progress": 0,
    "crawledItems": 0
  },
  "message": "Task created successfully"
}
```

---

### 4. 更新任务

**请求**
```
PUT /api/tasks/:id
Content-Type: application/json
```

**参数**
- `id` (string): 任务 ID

**请求体**（仅白名单字段生效，其余忽略）
- 可更新字段：`name`、`description`、`forumUrl`、`sectionUrl`、`crawlType`、`taskType`、`config`、`schedule`
- `status`、`userId`、`progress` 等状态/归属字段不在白名单，传入即忽略（防批量赋值篡改）
```json
{
  "name": "更新的名称",
  "description": "新描述"
}
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "_id": "65d1234567890abcdef12345",
    "name": "更新的名称",
    // ... 更新后的字段
  },
  "message": "Task updated successfully"
}
```

---

### 5. 删除任务

**请求**
```
DELETE /api/tasks/:id
```

**参数**
- `id` (string): 任务 ID

**响应示例**
```json
{
  "success": true,
  "data": null,
  "message": "Task deleted successfully"
}
```

---

### 6. 启动任务

**请求**
```
POST /api/tasks/:id/start
```

**参数**
- `id` (string): 任务 ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "_id": "65d1234567890abcdef12345",
    "status": "running",
    "startTime": "2024-02-20T10:30:00Z"
  },
  "message": "Task started"
}
```

---

### 7. 暂停任务

**请求**
```
POST /api/tasks/:id/pause
```

**参数**
- `id` (string): 任务 ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "_id": "65d1234567890abcdef12345",
    "status": "paused"
  },
  "message": "Task paused"
}
```

---

### 8. 恢复任务

**请求**
```
POST /api/tasks/:id/resume
```

**参数**
- `id` (string): 任务 ID

**响应示例**
```json
{
  "success": true,
  "data": {
    "_id": "65d1234567890abcdef12345",
    "status": "running"
  },
  "message": "Task resumed"
}
```

---

### 9. 取消排队任务

**请求**
```
POST /api/tasks/:id/cancel
```

取消仍在队列中等待（waiting/delayed）的任务：从队列移除 job 并将任务回退为 `paused`。

- 任务正在执行（running）→ `400`「任务正在执行中，无法取消」
- 任务不在等待队列（如已消费完成）→ `400`「任务不在等待队列中」

**响应示例**
```json
{
  "success": true,
  "data": {
    "_id": "65d1234567890abcdef12345",
    "status": "paused"
  },
  "message": "Task cancelled"
}
```

---

### 10. 查看任务执行日志

**请求**
```
GET /api/tasks/:id/logs?lines=100
```

**查询参数**
- `lines` (integer, optional): 返回日志尾部行数，默认 100

读取爬虫任务落盘日志（`crawler/logs/task_<id>.log`）的尾部。

**响应示例**（日志存在）
```json
{
  "success": true,
  "data": {
    "taskId": "65d1234567890abcdef12345",
    "logs": ["开始爬虫任务 ...", "PROGRESS:50", "CRAWLED:12"],
    "exists": true
  }
}
```

任务尚未执行、日志文件不存在时：
```json
{
  "success": true,
  "data": { "taskId": "...", "logs": [], "exists": false }
}
```

---

### 11. 爬虫队列统计（管理员）

**请求**
```
GET /api/tasks/crawler/stats
```

需 `admin` 角色（普通用户 `403`）。返回 Bull 队列计数：`active` / `waiting` / `completed` / `failed` / `paused` / `delayed`。

---

## 内容管理 API

### 1. 获取所有内容

**请求**
```
GET /api/posts
```

**查询参数**
- `page` (integer, optional): 页码，默认为 1
- `limit` (integer, optional): 每页数量，默认为 20
- `taskId` (string, optional): 任务 ID 过滤
- `postType` (string, optional): 内容类型过滤 (novel, image, text)
- `status` (string, optional): 状态过滤 (active, archived, flagged)
- `sort` (string, optional): 排序字段，默认为 -createdAt

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "_id": "65d1234567890abcdef12345",
      "taskId": "65d1234567890abcdef12346",
      "title": "内容标题",
      "content": "内容文本...",
      "postType": "image",
      "author": "作者名",
      "sourceUrl": "https://example.com/post/123",
      "media": [
        {
          "type": "image",
          "url": "https://example.com/image.jpg",
          "description": "图片描述"
        }
      ],
      "likes": 10,
      "views": 100,
      "replies": 5,
      "tags": ["tag1", "tag2"],
      "crawledAt": "2024-02-20T10:00:00Z",
      "createdAt": "2024-02-20T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

---

### 2. 获取单个内容

**请求**
```
GET /api/posts/:id
```

**参数**
- `id` (string): 内容 ID

---

### 3. 获取任务相关的内容

**请求**
```
GET /api/posts/task/:taskId
```

**参数**
- `taskId` (string): 任务 ID

**查询参数**
- `page` (integer, optional): 页码
- `limit` (integer, optional): 每页数量
- `sort` (string, optional): 排序字段
- `postType` (string, optional): 内容类型过滤

---

### 4. 获取内容统计

**请求**
```
GET /api/posts/task/:taskId/stats
```

**参数**
- `taskId` (string): 任务 ID

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "_id": "image",
      "count": 50,
      "avgLikes": 15.5,
      "avgViews": 120.3
    },
    {
      "_id": "text",
      "count": 45,
      "avgLikes": 10.2,
      "avgViews": 85.6
    }
  ]
}
```

---

### 5. 创建内容

**请求**
```
POST /api/posts
Content-Type: application/json
```

**请求体**
```json
{
  "taskId": "65d1234567890abcdef12346",
  "title": "新内容",
  "content": "内容文本",
  "postType": "image",
  "author": "作者",
  "sourceUrl": "https://example.com/post/123",
  "media": [
    {
      "type": "image",
      "url": "https://example.com/image.jpg",
      "description": "描述"
    }
  ]
}
```

---

### 6. 更新内容

**请求**
```
PUT /api/posts/:id
Content-Type: application/json
```

**参数**
- `id` (string): 内容 ID

**请求体**（仅白名单字段生效，其余忽略）
- 可更新字段：`title`、`content`、`visibility`（public/private/protected）、`status`（active/archived/flagged）、`tags`
- `userId`、`taskId`、`sourceUrl`、`contentHash`、`postType`、`likes/views/replies` 等不在白名单，传入即忽略（防批量赋值篡改）
- 仅所有者本人可更新（非所有者返回 404）

---

### 7. 删除内容

**请求**
```
DELETE /api/posts/:id
```

**参数**
- `id` (string): 内容 ID

---

## 健康检查

**请求**（无需认证，路径无 `/api` 前缀）
```
GET /health
```

**响应示例**
```json
{
  "success": true,
  "message": "API is running",
  "timestamp": "2024-02-20T10:30:00.000Z"
}
```

---

## 其他模块

- **浏览/检索 API**：`/api/browse/images`、`/api/browse/novels`、`/api/browse/collections/*` 等（图片/小说浏览、搜索、收藏夹管理），均需认证
- **管理 API**：`/api/admin/*`（用户管理、系统配置、监控），需 `admin` 角色
- 响应结构与上述统一约定一致

---

## 使用示例

> 除注册/登录等公开接口外，请求头需携带 `Authorization: Bearer <accessToken>`。

### cURL

```bash
# 登录获取令牌
curl -X POST "http://localhost:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.c","password":"yourpassword"}'

# 获取所有任务
curl -X GET "http://localhost:5000/api/tasks?page=1&limit=10" \
  -H "Authorization: Bearer <accessToken>"

# 创建新任务
curl -X POST "http://localhost:5000/api/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "crawlType": "single",
    "forumUrl": "https://example.com/post/123",
    "taskType": "mixed"
  }'

# 取消排队任务
curl -X POST "http://localhost:5000/api/tasks/65d1234567890abcdef12345/cancel" \
  -H "Authorization: Bearer <accessToken>"

# 查看任务日志尾部
curl "http://localhost:5000/api/tasks/65d1234567890abcdef12345/logs?lines=200" \
  -H "Authorization: Bearer <accessToken>"
```

### JavaScript/Fetch

```javascript
const TOKEN = '登录后获取的 accessToken';
const authHeader = { Authorization: `Bearer ${TOKEN}` };

// 获取所有任务
fetch('http://localhost:5000/api/tasks?page=1&limit=10', { headers: authHeader })
  .then(res => res.json())
  .then(data => console.log(data));

// 创建新任务
fetch('http://localhost:5000/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeader },
  body: JSON.stringify({
    crawlType: 'single',
    forumUrl: 'https://example.com/post/123',
    taskType: 'mixed'
  })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

### Python

```python
import requests

headers = {'Authorization': f'Bearer {access_token}'}

# 获取所有任务
response = requests.get('http://localhost:5000/api/tasks',
                        params={'page': 1, 'limit': 10}, headers=headers)
print(response.json())

# 创建新任务
response = requests.post('http://localhost:5000/api/tasks', json={
    'crawlType': 'single',
    'forumUrl': 'https://example.com/post/123',
    'taskType': 'mixed'
}, headers=headers)
print(response.json())
```

---

## 相关资源

- [项目 README](../README.md)
- [开发指南](./development.md)
