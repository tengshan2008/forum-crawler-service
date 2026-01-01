# 重复帖子处理改进方案

## 问题分析

### 当前问题
1. **前端无法区分原因**：任务状态都是"completed"，无法区分是因为"重复跳过"还是"正常采集完成"
2. **忽略内容更新**：如果帖子地址相同但内容已更新，直接跳过，会导致数据过期
3. **统计数据不清晰**：crawledItems 和 skipped 的关系不明确

### 影响场景
- 批量采集中有重复帖子：显示完成，但前端看不出跳过了多少
- 已采集帖子被更新：用户不知道现在的版本是旧的
- 任务统计：`crawledItems` 不包含 `skipped`，导致进度理解困惑

## 解决方案

### 1. 添加跳过原因标记（Backend Model 修改）

在 Task.js 中添加 `skippedItems` 和 `skipReasons`：

```javascript
// Task.js
skippedItems: {
  type: Number,
  default: 0,
},
skipReasons: [{
  url: String,
  reason: {
    type: String,
    enum: ['duplicate', 'update_check_failed', 'parse_failed', 'other'],
    default: 'other'
  },
  message: String,
  timestamp: Date,
}],
updateCheckEnabled: {
  type: Boolean,
  default: false,  // 可选：是否检查更新
  description: '是否在爬取前检查已存在帖子是否有更新'
},
```

### 2. 改进爬虫检查逻辑（Crawler 修改）

```python
# crawl.py - 改进 _is_post_exist 方法

def _is_post_exist(self, post_url, check_update=False):
    """
    检查帖子是否已经存在于数据库中
    
    Args:
        post_url: 帖子URL
        check_update: 是否检查内容更新
        
    Returns:
        {
            'exists': bool,
            'reason': 'duplicate' | 'needs_update' | None,
            'post_data': existing_post if exists else None
        }
    """
    try:
        existing_post = self.posts_collection.find_one({'sourceUrl': post_url})
        
        if not existing_post:
            return {
                'exists': False,
                'reason': None,
                'post_data': None
            }
        
        # 如果不需要检查更新，直接返回存在
        if not check_update:
            return {
                'exists': True,
                'reason': 'duplicate',
                'post_data': existing_post
            }
        
        # 检查更新：比较采集时间和当前时间（超过7天则检查）
        last_crawl = existing_post.get('crawledAt')
        if last_crawl:
            from datetime import datetime, timedelta
            age_days = (datetime.now() - last_crawl).days
            if age_days > 7:  # 7天后检查更新
                return {
                    'exists': True,
                    'reason': 'needs_update',  # 需要更新
                    'post_data': existing_post
                }
        
        return {
            'exists': True,
            'reason': 'duplicate',
            'post_data': existing_post
        }
    
    except Exception as e:
        print(f"⚠ 检查帖子是否存在失败: {e}", file=sys.stderr, flush=True)
        return {
            'exists': False,
            'reason': None,
            'post_data': None
        }
```

### 3. 改进爬虫返回信息（Crawler 修改）

爬虫返回结果增加详细信息：

```python
return {
    'success': True,
    'task_id': self.task_id,
    'total_posts': total_posts,
    'crawled_posts': crawled_count,
    'skipped_posts': skipped_count,
    'skip_details': [  # 新增：跳过详情
        {
            'url': 'xxx',
            'reason': 'duplicate',  # 或 'needs_update', 'parse_failed' 等
            'message': '帖子已存在'
        },
        ...
    ],
    'message': '爬虫任务完成'
}
```

### 4. 改进后端任务更新逻辑（Backend 修改）

在 crawlerExecutor.js 中解析爬虫返回的 skip_details：

```javascript
// crawlerExecutor.js
if (result.skip_details && result.skip_details.length > 0) {
    const skipReasons = result.skip_details.map(item => ({
        url: item.url,
        reason: item.reason,
        message: item.message,
        timestamp: new Date(),
    }));
    
    await Task.findByIdAndUpdate(
        taskId,
        {
            skippedItems: result.skipped_posts || 0,
            skipReasons: skipReasons,  // 保存跳过原因
        }
    );
}
```

### 5. 改进前端显示（Frontend 修改）

在任务详情和浏览页面显示跳过原因：

```javascript
// TaskList.js 或任务详情组件
<Statistic title="已爬取" value={task.crawledItems} />
<Statistic title="已跳过" value={task.skippedItems} />
<Statistic title="失败" value={task.failedItems} />

// 显示跳过原因
{task.skipReasons && task.skipReasons.length > 0 && (
    <div className="skip-reasons">
        <h4>跳过的帖子原因：</h4>
        {task.skipReasons.map((reason, idx) => (
            <div key={idx} className={`skip-reason skip-reason-${reason.reason}`}>
                <span className="reason-badge">{reason.reason}</span>
                <span>{reason.message}</span>
            </div>
        ))}
    </div>
)}
```

## 实现步骤

### Phase 1: 数据模型更新
- [ ] 更新 Task.js Model - 添加 skippedItems, skipReasons 字段
- [ ] 迁移现有任务数据（可选）

### Phase 2: 爬虫逻辑改进
- [ ] 改进 `_is_post_exist()` 方法 - 返回详细的存在状态
- [ ] 修改批量采集循环 - 记录跳过原因
- [ ] 修改单贴采集逻辑 - 同样记录跳过原因
- [ ] 改进返回结果 - 包含 skip_details

### Phase 3: 后端集成
- [ ] 更新 crawlerExecutor.js - 解析爬虫返回的跳过原因
- [ ] 更新任务状态更新逻辑 - 保存跳过信息
- [ ] 添加日志记录

### Phase 4: 前端改进（可选，第二阶段）
- [ ] 更新 TaskList 组件 - 显示跳过统计
- [ ] 添加跳过原因详情面板
- [ ] 改进 CSS 样式 - 视觉区分

## 优先级

### 必须优先实现（MVP）
1. 爬虫改进 - 返回跳过原因
2. 后端模型 - 保存跳过原因
3. crawlerExecutor.js - 解析并保存

### 可以延后实现
1. 前端显示优化
2. 内容更新检查功能

## 相关文件
- `/workspaces/forum-crawler-service/backend/src/models/Task.js`
- `/workspaces/forum-crawler-service/crawler/crawl.py` - `_is_post_exist()` 方法
- `/workspaces/forum-crawler-service/crawler/crawl.py` - `crawl_forum()` 方法
- `/workspaces/forum-crawler-service/backend/src/services/crawlerExecutor.js`
- `/workspaces/forum-crawler-service/frontend/src/pages/TaskList.js` (optional)
