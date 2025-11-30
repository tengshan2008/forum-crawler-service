# 开发指南

## 项目结构深入了解

### 后端结构

```
backend/
├── src/
│   ├── index.js              # 应用入口点
│   ├── config/
│   │   ├── config.js         # 环境配置
│   │   └── database.js       # 数据库连接
│   ├── models/
│   │   ├── Task.js           # 任务数据模型
│   │   ├── Post.js           # 内容数据模型
│   │   └── Media.js          # 媒体文件模型
│   ├── controllers/
│   │   ├── taskController.js # 任务控制器
│   │   └── postController.js # 内容控制器
│   ├── routes/
│   │   ├── taskRoutes.js     # 任务路由
│   │   ├── postRoutes.js     # 内容路由
│   │   └── index.js          # 路由合并
│   ├── services/
│   │   ├── taskService.js    # 任务服务（业务逻辑）
│   │   └── postService.js    # 内容服务
│   ├── middlewares/
│   │   ├── errorHandler.js   # 错误处理
│   │   └── cors.js           # 跨域设置
│   └── utils/
│       ├── AppError.js       # 自定义错误类
│       └── catchAsync.js     # 异步错误包装
├── .env.example
├── .gitignore
├── package.json
└── nodemon.json (可选)
```

### 爬虫结构

```
crawler/
├── app/
│   ├── __init__.py
│   ├── config.py             # 配置管理
│   ├── logger.py             # 日志系统
│   ├── base_crawler.py       # 基础爬虫类
│   ├── engine.py             # 爬虫引擎
│   ├── spiders/
│   │   ├── __init__.py
│   │   └── generic_forum.py  # 通用论坛爬虫
│   ├── pipelines/
│   │   ├── __init__.py
│   │   ├── mongodb_pipeline.py   # MongoDB 数据管道
│   │   └── media_download.py     # 媒体下载管道
│   └── middlewares/
│       └── __init__.py
├── requirements.txt
├── .env.example
└── main.py (可选)
```

### 前端结构

```
frontend/
├── src/
│   ├── index.js              # React 应用入口
│   ├── App.js                # 主应用组件
│   ├── pages/
│   │   ├── TaskList.js       # 任务列表页面
│   │   └── PostPreview.js    # 内容预览页面
│   ├── components/
│   │   ├── TaskForm.js       # 任务表单组件
│   │   └── PostCard.js       # 内容卡片组件
│   ├── services/
│   │   └── api.js            # API 请求服务
│   ├── styles/
│   │   └── index.css         # 全局样式
│   ├── utils/
│   │   └── helpers.js        # 工具函数
│   ├── App.css
│   └── index.css
├── public/
│   └── index.html
├── .env.example
├── .gitignore
└── package.json
```

---

## 开发工作流

### 1. 添加新的 API 端点

#### 步骤 1: 创建数据模型

在 `backend/src/models/NewModel.js` 中定义 Mongoose schema:

```javascript
const mongoose = require('mongoose');

const newModelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    // 其他字段...
  },
  { timestamps: true }
);

module.exports = mongoose.model('NewModel', newModelSchema);
```

#### 步骤 2: 创建控制器

在 `backend/src/controllers/newController.js` 中实现业务逻辑:

```javascript
const NewModel = require('../models/NewModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.getAll = catchAsync(async (req, res) => {
  const items = await NewModel.find();
  res.status(200).json({
    success: true,
    data: items,
  });
});

exports.create = catchAsync(async (req, res) => {
  const item = await NewModel.create(req.body);
  res.status(201).json({
    success: true,
    data: item,
  });
});

// 其他方法...
```

#### 步骤 3: 创建路由

在 `backend/src/routes/newRoutes.js` 中定义路由:

```javascript
const express = require('express');
const newController = require('../controllers/newController');

const router = express.Router();

router.get('/', newController.getAll);
router.post('/', newController.create);
router.get('/:id', newController.getById);
router.put('/:id', newController.update);
router.delete('/:id', newController.delete);

module.exports = router;
```

#### 步骤 4: 注册路由

在 `backend/src/routes/index.js` 中添加:

```javascript
const newRoutes = require('./newRoutes');
router.use('/api/new-items', newRoutes);
```

---

### 2. 添加新爬虫

#### 步骤 1: 创建爬虫类

在 `crawler/app/spiders/custom_crawler.py` 中继承 `BaseCrawler`:

