# 计划：内容浏览数据按用户隔离（browse 域）

## Context

用户反馈：不同用户看到的内容预览（图片组列表 / 小说列表）完全一样，没有数据隔离。

根因（已核实代码）：
1. **browseService 的内容查询完全没有用户过滤**：`listImageGroups` / `getImageGroupDetail` / `listNovels` / `searchNovels` / `getNovelContent` / `deleteNovel` / `deleteImage(s)` 全部直接按 `postId/taskId/keyword` 查 `Post`，任何登录用户（甚至匿名）都能看到、打开、删除全部帖子。
2. **更严重的连带问题：browseRoutes.js 根本没挂 authMiddleware**（对比 taskRoutes/postRoutes 都有 `router.use(authMiddleware)`）——`/api/browse/*` 目前是匿名可访问的；收藏夹端点里 `req.user.userId` 实际依赖这个缺失的中间件。
3. 数据层已就绪：`Post` schema 有 `userId`（required）+ `visibility`（默认 private）；crawl.py 写帖时已把任务归属用户的 `userId` 写入每个帖子文档（`lib/post_builder.py` build_post_document / build_upsert_updates）。
4. 仓库内已有可见性语义范本：`postController.js` 对 Post 的过滤是 `admin ? {} : { $or: [{ userId: req.user.userId }, { visibility: 'public' }] }`；taskService 有 `buildVisibilityFilter(user)` 模式。browse 应复用同一语义（owner 或 public 可见，admin 全量）。

前端无需改动（JWT 经 axios 拦截器自动携带，查询参数不含用户维度，隔离纯后端实现）。

## 改动内容

