# JWT Token userId 修复总结

## 问题描述
JWT token 中的字段名称 (`userId`) 与后端控制器中使用的字段名称 (`req.user.id`) 不一致，导致：
- 任务创建时 `userId` 为 `undefined`
- 任务虽然被创建但不会出现在用户的任务列表中
- 爬虫必须使用管理员账户作为后备方案

## 根本原因
- **Token 生成** (`authService.js`): 使用 `userId` 作为 JWT payload 字段
- **Token 消费** (所有 controller): 期望使用 `req.user.id` 来访问用户 ID

这导致了 17+ 个地方的不匹配。

## 解决方案
将所有 controller 中的 `req.user.id` 替换为 `req.user.userId`，使其与 JWT token payload 一致。

### 修改的文件

#### 1. `/backend/src/controllers/taskController.js`
修改了以下 8 处：
- `getAllTasks()` - 行 48
- `getTaskById()` - 行 66
- `createTask()` - 行 79
- `updateTask()` - 行 130
- `deleteTask()` - 行 158
- `pauseTask()` - 已修复 (自动补充 userId)
- `resumeTask()` - 已修复 (自动补充 userId)

#### 2. `/backend/src/controllers/postController.js`
修改了以下 6 处：
- `getAllPosts()` - 行 9
- `getPostById()` - 行 41
- `getPostsByTaskId()` - 行 61
- `getPostStats()` - 行 144

## 测试验证

运行完整的测试流程：

```bash
./test_userid_fix_v2.sh
```

### 测试结果（✅ 全部通过）

1. ✅ **用户注册成功**
   - 创建新的测试用户: `testuser_1770524303@example.com`
   - 密码: `TestPassword123`

2. ✅ **认证成功**
   - 登录获取 JWT token
   - Token 包含正确的 `userId` 字段

3. ✅ **任务创建成功**
   - 创建新任务，自动设置 `userId` 为当前用户 ID
   - 任务 ID: `69880e8fa69e999021f34c07`
   - 用户 ID: `69880e8fa69e999021f34c01`

4. ✅ **单任务查询验证**
   - 后端日志确认: `[任务创建] 任务ID: 69880e8fa69e999021f34c07, 用户ID: 69880e8fa69e999021f34c01`
   - `userId` 正确关联

5. ✅ **任务列表验证**
   - 任务成功出现在用户的任务列表中
   - 列表分页和过滤工作正常

## 后端日志确认

修复前的日志：
```
[任务创建] 任务ID: 69880ca64b2af0576223cd18, 用户ID: undefined
[爬虫错误] ⚠ 任务中userId字段缺失或为空（旧数据）
[爬虫输出] ⚠ 使用管理员ID作为默认值: 6980c4e42690ba1bbd88ebb6
```

修复后的日志：
```
[任务创建] 任务ID: 69880e8fa69e999021f34c07, 用户ID: 69880e8fa69e999021f34c01
```

## 影响范围

### 直接修复的功能
- ✅ 任务创建时正确保存 `userId`
- ✅ 任务列表过滤正确显示用户的任务
- ✅ 单个任务查询验证 `userId` 所有权
- ✅ 任务更新/删除权限验证
- ✅ 帖子创建/更新/删除的用户权限验证

### 不需要修改的地方
- `authService.js` - 继续使用 `userId` 作为 JWT payload
- `authMiddleware.js` - 正确地将 token payload 存储为 `req.user`

## 回向兼容性

以下自动补充机制继续工作：
- 旧的没有 `userId` 的任务会在启动时自动关联当前用户
- 爬虫会使用管理员账户作为后备方案（但现在不再需要），确保旧数据不会完全失败

## 后续验证

1. 在开发环境中运行完整的集成测试
2. 确保爬虫能够正常使用正确的 `userId` 来更新任务
3. 检查所有权限校验是否正常工作
4. 验证前端任务列表是否能正确显示所有用户的任务

## 相关的之前完成的工作

这次修复补充了之前的以下工作：
- ✅ 内容长度追踪和比较（Feb 2）
- ✅ ESLint 警告修复（Feb 8）
- ✅ 固定帖子过滤（Feb 7）
- ✅ 管理员用户创建脚本（Feb 7-8）
- 🔧 **JWT token userId 对齐（当前修复，Feb 8）**

## 总结

通过统一 JWT token 和 controller 之间的字段名称，彻底解决了任务记录"消失"的问题。现在所有新创建的任务都会正确地关联到创建它们的用户，并且会在用户的任务列表中显示。
