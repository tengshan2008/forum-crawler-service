# 项目目录结构说明

## 📁 整体目录结构

```
forum-crawler-service/
├── 📄 README.md                 # 项目主文档
├── 
├── 📂 backend/                  # 后端应用（Node.js）
│   ├── src/                     # 源代码
│   ├── scripts/                 # 后端脚本
│   └── package.json             # 依赖配置
├── 
├── 📂 frontend/                 # 前端应用（React）
│   ├── src/                     # 源代码
│   ├── public/                  # 静态资源
│   └── package.json             # 依赖配置
├── 
├── 📂 crawler/                  # 爬虫模块（Python）
│   ├── crawl.py                 # 主爬虫脚本
│   ├── image_downloader.py      # 图片下载模块
│   ├── migrate_content_hash.py  # 内容哈希迁移脚本
│   ├── app/                     # 爬虫应用
│   └── requirements.txt          # Python依赖
├── 
├── 📂 docker/                   # Docker配置
│   ├── Dockerfile.*             # 各服务Dockerfile
│   └── docker-compose.*         # Docker编排文件
├── 
├── 📂 dev_env/                  # 本地开发环境
│   └── Dockerfile
├── 
├── 📂 docs/                     # 📚 文档（已整理）
│   ├── guides/                  # 部署和集成指南
│   ├── features/                # 功能实现文档
│   ├── fixes/                   # BUG修复总结
│   ├── archive/                 # 历史文档存档
│   ├── technical/               # 技术文档
│   ├── reports/                 # 项目报告
│   ├── product/                 # 产品文档
│   └── README.md                # 文档导航
├── 
├── 📂 scripts/                  # 🔧 脚本（已整理）
│   ├── setup/                   # 安装初始化脚本
│   ├── deploy/                  # 部署脚本
│   ├── admin/                   # 管理员工具脚本
│   └── README.md                # 脚本导航
├── 
├── 📂 tests/                    # 🧪 测试（已整理）
│   ├── integration/             # 集成测试脚本
│   ├── data/                    # 数据处理脚本
│   └── README.md                # 测试导航
├── 
└── 📂 analysis/                 # 🔍 分析工具
    ├── analyze_section_page.py  # 版块分析工具
    └── README.md                # 分析工具说明
```

## 🎯 快速导航

### 我要部署项目
- 📖 查看：[docs/guides/FRONTEND_DEPLOYMENT_GUIDE.md](docs/guides/FRONTEND_DEPLOYMENT_GUIDE.md)
- 🔧 执行：[scripts/setup/setup.sh](scripts/setup/setup.sh)

### 我要修改代码
- 📖 查看：[docs/development.md](docs/development.md) 
- 🎨 前端代码：`frontend/src/`
- 🖥️ 后端代码：`backend/src/`
- 🐍 爬虫代码：`crawler/`

### 我要管理用户和权限
- 📖 查看：[docs/features/ADMIN_PERMISSIONS_IMPLEMENTATION.md](docs/features/ADMIN_PERMISSIONS_IMPLEMENTATION.md)
- 🔧 执行：[scripts/admin/create-admin-docker.sh](scripts/admin/create-admin-docker.sh)

### 我要查看最近的变更
- 📖 查看：[docs/CHANGELOG.md](docs/CHANGELOG.md)

### 我要了解API
- 📖 查看：[docs/api.md](docs/api.md)

### 我要运行测试
- 📖 查看：[tests/README.md](tests/README.md)
- 🧪 执行：`./tests/integration/TEST_INTEGRATION.sh`

### 我要分析爬虫问题
- 🔍 工具：[analysis/](analysis/)
```bash
python analysis/analyze_section_page.py "https://example.com"
```

## 📋 主要文档清单

### 快速开始
- [README.md](README.md) - 项目概览
- [docs/quickstart.md](docs/quickstart.md) - 快速开始指南

### 开发相关
- [docs/development.md](docs/development.md) - 开发指南
- [docs/guides/FRONTEND_QUICKSTART.md](docs/guides/FRONTEND_QUICKSTART.md) - 前端快速开始

### 部署相关
- [docs/deployment.md](docs/deployment.md) - 部署文档
- [docs/guides/FRONTEND_DEPLOYMENT_GUIDE.md](docs/guides/FRONTEND_DEPLOYMENT_GUIDE.md) - 前端部署指南
- [docs/guides/SYSTEM_MANAGEMENT_DEPLOYMENT.md](docs/guides/SYSTEM_MANAGEMENT_DEPLOYMENT.md) - 系统管理部署

### API和数据
- [docs/api.md](docs/api.md) - API文档
- [docs/files.md](docs/files.md) - 文件结构

### 问题修复和功能
- [docs/fixes/](docs/fixes/) - 已修复问题汇总
- [docs/features/](docs/features/) - 新功能说明
- [docs/CHANGELOG.md](docs/CHANGELOG.md) - 变更日志

## 🚀 常用命令

```bash
# 安装依赖和初始化
./scripts/setup/setup.sh

# 启动开发环境
docker-compose -f docker/docker-compose.dev.yml up

# 创建管理员用户
./scripts/admin/create-admin-docker.sh

# 运行测试
./tests/integration/TEST_INTEGRATION.sh

# 分析页面（调试爬虫）
python analysis/analyze_section_page.py [URL]
```

## 📝 目录整理规范

为了保持项目整洁，请遵循以下规范：

- **docs/** - 所有文档文件（.md, .txt）
- **scripts/** - 所有脚本文件（.sh, .bat）
  - 按功能分类到 setup/, deploy/, admin/ 子目录
- **tests/** - 所有测试脚本
  - integration/ - 集成测试
  - data/ - 数据处理脚本
- **analysis/** - 分析和诊断工具
- **backend/**, **frontend/**, **crawler/** - 业务代码
- **docker/** - Docker配置文件

---

**提示：** 每个主要目录都有 `README.md` 文件，提供更详细的说明。
