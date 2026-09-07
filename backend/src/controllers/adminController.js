const SystemConfigService = require('../services/systemConfigService');
const SystemMonitoringService = require('../services/systemMonitoringService');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/respond');

// 审计操作人上下文（配置变更类接口统一记录）
const operatorFrom = (req) => ({
  id: req.user?.userId,
  username: req.user?.username,
  ipAddress: req.ip,
});

/**
 * 系统管理控制器
 */

/**
 * 获取系统配置
 */
exports.getSystemConfig = catchAsync(async (req, res) => {
  const config = await SystemConfigService.getConfig();
  sendSuccess(res, { data: config });
});

/**
 * 更新爬虫配置
 */
exports.updateCrawlerConfig = catchAsync(async (req, res) => {
  const updated = await SystemConfigService.updateCrawlerConfig(req.body, operatorFrom(req));
  sendSuccess(res, { message: '爬虫配置已更新', data: updated });
});

/**
 * 添加代理IP
 */
exports.addProxy = catchAsync(async (req, res) => {
  const { proxyUrl, description } = req.body;

  if (!proxyUrl) {
    throw new AppError('代理URL不能为空', 400);
  }

  const proxy = await SystemConfigService.addProxy(proxyUrl, description, operatorFrom(req));
  sendSuccess(res, { message: '代理已添加', data: proxy });
});

/**
 * 删除代理IP
 */
exports.removeProxy = catchAsync(async (req, res) => {
  const removed = await SystemConfigService.removeProxy(req.params.proxyUrl, operatorFrom(req));
  sendSuccess(res, { message: '代理已删除', data: removed });
});

/**
 * 更新存储配置
 */
exports.updateStorageConfig = catchAsync(async (req, res) => {
  const updated = await SystemConfigService.updateStorageConfig(req.body, operatorFrom(req));
  sendSuccess(res, { message: '存储配置已更新', data: updated });
});

/**
 * 获取存储统计信息
 */
exports.getStorageStats = catchAsync(async (req, res) => {
  const stats = await SystemConfigService.calculateStorageStats();
  sendSuccess(res, { data: stats });
});

/**
 * 更新监控配置
 */
exports.updateMonitoringConfig = catchAsync(async (req, res) => {
  const updated = await SystemConfigService.updateMonitoringConfig(req.body, operatorFrom(req));
  sendSuccess(res, { message: '监控配置已更新', data: updated });
});

/**
 * 更新系统设置
 */
exports.updateSystemConfig = catchAsync(async (req, res) => {
  const updated = await SystemConfigService.updateSystemConfig(req.body, operatorFrom(req));
  sendSuccess(res, { message: '系统设置已更新', data: updated });
});

/**
 * 获取实时系统状态
 */
exports.getRealTimeStatus = catchAsync(async (req, res) => {
  const status = await SystemMonitoringService.getRealTimeStatus();
  sendSuccess(res, { data: status });
});

/**
 * 获取监控历史数据
 */
exports.getMetricsHistory = catchAsync(async (req, res) => {
  const { timeRange } = req.query;
  const metrics = await SystemMonitoringService.getMetricsHistory(timeRange || 'hour');
  sendSuccess(res, { data: metrics });
});

/**
 * 生成性能报告
 */
exports.generatePerformanceReport = catchAsync(async (req, res) => {
  const { timeRange } = req.query;
  const report = await SystemMonitoringService.generatePerformanceReport(timeRange || 'day');
  sendSuccess(res, { data: report });
});

/**
 * 获取审计日志
 */
exports.getAuditLogs = catchAsync(async (req, res) => {
  const { action, resource, startDate, endDate, limit = 100, skip = 0 } = req.query;

  const logs = await SystemConfigService.getAuditLogs(
    { action, resource, startDate, endDate },
    parseInt(limit),
    parseInt(skip)
  );

  sendSuccess(res, { data: logs });
});

/**
 * 执行自动清理
 */
exports.autoClean = catchAsync(async (req, res) => {
  const result = await SystemConfigService.autoCleanExpiredData();

  // 业务分支：自动清理未启用时 service 返回 success:false，保持既有 200 响应契约
  if (result.success === false) {
    return res.status(200).json({
      success: false,
      message: result.message,
      data: result,
    });
  }

  sendSuccess(res, { data: result, message: result.message });
});

/**
 * 获取用户列表（用户管理）
 */
exports.getUserList = catchAsync(async (req, res) => {
  const { limit = 20, skip = 0, role } = req.query;
  const query = {};

  if (role) {
    query.role = role;
  }

  const users = await User.find(query)
    .select('-password')
    .limit(parseInt(limit))
    .skip(parseInt(skip))
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(query);

  sendSuccess(res, {
    data: {
      users,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    },
  });
});

/**
 * 更新用户角色
 */
exports.updateUserRole = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (!['admin', 'editor', 'user', 'guest'].includes(role)) {
    throw new AppError('无效的角色', 400);
  }

  const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select('-password');

  sendSuccess(res, { message: '用户角色已更新', data: user });
});

/**
 * 禁用/启用用户
 */
exports.toggleUserStatus = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    [{ $set: { active: { $not: '$active' } } }],
    { new: true }
  ).select('-password');

  sendSuccess(res, { message: `用户已${user.active ? '启用' : '禁用'}`, data: user });
});

/**
 * 重置用户密码
 */
exports.resetUserPassword = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    throw new AppError('密码长度至少6个字符', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('用户不存在', 404);
  }

  user.password = newPassword;
  await user.save();

  sendSuccess(res, { message: '用户密码已重置' });
});
