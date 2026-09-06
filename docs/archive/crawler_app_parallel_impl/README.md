# 已归档：crawler/app/ 并行实现（2026-09-06）

## 归档原因

本目录保存的是爬虫模块的**并行重写实现**（`crawler/app/` 与 `docker/Dockerfile.crawler`），
已于 2026-09-06 按架构整改计划归档停用。

- 生产唯一入口：`crawler/crawl.py`（由 `backend/src/services/crawlerExecutor.js` 以子进程调用）
- 归档时该实现未被任何 docker-compose 服务编排，`Dockerfile.crawler` 的
  `CMD python -m app.engine` 从未在生产链路中生效
- 并存导致提取/落库逻辑双写、文档入口描述与实现漂移

## 内容

| 文件 | 原路径 | 说明 |
|---|---|---|
| `app/` | `crawler/app/` | 模块化爬虫（engine / base_crawler / spiders / pipelines） |
| `Dockerfile.crawler` | `docker/Dockerfile.crawler` | 独立爬虫容器镜像定义 |

## 后续参考

如需将 `crawl.py` 单体重构为模块化结构（绞杀者迁移），可以本目录为起点，
重构前先阅读 `docs/reports/architecture-remediation-plan-2026-09-06.md` 的 P1-2（提取纯函数 + pytest 锁行为）。
