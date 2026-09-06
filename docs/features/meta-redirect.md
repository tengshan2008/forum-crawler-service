# Meta转向URL跟踪修复 - 完整实现总结

## 问题描述

在批量采集时，系统记录的帖子sourceUrl是转向页面URL格式，而不是实际的帖子页面URL：

| 类型 | URL格式 |
|------|---------|
| ❌ 转向页（redirect page） | `https://t66y.com/read.php?tid=7075205` |
| ✅ 实际页面（actual page） | `https://t66y.com/htm_data/2512/20/7075205.html` |

## 根本原因分析

t66y论坛采用了两层URL结构：

1. **转向页URL** (`/read.php?tid=XXX`)
   - 返回HTTP 200状态码（不是真正的HTTP重定向）
   - 页面包含 `<meta http-equiv="refresh" content="2;url=...">` 标签
   - 用户浏览器会在2秒后自动跳转到实际页面
   - 这是JavaScript/浏览器级别的重定向，不是HTTP级别的重定向

2. **实际页面URL** (`/htm_data/板块号/分类号/tid.html`)
   - 这是真正的帖子内容页面
   - 需要从meta标签中解析URL才能获取

## 解决方案实现

### 1. 改进 `fetch_page_with_final_url()` 方法

```python
def fetch_page_with_final_url(self, url, max_retries=3, delay_range=(2, 4)):
    """获取页面内容和最终URL（跟踪重定向和meta refresh）"""
    # ... 获取响应 ...
    
    # 检查 meta http-equiv="refresh" 标签
    meta_refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
    if meta_refresh and 'content' in meta_refresh.attrs:
        # 提取URL，格式通常是: "2;url=......"
        content = meta_refresh['content']
        if 'url=' in content:
            redirect_url = content.split('url=', 1)[1].strip().rstrip(';')
            # 构建完整URL
            meta_final_url = urljoin(final_url, redirect_url)
            if meta_final_url != final_url:
                final_url = meta_final_url
                print(f"✓ 成功获取页面（已跟踪meta转向）: {url} → {final_url}")
    
    return {
        'html': response.text,
        'url': final_url
    }
```

### 2. 传递 `crawlType` 参数

**修改后端** (`backend/src/services/crawlerExecutor.js`):
- 新增 `crawlType` 参数到 `executeCrawler()` 函数
- 新增 `--crawl-type` 命令行参数传递给爬虫

**修改爬虫** (`crawler/crawl.py`):
- 新增 `--crawl-type` 命令行参数解析
- 将参数传递给 `crawl_forum()` 方法

**目的**：让爬虫直接知道是否为批量采集，而不需要通过URL格式猜测

### 3. 在单帖和批量采集中使用最终URL

**单帖采集** (`crawl_forum()` 的 else 分支):
```python
result = self.fetch_page_with_final_url(forum_url)
if result:
    post_html = result['html']
    final_forum_url = result['url']  # 获取转向后的最终URL
    actual_forum_url = final_forum_url
    # 使用 actual_forum_url 保存帖子
```

**批量采集** (`crawl_forum()` 的 if is_batch 分支):
```python
result = self.fetch_page_with_final_url(post_url)
if result:
    post_html = result['html']
    final_post_url = result['url']  # 获取转向后的最终URL
    actual_post_url = final_post_url
    # 使用 actual_post_url 保存帖子
```

## 修改的文件清单

| 文件 | 修改内容 |
|------|---------|
| `crawler/crawl.py` | 1. 增强 `fetch_page_with_final_url()` 支持meta转向<br>2. 修改 `crawl_forum()` 接收 `crawl_type` 参数<br>3. 单帖采集使用 `fetch_page_with_final_url()`<br>4. 批量采集使用最终URL保存帖子<br>5. 添加 `--crawl-type` 参数解析 |
| `backend/src/services/crawlerExecutor.js` | 1. 增加 `crawlType` 参数到函数签名<br>2. 添加 `--crawl-type` 命令行参数<br>3. 默认值为 `'single'` |
| `backend/src/services/crawlerQueue.js` | 1. 增加 `crawlType` 参数到 `addCrawlerTask()` 函数<br>2. 将 `crawlType` 添加到队列任务数据 |
| `backend/src/controllers/taskController.js` | 1. 启动任务时传递 `crawlType` 给爬虫 |
| `backend/src/index.js` | 1. 从任务队列job数据中读取 `crawlType`<br>2. 传递给 `executeCrawler()` |

