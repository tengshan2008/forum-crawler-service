# Crawler

论坛爬虫模块（Python）。

## 唯一入口

```bash
python crawl.py
```

- 生产调用方：`backend/src/services/crawlerExecutor.js`（Node 子进程，通过 Bull 队列触发）
- 图片下载依赖：`image_downloader.py`（被 `crawl.py` 引用，勿单独删除）

## 维护约定

1. **禁止**在仓库中并存第二套爬虫实现；如需模块化重构，参见
   `docs/archive/crawler_app_parallel_impl/README.md` 与
   `docs/reports/architecture-remediation-plan-2026-09-06.md`（P1-2：先提取纯函数并用 pytest 锁行为，再迁移）。
2. 内容提取、`<br>` 转换、redirect 解析等纯逻辑应可被 `pytest` 直接 import 测试（见 P1-2）。
3. 数据落库契约（MongoDB 集合与字段）变更时，需同步 `backend/src/models/` 中的 Mongoose Schema。

## 环境

依赖安装：`pip install -r requirements.txt`
