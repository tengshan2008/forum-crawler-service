# 置顶规则帖子过滤说明

## 功能说明

爬虫现在会自动跳过论坛版块第一页的置顶规则帖子，避免采集不必要的内容。

## 黑名单中的帖子

目前黑名单中包含以下置顶规则帖子（帖子ID）：

| 帖子ID | 链接 | 描述 |
|--------|------|------|
| 5877 | https://t66y.com/htm_data/0612/9/5877.html | 置顶规则帖 |
| 932276 | https://t66y.com/htm_data/2010/20/932276.html | 置顶规则帖 |
| 131469 | https://t66y.com/htm_data/0805/20/131469.html | 置顶规则帖 |
| 183193 | https://t66y.com/htm_data/0810/20/183193.html | 置顶规则帖 |
| 46242 | https://t66y.com/htm_data/0707/20/46242.html | 置顶规则帖 |

## 代码位置

黑名单定义在 `crawler/crawl.py` 中的 `ForumCrawler` 类：

```python
class ForumCrawler:
    """真实的论坛爬虫实现"""
    
    # 置顶规则帖子的黑名单ID（跳过采集）
    PINNED_POST_BLACKLIST = {
        '5877',
        '932276',
        '131469',
        '183193',
        '46242',
    }
```

## 工作原理

### 1. 自动过滤

在提取版块页面的帖子链接时，爬虫会检查每个帖子的ID：

```
⏭ 跳过置顶规则帖子: https://t66y.com/htm_data/0612/9/5877.html
```

### 2. 过滤点

过滤发生在三个地方：

- **从 H3 标签提取链接时**：优先提取的帖子入口链接
- **从其他 A 标签提取链接时**：备选方案
- **处理转向链接时**（`/read.php?tid=`）：跟踪重定向前过滤

## 动态维护黑名单

### 添加新的置顶帖子

如果发现新的置顶规则帖子，可以通过以下方式添加：

#### 方法 1：直接修改代码

编辑 `crawler/crawl.py`，在 `PINNED_POST_BLACKLIST` 中添加新的帖子ID：

```python
PINNED_POST_BLACKLIST = {
    '5877',
    '932276',
    '131469',
    '183193',
    '46242',
    'NEW_POST_ID',  # 添加新的帖子ID
}
```

#### 方法 2：通过爬虫实例动态添加（程序运行时）

```python
# 在爬虫实例初始化后添加
crawler = ForumCrawler(task_id, mongodb_uri)
crawler.add_to_blacklist('NEW_POST_ID')
```

### 移除或修改黑名单

```python
# 移除帖子
crawler.remove_from_blacklist('5877')

# 检查帖子是否在黑名单中
if crawler.is_pinned_post('5877'):
    print("该帖子在黑名单中")
```

## 日志输出示例

运行爬虫时，跳过置顶帖子会产生以下日志：

```
✓ 从版块提取到 45 个帖子链接（直接获取htm_data入口）
  ✓ 从<h3>中提取帖子链接: https://t66y.com/htm_data/2024/8/123456.html
  ⏭ 跳过置顶规则帖子: https://t66y.com/htm_data/0612/9/5877.html
  ✓ 从<h3>中提取帖子链接: https://t66y.com/htm_data/2024/8/789012.html
```

## 常见问题

### Q: 如何添加更多置顶帖子到黑名单？

A: 找到帖子的ID（tid），然后：
1. 编辑 `crawler/crawl.py` 中的 `PINNED_POST_BLACKLIST`
2. 或在程序运行时调用 `crawler.add_to_blacklist(post_id)`

### Q: 黑名单如何同步到不同的爬虫实例？

A: 目前黑名单是硬编码在代码中的。如果需要动态管理，可以：
- 将黑名单存储在数据库中
- 在爬虫初始化时从数据库加载
- 提供管理 API 来修改黑名单

### Q: 如何验证黑名单是否生效？

A: 查看爬虫日志中是否出现 `⏭ 跳过置顶规则帖子` 的信息。

## 相关文件

- 黑名单定义：`crawler/crawl.py` （类属性 `PINNED_POST_BLACKLIST`）
- 过滤逻辑：`crawler/crawl.py` 中的 `extract_post_links_from_section()` 方法
- 管理方法：`crawler/crawl.py` 中的 `is_pinned_post()`、`add_to_blacklist()`、`remove_from_blacklist()` 方法
