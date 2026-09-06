# 脚本目录

本目录包含项目的各类脚本程序，按用途分类组织。

## 🔧 目录结构

### setup/ - 安装和初始化脚本
用于项目的初始安装和环境设置：
- `setup.sh` - Linux/Mac 安装脚本
- `setup.bat` - Windows 安装脚本

**用法：**
```bash
# Linux/Mac
./scripts/setup/setup.sh

# Windows
.\scripts\setup\setup.bat
```

### deploy/ - 部署脚本
用于项目的部署和发布：
- `DEPLOY_CHECKLIST.sh` - 部署检查清单脚本
- `DEPLOYMENT_GUIDE_CONTENT_HASH.sh` - 内容哈希部署指南脚本

**用法：**
```bash
./scripts/deploy/DEPLOY_CHECKLIST.sh
```

### admin/ - 管理员工具脚本
用于管理员操作和系统管理：
- `create-admin-docker.sh` - Docker 环境下创建管理员用户
- `init_system_management.sh` - 初始化系统管理功能
- `upgrade_user_to_admin.sh` - 升级普通用户为管理员

**用法：**
```bash
# 创建管理员（Docker环境）
./scripts/admin/create-admin-docker.sh

# 升级用户为管理员
./scripts/admin/upgrade_user_to_admin.sh
```

### utils/ - 工具脚本
其他实用工具脚本（目前为空，可用于存放通用工具）

## 💡 使用建议

在执行任何脚本之前：
1. 确保脚本有执行权限：`chmod +x scripts/**/*.sh`
2. 查看脚本头部的说明文档
3. 根据环境需要修改配置参数
