# 批量采集链接提取优化

## 问题发现

在观察论坛页面元素时，发现批量采集获取的链接存在不一致的问题：

### 论坛HTML结构
```html
<tr class="tr3 t_one tac">
    <td>
        <span class="s3">14</span>
    </td>
    <td class="tal">
        [現代奇幻]
        <h3>
            <a href="/htm_data/2512/20/7083270.html" target="_blank" id="t7083270">
                教师的堕落
            </a>
        </h3>
    </td>
    <td>
        <a href="/thread0806.php?fid=20&search=534067" class="bl">罗恩夏</a>
        <div class="f12"><span class="s3">19 小時</span></div>
    </td>
    <td>2</td>
    <td>
        <a href="/read.php?tid=7083270&page=e&fpage=1#a" class="f10">01-01 13:22</a><br>stemp
    </td>
</tr>
```

### 问题分析

**旧逻辑的问题：**
1. 通用扫描所有 `<a>` 标签
2. 可能获取到最后更新时间上的链接：`/read.php?tid=7083270&page=e&fpage=1#a`
3. 这个链接需要经过meta redirect才能到达实际页面
4. 与单贴采集的逻辑不一致

**为什么这是个问题：**
- 不必要的重定向跟踪增加复杂性
- 两种采集模式使用不同的链接格式
- 容易产生URL格式混乱

---

## 解决方案

### 优化策略

**优先级顺序：**
1. **第一优先：** 直接从 `<h3><a>` 中提取帖子入口链接
   - 格式：`/htm_data/xxxx/yy/zzzzzzzz.html`
   - 优点：直接访问，无需重定向
   - 与单贴采集保持一致

2. **第二优先：** 扫描其他 `/read.php?tid=` 链接（备选方案）
   - 格式：`/read.php?tid=123456`
   - 用途：处理HTML结构异常变化的情况
   - 使用：fetch_page跟踪meta redirect

### 代码修改

文件：`crawler/crawl.py`

#### 新的 `extract_post_links_from_section()` 方法

```python
def extract_post_links_from_section(self, html):
    """从版块页面中提取所有帖子链接（优先提取h3中的帖子入口链接）"""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        post_links = []
        
        # 优先策略：查找 <h3><a> 中的帖子入口链接
        h3_links = soup.find_all('h3')
        
        for h3 in h3_links:
            a_tag = h3.find('a', href=True)
            if a_tag:
                href = a_tag.get('href', '')
                # 帖子入口链接格式：/htm_data/xxxx/yy/zzzzzzzz.html
                if href and (href.startswith('/htm_data/') or href.startswith('htm_data/')):
                    full_url = urljoin('https://t66y.com/', href)
                    tid = self.extract_tid_from_url(full_url)
                    if tid:
                        post_links.append(full_url)
                        print(f"  ✓ 从<h3>中提取帖子链接: {full_url}", flush=True)
        
        # 备选方案：如果<h3>中没有找到足够的链接，再扫描其他<a>标签
        if len(post_links) < 5:
            print(f"  ℹ <h3>中仅找到{len(post_links)}个链接，扫描其他位置...", flush=True)
            link_elements = soup.find_all('a', href=True)
            
            for link in link_elements:
                href = link.get('href', '')
                if not href:
                    continue
                
                full_url = urljoin('https://t66y.com/', href)
                
                # 查找 /read.php?tid= 格式的转向链接
                if href.startswith('/read.php?tid='):
                    tid = self.extract_tid_from_url(full_url)
                    if tid:
                        # 检查是否已经有对应的htm_data版本
                        already_exists = any(f'/{tid}.' in link for link in post_links)
                        if not already_exists:
                            post_links.append(full_url)
                elif (href.startswith('/htm_data/') or href.startswith('htm_data/')):
                    tid = self.extract_tid_from_url(full_url)
                    if tid:
                        # 避免重复
                        if full_url not in post_links:
                            post_links.append(full_url)
        
        # 去重
        unique_links = list(set(post_links))
        print(f"✓ 从版块提取到 {len(unique_links)} 个帖子链接（直接获取htm_data入口）", flush=True)
        return unique_links
```

