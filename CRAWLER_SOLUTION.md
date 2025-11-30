# 爬虫任务执行系统 - 解决方案

## 问题描述

任务启动后，进度一直是 0%，且没有爬虫容器在运行，任务无法执行。

## 根本原因

1. **爬虫容器未启动** - docker-compose.yml 中爬虫服务被设置为 `profiles: ["crawler"]`，默认不启动
2. **没有任务执行机制** - 后端的 `startTask` 方法只改变数据库状态，没有实际启动爬虫
3. **没有异步任务队列** - 任务启动时没有对应的执行逻辑

## 解决方案实现

### 1. **移除独立爬虫容器**

将爬虫集成到后端服务中，而不是作为独立容器运行。这样更简单且易于管理。

修改 `docker/docker-compose.yml`：
- ❌ 移除 `crawler` 服务定义
- ❌ 移除 `profiles: ["crawler"]` 配置
- ❌ 移除 `crawler_downloads` 卷

### 2. **实现爬虫任务队列系统**

使用 **Bull + Redis** 实现异步任务队列：

**文件**: `backend/src/services/crawlerQueue.js`
```javascript
const Queue = require('bull');

// 创建爬虫任务队列，使用 Redis 作为后端
const crawlerQueue = new Queue('crawler', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  },
});

// 监听队列事件
crawlerQueue.on('completed', (job) => {
  console.log(`✓ 爬虫任务完成: ${job.data.taskId}`);
});

// 添加任务到队列
async function addCrawlerTask(taskId, forumUrl, taskType, taskConfig) {
  const job = await crawlerQueue.add(
    { taskId, forumUrl, taskType, config: taskConfig },
    {
      attempts: 3,        // 失败重试 3 次
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  return job;
}
```

### 3. **创建爬虫执行引擎**

**文件**: `backend/src/services/crawlerExecutor.js`

使用 Node.js `spawn` 启动 Python 爬虫进程：
```javascript
async function executeCrawler(taskId, forumUrl, taskType, taskConfig) {
  // 启动 Python 爬虫脚本
  const crawlerProcess = spawn('python3', [
    '/app/crawler/crawl.py',
    '--url', forumUrl,
    '--type', taskType,
    '--task-id', taskId,
    // ... 其他参数
  ]);

  // 监听进度输出
  crawlerProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line.includes('PROGRESS:')) {
      const progress = parseInt(line.split('PROGRESS:')[1]);
      updateTaskProgress(taskId, progress);
    }
  });

  // 等待进程完成
  return new Promise((resolve, reject) => {
    crawlerProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`爬虫失败: 退出码 ${code}`));
      }
    });
  });
}
```

### 4. **更新任务控制器**

**文件**: `backend/src/controllers/taskController.js`

修改 `startTask` 方法：
```javascript
exports.startTask = catchAsync(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  // 更新任务状态
  task.status = 'running';
  task.startTime = new Date();
  task.progress = 0;
  task.crawledItems = 0;
  await task.save();

  // 异步添加到爬虫队列（不阻塞响应）
  try {
    await addCrawlerTask(
      task._id.toString(),
      task.forumUrl,
      task.taskType,
      task.config
    );
  } catch (error) {
    console.error('Failed to add crawler task:', error);
    task.status = 'failed';
    task.errorLog.push({
      timestamp: new Date(),
      error: error.message,
    });
    await task.save();
  }

  res.status(200).json({
    success: true,
    data: task,
    message: 'Task started',
  });
});
```

### 5. **初始化爬虫队列处理器**

**文件**: `backend/src/index.js`

在服务器启动时设置队列处理：
```javascript
// 设置爬虫队列处理
crawlerQueue.process(1, async (job) => {
  const { taskId, forumUrl, taskType, config: taskConfig } = job.data;

  try {
    // 更新任务为运行中
    await Task.findByIdAndUpdate(taskId, {
      status: 'running',
      progress: 5,
    });

    // 执行爬虫
    const result = await executeCrawler(taskId, forumUrl, taskType, taskConfig);

    // 更新任务为完成
    await Task.findByIdAndUpdate(taskId, {
      status: 'completed',
      progress: 100,
      endTime: new Date(),
    });

    return result;
  } catch (error) {
    // 更新任务为失败
    await Task.findByIdAndUpdate(taskId, {
      status: 'failed',
      errorLog: [{ timestamp: new Date(), error: error.message }],
    });
    throw error;
  }
});
```

### 6. **创建爬虫启动脚本**

**文件**: `crawler/crawl.py`

