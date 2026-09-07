# 文档目录

本目录包含项目的所有文档，按用途分类组织。

## 📑 目录结构

### guides/ - 部署和集成指南
包含部署、集成、快速入门等指导文档：
- `FRONTEND_DEPLOYMENT_GUIDE.md` - 前端部署指南
- `SYSTEM_MANAGEMENT_DEPLOYMENT.md` - 系统管理部署指南
- `FRONTEND_INTEGRATION_CHECKLIST.md` - 前端集成检查清单
- `FRONTEND_CONSOLIDATION.md` - 前端整合说明
- `FRONTEND_QUICKSTART.md` - 前端快速开始
- `FRONTEND_QUICK_REFERENCE.md` - 前端快速参考
- 等其他集成和部署相关文档

### features/ - 功能实现文档
每个功能主题只保留一篇现行文档（同主题的历史变体已移入 `archive/features/`）：
- `content-hash.md` - 内容哈希去重（checklist/quickref/quickstart/deduplication 等变体已存档）
- `time-based-deduplication.md` - 时间戳快速判断去重
- `pagination.md` - 逐页分页采集（comparison/deployment/improvement/quickguide/summary 等变体已存档）
- `meta-redirect.md` - Meta 标签重定向跟踪（index/quickref 变体已存档）
- `link-extraction.md` - 批量采集链接提取
- `keyboard-navigation.md` - 图片预览键盘导航
- `ADMIN_PERMISSIONS_IMPLEMENTATION.md` - 管理员权限实现
- `FEATURE_DELETE_CONTENT.md` - 删除功能说明
- `system-management-implementation.md` - 系统管理实现
- `task-userid-migration.md` - 任务用户归属迁移

### product/ - 产品文档
- `PRD.md` - 现行产品需求文档（历史 backup 与更新报告已移入 `archive/product/`）

### fixes/ - BUG修复总结
包含已修复问题的总结文档：
- `CRAWLER_USERID_FIX_SUMMARY.md` - 爬虫用户ID修复
- `JWT_TOKEN_FIX_SUMMARY.md` - JWT令牌修复
- `JWT_TOKEN_USERID_FIX_REPORT.md` - JWT和用户ID修复报告
- `PINNED_POST_BLACKLIST.md` - 固定帖子黑名单

### archive/ - 存档文档
包含历史性或参考性文档，不再随代码同步维护：
- `IMPLEMENTATION_CHECKLIST.md` - 实现检查清单（存档）
- `SYSTEM_COMPLETE_SUMMARY.md` - 系统完整总结（存档）
- `features/` - 功能文档的历史变体（每主题现行版在 `features/` 根目录）
- `product/` - PRD 历史 backup 与阶段更新报告
- `crawler_app_parallel_impl/` - 已归档的并行爬虫实现
- 其他已完成或更新的历史文档

## 📚 主要文档

根目录的以下文档：
- `api.md` - API文档
- `deployment.md` - 部署说明
- `development.md` - 开发指南
- `CHANGELOG.md` - 变更日志
- `index.md` - 文档索引
- 等其他重要文档