---

## 改进效果

### 对比表格

| 方面 | 旧逻辑 | 新逻辑 |
|------|--------|--------|
| **链接来源** | 全量扫描所有 `<a>` 标签 | 优先 `<h3>` 中的入口链接 |
| **主要链接格式** | `/read.php?tid=` 转向 | `/htm_data/` 直接页面 |
| **重定向处理** | 每个链接都需要检测meta转向 | 大部分链接无需重定向 |
| **与单贴一致性** | 否，使用转向链接 | 是，使用直接链接 |
| **日志显示** | "从版块提取到X个链接" | "从版块提取到X个链接（直接获取htm_data入口）" |
| **异常处理** | 无备选方案 | 有备选方案（<5个时扫描其他位置） |

### 示例输出对比

**旧逻辑日志：**
```
✓ 从版块提取到 20 个帖子链接
🔍 正在处理帖子 1/20: https://t66y.com/read.php?tid=7083270&...
📌 使用重定向后的最终URL: https://t66y.com/htm_data/2512/20/7083270.html
```

**新逻辑日志：**
```
✓ 从<h3>中提取帖子链接: https://t66y.com/htm_data/2512/20/7083270.html
✓ 从<h3>中提取帖子链接: https://t66y.com/htm_data/2512/20/7083291.html
...
✓ 从版块提取到 20 个帖子链接（直接获取htm_data入口）
🔍 正在处理帖子 1/20: https://t66y.com/htm_data/2512/20/7083270.html
```

---

## 技术影响

### 性能提升
- **减少重定向检测**：不必要的meta refresh解析被消除
- **更快的处理速度**：直接链接无需验证转向
- **更清晰的日志**：减少重定向信息的输出

### 代码一致性
- **统一链接格式**：批量采集和单贴采集都使用 `htm_data` 格式
- **简化逻辑**：不需要区别对待不同格式的链接
- **便于维护**：单一的链接处理方式

### 容错性
- **备选方案**：如果HTML结构变化，可自动降级到扫描其他链接
- **自动检测**：当 `<h3>` 中的链接不足时，自动扫描其他位置
- **兼容多种结构**：可处理论坛页面HTML变化

---

## 验证步骤

### 1. 观察日志输出

运行批量采集任务后，查看是否显示：

```
✓ 从<h3>中提取帖子链接: https://t66y.com/htm_data/2512/20/xxxxxxx.html
✓ 从版块提取到 N 个帖子链接（直接获取htm_data入口）
```

### 2. 确认链接格式

检查处理的帖子URL是否都是 `htm_data` 格式：
```
✓ 正在处理帖子 1/20: https://t66y.com/htm_data/2512/20/7083270.html
✓ 正在处理帖子 2/20: https://t66y.com/htm_data/2512/20/7083291.html
```

### 3. 验证一致性

对比批量采集和单贴采集，确保：
- 都使用 `htm_data` 格式链接
- 都通过 `fetch_page_with_final_url()` 处理
- 都保存最终URL（如果有meta转向）

---

## 相关改进

### 与逐页采集的配合
- 链接提取优化与逐页采集机制独立
- 可同时部署，无冲突
- 共同提升批量采集的稳定性

### 与meta转向跟踪的配合
- 虽然优先使用直接链接，但仍保留meta转向检测
- 如果直接链接内部有meta转向，仍会被正确处理
- 提供双重保险

---

## 总结

**关键改进：**
- ✅ 优先提取 `<h3>` 中的帖子入口链接
- ✅ 使用 `htm_data` 格式的直接链接
- ✅ 与单贴采集逻辑保持一致
- ✅ 减少不必要的重定向处理
- ✅ 提供备选方案处理异常情况

**部署状态：** ✅ 代码已修改，待后端重启

**验证方法：** 查看日志中是否显示"从<h3>中提取帖子链接"和"直接获取htm_data入口"

---

**更新时间：** 2026-01-01  
**文档状态：** 完成
