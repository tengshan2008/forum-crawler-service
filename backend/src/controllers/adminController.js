const SystemConfigService = require('../services/systemConfigService');
const SystemMonitoringService = require('../services/systemMonitoringService');
const User = require('../models/User');

/**
 * 系统管理控制器
 */
class AdminController {
  /**
   * 获取系统配置
   */
  static async getSystemConfig(req, res) {
    try {
      const config = await SystemConfigService.getConfig();
      res.json({
        success: true,
        data: config,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 更新爬虫配置
   */
  static async updateCrawlerConfig(req, res) {
    try {
      const crawlerConfig = req.body;
      const operator = {
        id: req.user?.userId,
        username: req.user?.username,
        ipAddress: req.ip,
      };

      const updated = await SystemConfigService.updateCrawlerConfig(
        crawlerConfig,
        operator
      );

      res.json({
        success: true,
        message: '爬虫配置已更新',
        data: updated,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 添加代理IP
   */
  static async addProxy(req, res) {
    try {
      const { proxyUrl, description } = req.body;

      if (!proxyUrl) {
        return res.status(400).json({
          success: false,
          message: '代理URL不能为空',
        });
      }

      const operator = {
        id: req.user?.userId,
        username: req.user?.username,
        ipAddress: req.ip,
      };

      const proxy = await SystemConfigService.addProxy(
        proxyUrl,
        description,
        operator
      );

      res.json({
        success: true,
        message: '代理已添加',
        data: proxy,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 删除代理IP
   */
  static async removeProxy(req, res) {
    try {
      const { proxyUrl } = req.params;

      const operator = {
        id: req.user?.userId,
        username: req.user?.username,
        ipAddress: req.ip,
      };

      const removed = await SystemConfigService.removeProxy(proxyUrl, operator);

      res.json({
        success: true,
        message: '代理已删除',
        data: removed,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 更新存储配置
   */
  static async updateStorageConfig(req, res) {
    try {
      const storageConfig = req.body;
      const operator = {
        id: req.user?.userId,
        username: req.user?.username,
        ipAddress: req.ip,
      };

      const updated = await SystemConfigService.updateStorageConfig(
        storageConfig,
        operator
      );

      res.json({
        success: true,
        message: '存储配置已更新',
        data: updated,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 获取存储统计信息
   */
  static async getStorageStats(req, res) {
    try {
      const stats = await SystemConfigService.calculateStorageStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 更新监控配置
   */
  static async updateMonitoringConfig(req, res) {
    try {
      const monitoringConfig = req.body;
      const operator = {
        id: req.user?.userId,
        username: req.user?.username,
        ipAddress: req.ip,
      };

      const updated = await SystemConfigService.updateMonitoringConfig(
        monitoringConfig,
        operator
      );

      res.json({
        success: true,
        message: '监控配置已更新',
        data: updated,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 更新系统设置
   */
  static async updateSystemConfig(req, res) {
    try {
      const systemConfig = req.body;
      const operator = {
        id: req.user?.userId,
        username: req.user?.username,
        ipAddress: req.ip,
      };

      const updated = await SystemConfigService.updateSystemConfig(
        systemConfig,
        operator
      );

      res.json({
        success: true,
        message: '系统设置已更新',
        data: updated,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 获取实时系统状态
   */
  static async getRealTimeStatus(req, res) {
    try {
      const status = await SystemMonitoringService.getRealTimeStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 获取监控历史数据
   */
  static async getMetricsHistory(req, res) {
    try {
      const { timeRange } = req.query;
      const metrics = await SystemMonitoringService.getMetricsHistory(
        timeRange || 'hour'
      );

      res.json({
        success: true,
        data: metrics,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 生成性能报告
   */
  static async generatePerformanceReport(req, res) {
    try {
      const { timeRange } = req.query;
      const report = await SystemMonitoringService.generatePerformanceReport(
        timeRange || 'day'
      );

      res.json({
        success: true,
        data: report,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 获取审计日志
   */
  static async getAuditLogs(req, res) {
    try {
      const { action, resource, startDate, endDate, limit = 100, skip = 0 } =
        req.query;

      const logs = await SystemConfigService.getAuditLogs(
        { action, resource, startDate, endDate },
        parseInt(limit),
        parseInt(skip)
      );

      res.json({
        success: true,
        data: logs,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 执行自动清理
   */
  static async autoClean(req, res) {
    try {
      const result = await SystemConfigService.autoCleanExpiredData();

      res.json({
        success: result.success,
        message: result.message,
        data: result,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 获取用户列表（用户管理）
   */
  static async getUserList(req, res) {
    try {
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

      res.json({
        success: true,
        data: {
          users,
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 更新用户角色
   */
  static async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!['admin', 'editor', 'user', 'guest'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: '无效的角色',
        });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { role },
        { new: true }
      ).select('-password');

      res.json({
        success: true,
        message: '用户角色已更新',
        data: user,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 禁用/启用用户
   */
  static async toggleUserStatus(req, res) {
    try {
      const { userId } = req.params;

      const user = await User.findByIdAndUpdate(
        userId,
        [{ $set: { active: { $not: '$active' } } }],
        { new: true }
      ).select('-password');

      res.json({
        success: true,
        message: `用户已${user.active ? '启用' : '禁用'}`,
        data: user,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  /**
   * 重置用户密码
   */
  static async resetUserPassword(req, res) {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: '密码长度至少6个字符',
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在',
        });
      }

      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: '用户密码已重置',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = AdminController;
