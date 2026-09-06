# 测试目录

本目录包含项目的测试脚本和数据处理工具，按测试类型分类组织。

## 🧪 目录结构

### integration/ - 集成测试脚本
用于测试系统各组件的集成情况：
- `TEST_INTEGRATION.sh` - 主集成测试脚本
- `test_admin_api.sh` - 管理员API测试
- `test_admin_permissions.sh` - 管理员权限测试
- `test_batch_redirect_fix.sh` - 批量重定向修复测试
- `test_content_extraction.sh` - 内容提取测试
- `test_crawltype_filter.sh` - 爬虫类型过滤测试
- `test_duplicate_handling.sh` - 重复内容处理测试
- `test_meta_redirect_fix.sh` - 元标签重定向修复测试
- `test_pagination.sh` - 分页测试
- `test_permissions_simple.sh` - 简单权限测试
- `test_quick_verify.sh` - 快速验证脚本
- `test_single_post_redirect.sh` - 单线程重定向测试

**用法：**
```bash
# 运行所有集成测试
./tests/integration/TEST_INTEGRATION.sh

# 运行特定测试
./tests/integration/test_admin_permissions.sh
```

### data/ - 数据处理和转换脚本
用于数据验证、转换和处理：
- `test_br_conversion.py` - 换行符转换测试
- `test_extract_actual_url.py` - 提取实际URL测试
- `test_redirect_tracking.py` - 重定向追踪测试

**用法：**
```bash
python tests/data/test_br_conversion.py
python tests/data/test_redirect_tracking.py
```

### unit/ - 单元测试（预留）
用于存放单元测试脚本（目前为空）

## 📋 执行前检查

1. 确保脚本有执行权限：
   ```bash
   chmod +x tests/integration/*.sh
   ```

2. 检查环境依赖（Python/Node.js 等）

3. 查看脚本注释了解具体测试内容

## 🎯 典型测试流程

```bash
# 1. 快速验证
./tests/integration/test_quick_verify.sh

# 2. 权限测试
./tests/integration/test_admin_permissions.sh

# 3. 爬虫功能测试
./tests/integration/test_crawltype_filter.sh
./tests/integration/test_content_extraction.sh

# 4. 数据处理测试
python tests/data/test_br_conversion.py
```
