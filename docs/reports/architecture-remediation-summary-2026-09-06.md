# 架构整改总结报告

**日期**：2026-09-06
**范围**：forum-crawler-service（backend / crawler / tests / docs）
**依据**：[architecture-review-2026-09-06.md](file:///home/project/forum-crawler-service/docs/reports/architecture-review-2026-09-06.md)、[architecture-remediation-plan-2026-09-06.md](file:///home/project/forum-crawler-service/docs/reports/architecture-remediation-plan-2026-09-06.md)
**版本记录**：CHANGELOG v2.1.0

---

## 一、整改目标

针对架构评审发现的三类问题执行止血与收敛：

1. **结构性冗余**：爬虫存在 `crawler/app/` 与 `crawler/crawl.py` 双实现并行；图片下载存在 Node/Python 三处实现；未使用依赖（joi/multer/sharp/axios）。
2. **安全缺陷**：任务更新接口直接透传 `req.body`（批量赋值风险）；`catchAsync` 未 return Promise，错误链在测试与运行期均可能丢失。
3. **测试缺失与架构越位**：项目无自动化单元测试；评审结论明确 **不做** DDD 四层/Clean Architecture 全套抽象（CRUD 工具型系统，抽象成本 > 收益），整改方向是"轻度分层 + 测试兜底 + 防过度设计"。

---

## 二、执行阶段与结果

### P0 止血

| 事项 | 处理 |
|------|------|
| 爬虫双实现 | `crawler/app/` 整体归档至 [docs/archive/crawler_app_parallel_impl/](file:///home/project/forum-crawler-service/docs/archive/crawler_app_parallel_impl/)，生产仅保留 [crawl.py](file:///home/project/forum-crawler-service/crawler/crawl.py) 单一入口 |
| 图片下载重复实现 | 删除 `backend/src/services/imageDownloader.js`，保留 [image_downloader.py](file:///home/project/forum-crawler-service/crawler/image_downloader.py) |
| 未使用依赖 | 从 `backend/package.json` 移除 joi / multer / sharp / axios 并 `npm prune` |
| 批量赋值漏洞 | `updateTask` 改为 8 字段白名单（现位于 taskService） |
| 错误链丢失 | [catchAsync.js](file:///home/project/forum-crawler-service/backend/src/utils/catchAsync.js) 补 `return fn(...).catch(next)` |
| 孤立 Dockerfile | `docker/Dockerfile.crawler` 随归档目录移走 |

### P1 测试基建（TDD 落地）

| 套件 | 框架 | 用例数 | 覆盖内容 |
|------|------|--------|----------|
| 后端单元测试 | Jest（新增 [jest.config.js](file:///home/project/forum-crawler-service/backend/jest.config.js)） | **51** | authService、authMiddleware、taskController、taskService |
| 爬虫单元测试 | Pytest（uv venv） | **52** | [text_utils.py](file:///home/project/forum-crawler-service/crawler/lib/text_utils.py)、[url_utils.py](file:///home/project/forum-crawler-service/crawler/lib/url_utils.py) 及 3 个由数据脚本改写的用例 |

- 爬虫纯逻辑从 68KB 的 `crawl.py` 中提取为无副作用的 `lib/` 函数库（文本哈希/提取/乱码检测、URL 分页/重定向/tid 解析），主程序改为委托调用。
- 集成测试收敛：`test_permissions_simple.sh` 合并入 [test_admin_permissions.sh](file:///home/project/forum-crawler-service/tests/integration/test_admin_permissions.sh)；[tests/README.md](file:///home/project/forum-crawler-service/tests/README.md) 更新为"单元测试为 CI 主力、集成测试为手动冒烟"的三层体系说明。

### P2 轻度分层（不建四层）

严格按整改计划边界执行：**不建 repository 接口、不做 DI 容器、不引入 DTO mapper**。

1. **TDD 流程**：先写 [taskService.test.js](file:///home/project/forum-crawler-service/backend/src/services/__tests__/taskService.test.js)（20 用例锁定既有行为，含角色可见性、创建校验/默认命名、白名单、start/pause/resume 状态机、旧数据自动归属、入队失败置 failed），再实现 [taskService.js](file:///home/project/forum-crawler-service/backend/src/services/taskService.js)（204 行）。
2. **controller 瘦身**：[taskController.js](file:///home/project/forum-crawler-service/backend/src/controllers/taskController.js) 由 289 行降至 **81 行**，仅保留"参数读取 → 调 service → 组装响应"，角色过滤/校验/命名等业务规则零残留。
3. **回归证明**：重构前存在的 31 个 controller/service 用例 **零修改全部通过**，确认行为等价。
4. **统一响应约定**：新增 11 行 [respond.js](file:///home/project/forum-crawler-service/backend/src/utils/respond.js)（`sendSuccess`，兼容 `pagination`/`message`），taskController 已接入。

---

## 三、最终验收结果

| 验收项 | 结果 |
|--------|------|
| `npm test`（backend） | ✅ **51/51 通过**，4 个测试套件，约 0.4s |
| `uv run pytest tests/`（crawler） | ✅ **52/52 通过**，约 0.07s |
| `grep -r "imageDownloader\|require('joi')"` | ✅ 零命中 |
| 爬虫生产入口 | ✅ 仅 `crawler/crawl.py` 一条 |
| taskController 业务规则残留 | ✅ 无（grep 角色/白名单/校验关键词零命中） |
| 文档与变更记录 | ✅ 验收清单 6 项全勾选，[CHANGELOG.md](file:///home/project/forum-crawler-service/docs/CHANGELOG.md) 记录 v2.1.0 |

变更规模（git status 口径）：新增测试与 lib/service 文件约 15 个，归档 `crawler/app/` 13 个文件，删除死代码 1 处，修改文档 6 处。

---

## 四、架构结论

| 维度 | 评审时状态 | 整改后状态 |
|------|-----------|-----------|
| 分层 | controller 承载全部业务规则，service 仅有队列/调度等基础设施 | task 域业务规则下沉 service；controller 纯编排；不过度分层 |
| 可测试性 | 零单元测试，爬虫逻辑与 IO 耦合无法单测 | Jest 51 + Pytest 52；爬虫纯函数库无外部依赖可直接测试 |
| 冗余实现 | 爬虫双实现、图片下载三实现、4 个未用依赖 | 均已消除或归档 |
| 安全 | 批量赋值风险、错误链静默 | 白名单 + return Promise 修复，均有对应用例守护 |
| DDD / Clean Architecture | 评审结论：不适用 | 维持结论——未引入聚合/仓储/端口适配器/TS 重写 |

---

## 五、明确不做的事项（防过度设计）

- DDD 聚合/值对象/仓储/防腐层；Clean Architecture 四层 + 端口适配器；DTO 映射框架；爬虫微服务化；TypeScript 重写。
- 理由：本系统为 CRUD 为主的单人/小团队工具型项目，Mongoose Model + service 函数 + Bull 队列已满足复杂度需求，上述抽象无真实替换需求。

## 六、遗留事项（后续增量处理，不阻塞本次验收）

1. `browseController.js`（约 20 处响应）、`postController.js`、`adminController.js`、`authController.js` 尚未接入 `sendSuccess`，且无单元测试覆盖；建议后续为其补测试时**顺手**替换，不在本次无测试保护下批量改写。
2. 集成测试脚本（`tests/integration/*.sh`）依赖本地运行中的服务，未纳入自动化 CI。
3. `docs/` 下 PROJECT_STRUCTURE.md、README.md 等已随 P0/P1 更新，若后续新增 service/utils，需同步维护。

---

**结论**：P0→P1→P2 计划全部完成，验收清单 6/6 通过，103 个自动化用例全绿。整改在不引入冗余架构的前提下，消除了重复实现与安全缺陷，建立了 TDD 基建并完成首个业务域的分层收敛。
