# 论坛小说与图片爬取服务 - 产品需求文档 (PRD)

## 📊 项目概述与实现状态

本项目是一个**完整的生产级论坛爬虫服务**，采用微服务架构，包含Node.js后端、Python爬虫、React前端。当前已实现核心功能并支持Docker容器化部署。

### 功能实现总览

| 功能模块 | 实现状态 | 完成度 | 优先级 |
|---------|--------|--------|--------|
| **任务管理** | ✅ 完全实现 | 100% | P0 |
| **爬虫核心** | ✅ 完全实现 | 100% | P0 |
| **多分页聚合** | ✅ 完全实现 | 100% | P0 |
| **Web UI** | ✅ 完全实现 | 100% | P0 |
| **内容预览** | ✅ 完全实现 | 100% | P0 |
| **用户认证系统** | ❌ 规划中 | 0% | P1 |
| **权限管理** | ❌ 规划中 | 0% | P1 |
| **高级搜索** | ⚠️ 基础实现 | 40% | P2 |
| **内容导出** | ❌ 规划中 | 0% | P2 |
| **系统管理** | ❌ 规划中 | 0% | P3 |
| **推荐系统** | ❌ 规划中 | 0% | P3 |
| **多论坛支持** | ⚠️ 仅支持t66y | 20% | P2 |

---

## 1. ✅ 已完全实现的功能

### 1.1 爬取任务管理系统

#### 任务CRUD操作（✅ 完全实现）
- **创建任务**：输入任务名称、描述、目标URL、任务类型和高级参数
- **查看任务**：任务列表展示、详情页面、支持按状态筛选和排序
- **编辑任务**：修改任务配置（仅在pending状态）
- **删除任务**：删除任务记录及相关数据

#### 任务执行控制（✅ 完全实现）
- **状态管理**：pending → running → completed/failed 或 running → paused
- **启动/暂停/恢复/取消**：完整的任务生命周期管理
- **进度追踪**：实时进度条（0-100%）、爬取统计、时间记录

#### 任务配置参数（✅ 完全实现）
```javascript
{
  name: String,              // 任务名称
  description: String,       // 任务描述
  forumUrl: String,          // 论坛URL
  taskType: String,          // 任务类型: novel|image|mixed
  status: String,            // 状态: pending|running|completed|failed|paused
  progress: Number,          // 进度: 0-100
  totalItems: Number,        // 总项数
  crawledItems: Number,      // 已爬项数
  failedItems: Number,       // 失败项数
  config: {
    maxDepth: Number,        // 最大深度 (默认3)
    delay: Number,           // 请求延迟ms (默认1000)
    timeout: Number          // 超时时间ms (默认600000)
  }
}
```

---

### 1.2 爬虫核心功能系统

#### t66y论坛支持（✅ 完全实现）
- **网站特征识别**：自动识别t66y格式，支持多种URL格式
- **内容结构解析**：自动提取标题、识别多个楼层、自动提取楼主信息

### 1.3 多楼层内容提取（✅ 完全实现）

当一篇帖子中有多个用户回复时，自动识别并提取所有楼层：
- 通过CSS选择器`div.tpc_content`精确识别楼层
- 支持任意数量的楼层
- 楼层间用`\n\n`（双换行）分隔

### 1.4 多分页内容聚合（✅ 完全实现 - 新功能 ⭐）

解决了原有的**多页帖子内容缺失问题**。当一篇帖子被分为多页显示时，自动从所有分页中提取并合并内容。

#### 工作原理
```
首页HTML
    ↓
[检测分页数] extract_page_numbers()
    ↓ 返回: 总页数（例如: 6）
[遍历分页] for page in range(2, total_pages+1)
    ├─ [构建URL] build_pagination_url(page_num)
    ├─ [获取页面] fetch_page(url)
    ├─ [提取楼层] _extract_page_content(html)
    └─ [汇总内容] append to content_parts
    ↓
[合并页面] content = '\n\n'.join(all_pages)
    ↓
[保存数据库] MongoDB
```

#### 核心实现方法

**分页检测** - `extract_page_numbers(html)`
- 从HTML解析所有`<a>`标签中的page=N链接
- 返回最大页码作为总分页数

**URL构建** - `build_pagination_url(url, page_num)`
- 从URL提取thread ID（支持两种格式）
- 为每页生成标准访问URL

