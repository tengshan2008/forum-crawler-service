# 架构评审报告

- 评审日期：2026-09-06
- 评审范围：`backend/`、`crawler/`、`frontend/`、`tests/`、`docker/`
- 关联文档：[架构整改计划](./architecture-remediation-plan-2026-09-06.md)（独立文档）

---

## 一、总体结论

| 评估项 | 结论 | 摘要 |
|---|---|---|
| 架构是否合理 | **基本合理** | 三段式单体（Express API + React 前端 + Python 爬虫子进程），规模与复杂度匹配 |
| 是否采用 DDD | **否** | 无领域层（实体/值对象/聚合/仓储），业务规则散落在 controller；对本项目而言**不建议引入**完整 DDD |
| 是否采用 Clean Architecture | **否**（仅形似） | 有 services 层但仅覆盖调度链路；无依赖倒置、无用例层、无端口/适配器；**不建议引入**完整分层 |
| 是否 TDD 驱动 | **否** | 后端 0 个测试文件（jest 空配置）；现有"测试"是事后补的 shell 冒烟脚本与 print 式 Python 脚本 |
| 是否过度设计/冗余 | **存在明确冗余** | 爬虫双实现并存、图片下载三处实现、死代码、未用依赖、文档与实现漂移 |

核心判断：**本项目的问题不是"分层不够"，而是"冗余太多、测试为零"**。整改方向应是做减法（消除双实现）+ 补测试，而非引入 DDD / Clean Architecture。

---

## 二、系统现状

```
frontend (React/CRA) ──HTTP──▶ backend (Express)
                                 ├── routes → controllers → models (Mongoose)
                                 ├── schedulerService（每分钟扫描定时任务）
                                 ├── crawlerQueue（Bull/Redis，重试、回调）
                                 └── crawlerExecutor ──spawn──▶ crawler/crawl.py（子进程）
                                                                     └──▶ image_downloader.py
```

- 部署：docker-compose 编排 mongo / redis / backend / frontend 四个服务，**不含 crawler 服务**。
- 生产爬虫入口：`backend/src/services/crawlerExecutor.js:20` 指向 `/app/crawler/crawl.py`。

---

## 三、分层架构评估

### 3.1 做得好的部分

1. **请求链路薄而清晰**：routes 仅做 URL→controller 映射（如 `routes/taskRoutes.js`），无业务逻辑。
2. **统一错误处理**：`utils/AppError.js` + `utils/catchAsync.js` + `middlewares/errorHandler.js` 构成一致的错误传播模式。
3. **调度链路职责分明**：`schedulerService`（定时触发）→ `crawlerQueue`（Bull/Redis 异步解耦+重试）→ `crawlerExecutor`（子进程+超时控制），三者是链路而非重叠。
4. **输入校验**：`express-validator` 在路由/控制器层统一使用。

### 3.2 主要问题

1. **业务规则散落在 controller**
   - `controllers/taskController.js:10-11`：按角色过滤数据的权限规则写在 controller。
   - `taskController.js:63-76`：任务创建校验与默认命名规则写在 controller。
   - 这些属于任务领域的业务规则，应下沉到 service 层。

2. **Model 直接暴露给前端**：controller 直接 `res.json({ data: task })` 返回 Mongoose document，无 DTO 边界；`taskController.js:107-114` 的 `updateTask` 将 `req.body` 直传 `findOneAndUpdate`，存在批量赋值（mass assignment）越权字段风险。

3. **service 层覆盖不全**：仅调度与认证有 service，Task/Post 等核心 CRUD 没有服务层，形成"半分层"状态。

---

## 四、DDD 符合度评估：不符合

检查项逐一核对：

| DDD 构成要素 | 现状 |
|---|---|
| 实体/值对象 | 无。Mongoose Schema 直接充当模型（`models/Task.js` 等） |
| 聚合与聚合根 | 无。跨模型一致性靠 controller 顺序调用 |
| 领域服务 | 无。业务规则位于 controller（见 §3.2） |
| 仓储抽象 | 无。所有代码直接依赖 Mongoose Model |
| 应用层/用例 | 无独立应用层 |
|防腐层/DTO | 无。Mongoose document 直接序列化给前端 |

**评价**：本项目是 CRUD 为主 + 一条爬虫调度链路的工具型系统。为它引入 DDD（聚合、仓储、防腐层）属于**过度设计**，会增加大量无实际收益的抽象层。当前需要的不是 DDD，而是把散落的业务规则收拢到一个薄的 service 层。

---

## 五、Clean Architecture 符合度评估：不符合

| Clean Architecture 要求 | 现状 |
|---|---|
| 用例层（Use Case / Interactor） | 无；Task 用例直接写在 controller |
| 依赖倒置（内层不依赖外层） | 不满足。controllers 直接 import Mongoose Model；services 直接依赖 Bull、`child_process` |
| 端口/适配器 | 无。MongoDB、Redis、Python 子进程均无接口抽象 |
| 框架无关的领域内核 | 无。模型定义与持久化（Mongoose）强绑定 |