```python
from app.base_crawler import BaseCrawler
from app.logger import logger

class CustomForumCrawler(BaseCrawler):
    """自定义论坛爬虫"""
    
    def extract_posts(self, url):
        """提取帖子"""
        try:
            html = self.fetch_page(url)
            soup = self.parse_html(html)
            posts = []
            
            # 自定义解析逻辑
            # ...
            
            return posts
        except Exception as e:
            logger.error(f'Error: {str(e)}')
            return []
    
    def extract_media(self, element):
        """提取媒体"""
        # 自定义媒体提取逻辑
        pass
```

#### 步骤 2: 在引擎中注册

在 `crawler/app/engine.py` 中:

```python
from app.spiders.custom_crawler import CustomForumCrawler

class CrawlerEngine:
    def get_crawler(self, crawler_type):
        if crawler_type == 'custom':
            return CustomForumCrawler
        # 其他爬虫类型...
```

---

### 3. 前端组件开发

#### 创建新页面

在 `frontend/src/pages/NewPage.js` 中:

```javascript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

const NewPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/endpoint');
      setData(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* 组件内容 */}
    </div>
  );
};

export default NewPage;
```

#### 在路由中添加页面

在 `frontend/src/App.js` 中:

```javascript
import NewPage from './pages/NewPage';

// 在 Routes 中添加:
<Route path="/new-page" element={<NewPage />} />
```

---

## 常见任务

### 修改数据库字段

1. 编辑 `backend/src/models/` 中的 Mongoose schema
2. 更新相关的控制器
3. 如需要数据迁移，创建迁移脚本

### 添加身份验证

在需要保护的路由前添加认证中间件:

```javascript
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  // 验证 token...
  next();
};

router.post('/protected', authenticate, controller.action);
```

### 添加日志记录

在爬虫中使用提供的日志系统:

```python
from app.logger import logger

logger.info('操作信息')
logger.warning('警告信息')
logger.error('错误信息')
logger.debug('调试信息')
```

在后端使用 console:

```javascript
console.log('操作信息');
console.error('错误信息');
```

### 处理错误

使用自定义错误类:

```javascript
const AppError = require('../utils/AppError');

if (notFound) {
  throw new AppError('Resource not found', 404);
}
```

---

## 测试

### 后端测试

使用 Jest 编写测试 (需要配置):

```javascript
// backend/src/controllers/__tests__/taskController.test.js
const request = require('supertest');
const app = require('../../index');

describe('Task Controller', () => {
  it('should get all tasks', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

运行测试:
```bash
npm test
```

### 前端测试

使用 React Testing Library 或 Jest:

```javascript
import { render, screen } from '@testing-library/react';
import TaskList from '../pages/TaskList';

describe('TaskList', () => {
  it('renders task list', () => {
    render(<TaskList />);
    expect(screen.getByText(/任务管理/i)).toBeInTheDocument();
  });
});
```

---

## 部署前清单

- [ ] 更新所有 `.env.example` 文件
- [ ] 删除敏感信息（密钥、密码等）
- [ ] 运行 linter 检查代码质量
- [ ] 编写/更新测试
- [ ] 更新 API 文档
- [ ] 检查日志输出
- [ ] 性能测试
- [ ] 安全审计

---

## 有用的命令

### 后端
```bash
# 开发模式
npm run dev

# 生产模式
npm start

# 运行测试
npm test

# Linting
npm run lint
```

### 爬虫
```bash
# 创建虚拟环境
python -m venv venv

# 安装依赖
pip install -r requirements.txt

# 运行爬虫
python -m app.engine
```

### 前端
```bash
# 开发模式
npm start

# 生产构建
npm run build

# 运行测试
npm test

# Eject (不可逆)
npm run eject
```

### Docker
```bash
# 构建镜像
docker-compose -f docker/docker-compose.yml build

# 启动服务
docker-compose -f docker/docker-compose.yml up -d

# 查看日志
docker-compose -f docker/docker-compose.yml logs -f

# 停止服务
docker-compose -f docker/docker-compose.yml down

# 清除所有
docker-compose -f docker/docker-compose.yml down -v
```

---

## 资源链接

- [Express.js 文档](https://expressjs.com/)
- [MongoDB 文档](https://docs.mongodb.com/)
- [React 文档](https://react.dev/)
- [Ant Design 文档](https://ant.design/)
- [Docker 文档](https://docs.docker.com/)
- [Python 爬虫最佳实践](https://docs.scrapy.org/)