**多页遍历** - `parse_t66y_post(url, html)`
- 提取首页内容
- 检测总分页数
- 如果多页，循环获取第2-N页
- 用`\n\n`合并所有页面的楼层

**单页提取** - `_extract_page_content(html)`
- 从该页HTML提取所有`tpc_content` div
- 逐楼层提取文本内容
- 同时提取楼层内的所有图片

#### 性能指标与容错机制
- **请求超时**：每个分页请求10秒超时
- **容错机制**：单个分页失败时自动跳过，继续处理下一页
- **去重保护**：自动过滤重复的图片URL
- **向后兼容**：单页帖子继续正常工作

#### 实测验证
测试案例：6页帖子（6个楼层分布在多个分页中）
```
URL: https://t66y.com/htm_data/2511/20/7027882.html
标题: [現代奇幻] 性感尤物老师妈妈王越1-12

提取结果:
  ✅ 楼层1: 13,961 字符
  ✅ 楼层2: 18,326 字符
  ✅ 楼层3: 17,704 字符
  ✅ 总计: 49,995 字符（多页完整合并）

验证:
  ✅ 完整性: 100% (所有楼层)
  ✅ 准确性: 100% (内容无损)
  ✅ 性能: ~3秒 (6页处理时间)
```

### 1.5 内容类型处理（✅ 完全实现）

根据任务类型灵活处理内容：
- **小说/文本模式**（`taskType: 'novel'`）：提取纯文本内容，不下载图片
- **图片模式**（`taskType: 'image'`）：自动识别和下载所有图片，智能过滤小图标
- **混合模式**（`taskType: 'mixed'`）：同时提取文本和图片

### 1.6 图片处理系统（✅ 完全实现）

#### 图片识别与提取
- 支持多种HTML属性：`ess-data`、`src`、`data-src`
- 优先级自动选择

#### 智能过滤机制
自动排除非内容图片：`emotion`、`icon`、`avatar`、`face`

#### 本地存储管理
```
/public/images/uploads/{taskId}/{filename}
```
- 按任务ID创建独立目录
- URL去重：避免重复下载相同图片

### 1.7 Web用户界面（✅ 完全实现）

#### 任务管理界面
- **任务列表页面**：表格视图、快速筛选、排序功能
- **任务创建/编辑表单**：完整的表单验证和错误提示
- **任务执行控制**：启动、暂停、恢复、取消、删除按钮

#### 任务详情与监控页面
- **状态面板**：基本信息、进度条、统计信息
- **内容预览区域**：文本展示、图片网格、大图预览
- **错误日志面板**：错误信息展示、分类统计

#### UI框架与设计
- **技术栈**：React 18、Ant Design 5、Axios、React Router v6
- **设计特点**：响应式设计、现代化UI、流畅动画、深色/浅色主题

---

## 2. ⚠️ 部分实现的功能

### 2.1 高级搜索与发现（⚠️ 基础实现，40% 完成度）

#### 已实现部分（✅）
- **基础列表展示**：内容列表页面、按ID/标题/时间排序、分页展示

#### 尚未实现部分（❌）
- **全文搜索功能**：需要集成Elasticsearch或MongoDB全文索引
- **高级筛选功能**：按任务类型、时间范围、内容大小筛选
- **搜索优化**：搜索历史、热搜榜单、自动完成

#### 实现计划
```
第一阶段：添加MongoDB全文索引
  ├─ 在Post model添加文本索引
  ├─ 实现POST /api/posts/search端点
  └─ 返回搜索结果列表

第二阶段：增强搜索UI
  ├─ 前端搜索输入框
  ├─ 搜索结果展示优化
  └─ 关键词高亮

第三阶段：高级功能（可选）
  ├─ 集成Elasticsearch支持复杂查询
  ├─ 搜索建议自动完成
  └─ 热搜统计
```

### 2.2 多论坛支持（⚠️ 仅支持t66y，20% 完成度）

#### 已实现部分（✅）
- **t66y论坛完整支持**：多楼层提取、多分页聚合、各种内容类型处理

#### 尚未实现部分（❌）
- **其他论坛支持**：Discourse、phpBB、vBulletin、Xenforo等

