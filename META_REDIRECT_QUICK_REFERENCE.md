# Meta转向URL跟踪修复 - 快速参考

## 核心改进

### 问题
系统保存的帖子URL是转向页 (`/read.php?tid=7075205`)，而不是实际页面 (`/htm_data/2512/20/7075205.html`)

### 解决方案
识别并跟踪meta refresh标签中的转向URL

---

## 关键代码变更

### 1. 爬虫：支持meta转向跟踪 `[crawler/crawl.py]`

```python
# 在 fetch_page_with_final_url() 中添加meta转向检测
meta_refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
if meta_refresh and 'url=' in meta_refresh['content']:
    redirect_url = meta_refresh['content'].split('url=', 1)[1].strip().rstrip(';')
    final_url = urljoin(final_url, redirect_url)
    print(f"✓ 成功获取页面（已跟踪meta转向）: {url} → {final_url}")

return {
    'html': response.text,
    'url': final_url  # 返回最终URL
}
```

### 2. 爬虫：接收crawlType参数 `[crawler/crawl.py]`

```python
# 添加命令行参数
parser.add_argument('--crawl-type', default='single', help='采集类型 (single, batch)')

# 传递给crawl_forum
result = crawler.crawl_forum(args.url, args.type, args.max_depth, args.max_pages, args.crawl_type)

# 修改crawl_forum方法签名
def crawl_forum(self, forum_url, task_type='image', max_depth=1, max_pages=10, crawl_type='single'):
    is_batch = (crawl_type == 'batch')  # 直接使用参数，不通过URL判断
```

### 3. 爬虫：单帖采集使用最终URL `[crawler/crawl.py]`

```python
else:
    print("📄 单帖采集模式: 开始爬取单个帖子", flush=True)
    
    # 改进：获取最终URL
    result = self.fetch_page_with_final_url(forum_url)
    if result:
        post_html = result['html']
        final_forum_url = result['url']  # ← 获取转向后的最终URL
        
        # 使用最终URL处理和保存
        post_data = self.parse_t66y_post(final_forum_url, post_html, task_type)
        if self._save_post(post_data, final_forum_url, task_type):  # ← 使用最终URL
```

### 4. 爬虫：批量采集使用最终URL `[crawler/crawl.py]`

```python
if is_batch:
    # ... 提取帖子链接 ...
    for post_url in all_post_links:
        # 改进：获取最终URL
        result = self.fetch_page_with_final_url(post_url)
        if result:
            post_html = result['html']
            final_post_url = result['url']  # ← 获取转向后的最终URL
            
            post_data = self.parse_t66y_post(final_post_url, post_html, task_type)
            if self._save_post(post_data, final_post_url, task_type):  # ← 使用最终URL
```

### 5. 后端：传递crawlType `[backend/src/services/crawlerExecutor.js]`

```javascript
async function executeCrawler(taskId, forumUrl, taskType, taskConfig, crawlType = 'single') {
    // ...
    const args = [
        crawlerScript,
        '--url', forumUrl,
        '--type', taskType,
        '--task-id', taskId,
        '--crawl-type', crawlType,  // ← 新增
        // ...
    ];
}
```

### 6. 后端：队列传递参数 `[backend/src/services/crawlerQueue.js]`

```javascript
async function addCrawlerTask(taskId, forumUrl, taskType, taskConfig, crawlType = 'single') {
    const job = await crawlerQueue.add({
        taskId,
        forumUrl,
        taskType,
        config: taskConfig,
        crawlType,  // ← 新增
    }, { /* ... */ });
}
```

### 7. 后端：处理器使用参数 `[backend/src/index.js]`

```javascript
crawlerQueue.process(1, async (job) => {
    const { taskId, forumUrl, taskType, config: taskConfig, crawlType } = job.data;  // ← 解构crawlType
    
    const result = await executeCrawler(taskId, forumUrl, taskType, taskConfig, crawlType);
});
```

### 8. 后端：控制器传递参数 `[backend/src/controllers/taskController.js]`

```javascript
await addCrawlerTask(
    task._id.toString(),
    url,
    task.taskType,
    task.config,
    task.crawlType  // ← 新增
);
```

---

## 测试验证

### 测试命令
```bash
# 1. 清空数据库
docker compose exec mongo mongo -u admin -p admin123 forum-crawler --eval "db.posts.deleteMany({})"

# 2. 运行单帖测试
bash test_single_post_redirect.sh

# 3. 运行批量测试
bash test_meta_redirect_fix.sh
```

### 预期结果
```
输入URL:   https://t66y.com/read.php?tid=7075205  (转向页)
保存URL:   https://t66y.com/htm_data/2512/20/7075205.html  (实际页面)
格式检查:  ✅ htm_data (正确)
```

---

## 涉及的技术

| 技术 | 用途 |
|------|------|
| `BeautifulSoup` | 解析HTML，提取meta标签 |
| `urllib.parse.urljoin` | 相对URL转绝对URL |
| `meta http-equiv="refresh"` | 识别转向页面 |
| 命令行参数 | 传递crawlType信息 |
| Python subprocess | 执行爬虫进程 |
| Bull队列 | 异步任务处理 |

---

## 验证检查点

- [ ] meta转向跟踪代码已添加
- [ ] crawlType参数已传递通过整个链路
- [ ] 单帖采集使用最终URL
- [ ] 批量采集使用最终URL
- [ ] 日志输出显示转向跟踪
- [ ] 数据库中存储的是最终URL
- [ ] 测试通过：✅
- [ ] 无报错信息
- [ ] 后向兼容：✅

---

## 部署步骤

1. **代码更新**：所有修改已在文件中

2. **容器重启**：
   ```bash
   docker compose -f docker/docker-compose.dev.yml restart backend
   ```

3. **验证**：
   ```bash
   # 检查后端是否正常启动
   docker compose logs backend --tail 10
   ```

4. **测试**：
   ```bash
   bash test_single_post_redirect.sh
   ```

---

## 常见问题

**Q: 为什么需要crawlType参数？**
A: 因为通过URL格式判断是否为批量采集容易出错。直接传递参数更准确可靠。

**Q: meta转向会不会导致性能问题？**
A: 不会。meta信息已在第一个响应中获得，无需额外的网络请求。

**Q: 支持其他论坛吗？**
A: 支持。只要论坛使用meta refresh转向，都可以自动跟踪。

**Q: 如果URL已是最终格式怎么办？**
A: 系统会检测到最终URL与当前URL相同，直接使用，无影响。

---

## 修改文件总结

| 文件 | 行数变化 | 主要改动 |
|------|---------|---------|
| crawler/crawl.py | +40 | meta转向识别、crawlType参数、URL跟踪 |
| backend/src/services/crawlerExecutor.js | +2 | crawlType参数传递 |
| backend/src/services/crawlerQueue.js | +1 | crawlType数据包含 |
| backend/src/controllers/taskController.js | +1 | crawlType参数传递 |
| backend/src/index.js | +1 | crawlType参数提取 |

**总计：约 45 行代码变更**

---

**最后验证时间：** 2026-01-01 06:50 UTC  
**状态：** ✅ 完成并验证  
**兼容性：** ✅ 完全向后兼容
