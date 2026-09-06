const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  // 爬虫配置
  crawler: {
    // 代理设置
    proxy: {
      enabled: { type: Boolean, default: false },
      proxyList: [{
        url: String,
        active: { type: Boolean, default: true },
        lastUsedAt: Date,
        failureCount: { type: Number, default: 0 },
      }],
      rotationStrategy: {
        type: String,
        enum: ['round-robin', 'random', 'weighted'],
        default: 'round-robin'
      },
    },
    
    // User-Agent设置
    userAgent: {
      enabled: { type: Boolean, default: true },
      customList: [String],
      useDefault: { type: Boolean, default: true },
    },
    
    // Cookies管理
    cookies: {
      enabled: { type: Boolean, default: false },
      storage: [{
        domain: String,
        cookies: String,
        expiresAt: Date,
        description: String,
      }],
    },
    
    // 请求限流
    rateLimit: {
      enabled: { type: Boolean, default: true },
      globalLimit: { type: Number, default: 100 }, // 全局请求/分钟
      ipLimit: { type: Number, default: 10 }, // 每IP请求/分钟
      adaptiveDelay: { type: Boolean, default: true },
      minDelay: { type: Number, default: 500 }, // 最小延迟(ms)
      maxDelay: { type: Number, default: 3000 }, // 最大延迟(ms)
    },
    
    // 超时和重试
    timeout: { type: Number, default: 30000 }, // 超时时间(ms)
    retryAttempts: { type: Number, default: 3 }, // 重试次数
    maxConcurrentRequests: { type: Number, default: 5 }, // 最大并发请求
  },

  // 存储配置
  storage: {
    // 本地存储
    local: {
      enabled: { type: Boolean, default: true },
      basePath: { type: String, default: './public/uploads' },
      maxSize: { type: Number, default: 10737418240 }, // 10GB
      autoClean: {
        enabled: { type: Boolean, default: false },
        retentionDays: { type: Number, default: 30 },
        schedule: String, // cron表达式
      },
    },

    // 云存储(S3/OSS)
    cloud: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ['s3', 'oss', 'cos'],
        default: 's3'
      },
      config: {
        accessKey: String,
        secretKey: String,
        bucket: String,
        region: String,
        endpoint: String,
      },
      autoTiering: { type: Boolean, default: false },
    },

    // 数据库统计
    stats: {
      lastUpdated: Date,
      dbSize: Number, // 数据库大小(bytes)
      mediaSize: Number, // 媒体文件大小(bytes)
      mediaCount: Number, // 媒体文件数
    },
  },

  // 监控配置
  monitoring: {
    // 性能监控
    performance: {
      enabled: { type: Boolean, default: true },
      collectionInterval: { type: Number, default: 60000 }, // 60秒
      metricsRetention: { type: Number, default: 604800000 }, // 7天
    },

    // 错误监控
    errorMonitoring: {
      enabled: { type: Boolean, default: true },
      alertThreshold: { type: Number, default: 5 }, // 错误次数阈值
      alertChannels: {
        email: { type: Boolean, default: false },
        webhook: { type: Boolean, default: false },
        log: { type: Boolean, default: true },
      },
    },

    // 告警设置
    alerting: {
      enabled: { type: Boolean, default: false },
      rules: [{
        name: String,
        condition: String, // 条件表达式
        threshold: mongoose.Schema.Types.Mixed,
        actions: [String], // 执行的动作
        enabled: Boolean,
      }],
    },
  },

  // 系统设置
  system: {
    // 日志设置
    logging: {
      level: {
        type: String,
        enum: ['error', 'warn', 'info', 'debug'],
        default: 'info'
      },
      retention: { type: Number, default: 30 }, // 保留天数
      compress: { type: Boolean, default: true },
    },

    // 维护模式
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: String,
      startTime: Date,
      endTime: Date,
    },

    // 其他设置
    timezone: { type: String, default: 'UTC' },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  },

  // 记录变更历史
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: String, // 更新者
});

// 自动更新updatedAt
systemConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
