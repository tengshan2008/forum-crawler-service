# 架构整改计划

- 制定日期：2026-09-06
- 关联报告：[架构评审报告](./architecture-review-2026-09-06.md)
- 性质：本文档为**独立整改计划**，可与报告分开执行与验收。
- 总原则：**做减法 + 补测试**。不引入 DDD / Clean Architecture 全套分层，避免以整改之名制造新的过度设计。

---

## 目标与验收标准

| 目标 | 可验收标准 |
|---|---|
| 爬虫单一实现路径 | 全仓库仅存在一条被生产调用的爬虫入口；`docker compose config` 与代码、文档三者一致 |
| 死代码清零 | `imageDownloader.js`、`joi`、孤立 Dockerfile 移除，`npm ls` 无未用依赖 |
| 单测从 0 到 1 | `npm test`（jest）与 `pytest` 各有 ≥10 个真实断言用例并在本地可运行 |
| 业务规则归位 | taskController 不再包含权限过滤、任务校验、默认命名等规则逻辑 |
| 文档与实现一致 | docs 中爬虫入口描述与 `crawlerExecutor.js` 一致 |

---

## P0 — 止血：消除冗余（先做，风险最低收益最高）

### P0-1 确定唯一爬虫入口：保留 `crawl.py`，归档 `crawler/app/`

- **决策理由**：`crawl.py`（1613 行）是生产实际入口（`backend/src/services/crawlerExecutor.js:20`），功能最全；`crawler/app/` 是未被编排的并行重写。归档而非删除，保留未来绞杀者迁移的参考。
- 步骤：
  1. 将 `crawler/app/`、`docker/Dockerfile.crawler` 移入 `docs/archive/crawler_app_parallel_impl/`（或在 git 历史打 tag 后删除）。
  2. 同步修正引用方：`docs/files.md`、`docs/quickstart.md`、`docs/development.md`、`PROJECT_STRUCTURE.md`。
  3. 在 `crawler/README.md`（若无为新建一段）明确：唯一入口 `python crawl.py`，调用方为 crawlerExecutor。
- 产出：单一入口 + 文档一致。
- 备注：`crawler/image_downloader.py` 被 `crawl.py` 使用，**保留**。

### P0-2 删除死代码与未用依赖

1. 删除 `backend/src/services/imageDownloader.js`（全仓库无引用）。
2. 删除后检查 `sharp`、`axios` 是否仍有引用：若 `npm run start` 与全量 grep 均无消费，则从 `backend/package.json` 移除。
3. 从 `backend/package.json` 移除 `joi`（校验统一走 express-validator）。
4. 运行 `npm test`、启动 `npm run dev` 冒烟验证。

### P0-3 修复 updateTask 批量赋值风险

- `taskController.js` 的 `updateTask` 对 `req.body` 增加字段白名单（仅允许 `name/description/forumUrl/sectionUrl/crawlType/taskType/config/schedule`），拒绝或忽略 `status/userId` 等敏感字段。
- 该项与 P1-1 一起做测试覆盖。

---

## P1 — 测试基建（TDD 起步，不教条）

> 约定：此后所有 bug 修复与新功能一律**先写失败测试再写实现**（TDD 红绿循环）；存量代码按 P1 顺序补测，不追求覆盖率数字。

### P1-1 后端单测（jest + supertest）

- 新增 `backend/jest.config.js` 与 `backend/src/**/__tests__/`。
- 优先补测（按风险排序）：
  1. `taskController.updateTask` 白名单行为（配合 P0-3，先写用例再改实现）；
  2. `taskController.createTask` 校验与默认命名规则（下沉到 service 后测 service）；
  3. `authService`（登录/JWT 签发与过期）；
  4. `middlewares/authMiddleware`（角色鉴权）。
- 手段：mongoose 以 `mongodb-memory-server` 或 mock 方式隔离；HTTP 层用 supertest。
- 验收：`npm test` 至少 10 个用例、全绿，且不再空转。

### P1-2 爬虫单测（pytest）

- 新增 `pytest.ini` + `crawler/tests/`。
- 关键前提：从 `crawl.py` 中**提取纯函数**到 `crawler/lib/`（如内容提取、`<br>` 转换、redirect 解析、内容哈希计算），`crawl.py` 只保留编排。
- 将 `tests/data/test_br_conversion.py` 等 3 个 print 脚本改写为 **import 真实模块** 的 pytest 用例（删除复制逻辑）。
- 验收：`pytest` 至少 10 个用例全绿；`crawl.py` 行数下降且行为由测试锁定。

### P1-3 集成测试收敛

- 保留 `tests/integration/` 作为可选手动冒烟包；
- 合并 `test_admin_permissions.sh` 与 `test_permissions_simple.sh`；
- `tests/README.md` 写明执行前置条件与适用场景，单测为 CI 主力。

---

## P2 — 轻度分层整理（controller 瘦身，不建四层）

### P2-1 下沉业务规则到 service 层

- 新增 `backend/src/services/taskService.js`，承接：
  - 角色数据可见性过滤（原 `taskController.js:10-11, 43-46, 103-106`）；
  - 任务创建校验与默认命名（原 `taskController.js:63-76`）；
  - 任务状态机转换校验（`startTask` 中 running/pending 判断，原 `taskController.js:147-189` 附近）。
- controller 只保留：参数读取 → 调 service → 组装响应。
- **边界约束**：不建 repository 接口、不做依赖注入容器、不引入 DTO mapper；service 直接使用 Mongoose Model 即可。

### P2-2 统一响应约定（顺手项）

- 各 controller 已有 `success/data/message` 风格，补一个 5 行的响应工具即可，不引入框架。

---

## P3 — 明确不做的事项（防过度设计）

| 不做 | 理由 |
|---|---|
| DDD（聚合/值对象/仓储/防腐层） | CRUD 为主的工具型系统，抽象成本 > 收益 |
| Clean Architecture 四层 + 端口适配器 | 单人/小团队规模，依赖倒置无真实替换需求 |
| DTO & 映射框架 | 暂以 Model 字段白名单控制出参即可 |
| 微服务化爬虫 | 子进程 + Bull 队列已满足隔离与重试需求 |
| 引入 TypeScript 重写 | 与本次整改目标无关，另行评估 |

---

## 执行顺序与依赖关系

```
P0-1 归档 app/ ──┐
P0-2 清死代码 ──┼──▶ P1-2 爬虫 pytest（依赖 P0-1 的单一入口）
P0-3 白名单 ────┴──▶ P1-1 后端 jest ──▶ P2-1 service 下沉（先测后改）
```

- P0 三项互相独立，可并行；
- P1-1 的第一批用例先于 P2-1 落地（TDD：先锁行为再迁移逻辑）；
- P1-2 依赖 P0-1 完成，避免为将归档的 `app/` 写测试。

## 验收清单（整改完成定义）

- [ ] 仓库中仅一条爬虫生产入口，文档三处以上引用已修正
- [ ] `grep -r "imageDownloader\|require('joi')"` 零命中；孤立 Dockerfile 已归档
- [ ] `npm test` ≥10 用例全绿（含 updateTask 白名单用例）
- [ ] `pytest` ≥10 用例全绿（含改写后的 3 个数据脚本）
- [ ] `taskController.js` 中无角色过滤/校验/命名等业务规则残留
- [ ] 本清单归档至 `docs/reports/`，并在 `docs/CHANGELOG.md` 记录