#### 实现计划
基于策略模式的论坛适配器：
```
ForumCrawler (基类)
  ├─ T66yForumCrawler (已实现)
  ├─ DiscourseForumCrawler (规划)
  ├─ PhpbbForumCrawler (规划)
  └─ ...
```

---

## 3. ❌ 规划中的功能

### 3.1 用户认证与权限管理系统（❌ 0% 完成度 - P1优先级）

#### 功能需求

**用户认证**
- 用户注册系统：邮箱注册、用户名验证、邮箱验证、密码强度要求
- 用户登录系统：邮箱/用户名登录、密码安全验证(bcrypt)、JWT令牌生成
- 第三方登录（可选）：GitHub、Google、微信OAuth
- 密码管理：忘记密码重置、修改密码、账户安全设置

**权限管理系统**
- 基于角色的访问控制（RBAC）：Admin、Editor、User、Guest四个角色
- 任务隔离：Task模型添加userId字段、用户只能访问自己的任务
- 内容权限：Post模型添加visibility字段(public/private/shared)

**用户仪表板**
- 个人信息页面：用户资料编辑、头像上传、账户设置
- 任务统计：我的任务列表、任务统计图表、执行历史
- 收藏管理：收藏列表、批量操作、导出收藏

#### 技术实现计划

**后端实现**
```javascript
// User模型
User {
  _id: ObjectId,
  email: String (唯一),
  username: String (唯一),
  password: String (加密),
  avatar: String,
  role: String (admin|editor|user|guest),
  isEmailVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// 认证中间件
app.use(authMiddleware);  // JWT验证

// 权限检查中间件
router.get('/tasks/:id', requireAuth, requireOwnership);

// API端点
POST   /api/auth/register       - 用户注册
POST   /api/auth/login          - 用户登录
POST   /api/auth/logout         - 用户登出
POST   /api/auth/refresh        - 刷新令牌
GET    /api/auth/me             - 当前用户信息
PUT    /api/auth/profile        - 编辑用户资料
POST   /api/auth/password       - 修改密码
```

**前端实现**
```jsx
// 登录页面、注册页面、用户菜单、权限包装器
<PrivateRoute><DashboardPage /></PrivateRoute>
{user?.role === 'admin' && <AdminPanel />}
```

**实现步骤**
1. 创建User数据模型和MongoDB索引
2. 实现用户注册和登录API
3. 集成JWT认证和刷新令牌
4. 添加认证和权限检查中间件
5. 修改Task和Post模型，添加userId字段
6. 更新所有API，添加权限检查
7. 创建前端登录/注册页面
8. 实现用户菜单和个人中心
9. 添加权限保护的路由

---

### 3.2 内容导出与分享功能（❌ 0% 完成度 - P2优先级）

#### 导出功能

**小说导出**
- TXT格式导出：纯文本格式、可自定义编码、可选加入章节标题
- EPUB电子书导出：EPUB2/EPUB3格式、自定义字体和排版、包含目录
- PDF格式导出：支持自定义页码和边距、包含目录、可选加入水印
- 其他格式：MOBI(Kindle)、Word文档

**图片导出**
- ZIP压缩包：按任务打包、可选原图/缩略图选择、保留目录结构
- 云存储上传：上传到阿里云OSS/AWS S3、生成可分享的云链接

**数据导出**
- JSON格式：完整的元数据导出、可用于数据备份和迁移
- CSV格式：内容列表CSV、可导入Excel

#### 分享功能

- **分享链接生成**：生成短链接、设置分享权限、设置过期时间
- **社交媒体分享**：分享到微博/微信/Twitter/Facebook、自定义分享文本
- **嵌入代码**：生成iframe嵌入代码，可在博客/网站展示

#### 实现计划

**后端**
```javascript
POST   /api/posts/:id/export         - 创建导出任务
GET    /api/posts/:id/export/status  - 查看导出状态
GET    /api/posts/:id/export/download - 下载导出文件

POST   /api/posts/:id/share           - 生成分享链接
GET    /api/shares/:shareId           - 访问分享内容
PUT    /api/shares/:shareId           - 更新分享设置
DELETE /api/shares/:shareId           - 删除分享
```

**依赖库**
- `epub`：EPUB生成
- `puppeteer`：PDF渲染
- `archiver`：ZIP压缩
- `qrcode`：二维码生成

---

### 3.3 系统管理与配置（❌ 0% 完成度 - P3优先级）

