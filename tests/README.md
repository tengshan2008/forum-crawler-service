# 测试目录

本目录包含项目的集成测试脚本和数据处理工具。

## 🧪 测试体系总览

| 层级 | 位置 | 框架 | 覆盖内容 |
|------|------|------|----------|
| 后端单元测试 | `backend/src/**/__tests__/` | Jest | 服务层、中间件、工具函数 |
| 爬虫单元测试 | `crawler/tests/` | Pytest | 纯函数库（`lib/text_utils.py`、`lib/url_utils.py`） |
| 集成测试 | `tests/integration/` | Bash + curl | API 端到端行为（需本地服务运行） |

## 📂 目录结构

### integration/ - 集成测试脚本
用于测试系统各组件的集成情况（依赖运行中的后端服务）：
- `TEST_INTEGRATION.sh` - 主集成测试脚本
- `test_admin_api.sh` - 管理员API测试
- `test_admin_permissions.sh` - 管理员权限测试（原 `test_permissions_simple.sh` 已合并至此）
- `test_batch_redirect_fix.sh` - 批量重定向修复测试
- `test_content_extraction.sh` - 内容提取测试
- `test_crawltype_filter.sh` - 爬虫类型过滤测试
- `test_duplicate_handling.sh` - 重复内容处理测试
- `test_meta_redirect_fix.sh` - 元标签重定向修复测试
- `test_monitoring_dashboard.sh` - 监控面板测试
- `test_monitoring_db.sh` - 监控数据库测试
- `test_pagination.sh` - 分页测试
- `test_quick_verify.sh` - 快速验证脚本
- `test_single_post_redirect.sh` - 单线程重定向测试

**用法：**
```bash
# 运行所有集成测试
./tests/integration/TEST_INTEGRATION.sh

# 运行特定测试
./tests/integration/test_admin_permissions.sh
```

### data/ - 数据处理脚本（预留）
原有的数据转换脚本已迁移至 `crawler/tests/`，作为 pytest 用例统一维护。此目录当前为空，预留存放数据处理工具。

## 🔬 单元测试运行方式

### 后端（Jest）
```bash
cd backend
npm test                # 运行全部单元测试（31 用例）
npx jest --watch        # 监听模式
```

### 爬虫（Pytest，通过 uv 管理虚拟环境）
```bash
cd crawler
uv run pytest tests/ -v         # 运行全部单元测试（52 用例）
uv run pytest tests/test_url_utils.py -v   # 运行单个文件
```

## 📋 执行前检查

1. 确保脚本有执行权限：
   ```bash
   chmod +x tests/integration/*.sh
   ```

2. 集成测试需要：后端服务运行于 `localhost:5000`，MongoDB 与 Redis 可用

3. 查看脚本注释了解具体测试内容

## 🎯 典型测试流程

```bash
# 1. 单元测试先行（无需启动服务）
cd backend && npm test
cd crawler && uv run pytest tests/ -v

# 2. 快速验证（需服务运行）
./tests/integration/test_quick_verify.sh

# 3. 权限测试
./tests/integration/test_admin_permissions.sh

# 4. 爬虫功能测试
./tests/integration/test_crawltype_filter.sh
./tests/integration/test_content_extraction.sh
```
