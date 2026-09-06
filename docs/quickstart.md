# 快速开始指南

## 5 分钟快速启动

### 选项 1: 使用 Docker Compose（推荐）

#### 前置要求
- Docker 和 Docker Compose

#### 启动步骤

1. **进入项目目录**
```bash
cd forum-crawler-service
```

2. **运行启动脚本**
```bash
# Linux/Mac
chmod +x setup.sh
./setup.sh

# Windows
setup.bat
```

3. **等待服务启动**
```bash
# 查看日志
docker-compose -f docker/docker-compose.yml logs -f
```

4. **访问应用**
- 前端: http://localhost:3000
- 后端 API: http://localhost:5000/api

---

### 选项 2: 本地开发模式

#### 前置要求
- Node.js 18+
- Python 3.11+
- MongoDB 本地实例
- Redis 本地实例

#### 后端启动

```bash
cd backend
npm install
npm run dev
```
访问: http://localhost:5000

#### 爬虫启动

```bash
cd crawler
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m app.engine
```

#### 前端启动

```bash
cd frontend
npm install
npm start
```
访问: http://localhost:3000

---

## 基础操作

### 创建爬虫任务

1. 打开 Web UI: http://localhost:3000
2. 点击"新建任务"按钮
3. 填写任务信息:
   - **任务名称**: 例如 "示例论坛爬虫"
   - **论坛地址**: 目标论坛 URL
   - **任务类型**: 选择 novel/image/mixed

4. 点击"保存"

### 启动任务

1. 在任务列表中找到创建的任务
2. 点击"开始"按钮
3. 任务开始运行，进度将实时更新

### 查看爬取内容

1. 点击任务后的"预览"按钮
2. 可以看到爬取的所有内容
3. 支持按类型过滤 (文本、图片等)

---

## 常用命令

### Docker Compose

```bash
# 启动所有服务
docker-compose -f docker/docker-compose.yml up -d

# 查看日志
docker-compose -f docker/docker-compose.yml logs -f

# 停止服务
docker-compose -f docker/docker-compose.yml stop

# 删除服务（含数据）
docker-compose -f docker/docker-compose.yml down

# 删除所有数据卷
docker-compose -f docker/docker-compose.yml down -v

# 重启特定服务
docker-compose -f docker/docker-compose.yml restart backend
```

### 数据库操作

```bash
# 进入 MongoDB shell
docker exec -it forum-crawler-mongo mongosh

# 查看所有数据库
show dbs

# 使用 forum-crawler 数据库
use forum-crawler

# 查看所有 collections
show collections

# 查询任务列表
db.crawlertasks.find()

# 删除所有数据
db.crawlertasks.deleteMany({})
```

### 日志查看

```bash
# 后端日志
docker logs forum-crawler-backend -f

# 爬虫日志
docker logs forum-crawler-crawler -f

# 前端日志
docker logs forum-crawler-frontend -f

# 获取特定数量的日志
docker logs --tail 100 forum-crawler-backend
```

---

## 配置修改

### 修改后端配置

编辑 `backend/.env`:

```env
PORT=5000                    # API 端口
MONGODB_URI=mongodb://...    # MongoDB 连接
REDIS_HOST=localhost         # Redis 主机
CORS_ORIGIN=http://localhost:3000  # 前端地址
```

### 修改爬虫配置

编辑 `crawler/.env`:

```env
MONGODB_URI=mongodb://...    # MongoDB 连接
REDIS_HOST=localhost         # Redis 主机
CRAWLER_TIMEOUT=30000        # 超时时间 (ms)
MAX_CONCURRENT_TASKS=5       # 最大并发数
```

### 修改前端配置

编辑 `frontend/.env`:

```env
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_API_TIMEOUT=30000
```

修改后需要重启服务：

```bash
docker-compose -f docker/docker-compose.yml restart backend
```

---

## 故障排除

### 问题: 无法连接到 MongoDB

**解决方案:**
```bash
# 检查 MongoDB 容器是否运行
docker ps | grep mongo

# 查看 MongoDB 日志
docker logs forum-crawler-mongo

# 重启 MongoDB
docker-compose -f docker/docker-compose.yml restart mongo
```

### 问题: 前端显示无法连接到 API

**解决方案:**
```bash
# 检查后端服务
curl http://localhost:5000/health

# 查看后端日志
docker logs forum-crawler-backend

# 检查网络连接
docker network ls
docker network inspect forum-crawler-network
```

### 问题: 爬虫任务一直处于 pending 状态

**解决方案:**
```bash
# 检查爬虫服务状态
docker ps | grep crawler

# 查看爬虫日志
docker logs forum-crawler-crawler

# 手动启动爬虫（如果需要）
docker-compose -f docker/docker-compose.yml up crawler
```

### 问题: 磁盘空间不足

**解决方案:**
```bash
# 清理 Docker 镜像和容器
docker system prune -a

# 删除下载的媒体文件
rm -rf crawler/downloads/*

# 删除数据库数据
docker-compose -f docker/docker-compose.yml down -v
```

---

## API 测试

### 使用 curl 测试

```bash
# 获取所有任务
curl http://localhost:5000/api/tasks

# 创建新任务
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Task",
    "forumUrl": "https://example.com",
    "taskType": "mixed"
  }'

# 启动任务 (替换 ID)
curl -X POST http://localhost:5000/api/tasks/[TASK_ID]/start
```

### 使用 Postman

1. 导入 API collection (可选)
2. 设置环境变量: `baseUrl=http://localhost:5000/api`
3. 开始测试

---

## 性能调优

### 增加并发爬虫数

编辑 `crawler/.env`:
```env
MAX_CONCURRENT_TASKS=10  # 增加并发数
```

### 缩短请求间隔

编辑 `crawler/app/config.py`:
```python
DOWNLOAD_DELAY = 0.5  # 改为 0.5 秒
```

### 增加数据库查询缓存

编辑 `backend/src/config/config.js`:
```javascript
redis: {
  ttl: 3600  // 缓存 1 小时
}
```

---

## 下一步

- 查看 [API 文档](./docs/api.md) 了解所有接口
- 阅读 [开发指南](./docs/development.md) 进行自定义开发
- 学习 [部署指南](./docs/deployment.md) 进行生产部署
- 了解 [项目架构](./docs/overview.md) 深入理解系统

---

## 获取帮助

- 查看项目日志: `docker-compose logs -f`
- 检查错误消息
- 阅读相关文档
- 提交 Issue 报告 bug

---

## 许可证

MIT License

祝你使用愉快！🎉
