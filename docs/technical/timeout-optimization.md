# 批量采集超时优化

## 问题分析

批量采集通常包括：
1. **多页采集**：获取多个分页版块内容
2. **多帖解析**：处理大量帖子内容
3. **网络延迟**：论坛服务器可能响应缓慢
4. **带宽限制**：大文件下载可能需要更长时间

原来的超时设置不够合理：
- **整体超时**：10分钟（600000ms）- 对于10页 + 100帖太短
- **HTTP请求**：15秒 - 对于大页面或网络缓慢的情况可能不够

## 优化方案

### 1. 后端整体超时动态调整

**文件：** `backend/src/services/crawlerExecutor.js`

```javascript
// 批量采集需要更长的超时时间
// 计算方式: maxPages * 平均每页时间(30秒) + 30秒缓冲
const maxPages = taskConfig?.maxPages !== undefined ? taskConfig.maxPages : 10;
const isNeedLongerTimeout = crawlType === 'batch' && maxPages > 3;
const defaultTimeout = isNeedLongerTimeout ? 
  Math.max(1800000, maxPages * 30000 + 30000) :  // 批量采集: 至少30分钟
  600000;  // 单贴采集: 10分钟
const timeout = taskConfig?.timeout || defaultTimeout;
```

**超时计算：**
```
单贴采集：10分钟
批量采集：max(30分钟, maxPages * 30秒 + 30秒)

示例：
- maxPages=5:  max(30分钟, 5*30秒+30秒) = max(1800秒, 180秒) = 30分钟
- maxPages=10: max(30分钟, 10*30秒+30秒) = max(1800秒, 330秒) = 30分钟
- maxPages=50: max(30分钟, 50*30秒+30秒) = max(1800秒, 1530秒) = 30分钟
- maxPages=100: max(30分钟, 100*30秒+30秒) = max(1800秒, 3030秒) = 50.5分钟
```

### 2. HTTP请求超时调整

**文件：** `crawler/crawl.py`

#### 修改 `fetch_page_with_final_url()` 方法

```python
def fetch_page_with_final_url(self, url, max_retries=3, delay_range=(2, 4), request_timeout=30):
    """获取页面内容和最终URL（跟踪重定向和meta refresh）
    
    Args:
        request_timeout: HTTP请求超时时间(秒)，批量采集建议30-60秒
    """
    # ...
    response = self.session.get(
        url, 
        headers=headers,
        timeout=request_timeout,  # 可配置的HTTP超时，默认30秒
        verify=False,
        allow_redirects=True
    )
```

#### 修改 `fetch_page()` 方法

```python
def fetch_page(self, url, max_retries=3, delay_range=(2, 4), request_timeout=30):
    """获取页面内容 - 带重试和反爬虫
    
    Args:
        request_timeout: HTTP请求超时时间(秒)，默认30秒
    """
    result = self.fetch_page_with_final_url(url, max_retries, delay_range, request_timeout)
    return result['html'] if result else None
```

#### 批量采集中的使用

```python
# 批量采集时使用60秒超时
html = self.fetch_page(forum_url, request_timeout=60)
section_page_html = self.fetch_page(section_page_url, request_timeout=60)
result = self.fetch_page_with_final_url(post_url, request_timeout=60)
```

**超时设置对比：**
| 场景 | 原来 | 现在 | 说明 |
|------|------|------|------|
| HTTP 请求 | 15秒 | 30-60秒 | 更宽松的网络容忍度 |
| 单贴采集 | 10分钟 | 10分钟 | 无变化 |
| 批量采集(5页) | 10分钟 | 30分钟 | 充足的时间处理 |
| 批量采集(10页) | 10分钟 | 30分钟 | 充足的时间处理 |
| 批量采集(100页) | 10分钟 | 50分钟+ | 根据页数动态调整 |

## 改进效果

### 性能方面
- ✅ 批量采集不再因超时而失败
- ✅ 网络延迟的容忍度更高
- ✅ 大页面处理的成功率提升

### 可靠性方面
- ✅ 减少不必要的超时错误
- ✅ 适应不同网络环境
- ✅ 自动根据页数调整超时

### 用户体验方面
- ✅ 批量采集能够顺利完成
- ✅ 错误日志更清晰
- ✅ 任务成功率提升

## 实施细节

### 修改文件
1. **backend/src/services/crawlerExecutor.js** (行 25-29)
   - 动态计算超时时间
   - 根据采集类型和页数调整

2. **crawler/crawl.py**
   - 行 85-95: `fetch_page()` 方法
   - 行 97-143: `fetch_page_with_final_url()` 方法
   - 行 802: 批量采集首页请求
   - 行 835: 批量采集分页请求
   - 行 880: 批量采集帖子请求

### 向后兼容性
- ✅ 所有方法都有默认参数值
- ✅ 现有代码无需修改
- ✅ 单贴采集超时时间不变

## 验证步骤

### 1. 观察后端日志
```
[爬虫] 启动爬虫: python3 /app/crawler/crawl.py --timeout 1800000 ...
        ↑ 单贴：600000ms (10分钟)
        ↑ 批量：1800000ms (30分钟) 或更长
```

### 2. 运行批量采集任务
- 创建包含 5-10 页的批量采集任务
- 观察是否顺利完成
- 检查是否超时

### 3. 监控日志消息
```
⏳ 等待 3.2 秒后请求...
✓ 成功获取页面: ...
📊 共采集版块 X 页
```

## 常见问题

### Q: 超时时间是否会影响成本？
A: 不会。超时时间只是上限，不会因为超时长就消耗更多资源。实际运行时间不会增加。

### Q: 单贴采集是否会受影响？
A: 不会。单贴采集的超时时间仍为 10 分钟，HTTP 超时为 30 秒（比原来的 15 秒更宽松，但这不会影响快速完成的任务）。

### Q: 能否手动设置超时时间？
A: 可以。通过 API 的 `timeout` 参数来覆盖默认值：
```json
{
  "type": "batch",
  "maxPages": 20,
  "timeout": 2400000  // 40分钟
}
```

## 总结

通过合理调整超时时间，使批量采集更加稳定可靠：

- ✅ **动态超时**：根据页数自动调整
- ✅ **HTTP超时**：从 15秒 增加到 30-60秒
- ✅ **向后兼容**：无需改动现有代码
- ✅ **更宽松**：适应网络变化

**部署状态：** ✅ 代码已修改，待后端重启

---

**更新时间：** 2026-01-01  
**文档状态：** 完成
