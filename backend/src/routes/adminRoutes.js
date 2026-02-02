const express = require('express');
const AdminController = require('../controllers/adminController');
const { authMiddleware, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// 所有管理员路由都需要认证和管理员权限
router.use(authMiddleware);
router.use(requireRole('admin'));

// ============ 系统配置管理 ============

// 获取系统配置
router.get('/config', AdminController.getSystemConfig);

// ============ 爬虫配置 ============

// 更新爬虫配置
router.put('/config/crawler', AdminController.updateCrawlerConfig);

// 代理管理
router.post('/config/proxies', AdminController.addProxy);
router.delete('/config/proxies/:proxyUrl', AdminController.removeProxy);

// ============ 存储管理 ============

// 更新存储配置
router.put('/config/storage', AdminController.updateStorageConfig);

// 获取存储统计
router.get('/storage/stats', AdminController.getStorageStats);

// 执行自动清理
router.post('/storage/clean', AdminController.autoClean);

// ============ 监控配置 ============

// 更新监控配置
router.put('/config/monitoring', AdminController.updateMonitoringConfig);

// ============ 系统设置 ============

// 更新系统设置
router.put('/config/system', AdminController.updateSystemConfig);

// ============ 监控与性能 ============

// 获取实时系统状态
router.get('/monitor/status', AdminController.getRealTimeStatus);

// 获取监控历史数据
router.get('/monitor/history', AdminController.getMetricsHistory);

// 生成性能报告
router.get('/monitor/report', AdminController.generatePerformanceReport);

// ============ 审计日志 ============

// 获取审计日志
router.get('/audit-logs', AdminController.getAuditLogs);

// ============ 用户管理 ============

// 获取用户列表
router.get('/users', AdminController.getUserList);

// 更新用户角色
router.put('/users/:userId/role', AdminController.updateUserRole);

// 禁用/启用用户
router.patch('/users/:userId/status', AdminController.toggleUserStatus);

// 重置用户密码
router.post('/users/:userId/reset-password', AdminController.resetUserPassword);

module.exports = router;
