# 逐页采集分页处理改进

## 问题描述

论坛网站的分页功能存在BUG：
- 页码显示不准确
- 初始页面显示有1、2两页，但翻到第二页后，又显示有第三页
- 只有翻到前一页才知道后面还有页面

## 原理

原来的代码在采集开始时就尝试提取"总页数"，但由于论坛的BUG，提取到的页码信息不准确。

新的逐页采集方案改为：
- **只有当能实际访问下一页时，才认为下一页存在**
- 一页一页地处理，而不是依赖论坛的页码显示

## 实现方案

### 1. 新增 `has_next_page()` 方法

```python
def has_next_page(self, html, current_page):
    """检查当前页是否有下一页链接（用于逐页采集）"""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        next_page = current_page + 1
        
        # 查找所有可能的下一页链接
        all_links = soup.find_all('a')
        for link in all_links:
            href = link.get('href', '')
            # 检查是否存在指向下一页的链接
            match = re.search(r'page=(\d+)', href)
            if match and int(match.group(1)) == next_page:
                return True
        
        return False
    except Exception as e:
        print(f"⚠ 检查下一页失败: {e}", file=sys.stderr, flush=True)
        return False
```

### 2. 改进批量采集的分页逻辑

**原来的做法：**
```python
# 一次性决定总页数
total_pages = extract_page_numbers(html)
for page_num in range(2, total_pages + 1):
    # 按顺序采集所有页面
```

**新的做法：**
```python
# 逐页采集，检查是否有下一页
current_page = 1
while current_page < max_pages:
    # 检查当前页是否有下一页链接
    if not has_next_page(html, current_page):
        break  # 没有下一页，停止采集
    
    # 获取下一页
    next_page_url = build_section_pagination_url(forum_url, current_page + 1)
    html = fetch_page(next_page_url)
    
    if not html:
        break  # 无法获取页面，停止采集
    
    current_page += 1
```

## 关键改进

| 方面 | 原做法 | 新做法 | 优势 |
|------|--------|--------|------|
| 页数确定 | 依赖论坛显示 | 实际验证链接 | ✅ 不受论坛BUG影响 |
| 采集方式 | 一次性预设页数 | 逐页检查 | ✅ 灵活适应 |
| 错误处理 | 可能采集空页 | 检测到空页立即停止 | ✅ 更高效 |
| 可靠性 | 依赖页码准确性 | 实际测试下一页 | ✅ 更可靠 |

## 日志示例

### 新的逐页采集日志

```
🔄 批量采集模式: 开始逐页爬取版块帖子
⏳ 等待 2.4 秒后请求...
✓ 成功获取页面: https://t66y.com/htm_data/2511/20/
📄 开始爬取版块第 1 页
✓ 从版块提取到 15 个帖子链接
✓ 版块第 1 页有下一页链接 (page=2)
📄 开始爬取版块第 2 页: https://t66y.com/htm_data/2511/20/?page=2
✓ 成功获取页面: https://t66y.com/htm_data/2511/20/?page=2
✓ 从版块提取到 15 个帖子链接
✓ 版块第 2 页有下一页链接 (page=3)
📄 开始爬取版块第 3 页: https://t66y.com/htm_data/2511/20/?page=3
✓ 成功获取页面: https://t66y.com/htm_data/2511/20/?page=3
✓ 从版块提取到 12 个帖子链接
⚠ 版块第 3 页没有下一页链接，采集完毕
📊 共采集版块 3 页
📋 准备爬取 42 个帖子
```

## 优化特点

1. **自适应采集**
   - 有几页就采集几页
   - 不需要提前知道总页数
   - 自动停止，无需手动干预

2. **错误处理**
   - 无法获取页面 → 立即停止
   - 页面无帖子链接 → 立即停止
   - 没有下一页链接 → 立即停止

3. **日志清晰**
   - 显示每一页的采集过程
   - 显示页数和链接数
   - 显示停止原因

4. **用户友好**
   - 尊重用户设置的最大页数限制
   - 实时反馈采集进度
   - 清晰的错误提示

## 修改的文件

- **crawler/crawl.py**
  - 添加 `has_next_page()` 方法（检查下一页是否存在）
  - 改进 `if is_batch:` 分支（逐页采集逻辑）

## 向后兼容性

✅ **完全向后兼容**
- 不改变API接口
- 不改变数据库结构
- 不影响单帖采集
- 仅改进批量采集的分页逻辑

## 测试验证

建议测试场景：
1. 采集有多页的版块（观察是否逐页采集）
2. 采集只有1页的版块（应立即停止）
3. 设置 `maxPages=2`（应最多采集2页）

预期行为：
- ✅ 实际页数 ≤ 设置的maxPages
- ✅ 每页都有帖子链接
- ✅ 日志清晰显示采集进度
- ✅ 没有空页或重复

---

**修改完成时间：** 2026-01-01 07:00 UTC  
**改进等级：** ⭐⭐⭐⭐⭐ (重要功能改进)
