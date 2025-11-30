const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrawlerTask',
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    originalUrl: String,
    localPath: String,
    mediaType: {
      type: String,
      enum: ['image', 'video', 'audio', 'document'],
      required: true,
    },
    size: Number,
    mimeType: String,
    thumbnail: String,
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
    downloadedAt: {
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

mediaSchema.index({ postId: 1 });
mediaSchema.index({ taskId: 1 });
mediaSchema.index({ mediaType: 1 });

module.exports = mongoose.model('Media', mediaSchema);
