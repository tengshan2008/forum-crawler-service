# 批量采集转向页问题修复方案

## 问题描述

在批量采集时，记录的帖子URL与实际的帖子首页URL不同：

**问题表现：**
- 记录的URL: `https://t66y.com/read.php?tid=7072437&page=e&fpage=1#a` (转向页)
- 实际URL: `https://t66y.com/htm_data/2512/20/7072437.html` (实际帖子首页)

**根本原因：**
1. 从版块页面提取帖子链接时，获取到的是 `/read.php?tid=XXX` 格式的URL
2. 这类URL是转向链接，会被网站重定向到真实的帖子页面
3. 在批量采集时，虽然请求了这个URL，但没有跟踪重定向后的最终URL
4. 结果就是数据库中记录的 sourceUrl 是转向页而不是实际的帖子页面

## 解决方案

### 1. 添加新的获取页面方法

在 `fetch_page()` 基础上，创建 `fetch_page_with_final_url()` 方法，返回重定向后的最终URL：

```python
def fetch_page_with_final_url(self, url, max_retries=3, delay_range=(2, 4)):
    """获取页面内容和最终URL（跟踪重定向）"""
    # ... 返回 {'html': response.text, 'url': final_url}
```

### 2. 改进 fetch_page() 方法

修改 `fetch_page()` 使其调用 `fetch_page_with_final_url()` 的 html 部分，保持向后兼容：

```python
def fetch_page(self, url, max_retries=3, delay_range=(2, 4)):
    """获取页面内容 - 带重试和反爬虫"""
    result = self.fetch_page_with_final_url(url, max_retries, delay_range)
    return result['html'] if result else None
```

### 3. 修改批量采集逻辑

在批量采集处理每个帖子时，使用 `fetch_page_with_final_url()` 来获取最终URL：

```python
# 之前的做法
post_html = self.fetch_page(post_url)

# 改进后的做法
result = self.fetch_page_with_final_url(post_url)
post_html = result['html']
final_post_url = result['url']  # 获取重定向后的最终URL

# 使用最终URL来解析和保存帖子
post_data = self.parse_t66y_post(final_post_url, post_html, task_type)
self._save_post(post_data, final_post_url, task_type)
```

## 技术细节

### URL 重定向过程

```
用户提取的链接: https://t66y.com/read.php?tid=7072437
                        ↓
服务器302重定向到: https://t66y.com/htm_data/2512/20/7072437.html
                        ↓
requests 库自动跟踪 (allow_redirects=True)
                        ↓
response.url 包含最终URL: https://t66y.com/htm_data/2512/20/7072437.html
```

### 关键改进点

1. **捕获最终URL** - `response.url` 包含经过所有重定向后的最终URL
2. **单帖vs批量** - 单帖采集没有这个问题，因为用户一般直接输入最终URL
3. **向后兼容** - 保持 `fetch_page()` 的原有接口，新增 `fetch_page_with_final_url()` 方法
4. **日志输出** - 当检测到重定向时，输出日志帮助诊断

## 修改文件

**文件:** `crawler/crawl.py`

**改动摘要:**
- 行 86-140: 新增 `fetch_page_with_final_url()` 方法，修改 `fetch_page()` 方法
- 行 202-256: 改进 `extract_post_links_from_section()` 方法，添加重定向检测日志
- 行 796-818: 修改批量采集逻辑，使用 `fetch_page_with_final_url()` 跟踪最终URL

## 日志示例

**改进前：**
```
🔍 正在处理帖子 1/10: https://t66y.com/read.php?tid=7072437
✓ 成功获取页面: https://t66y.com/read.php?tid=7072437
⚠ 未能找到任何内容容器，检查 HTML 结构
```

**改进后：**
```
🔍 正在处理帖子 1/10: https://t66y.com/read.php?tid=7072437
✓ 成功获取页面（已跟踪重定向）: https://t66y.com/read.php?tid=7072437 → https://t66y.com/htm_data/2512/20/7072437.html
📌 使用重定向后的最终URL: https://t66y.com/htm_data/2512/20/7072437.html
✓ 使用选择器: div.tpc_content (找到 3 个容器)
  ✓ 楼层 1: 提取 14733 字符
✓ 文章已保存: [标题]
```

## 测试验证

### 测试用例

1. **批量采集版块**
   - 输入: 版块URL（如 `https://t66y.com/htm_data/2511/20/index.php?page=1`）
   - 预期: sourceUrl 应该是 htm_data 格式的最终URL
   - 验证: 查看数据库中保存的帖子的 sourceUrl 字段

2. **单帖采集**
   - 预期: 不受影响（单帖采集通常直接输入最终URL）
   - 验证: 确保单帖采集功能仍正常

### 验证命令

```bash
# 查看最近保存的帖子的 sourceUrl
db.posts.find({}, {sourceUrl: 1, title: 1}).limit(5)

# 应该显示 htm_data 格式的URL，而不是 read.php 格式
# 正确: https://t66y.com/htm_data/2512/20/7072437.html
# 错误: https://t66y.com/read.php?tid=7072437
```

## 性能影响

- **增加的网络请求:** 无（重定向由 requests 库自动处理）
- **增加的处理时间:** 无显著增加（只是额外读取 response.url）
- **增加的日志输出:** 轻微增加（检测到重定向时输出一行日志）

## 兼容性

- ✅ 向后兼容 - `fetch_page()` 接口保持不变
- ✅ 支持所有爬虫模式 - 批量采集、单帖采集、定时采集
- ✅ 支持多个论坛 - t66y、其他重定向的论坛

## 后续优化

1. **智能URL识别** - 检测到转向URL时，自动转换为 htm_data 格式（如果可能）
2. **缓存最终URL** - 避免重复请求相同的转向URL
3. **URL规范化** - 统一URL格式存储到数据库

---

**实现日期:** 2026-01-01  
**修复版本:** 3.1 - 转向页重定向跟踪  
**状态:** ✅ 已部署
