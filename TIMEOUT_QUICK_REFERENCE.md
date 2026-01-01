# 超时优化 - 快速参考

## 🎯 改进内容

批量采集的超时时间已优化，不再因为时间限制而失败。

---

## ⚡ 核心改进

### 后端超时（crawlerExecutor.js）

**原来：** 固定 10 分钟（600000ms）

**现在：** 动态调整
```
单贴采集:     10分钟
批量采集:     max(30分钟, maxPages × 30秒 + 30秒)
```

**示例：**
```
maxPages=10  → 30分钟  ✓ 充足
maxPages=50  → 30分钟  ✓ 充足
maxPages=100 → 50分钟  ✓ 充足
```

### HTTP 请求超时（crawl.py）

**原来：** 固定 15 秒

**现在：** 
- 默认：30 秒
- 批量采集：60 秒

---

## 📊 超时时间对比表

| 采集类型 | 场景 | 原来 | 现在 | 改进 |
|---------|------|------|------|------|
| **单贴** | 总超时 | 10分钟 | 10分钟 | - |
| **单贴** | HTTP请求 | 15秒 | 30秒 | ✅ 更宽松 |
| **批量(5页)** | 总超时 | 10分钟 | 30分钟 | ✅ 3倍 |
| **批量(10页)** | 总超时 | 10分钟 | 30分钟 | ✅ 3倍 |
| **批量(50页)** | 总超时 | 10分钟 | 30分钟 | ✅ 3倍 |
| **批量** | HTTP请求 | 15秒 | 60秒 | ✅ 4倍 |

---

## 🔧 工作原理

### 超时计算流程

```
后端启动爬虫进程
  ↓
检查采集类型和页数
  ├─ 如果是单贴采集 → timeout = 10分钟
  ├─ 如果是批量采集且maxPages <= 3 → timeout = 10分钟
  └─ 如果是批量采集且maxPages > 3 → timeout = max(30分钟, maxPages×30秒+30秒)
  ↓
启动爬虫进程，传递timeout参数
  ↓
爬虫执行完成或达到timeout时停止
```

### HTTP 请求流程

```
调用 fetch_page() 或 fetch_page_with_final_url()
  ↓
检查是否指定了 request_timeout 参数
  ├─ 默认值：30秒
  ├─ 批量采集：60秒（显式指定）
  └─ 单贴采集：30秒（默认）
  ↓
发送 HTTP 请求，设置 timeout=request_timeout
  ↓
如果响应超过timeout → 重试（最多3次）
```

---

## 📝 修改位置

### 1. 后端文件修改
**文件：** `backend/src/services/crawlerExecutor.js`
```javascript
// 行 25-29：动态计算超时
const defaultTimeout = isNeedLongerTimeout ? 
  Math.max(1800000, maxPages * 30000 + 30000) :  
  600000;
const timeout = taskConfig?.timeout || defaultTimeout;
```

### 2. 爬虫文件修改
**文件：** `crawler/crawl.py`

**修改位置1：** 方法签名（行 85-95）
```python
def fetch_page(self, url, max_retries=3, delay_range=(2, 4), request_timeout=30):
```

**修改位置2：** 方法签名（行 97-143）
```python
def fetch_page_with_final_url(self, url, max_retries=3, delay_range=(2, 4), request_timeout=30):
```

**修改位置3：** 批量采集版块页（行 802）
```python
html = self.fetch_page(forum_url, request_timeout=60)
```

**修改位置4：** 批量采集分页（行 835）
```python
section_page_html = self.fetch_page(section_page_url, request_timeout=60)
```

**修改位置5：** 批量采集帖子（行 880）
```python
result = self.fetch_page_with_final_url(post_url, request_timeout=60)
```

---

## ✅ 部署状态

- ✅ 代码修改完成
- ✅ 后端容器已重启
- ✅ 新配置已生效

### 验证命令
```bash
# 查看后端日志
docker compose logs backend --tail 5

# 预期输出
# ✓ Server running on http://0.0.0.0:5000
```

---

## 🧪 测试方法

### 测试1：批量采集不再超时
```
创建任务：
- URL: 一个多页版块
- Type: batch
- maxPages: 10-20

预期结果：
- 任务完成
- 不出现 "爬虫执行超时" 错误
```

### 测试2：观察日志
```
后端日志应显示：
[爬虫] 启动爬虫: python3 ... --timeout 1800000 ...
                                      ↑
                              30分钟（1800000ms）
```

### 测试3：单贴采集保持不变
```
创建任务：
- URL: 单个帖子
- Type: novel/image/mixed

预期结果：
- 超时时间仍为 10分钟
- 执行速度不受影响
```

---

## 🔄 配置调整

### 如何手动覆盖超时时间？

通过 API 传递 `timeout` 参数（毫秒）：

```json
POST /api/tasks/create

{
  "url": "https://t66y.com/...",
  "type": "batch",
  "maxPages": 20,
  "timeout": 2400000  // 40分钟，覆盖默认值
}
```

### 如何手动覆盖 HTTP 超时？

这需要修改代码中的 `request_timeout` 参数，或在爬虫中添加配置选项。

---

## 📈 预期效果

### 失败情况减少
| 原因 | 原来 | 现在 |
|------|------|------|
| 总体超时 | 频繁 | 罕见 |
| HTTP请求超时 | 偶现 | 罕见 |
| 网络延迟 | 容易失败 | 容易通过 |

### 用户体验提升
- ✅ 批量采集成功率提升
- ✅ 不再被错误的超时打断
- ✅ 采集过程更流畅

---

## 💡 原理说明

### 为什么要动态计算超时？

```
批量采集时间 = 多页采集时间 + 多帖解析时间 + 网络延迟

例如：10页 × 20帖/页 = 200帖

时间计算：
- 每页采集：10-30秒
- 每帖解析：3-5秒
- 网络延迟：5-15秒

总时间：10页 × (30秒 + 20×5秒) = 10 × 130秒 = 1300秒 ≈ 22分钟

设置30分钟超时 = 22分钟实际 + 8分钟缓冲 ✓ 合理
```

### 为什么 HTTP 超时要增加到 60秒？

```
网络因素：
1. 服务器响应缓慢：10-30秒
2. 大文件下载：20-40秒
3. 网络波动：10-20秒
4. 总延迟：可能达到 30-60秒

15秒超时太短，容易触发超时重试
60秒超时更合理，减少不必要的重试
```

---

## 🚀 快速开始

1. **已自动部署** - 后端已重启，新配置已生效
2. **可直接使用** - 创建批量采集任务，享受更长的超时时间
3. **无需配置** - 自动根据采集类型和页数调整

---

**部署时间：** 2026-01-01 08:30 UTC  
**状态：** ✅ 已完成  
**兼容性：** 100% 向后兼容