### 1. backend/src/routes/browseRoutes.js — 挂载认证中间件（P0）
- 头部 `const authMiddleware = require('../middlewares/authMiddleware');`
- `router.use(authMiddleware.authMiddleware);`（与 taskRoutes.js L3/L8 写法一致）
- 效果：匿名访问 /api/browse/* 返回 401；`req.user` 可用。

### 2. backend/src/services/browseService.js — 用户可见性过滤
新增导出纯函数（语义镜像 postController）：

```js
const buildVisibilityFilter = (user) =>
  user.role === 'admin' ? {} : { $or: [{ userId: user.userId }, { visibility: 'public' }] };
```

新增内部合并助手 `applyVisibility(filter, user)`：admin（`{}`）时 no-op；非 admin 的 `{$or: [...]}` 与业务过滤合并——**注意冲突**：关键词搜索已占用 `filter.$or`（buildImageFilter / searchNovels 的正则回退），需组合为 `filter.$and = [{ $or: 关键词分支 }, { $or: 可见性分支 }]` 并删除原 `$or`；`$text` 保持在查询根层（Mongo 要求），不受影响。`buildImageFilter` / `buildNovelFilter` 纯函数签名不变（现有单测不动）。

各数据访问函数加 `user` 参数并应用：
- `listImageGroups(query, user)`：filter 应用可见性。
- `getImageGroupDetail(postId, user)`：`Post.findById` → `Post.findOne({ _id: postId, ...可见性 })`（非本人/非 public/不存在统一 404「内容不存在」，不泄露存在性）。
- `listNovels(query, user)`：filter 应用可见性；**countCache key 必须加 userId**：`novels_count_${user.userId}_${taskId || 'all'}`（否则 A 用户的计数缓存泄漏给 B）。
- `searchNovels(body, user)`：同上；`search_count_` 缓存 key 同样加 userId。
- `getNovelContent(id, user)`：`findByIdAndUpdate(id, {$inc})` → `findOneAndUpdate({ _id: id, ...可见性 }, { $inc: { views: 1 } }, { new: true })`。
- `deleteNovel(id, user)` / `deleteImage(id, imageUrl, user)` / `deleteImages(id, imageUrls, user)`：`findById/findByIdAndDelete` → `findOne/findOneAndDelete({ _id, ...可见性 })`（删除操作必须隔离）。
- `addToCollection`：帖子存在性校验 `Post.findById(postId)` → `Post.findOne({ _id: postId, ...可见性 })`（不能收藏不可见的帖子）。
- `getStats(user)`：两个 countDocuments 应用可见性（非 admin 统计自己的数据）。
- 收藏夹系列函数已是按 `userId` 隔离，不动。

### 3. backend/src/controllers/browseController.js — 传入 req.user
内容类端点把 `req.user` 传给 service：`getImageGroups`、`getImageGroupDetail`、`getNovels`、`searchNovels`、`getNovelContent`、`deleteNovel`、`deleteImage`、`deleteImages`、`getStats`（收藏夹端点已传 `req.user.userId`，不动）。404 时前端已按通用错误处理，无需变更。

### 4. backend/src/models/Post.js — 补用户维度索引
`postSchema.index({ userId: 1, postType: 1, createdAt: -1 });`（用户范围列表/计数；普通索引，无 TTL 风险）。

### 5. backend/scripts/migratePostsUserIds.js — 旧数据回填（新脚本）
镜像 `migrateTasksUserIds.js`：连接 MongoDB → 取第一个 admin → `Post.updateMany({ userId: { $exists: false } }, { $set: { userId: admin._id } })` → 输出统计。幂等；显式 `require('../src/models/Post')` 防止 MissingSchemaError（migrateCollectionOwners 的教训）。**实施后需用户确认再执行**（连接 192.168.50.50:27017/forum-crawler）。

### 6. 测试（TDD：先补用例再实现）
- `src/services/__tests__/browseService.test.js`：
  - 新增 `buildVisibilityFilter` 纯函数用例（admin `{}` / 普通用户 `$or` 形状）。
  - `listImageGroups`/`listNovels`/`searchNovels`：断言 `Post.find` 收到的 filter 含可见性 `$or`；关键词 + 可见性时为 `$and` 组合形状。
  - `getImageGroupDetail`：断言 `findOne` 查询含 `_id` + 可见性；他人帖子 → 404。
  - `getNovelContent`/`deleteNovel`/`deleteImage(s)`：断言作用域查询。
  - countCache key 含 userId（两个不同 user 不串缓存）。
  - `addToCollection` 对不可见帖子 404。
- `src/controllers/__tests__/browseController.test.js`：更新 service 调用断言为携带 `req.user`（机械同步）。
- 注意已知问题：全量 `npx jest` 需 `--forceExit`（SSE/ioredis open handle）；本改动只跑 browse 相关 + 冒烟全量。

### 7. 文档同步（Doc Governance）
- `docs/api.md`：browse 端点补充「需 JWT Bearer；数据范围=本人或 visibility:public，admin 全量；匿名 401」。
- `docs/CHANGELOG.md`：追加「版本 2.13.0 - 内容浏览数据按用户隔离」条目（沿用现有格式）。
- `docs/files.md`：补充 `backend/scripts/migratePostsUserIds.js`。
- `docs/features/` 内容浏览现行文档：同步数据隔离说明（按主题现行版唯一原则）。

## 验证

1. `npx jest src/services/__tests__/browseService.test.js src/controllers/__tests__/browseController.test.js` 全绿。
2. 全量后端测试（`--forceExit`）确认无回归（taskEventBus.test.js 7 例为已知跨文件污染问题，单独跑该文件绿即可，不视为本次回归）。
3. 双用户隔离冒烟（真库或临时实例）：
   - node 脚本/脚本插入两条 Post（userId 分别为 userA/userB）；
   - curl 用 userA 的 JWT 拉 `/api/browse/images/groups` 只见 A 的帖子；userB 只见 B 的；admin 两个都见；
   - userB 用 userA 的 postId 调详情/删除/收藏 → 404；
   - 无 token 调 `/api/browse/images/groups` → 401；
   - 迁移脚本执行后确认无 `userId` 缺失的 Post（用户在 192.168.50.50 库上执行）。

## 关键文件
- backend/src/routes/browseRoutes.js
- backend/src/services/browseService.js（核心）
- backend/src/controllers/browseController.js
- backend/src/models/Post.js
- backend/scripts/migratePostsUserIds.js（新增）
- backend/src/services/__tests__/browseService.test.js、backend/src/controllers/__tests__/browseController.test.js
- docs/api.md、docs/CHANGELOG.md、docs/files.md、docs/features/ 内容浏览文档
