# Forum Crawler Service 论坛爬虫服务

一个**完整的生产级论坛爬虫服务**，支持爬取小说和图片帖子，具有智能去重、多分页聚合、多楼层提取等高级功能。通过现代化Web UI管理爬取任务和预览内容。

[![CI](https://github.com/tengshan2008/forum-crawler-service/actions/workflows/ci.yml/badge.svg)](https://github.com/tengshan2008/forum-crawler-service/actions/workflows/ci.yml)
![Build Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/node.js-18+-green)
![Python](https://img.shields.io/badge/python-3.11+-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![Version](https://img.shields.io/badge/version-v2.2.0-orange)

## 功能特性

🎯 **核心爬虫功能**
- ✨ **任务管理系统**：创建、编辑、启动、暂停、恢复、取消任务，完整的生命周期管理
- 🖼️ **多内容类型支持**：小说(纯文本)、图片、混合模式，按需灵活处理
- 📄 **多分页聚合**：自动检测分页总数，逐页获取并合并内容（已验证6页+帖子）
- 🏢 **多楼层提取**：自动识别并提取单个帖子中的所有楼层内容
- 🔗 **智能链接提取**：优化的URL识别和处理，支持多种格式转换

🧠 **数据智能处理**
- 🎯 **内容重复检测**：多维度去重（URL、内容长度、内容哈希），自动识别更新
- 🔐 **内容哈希存储**：计算并存储内容哈希值，支持跨URL去重
- 📊 **跳过原因统计**：详细记录每条跳过的原因和信息，前端彩色展示

🖥️ **用户界面**
- 💻 **现代Web UI**：使用React 18 + Ant Design 5构建的响应式前端
- 👀 **内容预览**：支持文本预览、图片网格展示、大图查看器
- 📈 **实时进度追踪**：进度条、统计信息、错误日志面板
- 🏗️ **灵活布局**：图片卡片水平垂直居中显示，网格/瀑布流视图自适应

🔧 **后端服务**
- ⚡ **异步任务队列**：基于Redis的Bull队列，支持并发爬虫任务
- 🗄️ **数据持久化**：MongoDB存储，完整的数据模型和索引
- 🔄 **实时进度更新**：通过轮询机制实时获取任务进度
- 🖼️ **智能图片处理**：自动下载、本地存储、URL去重、智能过滤

🐳 **生产就绪**
- 🐳 **Docker容器化**：完整的Docker和Docker Compose配置
- 📚 **完善的文档**：API文档、部署指南、开发文档、故障排查
- 🧪 **测试脚本**：集成测试、数据处理测试、分析工具

## 项目架构

```
forum-crawler-service/
├── README.md                     # 项目主文档
├── PROJECT_STRUCTURE.md          # 项目结构详细说明
│
├── backend/                      # Node.js/Express 后端服务
│   ├── src/
│   │   ├── config/              # 配置文件
│   │   ├── models/              # 数据库模型
│   │   ├── controllers/         # 控制器
│   │   ├── routes/              # 路由定义
│   │   ├── services/            # 业务逻辑
│   │   ├── middlewares/         # 中间件
│   │   └── utils/               # 工具函数
│   ├── package.json
│   └── scripts/                 # 后端脚本
│
├── crawler/                      # Python 爬虫服务
│   ├── crawl.py                 # 主爬虫脚本
│   ├── image_downloader.py      # 图片下载模块
│   ├── migrate_content_hash.py  # 内容哈希迁移脚本
│   ├── requirements.txt
│   └── ...                      # 其他爬虫工具
│
├── frontend/                     # React 前端
│   ├── src/
│   │   ├── pages/               # 页面组件
│   │   ├── components/          # 通用组件
│   │   ├── services/            # API 服务
│   │   └── App.js
│   ├── public/                  # 静态资源
│   └── package.json
│
├── docker/                       # Docker 配置
│   ├── Dockerfile.backend       # 后端镜像
│   ├── Dockerfile.backend.dev   # 后端开发镜像
│   ├── Dockerfile.frontend      # 前端镜像
│   ├── Dockerfile.frontend.dev  # 前端开发镜像
│   ├── docker-compose.yml       # 生产配置
│   ├── docker-compose.dev.yml   # 开发配置
│   └── nginx.conf               # Nginx配置
│
├── dev_env/                      # 本地开发环境
│   └── Dockerfile
│
├── docs/                         # 📚 完善的文档
│   ├── guides/                  # 部署和集成指南
│   ├── features/                # 功能实现文档
│   ├── fixes/                   # BUG修复总结
│   ├── archive/                 # 历史文档存档
│   ├── technical/               # 技术文档
│   ├── reports/                 # 项目报告
│   ├── product/                 # 产品文档
│   ├── api.md                   # API文档 ⭐
│   ├── development.md           # 开发指南 ⭐
│   ├── deployment.md            # 部署说明 ⭐
│   ├── quickstart.md            # 快速开始指南
│   ├── CHANGELOG.md             # 变更日志
│   └── README.md                # 文档导航
│
├── scripts/                      # 🔧 实用脚本
│   ├── setup/                   # 安装初始化脚本
│   ├── deploy/                  # 部署脚本
│   ├── admin/                   # 管理员工具脚本
│   └── README.md                # 脚本导航
│
├── tests/                        # 🧪 测试脚本
│   ├── integration/             # 集成测试脚本 (14个)
│   ├── data/                    # 数据处理脚本
│   └── README.md                # 测试导航
│
└── analysis/                     # 🔍 分析工具
    ├── analyze_section_page.py  # 版块分析工具
    └── README.md                # 工具说明
```

### 微服务架构

```
Internet / 用户
    ↓
Nginx反向代理 (可选)
    ↓
┌─────────────────┬──────────────┬────────────┐
│                 │              │            │
React Frontend  Express Backend  Python Crawler
:3000            :5000           (Worker)
│                 │              │            │
└─────────────────┼──────────────┼────────────┘
                  │              │
            ┌─────┴──────┬───────┴─────┐
            │            │              │
        MongoDB        Redis        图片存储
        :27017        :6379      /public/images
```

## 技术栈

### 后端
- **运行时**: Node.js 18+
- **框架**: Express.js
- **数据库**: MongoDB
- **缓存**: Redis
- **任务队列**: Bull
- **认证**: JWT
- **图片处理**: Sharp
- **定时任务**: node-cron

### 爬虫
- **语言**: Python 3.11+
- **库**: BeautifulSoup4, Requests, Selenium, Scrapy
- **数据库**: MongoDB
- **缓存**: Redis

### 前端
- **框架**: React 18
- **UI 库**: Ant Design 5
- **路由**: React Router v6
- **HTTP 客户端**: Axios
- **图表**: Recharts
- **瀑布流**: react-masonry-css
- **时间处理**: dayjs

### 部署
- **容器**: Docker & Docker Compose
- **Web 服务器**: Nginx
- **数据库**: MongoDB 7.0
- **缓存**: Redis 7

## 快速开始

### 前置要求

- **Docker & Docker Compose** (推荐) - [安装指南](https://docs.docker.com/get-docker/)
- **或者本地环境**：
  - Node.js 18+
  - Python 3.11+
  - MongoDB 7.0+
  - Redis 7+

### 使用 Docker Compose 启动（推荐）

#### 1️⃣ 克隆项目
```bash
git clone https://github.com/tengshan2008/forum-crawler-service
cd forum-crawler-service
```

#### 2️⃣ 使用启动脚本
```bash
# Linux/Mac
chmod +x scripts/setup/setup.sh
./scripts/setup/setup.sh

# Windows
scripts\setup\setup.bat
```

#### 3️⃣ 启动服务
```bash
# 使用开发环境配置
docker-compose -f docker/docker-compose.dev.yml up -d

# 或使用生产环境配置
docker-compose -f docker/docker-compose.yml up -d

# 查看容器状态
docker-compose ps
```

#### 4️⃣ 访问各服务
- **前端 Web UI**: http://localhost:3000
- **后端 API**: http://localhost:5000
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

#### 5️⃣ 停止服务
```bash
docker-compose down
```

### 本地开发启动

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
# 或：python -m crawler.crawl --help
```

#### 前端开发
```bash
cd frontend
npm install
cp .env.example .env
npm start
```
应用在 http://localhost:3000 运行

## 核心功能演示

### 创建爬虫任务

```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "爬取t66y帖子",
    "description": "爬取目标帖子内容",
    "forumUrl": "https://t66y.com/htm_data/2511/20/XXXXX.html",
    "taskType": "mixed",
    "config": {
      "maxDepth": 1,
      "delay": 1000,
      "timeout": 30000
    }
  }'
```

### 启动任务执行

```bash
curl -X POST http://localhost:5000/api/tasks/{taskId}/start
```

### 查看任务进度

```bash
curl http://localhost:5000/api/tasks/{taskId}
```

### 获取任务内容

```bash
curl "http://localhost:5000/api/posts?taskId={taskId}&page=1&limit=20"
```

## API 文档

### 完整API文档请查看
- 📖 [API 详细文档](docs/api.md) - 完整的API端点说明
- 📚 [开发指南](docs/development.md) - 后端开发风格和模式
- 🚀 [部署指南](docs/deployment.md) - 生产环境部署说明

## 环境变量配置

所有服务均支持通过 `.env` 文件配置。详见各项目目录的 `.env.example` 文件：

- `backend/.env.example` - 后端配置（MongoDB、Redis、JWT、端口等）
- `crawler/.env.example` - 爬虫配置（请求超时、重试次数等）
- `frontend/.env.example` - 前端配置（API基础URL、超时等）

### 常见环境变量

```bash
# 后端 (backend/.env.example)
PORT=5000
MONGODB_URI=mongodb://localhost:27017/forum-crawler
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=24h
CORS_ORIGIN=http://localhost:3000

# 爬虫 (crawler/.env.example)
MONGODB_URI=mongodb://localhost:27017/forum-crawler
REDIS_HOST=localhost
REDIS_PORT=6379
CRAWLER_TIMEOUT=600000
CRAWLER_RETRY_ATTEMPTS=3
DOWNLOAD_DELAY=1

# 前端 (frontend/.env.example)
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_API_TIMEOUT=30000
```

## 项目文档

### 📚 核心文档

| 文档 | 说明 |
|------|------|
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | **项目整体结构说明** ⭐ |
| [docs/README.md](docs/README.md) | 文档导航和索引 |
| [docs/quickstart.md](docs/quickstart.md) | 快速开始指南 |
| [docs/api.md](docs/api.md) | API接口文档 |
| [docs/development.md](docs/development.md) | 开发指南 |
| [docs/deployment.md](docs/deployment.md) | 部署说明 |
| [docs/product/PRD.md](docs/product/PRD.md) | 产品需求文档 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 变更日志 |

### 📖 部署和集成指南

- [docs/guides/FRONTEND_DEPLOYMENT_GUIDE.md](docs/guides/FRONTEND_DEPLOYMENT_GUIDE.md) - 前端部署指南
- [docs/guides/SYSTEM_MANAGEMENT_DEPLOYMENT.md](docs/guides/SYSTEM_MANAGEMENT_DEPLOYMENT.md) - 系统管理部署

### 🔧 脚本和工具

| 脚本目录 | 说明 |
|---------|------|
| [scripts/setup](scripts/setup) | 安装和初始化脚本 |
| [scripts/deploy](scripts/deploy) | 部署脚本 |
| [scripts/admin](scripts/admin) | 管理员工具脚本 |
| [tests/integration](tests/integration) | 集成测试脚本 |
| [analysis](analysis) | 页面分析和诊断工具 |

详见 [scripts/README.md](scripts/README.md) 和 [tests/README.md](tests/README.md)

## 常见问题 (FAQ)

### 如何创建管理员用户？
```bash
# Docker 环境（推荐）
./scripts/admin/create-admin-docker.sh

# 本地环境
cd backend && npm run create:admin
```

### 爬虫任务执行很慢？
- 减少 `config.maxDepth` 参数
- 减少 `config.delay` 延迟时间（注意反爬虫策略）
- 检查网络连接质量

### 图片下载失败？
- 检查图片URL的有效性
- 确保服务器有足够的磁盘空间 (`/public/images/`)
- 检查网络连接和代理设置

### 如何导出内容？
目前版本支持在前端直接复制文本和下载文本文件。完整的导出功能（EPUB、PDF等）计划在后续版本实现。

### 支持多用户吗？
支持。系统基于 JWT 实现用户认证，并提供管理员/普通用户角色权限隔离（系统管理、用户管理、审计日志等仅管理员可用）。

### 支持哪些论坛？
当前完全支持 **t66y论坛**。其他论坛支持计划在后续版本实现。

## 许可证

MIT License

## 支持与反馈

- 📖 查看 [项目文档](docs/)
- 🐛 提交 [Issue](../../issues)
- 💬 参考 [讨论区](../../discussions)
- 📧 联系开发者

## 相关链接

- [GitHub 仓库](https://github.com/tengshan2008/forum-crawler-service)
- [项目结构](PROJECT_STRUCTURE.md)
- [开发路线图](docs/product/PRD.md#6-开发路线图)
