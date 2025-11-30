# 项目概览

## 项目简介

**Forum Crawler Service** 是一个完整的论坛爬虫解决方案，设计用于从各类论坛网站爬取小说、图片等内容，并通过现代化的 Web UI 进行任务管理和内容预览。

### 核心功能

1. **任务管理系统**
   - 创建和配置爬取任务
   - 监控任务执行状态和进度
   - 支持暂停、恢复、取消等操作

2. **内容爬取引擎**
   - 支持多种论坛结构的自动识别
   - 文本、图片、视频等多媒体内容爬取
   - 智能重试和错误处理机制

3. **Web 管理界面**
   - 直观的任务管理面板
   - 实时进度展示和统计分析
   - 内容预览和搜索功能

4. **现代技术栈**
   - Node.js/Express 后端 API
   - React 前端应用
   - MongoDB 数据持久化
   - Redis 缓存支持

---

## 系统架构

### 三层架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    Web UI Layer                          │
│    React 前端应用 (http://localhost:3000)              │
│  ├─ 任务管理页面                                        │
│  ├─ 内容预览页面                                        │
│  └─ 统计分析页面                                        │
└────────────────┬────────────────────────────────────────┘
                 │ HTTP/REST API
                 ▼
┌─────────────────────────────────────────────────────────┐
│                  API Layer                               │
│    Express.js 后端服务 (http://localhost:5000)         │
│  ├─ 任务管理 API                                        │
│  ├─ 内容查询 API                                        │
│  ├─ 统计分析 API                                        │
│  └─ 文件上传 API                                        │
└────────────────┬────────────────────────────────────────┘
                 │ Database/Cache
                 ▼
┌─────────────────────────────────────────────────────────┐
│               Data Layer                                 │
│  ├─ MongoDB (主数据库)                                 │
│  ├─ Redis (缓存系统)                                   │
│  └─ 文件系统 (媒体存储)                                │
└─────────────────────────────────────────────────────────┘
```

### 爬虫系统独立架构

```
┌─────────────────────────────────────────────────────────┐
│              Crawler Engine                              │
│    Python 爬虫引擎 (可在后台独立运行)                  │
│  ├─ 基础爬虫模块 (BaseCrawler)                         │
│  ├─ 通用论坛爬虫 (GenericForumCrawler)                │
│  └─ 自定义爬虫 (可扩展)                               │
└────────────────┬────────────────────────────────────────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌──────────┐ ┌──────────┐
│MongoDB  │ │ Redis    │ │ 文件系统 │
│Pipeline │ │ Pipeline │ │ 存储     │
└─────────┘ └──────────┘ └──────────┘
```

---

## 数据流向

### 任务执行流程

```
1. 用户在 Web UI 创建任务
   ↓
2. 任务保存到 MongoDB
   ↓
3. 触发爬虫引擎启动
   ↓
4. 爬虫访问目标 URL 并解析内容
   ↓
5. 提取的数据通过 Pipeline 处理
   ├─ MongoDB Pipeline: 存储文本和元数据
   ├─ Media Download Pipeline: 下载媒体文件
   └─ Redis Pipeline: 缓存热数据
   ↓
6. 更新任务进度和统计信息
   ↓
7. 用户可在 Web UI 查看任务状态和预览内容
```

---

## 关键组件说明

### 后端服务 (Node.js/Express)

**职责:**
- RESTful API 接口提供
- 任务和内容的 CRUD 操作
- 用户请求的处理和验证
- 爬虫引擎的调度

**主要模块:**
- **Models**: 定义数据库 schema
- **Controllers**: 处理请求逻辑
- **Routes**: 定义 API 端点
- **Middlewares**: 请求拦截和错误处理

### 爬虫引擎 (Python)

**职责:**
- 网页内容的爬取和解析
- 多媒体文件的下载和处理
- 数据的清理和验证
- 错误处理和重试机制

**主要模块:**
- **BaseCrawler**: 爬虫基类，提供通用功能
- **Spiders**: 具体爬虫实现
- **Pipelines**: 数据处理管道
- **Logger**: 日志记录系统

### 前端应用 (React)

**职责:**
- 用户界面的展示
- 任务管理功能
- 内容预览展示
- 与后端 API 的交互

**主要页面:**
- **TaskList**: 任务管理页面
- **PostPreview**: 内容预览页面
- **Dashboard**: 数据统计页面 (可选)

---

## 部署拓扑

### 单机部署

```
┌──────────────────────────────────────────┐
│         Docker Host                      │
│  ┌────────────────────────────────────┐  │
│  │  Docker Container Network          │  │
│  │  ┌─────────────┐ ┌──────────────┐  │  │
│  │  │  MongoDB    │ │   Redis      │  │  │
│  │  │ :27017      │ │   :6379      │  │  │
│  │  └─────────────┘ └──────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  Backend (Express)           │  │  │
│  │  │  :5000                       │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  Frontend (React/Nginx)      │  │  │
│  │  │  :3000                       │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  Crawler (Python) [可选]    │  │  │
│  │  │   后台运行                  │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
       ↑
       │ 外部访问
       │
   用户浏览器
```

### 生产部署

```
┌────────────────────────────────────────────────────────┐
│                   Nginx (反向代理)                      │
│                  域名/HTTPS 入口                        │
└────────────┬──────────────────────────┬────────────────┘
             │                          │
         前端             API          
             │                          │
    ┌────────▼──────────┐    ┌─────────▼────────┐
    │  Frontend         │    │  Backend         │
    │  Load Balancer    │    │  Load Balancer   │
    │  (可选多实例)     │    │  (可选多实例)   │
    └────────┬──────────┘    └─────────┬────────┘
             │                          │
    ┌────────▼──────────────────────────▼─────┐
    │         共享数据层                       │
    │  ┌──────────────────────────────────┐   │
    │  │  MongoDB 副本集 (高可用)         │   │
    │  │  Redis 集群 (缓存)              │   │
    │  │  分布式文件系统 (媒体存储)      │   │
    │  └──────────────────────────────────┘   │
    └──────────────────────────────────────────┘
```

---

## 数据库设计

### Task Collection

存储爬虫任务配置和状态。

```javascript
{
  _id: ObjectId,
  name: String,              // 任务名称
  description: String,       // 任务描述
  forumUrl: String,         // 目标论坛 URL
  taskType: String,         // 任务类型: novel|image|mixed
  status: String,           // 状态: pending|running|paused|completed|failed
  progress: Number,         // 进度百分比 (0-100)
  totalItems: Number,       // 预期爬取总数
  crawledItems: Number,     // 已爬取数量
  failedItems: Number,      // 失败数量
  config: {                 // 爬虫配置
    maxDepth: Number,       // 最大深度
    delay: Number,          // 请求间隔
    timeout: Number,        // 超时时间
    userAgent: String,      // User Agent
    headers: Object         // 自定义请求头
  },
  errorLog: [{              // 错误日志
    timestamp: Date,
    message: String,
    url: String
  }],
  startTime: Date,          // 开始时间
  endTime: Date,            // 结束时间
  createdBy: String,        // 创建者
  createdAt: Date,          // 创建时间
  updatedAt: Date           // 更新时间
}
```

### Post Collection

存储爬取的内容。

```javascript
{
  _id: ObjectId,
  taskId: ObjectId,         // 关联的任务
  title: String,            // 标题
  content: String,          // 内容文本
  postType: String,         // 类型: novel|image|text
  author: String,           // 作者
  sourceUrl: String,        // 原始 URL
  media: [{                 // 媒体列表
    type: String,
    url: String,
    description: String
  }],
  metadata: Object,         // 自定义元数据
  likes: Number,            // 点赞数
  views: Number,            // 浏览数
  replies: Number,          // 回复数
  status: String,           // 状态: active|archived|flagged
  tags: [String],           // 标签
  crawledAt: Date,          // 爬取时间
  createdAt: Date,          // 创建时间
  updatedAt: Date           // 更新时间
}
```

### Media Collection

存储媒体文件信息。

```javascript
{
  _id: ObjectId,
  postId: ObjectId,         // 关联的内容
  taskId: ObjectId,         // 关联的任务
  filename: String,         // 本地文件名
  originalUrl: String,      // 原始 URL
  localPath: String,        // 本地路径
  mediaType: String,        // 类型: image|video|audio|document
  size: Number,             // 文件大小
  mimeType: String,         // MIME 类型
  thumbnail: String,        // 缩略图路径
  description: String,      // 描述
  metadata: Object,         // 自定义元数据
  downloadedAt: Date,       // 下载时间
  createdAt: Date,          // 创建时间
  updatedAt: Date           // 更新时间
}
```

---

## 扩展可能性

### 计划的功能扩展

1. **身份验证和授权**
   - 用户注册和登录
   - 任务权限管理
   - 操作审计日志

2. **高级爬虫功能**
   - JavaScript 页面支持 (Selenium/Puppeteer)
   - 验证码处理
   - 代理轮换

3. **内容处理**
   - OCR 文本识别
   - 内容去重
   - 敏感信息过滤

4. **数据分析**
   - 内容趋势分析
   - 用户行为分析
   - 性能监控

5. **集成和导出**
   - CSV/Excel 导出
   - 数据库迁移工具
   - 第三方 API 集成

---

## 性能指标

### 目标性能

- **API 响应时间**: < 500ms
- **页面加载时间**: < 2s
- **爬虫吞吐量**: 100+ 页面/小时
- **并发任务数**: 5+ 同时任务
- **存储容量**: 支持百万级内容

### 优化策略

1. **数据库优化**
   - 合理索引设计
   - 查询优化
   - 连接池管理

2. **缓存策略**
   - Redis 热数据缓存
   - 浏览器缓存
   - CDN 分发

3. **代码优化**
   - 异步处理
   - 批量操作
   - 内存管理

---

## 维护和运维

### 监控指标

- 服务健康状态
- API 响应时间
- 数据库查询性能
- 磁盘使用情况
- 内存占用率

### 日常维护

- 定期备份
- 日志分析
- 性能调优
- 安全更新
- 依赖更新

### 故障恢复

- 自动健康检查
- 容器自动重启
- 数据备份恢复
- 灾难恢复计划

---

## 安全考虑

1. **API 安全**
   - 输入验证
   - CORS 配置
   - 速率限制

2. **数据安全**
   - 加密存储
   - 访问控制
   - 审计日志

3. **爬虫安全**
   - User-Agent 轮换
   - IP 代理支持
   - 遵守 robots.txt
   - 合法性检查

---

## 成本考虑

### 资源需求

- CPU: 2 核心 (最小)
- 内存: 2GB (最小) / 8GB+ (推荐)
- 存储: 10GB+ (根据内容量)
- 带宽: 动态 (根据爬取量)

### 优化建议

- 使用云服务提供商优化部署成本
- 实施数据清理策略
- 使用 CDN 减少带宽成本

---

## 相关资源

- [项目 README](../README.md)
- [API 文档](./api.md)
- [开发指南](./development.md)
- [部署指南](./deployment.md)
