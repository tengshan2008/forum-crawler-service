# API 文档

## 基础信息

- **基础 URL**: `http://localhost:5000/api`
- **认证方式**: 目前不需要认证（可选）
- **响应格式**: JSON

## 响应格式

所有 API 响应都遵循以下格式：

### 成功响应
```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

### 错误响应
```json
{
  "success": false,
  "message": "错误信息描述"
}
```

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
- `sort` (string, optional): 排序字段，默认为 -createdAt

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
  "name": "新任务",
  "description": "任务描述",
  "forumUrl": "https://example.com/forum",
  "taskType": "mixed",
  "config": {
    "maxDepth": 3,
    "delay": 1000,
    "timeout": 30000,
    "userAgent": "Mozilla/5.0...",
    "headers": {}
  }
}
```

**必需字段**
- `name` (string): 任务名称
- `forumUrl` (string): 论坛 URL

**可选字段**
- `description` (string): 任务描述
- `taskType` (string): 任务类型 (novel, image, mixed)，默认 mixed
- `config` (object): 爬虫配置

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

**请求体** (任何可更新字段)
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

**请求**
```
GET /api/health
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

## 错误响应

### 常见错误码

| 状态码 | 含义 | 原因 |
|--------|------|------|
| 200 | 成功 | 请求成功 |
| 201 | 创建成功 | 资源创建成功 |
| 400 | 请求错误 | 请求参数错误或验证失败 |
| 404 | 未找到 | 资源不存在 |
| 500 | 服务器错误 | 服务器内部错误 |

### 错误响应示例
```json
{
  "success": false,
  "message": "Task not found"
}
```

---

## 使用示例

### cURL

```bash
# 获取所有任务
curl -X GET "http://localhost:5000/api/tasks?page=1&limit=10"

# 创建新任务
curl -X POST "http://localhost:5000/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新任务",
    "forumUrl": "https://example.com/forum",
    "taskType": "mixed"
  }'

# 启动任务
curl -X POST "http://localhost:5000/api/tasks/65d1234567890abcdef12345/start"
```

### JavaScript/Fetch

```javascript
// 获取所有任务
fetch('http://localhost:5000/api/tasks?page=1&limit=10')
  .then(res => res.json())
  .then(data => console.log(data));

// 创建新任务
fetch('http://localhost:5000/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: '新任务',
    forumUrl: 'https://example.com/forum',
    taskType: 'mixed'
  })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

### Python

```python
import requests

# 获取所有任务
response = requests.get('http://localhost:5000/api/tasks', params={
    'page': 1,
    'limit': 10
})
print(response.json())

# 创建新任务
response = requests.post('http://localhost:5000/api/tasks', json={
    'name': '新任务',
    'forumUrl': 'https://example.com/forum',
    'taskType': 'mixed'
})
print(response.json())
```

---

## 相关资源

- [项目 README](../README.md)
- [开发指南](./development.md)
