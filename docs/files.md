# 项目文件清单

## 📦 完整项目文件列表

### 后端文件 (Backend - Node.js/Express)

```
backend/
├── package.json                              # 项目依赖配置
├── .env.example                              # 环境变量示例
├── .gitignore                                # Git 忽略文件
└── src/
    ├── index.js                              # 应用入口点
    ├── config/
    │   ├── config.js                         # 环境配置管理
    │   └── database.js                       # MongoDB 连接配置
    ├── models/
    │   ├── Task.js                           # 任务数据模型 (Schema)
    │   ├── Post.js                           # 内容数据模型
    │   └── Media.js                          # 媒体文件模型
    ├── controllers/
    │   ├── taskController.js                 # 任务控制器 (业务逻辑)
    │   └── postController.js                 # 内容控制器
    ├── routes/
    │   ├── index.js                          # 路由入口
    │   ├── taskRoutes.js                     # 任务路由定义
    │   └── postRoutes.js                     # 内容路由定义
    ├── middlewares/
    │   ├── errorHandler.js                   # 全局错误处理中间件
    │   └── cors.js                           # CORS 跨域处理
    └── utils/
        ├── AppError.js                       # 自定义错误类
        └── catchAsync.js                     # 异步错误包装器
```

### 爬虫文件 (Crawler - Python)

```
crawler/
├── requirements.txt                          # Python 依赖
├── .env.example                              # 环境变量示例
└── app/
    ├── __init__.py                           # Python 包初始化
    ├── config.py                             # 配置管理
    ├── logger.py                             # 日志系统
    ├── base_crawler.py                       # 基础爬虫类
    ├── engine.py                             # 爬虫执行引擎
    ├── spiders/
    │   ├── __init__.py                       # Spiders 包初始化
    │   └── generic_forum.py                  # 通用论坛爬虫实现
    ├── pipelines/
    │   ├── __init__.py                       # Pipelines 包初始化
    │   ├── mongodb_pipeline.py               # MongoDB 数据保存管道
    │   └── media_download.py                 # 媒体下载处理管道
    └── middlewares/
        └── __init__.py                       # Middlewares 包初始化
```

### 前端文件 (Frontend - React)

```
frontend/
├── package.json                              # 项目依赖配置
├── .env.example                              # 环境变量示例
├── .gitignore                                # Git 忽略文件
├── public/
│   └── index.html                            # HTML 入口页面
└── src/
    ├── index.js                              # React 应用入口
    ├── index.css                             # 全局样式
    ├── App.js                                # 主应用组件
    ├── pages/
    │   ├── TaskList.js                       # 任务管理页面
    │   └── PostPreview.js                    # 内容预览页面
    ├── components/                           # 可复用组件目录
    ├── services/
    │   └── api.js                            # API 服务层
    ├── styles/                               # 样式文件目录
    └── utils/                                # 工具函数目录
```

### Docker 文件

```
docker/
├── Dockerfile.backend                        # 后端容器镜像配置
├── Dockerfile.crawler                        # 爬虫容器镜像配置
├── Dockerfile.frontend                       # 前端容器镜像配置
├── docker-compose.yml                        # Docker Compose 编排配置
└── nginx.conf                                # Nginx 反向代理配置
```

### 文档文件

```
docs/
├── overview.md                               # 项目架构和概览
├── api.md                                    # API 完整文档
├── development.md                            # 开发指南和扩展
├── deployment.md                             # 部署指南
└── quickstart.md                             # 快速开始指南
```

### 根目录文件

```
/
├── README.md                                 # 项目主文档
├── PROJECT_SUMMARY.md                        # 项目完成总结
├── setup.sh                                  # Linux/Mac 启动脚本
├── setup.bat                                 # Windows 启动脚本
├── .gitignore                                # Git 全局忽略配置
└── .devcontainer/
    └── devcontainer.json                     # VS Code 开发容器配置
```

---

## 📊 文件统计

### 代码文件

| 类别 | 数量 | 说明 |
|------|------|------|
| JavaScript 文件 | 12 | 后端 API 和前端代码 |
| Python 文件 | 9 | 爬虫引擎代码 |
| 配置文件 | 6 | JSON、YML、YAML 等 |
| 文档文件 | 7 | Markdown 文档 |
| 脚本文件 | 2 | 启动脚本 |
| 其他 | 5 | 配置文件等 |
| **总计** | **41** | **完整项目文件** |

### 代码行数估计

| 模块 | 代码行数 | 说明 |
|------|---------|------|
| Backend | 500+ | Express API 和数据模型 |
| Crawler | 300+ | Python 爬虫引擎 |
| Frontend | 400+ | React 组件和页面 |
| Docker | 200+ | 容器配置文件 |
| Documentation | 800+ | 完整文档 |
| **总计** | **2200+** | **总代码和文档行数** |

---

## 🔍 关键文件说明

