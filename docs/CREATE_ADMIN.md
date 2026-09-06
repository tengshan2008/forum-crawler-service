# 创建 Admin 账号指南

本文档说明如何创建 admin 管理员账号。

## 📋 前置条件

- Docker 容器正在运行
- MongoDB 数据库可访问
- 后端服务已启动

## 🚀 快速开始

### 方法一：使用 Docker 脚本（推荐）

在项目根目录执行：

```bash
bash create-admin-docker.sh
```

脚本会：
1. 检查 Docker 容器是否运行
2. 在容器内启动交互式脚本
3. 引导您输入邮箱、用户名和密码
4. 创建 admin 账号

### 方法二：直接在容器内执行

```bash
docker exec -it forum-crawler-backend-dev node /app/backend/scripts/create-admin.js
```

### 方法三：本地执行（开发环境）

```bash
cd backend
node scripts/create-admin.js
```

## 📝 交互式提示

运行脚本后，你需要输入：

### 1. 邮箱地址
```
请输入邮箱地址: admin@example.com
```
- 必须是有效的邮箱格式
- 不能重复

### 2. 用户名
```
请输入用户名 (3-30个字符，只能包含字母、数字、下划线、连字符): admin
```
- 长度 3-30 个字符
- 只能包含：字母(a-z, A-Z)、数字(0-9)、下划线(_)、连字符(-)
- 不能重复

### 3. 密码
```
请输入密码 (至少6个字符): password123
```
- 至少 6 个字符
- 需要再次确认

## ✅ 成功提示

创建成功后会显示：

```
╔════════════════════════════════════════════════════╗
║         ✅ Admin 账号创建成功！                    ║
╚════════════════════════════════════════════════════╝

账号信息:
  📧 邮箱:     admin@example.com
  👤 用户名:   admin
  🔑 角色:     admin
  ✓  状态:     已激活
```

## 🔐 账号特权

使用 admin 账号登录后，可以访问：

- 📊 **监控仪表板** (`/admin/dashboard`) - 系统监控和性能指标
- ⚙️ **系统配置** (`/admin/config`) - 爬虫配置、存储管理
- 👥 **用户管理** (`/admin/users`) - 用户列表和角色管理

## 🆘 故障排查

### 错误：容器未运行
```
❌ 容器 forum-crawler-backend-dev 未运行
```

**解决方案：**
启动 Docker 容器
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

### 错误：邮箱或用户名已存在
```
❌ 该邮箱已被使用，请使用其他邮箱
❌ 该用户名已被使用，请使用其他用户名
```

**解决方案：**
使用其他邮箱和用户名，或在数据库中删除旧账号

### 错误：数据库连接失败
```
❌ 创建 Admin 账号失败: connect ECONNREFUSED
```

**解决方案：**
确保 MongoDB 容器正在运行
```bash
docker compose -f docker/docker-compose.dev.yml up -d mongodb
```

## 📊 数据库直接操作

如果脚本出现问题，也可以直接在数据库中创建：

```bash
# 进入 MongoDB 容器
docker exec -it forum-crawler-mongodb mongosh

# 选择数据库
use forum-crawler

# 插入新用户（密码需要经过 bcrypt 加密）
db.users.insertOne({
  email: "admin@example.com",
  username: "admin",
  password: "$2a$10$...", // bcrypt 加密的密码
  role: "admin",
  isEmailVerified: true,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

## ✨ 最佳实践

1. **创建多个账号** - 至少创建一个备份 admin 账号
2. **强密码** - 使用复杂密码提高安全性
3. **定期备份** - 备份数据库确保数据安全
4. **权限隔离** - 给不同的人创建不同权限的账号

## 📝 相关命令

### 查看所有 admin 账号
```bash
docker exec forum-crawler-backend-dev node -e "
const mongoose = require('mongoose');
const User = require('/app/backend/src/models/User');

mongoose.connect('mongodb://mongodb:27017/forum-crawler')
  .then(() => User.find({ role: 'admin' }))
  .then(users => console.log(JSON.stringify(users, null, 2)))
  .catch(err => console.error(err));
"
```

### 重置用户密码
使用 Settings 页面中的密码修改功能

### 删除用户
```bash
docker exec forum-crawler-backend-dev mongosh forum-crawler --eval "db.users.deleteOne({ username: 'admin' })"
```

## 🎯 常见问题

**Q: 忘记了 admin 密码怎么办？**
A: 使用另一个 admin 账号登录后台，通过用户管理页面重置密码

**Q: 可以创建多个 admin 吗？**
A: 可以，运行脚本多次创建不同的 admin 账号

**Q: admin 可以自己修改权限吗？**
A: 目前不支持，需要在数据库中直接修改

---

**需要帮助？** 查看项目的 README.md 或联系开发团队
