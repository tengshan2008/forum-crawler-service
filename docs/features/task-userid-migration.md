# 爬虫任务 userId 字段迁移

## 问题描述

当启动爬虫任务时，日志中可能出现以下警告：
```
⚠ 未找到任务用户ID，使用管理员ID作为默认
```

这是因为在应用早期阶段，创建的任务没有关联的 `userId` 字段，该字段是后来添加的为了实现基于用户的任务隔离。

## 原因分析

1. **旧任务缺少 userId**：在添加用户认证系统之前创建的任务没有 `userId` 字段
2. **爬虫需要 userId**：爬虫脚本在初始化时会查询 MongoDB 获取任务的关联用户ID，用于保存爬虫数据时确保数据与正确的用户关联

## 解决方案

### 自动迁移（推荐）

运行迁移脚本为所有现有任务添加 `userId` 字段：

```bash
# 在后端容器中运行
npm run migrate:tasks-userids

# 或者直接运行
node scripts/migrateTasksUserIds.js
```

该脚本会：
1. 连接到 MongoDB
2. 查找第一个管理员用户
3. 为所有缺少 `userId` 的任务分配该管理员的 ID
4. 验证更新结果

### 验证迁移结果

迁移后可以查询数据库验证：

```javascript
// 检查所有任务是否都有 userId
db.crawlertasks.find({ userId: { $exists: true } }).count()

// 应该等于总任务数
db.crawlertasks.count()
```

## 新任务创建

从现在开始，通过 API 创建的新任务会自动获得创建者的 `userId`：

```javascript
// taskController.js 中的 createTask 方法
const task = await Task.create({
  // ... 其他字段
  userId: req.user.id,  // 自动设置为当前用户ID
});
```

## 爬虫日志解读

### 正常情况
```
✓ 获取到任务用户ID: 6980c4e42690ba1bbd88ebb6
```

### 如果任务不存在
```
⚠ 任务不存在于数据库中: task-id
```

### 如果任务缺少 userId（迁移前）
```
⚠ 任务中userId字段缺失或为空。任务数据: {...}
⚠ 使用管理员ID作为默认值: 6980c4e42690ba1bbd88ebb6
```

## 后续改进

考虑以下改进：

1. **强制 userId 验证**：在爬虫启动时确保任务有有效的 userId
2. **用户权限检查**：在启动爬虫前验证当前用户是否拥有该任务
3. **错误告警**：当无法找到合适的 userId 时发送告警而不是自动使用管理员 ID
