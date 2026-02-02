const mongoose = require('mongoose');

const systemMonitorSchema = new mongoose.Schema({
  // 时间戳
  timestamp: { type: Date, default: Date.now, index: true },

  // 爬虫性能指标
  crawler: {
    activeTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    failedTasks: { type: Number, default: 0 },
    totalRequests: { type: Number, default: 0 },
    failedRequests: { type: Number, default: 0 },
    averageRequestTime: { type: Number, default: 0 }, // 平均响应时间(ms)
    requestsPerSecond: { type: Number, default: 0 },
  },

  // 系统资源
  system: {
    cpuUsage: { type: Number, default: 0 }, // CPU使用率(%)
    memoryUsage: {
      total: Number,
      used: Number,
      percentage: Number,
    },
    diskUsage: {
      total: Number,
      used: Number,
      percentage: Number,
    },
    networkBandwidth: {
      incoming: Number, // 字节/秒
      outgoing: Number,
    },
  },

  // 数据库指标
  database: {
    operationsPerSecond: { type: Number, default: 0 },
    connectionCount: { type: Number, default: 0 },
    queryTime: { type: Number, default: 0 }, // 平均查询时间(ms)
    slowQueries: { type: Number, default: 0 },
  },

  // 缓存指标
  cache: {
    hits: { type: Number, default: 0 },
    misses: { type: Number, default: 0 },
    hitRate: { type: Number, default: 0 }, // 命中率(%)
    memoryUsed: { type: Number, default: 0 },
  },

  // 错误统计
  errors: {
    total: { type: Number, default: 0 },
    by_type: {
      network: { type: Number, default: 0 },
      parse: { type: Number, default: 0 },
      timeout: { type: Number, default: 0 },
      database: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    by_severity: {
      critical: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
    },
  },

  // 告警
  alerts: [{
    severity: { type: String, enum: ['critical', 'high', 'medium', 'low'] },
    message: String,
    timestamp: Date,
    resolved: { type: Boolean, default: false },
  }],
});

// TTL索引，30天后自动删除
systemMonitorSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('SystemMonitor', systemMonitorSchema);
