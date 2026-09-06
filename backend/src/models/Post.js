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
      unique: true,
      sparse: true,
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
postSchema.index({ sourceUrl: 1 });
postSchema.index({ contentHash: 1 });
postSchema.index({ forumLastPostTime: 1 });
postSchema.index({ postType: 1 });
postSchema.index({ createdAt: -1 });

// 复合索引：优化小说列表和搜索查询
postSchema.index({ postType: 1, createdAt: -1 }); // 小说列表按时间排序
postSchema.index({ postType: 1, taskId: 1, createdAt: -1 }); // 按任务筛选小说
postSchema.index({ title: 1 }); // 标题精确/前缀匹配
postSchema.index({ author: 1 }); // 作者精确/前缀匹配

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
