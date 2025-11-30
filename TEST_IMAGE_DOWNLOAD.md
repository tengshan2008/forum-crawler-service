# 图片下载功能测试指南

## 实现概要

已完成以下集成：

### 1. Python 爬虫集成 (`crawler/crawl.py`)
- ✅ 导入 `image_downloader` 模块
- ✅ 在 `crawl_forum()` 方法中添加图片下载逻辑
- ✅ 下载所有图片后将本地路径保存到数据库
- ✅ 支持三种任务类型：
  - `novel`: 文本类 (不下载图片)
  - `image`: 图片类 (只下载和保存图片)
  - `mixed`: 混合类 (下载图片和保存文本)

### 2. Express 静态文件服务 (`backend/src/index.js`)
- ✅ 添加 `express.static()` 中间件
- ✅ 映射 `/public` 路由到本地 `public/` 目录
- ✅ 支持访问 `/public/images/uploads/{taskId}/{filename}` 的本地图片

### 3. 前端图片路径处理 (`frontend/src/pages/PostPreview.js`)
- ✅ 添加 `getImageUrl()` 函数
- ✅ 优先使用本地路径 (`/public/images/...`)
- ✅ 回退到远程 URL 如果本地不可用

### 4. Docker 配置 (`docker/docker-compose.yml`)
- ✅ 添加 `public_images` 卷
- ✅ 挂载到 backend 容器的 `/app/public/images`
- ✅ 确保容器重启后图片持久化

### 5. Docker 镜像 (`docker/Dockerfile.backend`)
- ✅ 复制 `public/` 目录到容器
- ✅ 创建 `/app/public/images/uploads` 目录

## 测试步骤

### 第 1 步：启动 Docker 容器

```bash
cd docker/
docker-compose up -d
```

验证容器状态：
```bash
docker-compose ps
```

所有服务应该显示 "running" 状态。

### 第 2 步：创建新任务 (图片类型)

使用 REST 客户端（如 Postman、curl 或前端 UI）创建任务：

```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试图片下载",
    "description": "测试从论坛下载图片",
    "forumUrl": "https://forum.t66y.com/thread0806.php?fid=7&tid=4184300",
    "type": "image",
    "crawlerConfig": {
      "maxDepth": 1,
      "delay": 1000
    }
  }'
```

记录返回的 `taskId`。

### 第 3 步：查看下载进度

```bash
curl http://localhost:5000/api/tasks/{taskId}
```

监视以下字段：
- `progress`: 爬虫进度 (0-100)
- `status`: 任务状态 (pending/running/completed/failed)
- `crawledItems`: 爬虫采集的项目数

### 第 4 步：验证图片下载

#### 方式 A：检查本地文件系统

```bash
ls -lah /workspaces/forum-crawler-service/public/images/uploads/
# 应该看到 {taskId}/ 文件夹
ls -lah /workspaces/forum-crawler-service/public/images/uploads/{taskId}/
# 应该看到下载的图片文件
```

#### 方式 B：查看数据库记录

```bash
docker exec -it forum-crawler-mongo mongosh admin -u admin -p admin123
use forum-crawler
db.posts.find({ taskId: ObjectId("{taskId}") }).pretty()
```

查看 `media` 数组，应该包含形如 `/public/images/uploads/{taskId}/{filename.ext}` 的本地路径。

#### 方式 C：直接访问下载的图片

在浏览器中访问：
```
http://localhost:5000/public/images/uploads/{taskId}/{filename.ext}
```

应该能直接查看下载的图片。

### 第 5 步：在前端预览

访问 http://localhost:3000/

1. 导航到 "任务管理"
2. 找到刚才创建的任务，点击 "预览"
3. 应该看到：
   - 文章标题和内容
   - 下载好的图片在响应式网格中显示
   - 图片来自本地路径 (`/public/images/...`)

## 预期结果

- ✅ 图片从论坛成功下载到本地
- ✅ 数据库中存储本地文件路径而不是远程 URL
- ✅ 前端显示本地图片而不是远程 URL
- ✅ 图片在容器重启后仍然存在 (卷持久化)
- ✅ 大量图片下载速度快 (并发 5 个)

## 故障排查

### 问题：图片没有下载
1. 检查爬虫日志：`docker logs forum-crawler-backend | grep -i "download"`
2. 检查网络连接：论坛是否可以访问
3. 检查权限：`ls -la /workspaces/forum-crawler-service/public/images/uploads/`

### 问题：图片下载失败，显示错误
1. 检查 URL 有效性
2. 验证图片大小是否超过 50MB 限制
3. 检查网络超时 (默认 10 秒)

### 问题：前端看不到图片
1. 检查 Express 是否正确映射 `/public` 路由
2. 验证图片文件是否存在：`docker exec forum-crawler-backend ls /app/public/images/uploads/`
3. 检查浏览器控制台是否有网络错误

### 问题：Docker 容器重启后图片消失
1. 验证卷挂载：`docker volume inspect forum-crawler_public_images`
2. 检查卷是否被正确创建和挂载

## 代码位置参考

- **Python 爬虫**: `/workspaces/forum-crawler-service/crawler/crawl.py`
- **图片下载服务 (Node.js)**: `/workspaces/forum-crawler-service/backend/src/services/imageDownloader.js`
- **图片下载服务 (Python)**: `/workspaces/forum-crawler-service/crawler/image_downloader.py`
- **Express 静态服务**: `/workspaces/forum-crawler-service/backend/src/index.js` (第 27 行)
- **前端预览**: `/workspaces/forum-crawler-service/frontend/src/pages/PostPreview.js`
- **Docker 配置**: `/workspaces/forum-crawler-service/docker/docker-compose.yml`

## 性能指标

- 图片下载并发数: 5 个 (可调整)
- 单个图片超时: 10 秒 (可调整)
- 最大图片大小: 50MB (可调整)
- 文件命名: MD5 hash 的前 16 位 (防重复)

## 下一步优化（可选）

1. 添加图片 CDN 缓存
2. 实现图片压缩和缩略图生成
3. 添加图片删除任务时自动清理
4. 实现图片统计 (大小、数量、下载速度)
5. 支持自定义下载路径