**评价**：项目当前是"Express 社区惯例的 MVC 变体"。完整的 Clean Architecture（四层洋葱 + 端口适配器）对当前业务规模是过度设计；但**轻度补齐 service 层**（业务逻辑归位）是值得做的，它是未来任何架构演化的前提。

---

## 六、TDD 符合度评估：基本缺失

证据：

1. **后端零单测**：`backend/package.json:9` 配置了 `"test": "jest"`，devDependencies 含 jest + supertest，但 `backend/src` 及全仓库**没有任何 `*.test.js` 文件**。`npm test` 空转通过，属于"测试基建已备、从未使用"。
2. **前端零测试**：`frontend/package.json` 保留 `react-scripts test`，无任何测试文件。
3. **集成测试为 shell 脚本**：`tests/integration/` 下 14 个 `*.sh`，均为 curl 驱动、依赖运行中环境的冒烟脚本（如 `test_pagination.sh`、`test_admin_permissions.sh`），无法在无环境 CI 中运行，且相互之间有重复（`test_admin_permissions.sh` vs `test_permissions_simple.sh`）。
4. **Python"测试"不是测试**：`tests/data/test_br_conversion.py` 等以 `print` 输出结果、无断言，且把被测的 `<br>` 处理逻辑**复制**进测试文件里（文件内自述"模拟修复后的处理逻辑"），而非 import 爬虫真实模块——既不可信也无法防回归。
5. **无 pytest 配置、无 CI 流水线**：全仓库无 `pytest.ini`、无 CI 配置文件。
6. **实践模式是"修复后补脚本"**：`tests/README.md` 与 `docs/fixes/` 下大量修复记录文档表明流程为：出 bug → 修复 → 写验证脚本，属于事后验证，与 TDD 相反。

---

## 七、过度设计与冗余清单（重点问题）

### R1. 爬虫双实现并存（最严重）
- **实现 A**：`crawler/crawl.py`（1613 行单体）——生产实际使用的入口（`crawlerExecutor.js:20`），功能最全（提取、去重、内容哈希、图片、断点续传等）。
- **实现 B**：`crawler/app/`（engine.py / base_crawler.py / spiders / pipelines，共约 300 行模块化重写）——**仅**被 `docker/Dockerfile.crawler:17`（`CMD python -m app.engine`）和文档引用，而该 Dockerfile **未被任何 docker-compose 文件编排**。
- 后果：两套提取/落库逻辑语义重复，任何修复都需要双写或漏写；文档宣称的入口与生产入口不一致。

### R2. 图片下载三处实现
- `crawler/image_downloader.py`（crawl.py 使用）；
- `crawler/app/pipelines/media_download.py`（app 引擎使用）；
- `backend/src/services/imageDownloader.js`——**全仓库无任何引用，属死代码**，且是 backend 中 `sharp`、`axios` 依赖的唯一疑似消费者。

### R3. 未使用依赖
- `backend/package.json:31` 声明 `joi`，但代码校验全部使用 `express-validator`（`middlewares/validators.js:1`），joi 从未被 require。

### R4. 文档与实现漂移
- `docs/files.md:156`、`docs/quickstart.md:63`、`docs/development.md:422` 声称爬虫入口为 `python -m app.engine`，与生产实际（`crawl.py` 子进程）矛盾。
- `PROJECT_STRUCTURE.md` 将 `crawler/app/` 列为正式组成部分，未说明其与 `crawl.py` 的关系。

### R5. 冗余集成脚本
- `tests/integration/test_admin_permissions.sh` 与 `test_permissions_simple.sh` 覆盖面高度重叠。

### 未发现的问题（澄清）
- `crawlerQueue` / `crawlerExecutor` / `schedulerService` 三者是调度链路的三个环节，**不属于**职责重叠；
- backend 与 crawler 分离本身合理，Redis/Bull 解耦 spawn 有重试价值，不构成过度设计。

---

## 八、风险评级

| 编号 | 问题 | 等级 | 影响 |
|---|---|---|---|
| R1 | 爬虫双实现 | 高 | 修复漏打、维护成本翻倍、新人误解入口 |
| T | 零单元测试 | 高 | 回归无防护，`docs/fixes/` 的大量 bug 记录即佐证 |
| R2 | 死代码 imageDownloader.js | 中 | 误导维护者 |
| §3.2-2 | updateTask 批量赋值 | 中 | 潜在越权字段修改 |
| R3/R4/R5 | 未用依赖/文档漂移/重复脚本 | 低 | 认知噪音 |

---

## 九、建议方向（详见独立整改计划）

1. **只保留一条爬虫实现路径**（以 `crawl.py` 为生产入口，归档 `crawler/app/`），杜绝双写。
2. **删除死代码与未用依赖**（imageDownloader.js、Dockerfile.crawler、joi）。
3. **补测试基建而非补架构**：backend 起 jest + supertest 单测，crawler 引 pytest 并让既有测试真正 import 被测模块。
4. **轻度下沉业务规则**到 service 层，controller 只留 HTTP 编排；updateTask 加字段白名单。
5. **明确不做**：不引入 DDD 分层、不引入 Clean Architecture 四层结构、不引入 DTO mapper 框架。
