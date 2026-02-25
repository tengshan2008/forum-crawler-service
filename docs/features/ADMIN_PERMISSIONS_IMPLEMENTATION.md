# 管理员权限增强 - 实现总结

## 功能需求
管理员作为高权限用户，需要能够查看平台的所有内容，包括：
- 所有用户的任务（无论任务所有者是谁）
- 所有用户采集的数据和帖子
- 完整的系统操作权限

## 实现方案

### 核心原理
在所有权限检查处添加 `req.user.role === 'admin'` 的特殊处理：
- 如果用户是管理员，绕过用户 ID 检查，允许查看/管理所有内容
- 如果用户是普通用户，继续按照原有的权限隔离规则

### 修改的文件

#### 1. `/backend/src/controllers/taskController.js`
7 处修改，为管理员添加无限制权限：

| 方法 | 修改内容 | 作用 |
|------|--------|------|
| `getAllTasks()` | 如果是 admin，filter = {}，否则 filter = { userId } | 管理员看所有任务，普通用户只看自己的 |
| `getTaskById()` | 如果不是 admin，才添加 userId 查询条件 | 管理员可以访问任何任务 |
| `updateTask()` | 同上 | 管理员可以更新任何任务 |
| `deleteTask()` | 同上 | 管理员可以删除任何任务 |
| `pauseTask()` | `req.user.role !== 'admin'` 权限检查 | 管理员可以暂停任何任务 |
| `resumeTask()` | `req.user.role !== 'admin'` 权限检查 | 管理员可以恢复任何任务 |

**代码示例**：
```javascript
// 修改前
const filter = { userId: req.user.userId };

// 修改后
const filter = req.user.role === 'admin' ? {} : { userId: req.user.userId };
```

```javascript
// 修改前
const task = await Task.findOne({ _id: req.params.id, userId: req.user.userId });

// 修改后
const query = { _id: req.params.id };
if (req.user.role !== 'admin') {
  query.userId = req.user.userId;
}
const task = await Task.findOne(query);
```

#### 2. `/backend/src/controllers/postController.js`
4 处修改，为管理员添加无限制访问：

| 方法 | 修改内容 | 作用 |
|------|--------|------|
| `getAllPosts()` | 如果是 admin，filter = {}，否则 filter = { userId 或 public } | 管理员看所有帖子 |
| `getPostById()` | 如果不是 admin，才添加用户和可见性过滤 | 管理员可以查看任意帖子 |
| `getPostsByTaskId()` | 如果不是 admin，才检查任务所有权 | 管理员可以查看任意任务的帖子 |
| `getPostStats()` | 同 getPostsByTaskId | 管理员可以查看任意任务的统计 |

**代码示例**：
```javascript
// 修改前
const filter = { $or: [{ userId: req.user.userId }, { visibility: 'public' }] };

// 修改后
const filter = req.user.role === 'admin' ? {} : { $or: [{ userId: req.user.userId }, { visibility: 'public' }] };
```

#### 3. `/backend/src/controllers/adminController.js`
6 处修改，将 `req.user?.id` 改为 `req.user?.userId`：

所有操作员信息的 operator.id 字段都已修正，确保与 JWT token 中的 userId 字段一致。这些修改在各个管理操作（更新配置、添加代理等）中都包含。

## 权限矩阵

| 操作 | 普通用户 | 管理员 |
|------|--------|--------|
| 查看自己的任务 | ✓ | ✓ |
| 查看他人的任务 | ✗ | ✓ |
| 查看所有任务列表 | 仅自己的 | 全部 |
| 修改自己的任务 | ✓ | ✓ |
| 修改他人的任务 | ✗ | ✓ |
| 查看自己的帖子 | ✓ | ✓ |
| 查看他人的帖子 | 仅公开的 | 全部 |
| 修改/删除帖子 | 仅自己的 | 任意 |
| 系统管理 | ✗ | ✓ |

## 测试验证

### 权限隔离测试 (✓ PASSED)
```bash
./test_permissions_simple.sh
```

**测试结果**：
- ✓ 普通用户能看到自己的任务列表
- ✓ 普通用户被拒绝访问其他用户的任务（404）
- ✓ 不同用户之间完全隔离

### 后端代码验证
- ✓ `taskController.js`: 7 处管理员权限检查
- ✓ `postController.js`: 4 处管理员权限检查  
- ✓ `adminController.js`: 6 处 userId 字段修正

## 向后兼容性

所有修改都是向后兼容的：
- 旧的权限逻辑保留，只是添加了管理员特例
- 现有的用户权限规则不变
- 只需设置用户的 `role` 字段为 `admin` 即可获得完整权限

## 部署说明

### 数据库操作（将用户升级为管理员）
```javascript
// MongoDB
db.users.updateOne(
  { email: 'admin@example.com' },
  { $set: { role: 'admin' } }
)
```

### REST API（如果实现了用户管理接口）
```bash
# 管理员更新用户角色
POST /api/admin/users/{userId}/role
{
  "role": "admin"
}
```

## 关联修复
这个功能实现补充了之前的以下工作：
1. ✅ JWT token userId 修复（2026-02-08）：确保 JWT 中的 userId 字段与代码一致
2. ✅ 权限隔离实现（当前）：为管理员提供无限制权限

## 后续改进建议

1. **审计日志**：记录所有管理admin操作（谁操作了什么资源）
2. **权限等级**：实现更细粒度的权限（如 viewer、editor、admin 等）
3. **操作日志**：为所有敏感操作添加变更日志
4. **访问控制**：实现基于资源的访问控制（RBAC）
5. **WebSocket**：为管理员推送实时通知

## 总结

通过添加 `req.user.role === 'admin'` 的条件检查，成功实现了管理员的高权限访问。管理员现在可以：
- 查看平台所有任务和数据
- 管理所有用户的资源
- 进行系统级别的配置和监控

普通用户仍然享受完整的权限隔离，确保数据安全性和隐私保护。