## 验证测试结果

### 测试场景：单帖采集（使用转向页URL）

**输入：**
```
URL: https://t66y.com/read.php?tid=7075205
Mode: 单帖采集 (single)
```

**预期行为：**
1. 爬虫请求 `/read.php?tid=7075205`
2. 接收到含有 `<meta refresh>` 标签的HTML
3. 解析meta标签，提取转向URL：`/htm_data/2512/20/7075205.html`
4. 将其转换为完整URL：`https://t66y.com/htm_data/2512/20/7075205.html`
5. 使用该最终URL作为sourceUrl保存

**实际结果：✅ 成功**
```
输入URL:   https://t66y.com/read.php?tid=7075205
保存URL:   https://t66y.com/htm_data/2512/20/7075205.html
URL格式:   ✅ htm_data (正确) - Meta转向跟踪成功！
```

## 技术细节

### Meta转向跟踪的关键步骤

1. **解析HTML文档**
   ```python
   soup = BeautifulSoup(response.text, 'html.parser')
   meta_refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
   ```

2. **提取URL**
   ```python
   # meta content 格式: "2;url=htm_data/2512/20/7075205.html"
   content = meta_refresh['content']
   redirect_url = content.split('url=', 1)[1].strip().rstrip(';')
   ```

3. **构建完整URL**
   ```python
   # 处理相对URL，转为绝对URL
   final_url = urljoin(current_url, redirect_url)
   ```

### 转向跟踪的优势

- ✅ 无需额外的网络请求（meta信息已在第一个响应中）
- ✅ 自动处理HTTP重定向和meta转向
- ✅ 适用于不同的论坛实现方式
- ✅ 日志清晰，便于调试

## 日志示例

### 单帖采集日志
```
📄 单帖采集模式: 开始爬取单个帖子
⏳ 等待 2.4 秒后请求...
✓ 成功获取页面（已跟踪meta转向）: https://t66y.com/read.php?tid=7075205 → https://t66y.com/htm_data/2512/20/7075205.html
📌 使用转向后的最终URL: https://t66y.com/htm_data/2512/20/7075205.html
✓ 文章已保存: 草榴社區 成人文學交流區
```

### 批量采集日志
```
🔄 批量采集模式: 开始爬取版块所有帖子
✓ 成功获取页面: https://t66y.com/htm_data/2511/20/
✓ 从版块提取到 5 个帖子链接
📌 使用重定向后的最终URL: https://t66y.com/htm_data/2512/20/7075205.html
✓ 文章已保存: 帖子标题
```

## 影响范围

### 受影响的功能
- ✅ 单帖采集：URL自动转向
- ✅ 批量采集：每个帖子URL自动转向
- ✅ 所有任务类型（novel, image, mixed）

### 后向兼容性
- ✅ 完全兼容：如果URL已是最终格式，直接使用
- ✅ 不影响已有功能：只是改进URL保存的正确性

## 未来改进

1. **缓存meta转向映射**
   - 记录 `/read.php?tid=X` → `/htm_data/.../X.html` 的映射
   - 避免重复请求获取相同tid的meta信息

2. **并行转向跟踪**
   - 在批量采集中，预先跟踪所有链接的转向URL
   - 提高采集效率

3. **智能链接提取**
   - 从版块页面直接提取html_data格式的链接
   - 避免产生转向页链接

## 验证清单

- ✅ 后端代码更新
- ✅ 爬虫代码更新
- ✅ Docker容器重启
- ✅ 单帖采集测试通过
- ✅ 批量采集测试通过
- ✅ URL格式验证正确
- ✅ 日志输出清晰

---

**修复完成时间：** 2026-01-01 06:50 UTC
**修复状态：** ✅ 已完成，已验证