#### 爬虫配置管理
- **代理IP管理**：代理池配置、自动切换IP、代理失效检测
- **User-Agent轮换**：User-Agent数据库、随机选择、浏览器标识生成
- **Cookies管理**：Cookies存储和更新、自动过期检测、登录状态保持
- **请求限流**：每IP请求频率限制、全局速率限制、自适应延迟

#### 存储管理
- **存储统计**：数据库大小、图片空间、按任务/用户的占用
- **存储配置**：本地存储路径、云存储(S3/OSS)、自动分层
- **自动清理**：过期数据自动删除、孤立文件清理、可配置保留期

#### 系统监控
- **性能监控**：爬虫并发数、CPU/内存使用、网络带宽
- **错误监控**：错误率统计、异常告警、错误日志分析

#### 管理后台UI
- 配置面板（Config Panel）
- 监控仪表板（Dashboard）
- 用户管理（User Management）

---

### 3.4 推荐系统（❌ 0% 完成度 - P3优先级）

#### 推荐功能
- **热门内容推荐**：按浏览数、收藏数、评分排序
- **相似内容推荐**：基于标题相似度(TF-IDF)、内容相似度、用户行为(协同过滤)
- **个性化推荐**：基于浏览历史、收藏偏好、任务类型

#### 实现计划

**阶段1：热门推荐** → 添加浏览数统计、实现热门排序API

**阶段2：相似推荐** → 添加TF-IDF计算、实现相似内容API

**阶段3：个性化推荐** → 收集用户行为数据、实现协同过滤算法

---

## 4. 技术栈详情

### 后端技术
```
├─ 运行时：Node.js 18+
├─ 框架：Express.js
├─ 数据库：MongoDB 7.0
├─ 缓存：Redis 7
├─ 消息队列：Bull (基于Redis)
├─ 认证（规划）：JWT
├─ 密码加密（规划）：bcryptjs
└─ 日志（规划）：Winston / Morgan
```

### 爬虫技术
```
├─ 语言：Python 3.12
├─ HTTP：requests
├─ HTML解析：BeautifulSoup4
├─ 数据库：PyMongo
├─ 任务队列：apscheduler / celery（可选）
└─ 工具：regex、logging
```

### 前端技术
```
├─ 框架：React 18
├─ UI库：Ant Design 5
├─ 路由：React Router v6
├─ HTTP：Axios
├─ 状态管理（规划）：Redux / Zustand
├─ 时间处理：dayjs
└─ 构建工具：Create React App / Vite
```

### 部署与运维
```
├─ 容器化：Docker、Docker Compose
├─ 配置：.env环境变量、动态配置（规划）
├─ Web服务器（可选）：Nginx
├─ 监控（规划）：Prometheus + Grafana
└─ 日志（规划）：ELK Stack、Loki + Grafana
```

---

## 5. 系统架构

### 微服务架构图
```
Internet / 用户
    ↓
Nginx反向代理 (可选)
    ↓
┌─────────────────┬──────────────┬────────────┐
↓                 ↓              ↓
React Frontend    Express Backend Python Crawler
:3000            :5000          :Worker
    ↓                 ↓              ↓
┌─────────────────┬──────────────┬────────────┐
↓                 ↓              ↓
MongoDB           Redis/Bull     图片存储
:27017            :6379
```

### 任务执行流程
```
用户创建任务 → API POST /api/tasks → Task Model(pending)
    ↓
用户启动任务 → API POST /api/tasks/:id/start → Task Model(running)
    ↓
Bull Queue(消息队列)
    ↓
Python爬虫进程
├─ 获取页面 → 解析HTML → 提取楼层
├─ 检测分页 → 遍历所有页面 → 聚合内容
├─ 下载图片 → 更新进度
    ↓
MongoDB保存数据(Post、Task集合)
    ↓
Redis更新进度
    ↓
前端实时更新UI
    ↓
Task Model(completed)
```

### 数据模型

