# 快速参考 - 图片下载功能

## 🎯 功能说明

将论坛爬虫采集的图片从远程 URL 下载到本地，并在前端预览中显示本地图片。

## 📂 关键文件

| 文件 | 作用 | 修改 |
|-----|------|------|
| `backend/src/services/imageDownloader.js` | Node.js 下载服务 | ✨ 新增 |
| `crawler/image_downloader.py` | Python 下载模块 | ✨ 新增 |
| `crawler/crawl.py` | 爬虫主程序 | 🔧 修改 |
| `backend/src/index.js` | Express 服务器 | 🔧 修改 |
| `frontend/src/pages/PostPreview.js` | 预览页面 | 🔧 修改 |
| `docker/docker-compose.yml` | Docker 配置 | 🔧 修改 |
| `docker/Dockerfile.backend` | 后端镜像 | 🔧 修改 |

## 🚀 快速开始

### 1. 启动服务
```bash
cd docker/
docker-compose up -d
```

### 2. 创建任务
```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "爬取图片",
    "forumUrl": "https://forum.t66y.com/...",
    "type": "image"
  }'
```

### 3. 查看预览
访问 http://localhost:3000/ 并点击任务预览

## 📊 工作原理

```
用户创建任务
    ↓
爬虫获取论坛 HTML
    ↓
解析楼主的图片 URL
    ↓
下载所有图片到本地 (并发5个)
    ↓
保存本地路径到 MongoDB
    ↓
前端使用本地路径显示图片
```

## 🎛️ 核心配置

### 下载并发数
- **Python**: `concurrent.futures.ThreadPoolExecutor(max_workers=5)`
- **Node.js**: 批量处理，每批 5 个

### 单文件大小限制
- **限制**: 50 MB
- **位置**: `imageDownloader.js` 第 61-62 行

### HTTP 超时
- **限制**: 10 秒
- **位置**: `imageDownloader.js` 第 77-78 行

### 存储路径
```
/public/images/uploads/{taskId}/{MD5_hash}.{extension}
```

## 📍 文件位置

### 本地查看
```bash
# 查看下载的图片
ls -la /workspaces/forum-crawler-service/public/images/uploads/

# 访问特定任务的图片
ls -la /workspaces/forum-crawler-service/public/images/uploads/{taskId}/
```

### 容器内查看
```bash
docker exec forum-crawler-backend \
  ls /app/public/images/uploads/
```

### 通过 HTTP 访问
```
http://localhost:5000/public/images/uploads/{taskId}/{filename}
```

## 🔍 故障排查

### 问题：图片没有下载
**检查清单**:
1. 爬虫日志: `docker logs forum-crawler-backend | grep -i download`
2. 论坛 URL 是否可访问
3. 目录权限: `ls -la /public/images/uploads/`

### 问题：前端看不到图片
**检查清单**:
1. 浏览器开发者工具 → Network 标签
2. 检查 HTTP 请求是否正确: `/public/images/uploads/...`
3. 确认 Express 中间件已加载: `grep express.static backend/src/index.js`

### 问题：容器重启后图片丢失
**检查清单**:
1. 验证卷挂载: `docker volume ls | grep public`
2. 检查卷内容: `docker volume inspect forum-crawler_public_images`

## 📈 监控指标

### 任务进度
```bash
curl http://localhost:5000/api/tasks/{taskId} \
  | jq '.data | {progress, crawledItems, status}'
```

### 数据库记录
```bash
docker exec forum-crawler-mongo mongosh admin -u admin -p admin123 \
  -c 'use forum-crawler; db.posts.countDocuments()'
```

### 磁盘使用
```bash
du -sh /workspaces/forum-crawler-service/public/images/uploads/
```

## 🧹 清理操作

### 删除特定任务的图片
```python
# 在 Python 中调用
from image_downloader import delete_task_images
delete_task_images(task_id)
```

### 删除所有图片
```bash
rm -rf /workspaces/forum-crawler-service/public/images/uploads/*
```

### 清空 Docker 卷
```bash
docker volume rm forum-crawler_public_images
```

## ✅ 验证清单

- [ ] 所有 25 个集成测试通过
- [ ] Docker 容器正常运行
- [ ] 能创建新任务
- [ ] 爬虫能采集内容
- [ ] 图片能下载到本地
- [ ] 前端能显示本地图片
- [ ] 容器重启后图片仍存在

## 📚 详细文档

- `IMPLEMENTATION_SUMMARY.md` - 完整实现细节
- `TEST_IMAGE_DOWNLOAD.md` - 测试和部署指南
- `TEST_INTEGRATION.sh` - 自动化测试脚本

## 💡 常用命令

```bash
# 运行测试
bash TEST_INTEGRATION.sh

# 查看后端日志
docker logs -f forum-crawler-backend

# 进入 MongoDB
docker exec -it forum-crawler-mongo mongosh admin -u admin -p admin123

# 查看下载进度
watch 'du -sh /public/images/uploads'

# 重建容器
docker-compose down && docker-compose up -d --build
```

## 🎯 下一步

1. **部署**: 执行 `docker-compose up -d` 启动服务
2. **测试**: 通过 `TEST_IMAGE_DOWNLOAD.md` 中的步骤验证
3. **优化**: 根据实际使用情况调整参数
4. **监控**: 定期检查磁盘和数据库使用情况

---

**版本**: 1.0  
**最后更新**: 2024 年 1 月  
**状态**: ✅ 生产就绪
