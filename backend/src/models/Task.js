const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    forumUrl: {
      type: String,
      required: true,
      trim: true,
    },
    taskType: {
      type: String,
      enum: ['novel', 'image', 'mixed'],
      default: 'mixed',
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'paused', 'completed', 'failed'],
      default: 'pending',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalItems: {
      type: Number,
      default: 0,
    },
    crawledItems: {
      type: Number,
      default: 0,
    },
    failedItems: {
      type: Number,
      default: 0,
    },
    config: {
      maxDepth: {
        type: Number,
        default: 3,
      },
      delay: {
        type: Number,
        default: 1000,
      },
      timeout: {
        type: Number,
        default: 300000,
      },
      userAgent: String,
      headers: mongoose.Schema.Types.Mixed,
    },
    errorLog: [
      {
        timestamp: Date,
        message: String,
        url: String,
      },
    ],
    startTime: Date,
    endTime: Date,
    createdBy: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ status: 1 });
taskSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CrawlerTask', taskSchema);