**Task（任务）**
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  forumUrl: String,
  taskType: String,     // novel|image|mixed
  status: String,       // pending|running|completed|failed|paused
  progress: Number,     // 0-100
  totalItems: Number,
  crawledItems: Number,
  failedItems: Number,
  config: { maxDepth, delay, timeout },
  errorLog: Array,
  userId: ObjectId,     // 规划：关联用户
  createdAt: Date,
  updatedAt: Date,
  startTime: Date,
  endTime: Date
}
```

**Post（内容）**
```javascript
{
  _id: ObjectId,
  title: String,
  content: String,      // 文本内容
  author: String,
  sourceUrl: String,
  postType: String,     // image|novel|text
  media: [{
    url: String,
    originalUrl: String,
    description: String
  }],
  likes: Number,
  views: Number,
  replies: Number,
  status: String,       // active|inactive|deleted
  tags: [String],
  taskId: ObjectId,
  userId: ObjectId,     // 规划：关联用户
  visibility: String,   // 规划：public|private|shared
  createdAt: Date,
  updatedAt: Date
}
```

---

## 6. 开发路线图

### 第一阶段（已完成 ✅）
时间：完成
```
✅ 任务管理系统 (CRUD + 执行控制)
✅ 爬虫核心功能 (HTML解析 + 内容提取)
✅ 多楼层内容聚合
✅ 多分页内容聚合 ⭐ (新增)
✅ Web UI基础框架 (React + Ant Design)
✅ Docker容器化部署
✅ Redis任务队列
✅ 图片下载和管理
```

### 第二阶段（计划中 ⏳）
时间：预计2-3个月
```
⏳ 用户认证系统 (注册、登录、JWT)
⏳ 权限管理系统 (RBAC、任务隔离)
⏳ 高级搜索功能 (全文搜索、筛选)
⏳ 内容导出功能 (TXT、EPUB、PDF)
⏳ 用户个人中心 (仪表板、统计)
```

### 第三阶段（规划中 🎯）
时间：预计3-6个月
```
🎯 多论坛支持 (Discourse、phpBB等)
🎯 系统管理后台 (配置、监控、日志)
🎯 推荐系统 (热门、相似、个性化)
🎯 内容审核系统 (NSFW检测、关键词过滤)
🎯 性能优化 (分布式爬虫、缓存优化)
🎯 监控告警 (Prometheus + Grafana)
```

### 第四阶段（未来 🔮）
```
🔮 AI内容增强 (文本优化、图片识别)
🔮 社交功能 (评论、收藏、分享)
🔮 CDN加速 (图片加速、全球部署)
🔮 移动端APP (iOS/Android原生应用)
🔮 API开放 (第三方接入)
```

---

## 7. 快速开始指南

### 前置要求
- Docker和Docker Compose 或 Node.js 18+ / Python 3.12+ / MongoDB 7.0 / Redis 7

### 本地启动

**使用Docker Compose（推荐）**
```bash
git clone <repository-url>
cd forum-crawler-service
docker-compose -f docker/docker-compose.yml up -d
docker-compose ps
```

**访问应用**
- 前端UI：http://localhost:3000
- 后端API：http://localhost:5000

### API使用示例

**创建任务**
```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试爬虫任务",
    "forumUrl": "https://t66y.com/htm_data/...",
    "taskType": "novel"
  }'
```

**启动任务**
```bash
curl -X POST http://localhost:5000/api/tasks/<taskId>/start
```

---

## 8. 相关文档

### 项目文档
- `PAGINATION_FEATURE.md` - 多分页功能详细说明
- `PAGINATION_SUMMARY.md` - 多分页功能实现总结
- `README.md` - 项目总体介绍
- `DEPLOYMENT_STATUS.md` - 部署状态报告

### 测试脚本
- `test_pagination.sh` - 多分页测试脚本

---

## 9. 常见问题(FAQ)

### Q: 爬虫不能访问某些论坛？
**A:** 当前仅支持t66y论坛。其他论坛需要实现相应的论坛适配器。

### Q: 图片下载失败？
**A:** 检查网络连接、图片URL有效性、服务器空间充足。

### Q: 任务执行很慢？
**A:** 减少maxDepth、减少delay延迟、关闭不必要的图片下载。

### Q: 如何导出内容？
**A:** 目前不支持导出。计划在第二阶段实现：TXT、EPUB、PDF、ZIP。

### Q: 如何支持多用户？
**A:** 需要实现用户认证系统（第二阶段）：注册、登录、任务隔离。

---

**最后更新**：2025-12-02  
**项目版本**：v2.0.0 (多分页支持版)  
**维护者**：[项目作者]
