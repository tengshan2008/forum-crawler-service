const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrawlerTask',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'protected'],
      default: 'private',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: String,
    contentHash: {
      type: String,
      description: '内容的 MD5 哈希值，用于检测重复内容',
    },
    forumLastPostTime: {
      type: Date,
      description: '论坛上该帖子最后一条回复的时间戳（用于快速判断是否有更新）',
    },
    postType: {
      type: String,
      enum: ['novel', 'image', 'text'],
      required: true,
    },
    author: String,
    sourceUrl: {
      type: String,
      required: true,
      // 唯一性由 {sourceUrl,userId} 复合唯一索引保证（v2.18.3：去重按用户隔离）
    },
    // 系列名（crazyhome 等分章站点）：同一部小说的多个章节共享该字段，
    // 用于浏览层按系列聚合展示；t66y 等一帖一本的站点此字段为空
    series: {
      type: String,
      trim: true,
    },
    // 章节起始序号（crazyhome 标题中的 "16" 或 "38-51" 取 38），
    // 用于同系列章节排序；无章节号的帖子为空
    chapterNo: {
      type: Number,
    },
    // 系列代表帖标记：每个系列仅一章为 true（章节号最小者），
    // 无系列的单帖（t66y 一帖一本）始终为 true。
    // 列表/搜索仅查询 isSeriesHead=true 的文档，实现书级分页，避免跨页重复。
    isSeriesHead: {
      type: Boolean,
      default: true,
    },
    media: [
      {
        url: String,
        description: String,
      },
    ],
    metadata: mongoose.Schema.Types.Mixed,
    likes: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    replies: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'archived', 'flagged'],
      default: 'active',
    },
    tags: [String],
    crawledAt: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

postSchema.index({ taskId: 1 });
// v2.18.3：去重按用户隔离——同一 URL/内容不同用户各存一份（迁移脚本见 src/scripts/migratePostDedupIndexes.js）
postSchema.index({ sourceUrl: 1, userId: 1 }, { unique: true });
postSchema.index({ userId: 1, contentHash: 1 });
postSchema.index({ forumLastPostTime: 1 });
postSchema.index({ postType: 1 });
postSchema.index({ createdAt: -1 });

// 复合索引：优化小说列表和搜索查询
postSchema.index({ postType: 1, createdAt: -1 }); // 小说列表按时间排序
postSchema.index({ postType: 1, taskId: 1, createdAt: -1 }); // 按任务筛选小说
postSchema.index({ userId: 1, postType: 1, createdAt: -1 }); // 按用户可见范围筛选/计数
postSchema.index({ visibility: 1, postType: 1, createdAt: -1 }); // 可见性 $or 的 public 分支（v2.13.0）
postSchema.index({ title: 1 }); // 标题精确/前缀匹配
postSchema.index({ author: 1 }); // 作者精确/前缀匹配
// 系列聚合索引：crazyhome 等分章站点按 series 分组、按 chapterNo 排序
postSchema.index({ series: 1, chapterNo: 1 });
postSchema.index({ series: 1 });
// 书级列表索引：仅 isSeriesHead=true 的文档参与小说列表/搜索的分页与计数
postSchema.index({ isSeriesHead: 1, postType: 1, createdAt: -1 });

// 文本索引：支持全文搜索（比正则表达式快很多）
// 注意：每个集合只能有一个文本索引，包含多个字段
postSchema.index(
  { title: 'text', author: 'text' },
  {
    weights: { title: 10, author: 5 }, // 标题权重更高
    name: 'post_text_search_index',
    default_language: 'none', // 禁用词干分析，适合中文
  }
);

module.exports = mongoose.model('Post', postSchema);
