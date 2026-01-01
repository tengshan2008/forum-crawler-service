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
      required: false,
      trim: true,
    },
    sectionUrl: {
      type: String,
      trim: true,
      default: '',
    },
    crawlType: {
      type: String,
      enum: ['single', 'batch'],
      default: 'single',
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
        default: 600000,
      },
      maxPages: {
        type: Number,
        default: 10,
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    schedule: {
      enabled: {
        type: Boolean,
        default: false,
      },
      interval: {
        type: Number,
        default: 24,
        description: 'Interval in hours',
      },
      startTime: Date,
      lastRunTime: Date,
    },
    lastCrawlTime: Date,
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

exports = mongoose.model('CrawlerTask', taskSchema);
module.exports = exports;