### 应用入口

1. **后端**: `backend/src/index.js`
   - Express 服务器启动
   - 数据库连接
   - 路由注册
   - 中间件配置

2. **爬虫**: `crawler/app/engine.py`
   - 爬虫任务执行
   - 数据管道处理
   - 错误处理

3. **前端**: `frontend/src/index.js` 和 `App.js`
   - React 应用初始化
   - 路由定义
   - 页面组件

### 配置文件

- `backend/.env.example` - 后端环境配置模板
- `crawler/.env.example` - 爬虫环境配置模板
- `frontend/.env.example` - 前端环境配置模板
- `docker/docker-compose.yml` - 容器编排配置

### 文档文件

- `README.md` - 项目概述和快速开始
- `docs/overview.md` - 系统架构详解
- `docs/api.md` - API 端点完整文档
- `docs/development.md` - 开发和扩展指南
- `docs/deployment.md` - 生产环境部署指南
- `docs/quickstart.md` - 5 分钟快速启动

---

## 📥 文件大小

### 预期文件大小

| 目录 | 未安装依赖 | 安装依赖后 |
|------|-----------|----------|
| backend | ~50KB | ~100MB |
| crawler | ~20KB | ~300MB |
| frontend | ~40KB | ~500MB |
| docker | ~50KB | N/A |
| docs | ~150KB | N/A |
| **总计** | **~310KB** | **~900MB+** |

---

## 🔧 配置文件详解

### `.env` 文件格式

**后端** (`backend/.env`):
```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://...
REDIS_HOST=localhost
CORS_ORIGIN=http://localhost:3000
```

**爬虫** (`crawler/.env`):
```
MONGODB_URI=mongodb://...
REDIS_HOST=localhost
CRAWLER_TIMEOUT=30000
MAX_CONCURRENT_TASKS=5
```

**前端** (`frontend/.env`):
```
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_API_TIMEOUT=30000
```

---

## 📝 文件依赖关系

```
index.html
    ↓
index.js (React)
    ↓
App.js
    ├─ TaskList.js
    └─ PostPreview.js
        ↓
    api.js (Axios)
        ↓
    backend/src/index.js (Express)
        ├─ routes/index.js
        │   ├─ taskRoutes.js → taskController.js → Task Model
        │   └─ postRoutes.js → postController.js → Post Model
        ├─ config/database.js → MongoDB
        └─ middlewares/
            ├─ errorHandler.js
            └─ cors.js
```

---

## 🚀 如何使用这些文件

### 本地开发

1. 修改 `.env.example` 为 `.env`
2. 安装依赖: `npm install` / `pip install`
3. 启动服务: `npm start` / `python -m app.engine`
4. 访问应用

### Docker 部署

1. 所有 Dockerfile 已配置
2. docker-compose.yml 定义了所有服务
3. 运行 `setup.sh` 或 `setup.bat`
4. 应用自动启动

### 文档查看

- 在线查看 Markdown 文件
- 使用 Markdown 阅读器
- 在 VS Code 中打开预览

---

## 📚 推荐阅读顺序

1. **首次使用**: `README.md` → `docs/quickstart.md`
2. **理解架构**: `docs/overview.md` → `docs/deployment.md`
3. **API 开发**: `docs/api.md` → `docs/development.md`
4. **生产部署**: `docs/deployment.md` → `PROJECT_SUMMARY.md`

---

## 🔒 敏感信息

以下文件包含或应包含敏感信息，需要妥善保护：

- `.env` 文件 (所有目录)
- 密钥和密码
- 数据库连接字符串
- API 密钥

这些文件已在 `.gitignore` 中排除，**不应该提交到 Git**。

---

## ✅ 文件检查清单

部署前确认以下文件完整：

- [ ] `backend/package.json` 包含所有依赖
- [ ] `backend/.env` 配置正确
- [ ] `crawler/requirements.txt` 包含所有依赖
- [ ] `crawler/.env` 配置正确
- [ ] `frontend/package.json` 包含所有依赖
- [ ] `frontend/.env` 配置正确
- [ ] `docker/docker-compose.yml` 配置完整
- [ ] 所有 Dockerfile 存在
- [ ] 所有文档文件完整
- [ ] `setup.sh` 和 `setup.bat` 可执行

---

## 🎯 文件维护

### 定期维护项

- 更新依赖版本 (`package.json`, `requirements.txt`)
- 更新文档 (功能变化时)
- 清理未使用的文件
- 备份数据库和媒体文件

### 版本控制

- 提交代码到 Git
- 标记重要版本 (v1.0, v1.1 等)
- 保留 CHANGELOG 记录

---

## 📞 相关链接

- [项目 GitHub](https://github.com/...)
- [问题报告](https://github.com/.../issues)
- [讨论论坛](https://github.com/.../discussions)

---

**最后更新**: 2024年2月

更多信息请参阅 [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)