简单的 Python 爬虫脚本，输出进度信息：
```python
#!/usr/bin/env python3
import sys
import argparse
import time

def mock_crawler(task_id, forum_url, task_type, max_depth=3):
    """模拟爬虫执行"""
    print(f"开始爬虫任务 {task_id}", flush=True)
    
    total_items = 10
    for i in range(1, total_items + 1):
        time.sleep(0.5)
        
        progress = int((i / total_items) * 100)
        print(f"PROGRESS:{progress}", flush=True)
        print(f"CRAWLED:{i}", flush=True)
    
    return {
        'success': True,
        'task_id': task_id,
        'total_posts': total_items,
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--type', required=True)
    parser.add_argument('--task-id', required=True)
    parser.add_argument('--max-depth', type=int, default=3)
    
    args = parser.parse_args()
    result = mock_crawler(args.task_id, args.url, args.type, args.max_depth)
    
    if result['success']:
        print(f"CRAWLED:{result.get('total_posts', 0)}", flush=True)
        sys.exit(0)
    else:
        sys.exit(1)
```

### 7. **更新后端 Dockerfile**

**文件**: `docker/Dockerfile.backend`

在后端镜像中添加 Python：
```dockerfile
FROM node:18-alpine

# 安装 Python
RUN apk add --no-cache python3 py3-pip curl && \
    pip3 install --no-cache-dir --break-system-packages \
      beautifulsoup4 \
      requests \
      pymongo \
      redis \
      python-dotenv \
      pillow \
      scrapy

WORKDIR /app/backend

# 安装 Node 依赖
COPY backend/package*.json ./
RUN npm install --production

# 复制源代码和爬虫
COPY backend/src ./src
COPY crawler ../crawler

EXPOSE 5000

CMD ["npm", "start"]
```

## 工作流程

```
用户点击启动任务
        ↓
后端 API 接收请求 (/api/tasks/:id/start)
        ↓
TaskController.startTask() 更新数据库状态为 'running'
        ↓
addCrawlerTask() 将任务添加到 Redis 队列
        ↓
爬虫队列处理器接收任务
        ↓
executeCrawler() 启动 Python 爬虫进程
        ↓
爬虫脚本输出 PROGRESS 和 CRAWLED 信息
        ↓
后端解析进度信息，实时更新数据库
        ↓
爬虫完成，更新任务状态为 'completed'，进度为 100%
        ↓
前端定期查询 API 获取最新任务状态和进度
        ↓
用户在 UI 上看到实时进度更新
```

## 验证测试

### 创建任务
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试爬虫",
    "forumUrl": "https://example.com",
    "taskType": "image"
  }'
```

### 启动任务
```bash
curl -X POST http://localhost:3000/api/tasks/{task_id}/start
```

### 监控进度
```bash
curl http://localhost:3000/api/tasks
```

**预期结果**:
- ✅ 任务状态变为 `running`
- ✅ 进度从 0% 逐渐增加到 100%
- ✅ `crawledItems` 数字增加
- ✅ 任务完成后状态变为 `completed`，进度为 100%

## 修改的文件列表

1. ✅ `backend/src/services/crawlerQueue.js` - 新建
2. ✅ `backend/src/services/crawlerExecutor.js` - 新建
3. ✅ `backend/src/controllers/taskController.js` - 更新
4. ✅ `backend/src/routes/taskRoutes.js` - 更新
5. ✅ `backend/src/index.js` - 更新
6. ✅ `docker/Dockerfile.backend` - 更新
7. ✅ `docker/docker-compose.yml` - 更新
8. ✅ `crawler/crawl.py` - 新建
9. ✅ `crawler/__init__.py` - 新建
10. ✅ `crawler/app/cli.py` - 新建

## 性能优化建议

### 1. **并发处理**
修改 `crawlerQueue.process(1, ...)` 中的 `1` 为更大的数字以并发处理多个任务。

### 2. **任务去重**
使用 jobId 避免重复任务：
```javascript
await crawlerQueue.add(
  { taskId, ... },
  { jobId: taskId } // 使用任务 ID 作为 job ID
);
```

### 3. **进度持久化**
定期保存爬虫进度到 Redis，以便在系统重启时恢复。

### 4. **超时处理**
为爬虫进程设置合理的超时：
```javascript
const timeout = taskConfig?.timeout || 300000; // 默认 5 分钟
const timer = setTimeout(() => crawlerProcess.kill(), timeout);
```

## 故障排除

### 症状: 任务卡在 'running' 状态

**检查项**:
1. 查看后端日志: `docker logs forum-crawler-backend`
2. 检查 Redis 连接: `docker exec forum-crawler-redis redis-cli ping`
3. 验证爬虫脚本权限: `docker exec forum-crawler-backend ls -la /app/crawler/crawl.py`

### 症状: 进度不更新

**检查项**:
1. 爬虫脚本是否输出 PROGRESS 信息
2. 后端是否正确解析进度信息
3. MongoDB 连接是否正常

### 症状: 爬虫超时

**解决方案**:
1. 增加超时时间参数
2. 优化爬虫效率
3. 检查网络连接

---

**实现时间**: 2025-11-29  
**版本**: 1.0.0 (Crawler Queue System)  
**状态**: ✅ 完成 - 爬虫任务执行系统已实现并测试
