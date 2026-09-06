const mongoose = require('mongoose');

const systemAuditLogSchema = new mongoose.Schema({
  // 操作信息
  timestamp: { type: Date, default: Date.now, index: true },
  action: String, // 操作类型: UPDATE_CONFIG, DELETE_PROXY, UPDATE_MONITOR等
  resource: String, // 资源类型: crawler, storage, monitoring, system
  resourceId: String, // 资源ID
  
  // 操作者信息
  operator: {
    userId: String,
    username: String,
    ipAddress: String,
  },

  // 详细信息
  details: {
    oldValue: mongoose.Schema.Types.Mixed, // 旧值
    newValue: mongoose.Schema.Types.Mixed, // 新值
    changes: [String], // 变更的字段列表
  },

  // 操作结果
  status: {
    type: String,
    enum: ['success', 'failure', 'partial'],
    default: 'success'
  },
  error: String, // 错误信息

  // 备注
  remarks: String,
});

// 索引
systemAuditLogSchema.index({ timestamp: -1 });
systemAuditLogSchema.index({ action: 1 });
systemAuditLogSchema.index({ 'operator.userId': 1 });
systemAuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // TTL: 90天

module.exports = mongoose.model('SystemAuditLog', systemAuditLogSchema);
