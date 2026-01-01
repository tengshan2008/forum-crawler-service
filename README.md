# Forum Crawler Service 论坛爬虫服务

一个完整的论坛爬虫解决方案，支持爬取小说和图片帖子，并通过 Web UI 管理爬取任务和预览内容。

![Build Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/node.js-18+-green)
![Python](https://img.shields.io/badge/python-3.11+-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)

## 功能特性

- ✨ **任务管理**: 创建、编辑、删除、启动、暂停和恢复爬取任务
- 🖼️ **内容爬取**: 支持爬取文本、小说和图片内容
- 👀 **内容预览**: 在 Web UI 中预览爬取的内容
- � **智能去重**: 基于内容哈希的智能重复检测，自动识别相同内容和更新
- 📊 **统计分析**: 任务进度跟踪、内容统计和跳过原因分析
- 🔄 **异步处理**: 基于任务队列的异步爬取机制
- 🐳 **Docker 支持**: 完整的容器化部署方案
- 🌐 **现代 UI**: 使用 React + Ant Design 的响应式前端

## 项目架构

```
forum-crawler-service/
├── backend/              # Node.js/Express 后端服务
│   ├── src/
│   │   ├── config/      # 配置文件
│   │   ├── models/      # 数据库模型
│   │   ├── controllers/ # 控制器
│   │   ├── routes/      # 路由定义
│   │   ├── services/    # 业务逻辑
│   │   ├── middlewares/ # 中间件
│   │   └── utils/       # 工具函数
│   ├── package.json
│   └── .env.example
│
├── crawler/             # Python 爬虫服务
│   ├── app/
│   │   ├── spiders/     # 爬虫蜘蛛程序
│   │   ├── pipelines/   # 数据处理管道
│   │   ├── middlewares/ # 爬虫中间件
│   │   ├── config.py    # 配置
│   │   └── engine.py    # 爬虫引擎
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/            # React 前端
│   ├── src/
│   │   ├── pages/       # 页面组件
│   │   ├── components/  # 通用组件
│   │   ├── services/    # API 服务
│   │   ├── styles/      # 样式文件
│   │   ├── utils/       # 工具函数
│   │   └── App.js
│   ├── public/
│   ├── package.json
│   └── .env.example
│
├── docker/              # Docker 配置
│   ├── Dockerfile.backend
│   ├── Dockerfile.crawler
│   ├── Dockerfile.frontend
│   ├── docker-compose.yml
│   └── nginx.conf
│
├── docs/                # 文档
├── docker-compose.yml   # 本地开发配置
└── README.md
```

## 技术栈

### 后端
- **运行时**: Node.js 18+
- **框架**: Express.js
- **数据库**: MongoDB
- **缓存**: Redis
- **认证**: JWT

### 爬虫
- **语言**: Python 3.11+
- **库**: BeautifulSoup4, Requests, Selenium
- **数据库**: MongoDB
- **缓存**: Redis

### 前端
- **框架**: React 18
- **UI 库**: Ant Design 5
- **路由**: React Router v6
- **HTTP 客户端**: Axios
- **时间处理**: dayjs

### 部署
- **容器**: Docker & Docker Compose
- **Web 服务器**: Nginx
- **数据库**: MongoDB 7.0
- **缓存**: Redis 7

## 快速开始

### 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (本地开发)
- Python 3.11+ (本地开发)

### 使用 Docker Compose 部署

1. **克隆项目**

```bash
git clone <repository-url>
cd forum-crawler-service
```

2. **运行设置脚本**

```bash
# Linux/Mac
chmod +x setup.sh
./setup.sh

# Windows
setup.bat
```

3. **访问应用**

- 前端: http://localhost:3000
- 后端 API: http://localhost:5000
- MongoDB: localhost:27017
- Redis: localhost:6379

4. **停止服务**

```bash
docker-compose -f docker/docker-compose.yml down
```

### 本地开发

#### 后端开发

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

服务在 http://localhost:5000 运行

#### 爬虫开发

```bash
cd crawler
python -m venv venv
source venv/bin/activate  # Linux/Mac 或 venv\Scripts\activate (Windows)
pip install -r requirements.txt
cp .env.example .env
```

#### 前端开发

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

应用在 http://localhost:3000 运行

## API 文档

### 任务管理 API

#### 获取所有任务
```bash
GET /api/tasks?page=1&limit=10&status=pending
```

#### 创建任务
```bash
POST /api/tasks
Content-Type: application/json

{
  "name": "Test Task",
  "description": "描述",
  "forumUrl": "https://example.com/forum",
  "taskType": "mixed",
  "config": {
    "maxDepth": 3,
    "delay": 1000,
    "timeout": 30000
  }
}
```

#### 启动任务
```bash
POST /api/tasks/:id/start
```

#### 暂停任务
```bash
POST /api/tasks/:id/pause
```

#### 恢复任务
```bash
POST /api/tasks/:id/resume
```

### 内容管理 API

#### 获取所有内容
```bash
GET /api/posts?page=1&limit=20&postType=image
```

#### 获取特定任务的内容
```bash
GET /api/posts/task/:taskId?page=1&limit=20
```

#### 获取内容统计
```bash
GET /api/posts/task/:taskId/stats
```

## 环境变量配置

详见各项目目录中的 `.env.example` 文件

## 许可证

MIT License

## 支持

如有问题，请提交 Issue 或联系开发者

## 相关链接

- [项目文档](./docs/)
- [API 文档](./docs/api.md)
- [开发指南](./docs/development.md)
