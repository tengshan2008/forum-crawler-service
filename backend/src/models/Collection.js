const mongoose = require('mongoose');

const CollectionSchema = new mongoose.Schema(
  {
    // 收藏夹名称
    name: {
      type: String,
      required: true,
      trim: true,
    },
    
    // 收藏夹描述
    description: {
      type: String,
      default: '',
    },
    
    // 封面图片URL
    coverImage: {
      type: String,
      default: null,
    },
    
    // 包含的Post ID数组
    items: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Post',
      default: [],
    },
    
    // 项目计数（冗余字段，用于快速查询）
    itemCount: {
      type: Number,
      default: 0,
    },
    
    // 是否公开
    isPublic: {
      type: Boolean,
      default: false,
    },
    
    // 标签
    tags: {
      type: [String],
      default: [],
    },
    
    // 所有者（预留用户认证功能）
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    // 创建时间
    createdAt: {
      type: Date,
      default: Date.now,
    },
    
    // 更新时间
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// 为 tags 字段创建索引，便于快速查询
CollectionSchema.index({ tags: 1 });
CollectionSchema.index({ isPublic: 1 });
CollectionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Collection', CollectionSchema);
