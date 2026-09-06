# 内容哈希去重实现说明

## 问题背景

之前的去重机制只检查 URL 是否存在：
- ❌ 同一个 URL 的帖子被更新时，仍然被跳过（无法采集新内容）
- ❌ 不同 URL 但内容相同的帖子都被保存（造成内容重复）

## 解决方案

实现基于**内容哈希（MD5）**的去重机制，取代纯 URL 的去重方式。

## 技术实现

### 1. 数据模型变更

**文件**: `/backend/src/models/Post.js`

添加了 `contentHash` 字段用于存储内容的 MD5 哈希值：
```javascript
contentHash: {
    type: String,
    description: 'MD5 hash of post content for content-based deduplication'
}
```

数据库索引也已添加对 `contentHash` 的支持，加快去重检查速度。

### 2. 爬虫逻辑改进

**文件**: `/crawler/crawl.py`

#### 新增方法

```python
def _calculate_content_hash(self, content):
    """计算内容的 MD5 哈希值用于去重"""
    # 规范化内容（去除空白，统一换行）
    # 返回 MD5 哈希值
```

#### 修改的方法

**_is_post_exist(post_url, content_hash=None)**
- 参数新增 `content_hash` 参数
- 检查逻辑更新为三层判断：

```
1. 如果提供了 content_hash：
   - 先检查是否有相同内容的帖子（不同URL）
   - 返回 'content_duplicate' 原因
   
2. 检查 URL 是否存在：
   - 如果 URL 存在且哈希相同 → 'duplicate'（完全重复）
   - 如果 URL 存在且哈希不同 → shouldUpdate=True（内容已更新）
   - 如果 URL 存在但无哈希信息 → 'same_url'（无法判断）
   
3. 都不存在 → 允许保存为新帖子
```

**_save_post(post_data, forum_url, task_type)**
- 保存前计算 `contentHash`
- 将 `contentHash` 保存到数据库

### 3. 采集流程调整

采集时的新逻辑：

```
批量采集模式：
  for each post_url:
    1. 获取帖子内容
    2. 计算内容哈希
    3. 调用 _is_post_exist(url, hash) 检查重复
    4. 如果不重复，保存帖子（包括 contentHash）
    5. 如果 shouldUpdate=True，覆盖更新

单帖采集模式：
  1. 获取帖子内容
  2. 计算内容哈希
  3. 调用 _is_post_exist(url, hash) 检查
  4. 根据结果决定是否保存或跳过
```

## 跳过原因说明

系统现在会区分不同类型的跳过原因：

| 原因 | 说明 | 处理方式 |
|------|------|--------|
| `duplicate` | 相同 URL 且相同内容 | 跳过 |
| `content_duplicate` | 不同 URL 但内容相同 | 跳过 |
| `same_url` | 相同 URL 但无法验证内容 | 跳过 |
| `network_error` | 网络错误无法获取 | 跳过 |
| `parse_failed` | 解析帖子失败 | 跳过 |
| `content_updated` | 相同 URL 但内容已更新 | **覆盖更新** |

## 数据迁移

### 问题
数据库中的现有帖子都没有 `contentHash` 字段。

### 解决
提供迁移脚本 `/crawler/migrate_content_hash.py`

运行迁移：
```bash
cd /workspaces/forum-crawler-service/crawler
python3 migrate_content_hash.py
```

脚本会：
1. 连接到 MongoDB
2. 为所有没有 `contentHash` 的帖子计算 MD5 哈希
3. 检测重复内容并输出报告
4. 为所有帖子添加 `contentHash` 字段
5. 输出迁移统计信息

## 性能考虑

1. **哈希计算成本**
   - MD5 计算很快（通常 <1ms）
   - 仅在保存前计算一次

2. **数据库查询优化**
   - `contentHash` 字段已建立索引
   - 快速检查内容重复

3. **采集时间增加**
   - 需要完整解析帖子后才能计算哈希
   - 无法进行快速的 URL 预检查
   - 但可以更准确地检测重复和更新

## 使用效果

### 场景 1: 同一 URL 内容更新
- **之前**: 跳过，无法采集新内容 ❌
- **之后**: 检测到内容更新，覆盖保存 ✓

### 场景 2: 不同 URL 相同内容
- **之前**: 都保存，造成重复 ❌
- **之后**: 检测为内容重复，只保存一个 ✓

### 场景 3: 完全新的帖子
- **之前**: 正常保存 ✓
- **之后**: 正常保存（不变） ✓

## 前端显示

任务列表现在会显示详细的跳过原因：

```
采集统计
总数: 10
成功: 7
跳过: 2
  ├─ 相同内容已存在 (content_duplicate) - 1个
  └─ 帖子已存在 (duplicate) - 1个
失败: 1
```

## 常见问题

### Q: 为什么采集时间变长了？
A: 需要完整下载和解析帖子才能计算内容哈希。相比于快速的 URL 检查，这提供了更准确的重复检测。

### Q: 旧的帖子怎么办？
A: 运行迁移脚本 `migrate_content_hash.py` 为所有现有帖子添加 `contentHash` 字段。

### Q: 能否只按 URL 去重？
A: 可以，但这样会回到之前"同 URL 内容更新无法采集"的问题。内容哈希去重提供了更好的灵活性。

### Q: 内容变化会导致不同的哈希吗？
A: 是的。即使只改变一个字符，MD5 哈希也会完全不同。这是特性，不是 bug。

### Q: 如何处理标题更新但内容不变的情况？
A: 当前只检查内容哈希，不检查标题。如果需要，可以修改 `_calculate_content_hash()` 方法。
