const SystemConfig = require('../models/SystemConfig');
const SystemMonitor = require('../models/SystemMonitor');
const SystemAuditLog = require('../models/SystemAuditLog');
const Task = require('../models/Task');
const Post = require('../models/Post');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class SystemConfigService {
  /**
   * 获取系统配置
   */
  static async getConfig() {
    let config = await SystemConfig.findOne();
    if (!config) {
      config = await this.initializeDefaultConfig();
    }
    return config;
  }

  /**
   * 初始化默认配置
   */
  static async initializeDefaultConfig() {
    const defaultConfig = new SystemConfig({
      crawler: {
        proxy: {
          enabled: false,
          proxyList: [],
          rotationStrategy: 'round-robin',
        },
        userAgent: {
          enabled: true,
          customList: [],
          useDefault: true,
        },
        cookies: {
          enabled: false,
          storage: [],
        },
        rateLimit: {
          enabled: true,
          globalLimit: 100,
          ipLimit: 10,
          adaptiveDelay: true,
          minDelay: 500,
          maxDelay: 3000,
        },
        timeout: 30000,
        retryAttempts: 3,
        maxConcurrentRequests: 5,
      },
      storage: {
        local: {
          enabled: true,
          basePath: './public/uploads',
          maxSize: 10737418240, // 10GB
          autoClean: {
            enabled: false,
            retentionDays: 30,
          },
        },
        cloud: {
          enabled: false,
          provider: 's3',
        },
        stats: {
          lastUpdated: new Date(),
          dbSize: 0,
          mediaSize: 0,
          mediaCount: 0,
        },
      },
      monitoring: {
        performance: {
          enabled: true,
          collectionInterval: 60000,
          metricsRetention: 604800000,
        },
        errorMonitoring: {
          enabled: true,
          alertThreshold: 5,
        },
        alerting: {
          enabled: false,
          rules: [],
        },
      },
      system: {
        logging: {
          level: 'info',
          retention: 30,
          compress: true,
        },
        maintenance: {
          enabled: false,
        },
        timezone: 'UTC',
        theme: 'light',
      },
    });

    return await defaultConfig.save();
  }

  /**
   * 更新爬虫配置
   */
  static async updateCrawlerConfig(crawlerConfig, operator) {
    const config = await this.getConfig();
    const oldValue = { ...config.crawler };

    Object.assign(config.crawler, crawlerConfig);
    config.updatedBy = operator;
    await config.save();

    // 记录审计日志
    await this.recordAuditLog({
      action: 'UPDATE_CRAWLER_CONFIG',
      resource: 'crawler',
      operator,
      details: {
        oldValue,
        newValue: config.crawler,
        changes: Object.keys(crawlerConfig),
      },
    });

    return config.crawler;
  }

  /**
   * 添加代理IP
   */
  static async addProxy(proxyUrl, description, operator) {
    const config = await this.getConfig();
    
    const newProxy = {
      url: proxyUrl,
      active: true,
      failureCount: 0,
      description,
    };

    config.crawler.proxy.proxyList.push(newProxy);
    config.updatedBy = operator;
    await config.save();

    // 审计日志
    await this.recordAuditLog({
      action: 'ADD_PROXY',
      resource: 'crawler',
      operator,
      details: {
        newValue: newProxy,
        changes: ['proxy.proxyList'],
      },
    });

    return newProxy;
  }

  /**
   * 删除代理IP
   */
  static async removeProxy(proxyUrl, operator) {
    const config = await this.getConfig();
    const index = config.crawler.proxy.proxyList.findIndex(p => p.url === proxyUrl);
    
    if (index === -1) {
      throw new Error('代理IP不存在');
    }

    const removed = config.crawler.proxy.proxyList.splice(index, 1)[0];
    config.updatedBy = operator;
    await config.save();

    // 审计日志
    await this.recordAuditLog({
      action: 'REMOVE_PROXY',
      resource: 'crawler',
      operator,
      details: {
        oldValue: removed,
        changes: ['proxy.proxyList'],
      },
    });

    return removed;
  }

  /**
   * 更新存储配置
   */
  static async updateStorageConfig(storageConfig, operator) {
    const config = await this.getConfig();
    const oldValue = { ...config.storage };

    Object.assign(config.storage, storageConfig);
    config.updatedBy = operator;
    await config.save();

    // 审计日志
    await this.recordAuditLog({
      action: 'UPDATE_STORAGE_CONFIG',
      resource: 'storage',
      operator,
      details: {
        oldValue,
        newValue: config.storage,
        changes: Object.keys(storageConfig),
      },
    });

    return config.storage;
  }

  /**
   * 计算存储统计信息
   */
  static async calculateStorageStats() {
    const config = await this.getConfig();

    // 计算本地存储
    let localSize = 0;
    let mediaCount = 0;

    try {
      const uploadsDir = config.storage.local.basePath;
      if (await this.directoryExists(uploadsDir)) {
        const stats = await this.calculateDirectorySize(uploadsDir);
        localSize = stats.size;
        mediaCount = stats.count;
      }
    } catch (err) {
      console.error('计算本地存储大小失败:', err);
    }

    // 更新统计信息
    config.storage.stats = {
      lastUpdated: new Date(),
      dbSize: 0, // 需要通过MongoDB stats API获取
      mediaSize: localSize,
      mediaCount,
    };

    await config.save();
    return config.storage.stats;
  }

  /**
   * 辅助函数：检查目录是否存在
   */
  static async directoryExists(dirPath) {
    try {
      await fs.access(dirPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 辅助函数：计算目录大小
   */
  static async calculateDirectorySize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;

    const files = await fs.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);

      if (file.isDirectory()) {
        const subStats = await this.calculateDirectorySize(filePath);
        totalSize += subStats.size;
        fileCount += subStats.count;
      } else {
        const fileStats = await fs.stat(filePath);
        totalSize += fileStats.size;
        fileCount++;
      }
    }

    return { size: totalSize, count: fileCount };
  }

  /**
   * 更新监控配置
   */
  static async updateMonitoringConfig(monitoringConfig, operator) {
    const config = await this.getConfig();
    const oldValue = { ...config.monitoring };

    Object.assign(config.monitoring, monitoringConfig);
    config.updatedBy = operator;
    await config.save();

    // 审计日志
    await this.recordAuditLog({
      action: 'UPDATE_MONITORING_CONFIG',
      resource: 'monitoring',
      operator,
      details: {
        oldValue,
        newValue: config.monitoring,
        changes: Object.keys(monitoringConfig),
      },
    });

    return config.monitoring;
  }

  /**
   * 更新系统设置
   */
  static async updateSystemConfig(systemConfig, operator) {
    const config = await this.getConfig();
    const oldValue = { ...config.system };

    Object.assign(config.system, systemConfig);
    config.updatedBy = operator;
    await config.save();

    // 审计日志
    await this.recordAuditLog({
      action: 'UPDATE_SYSTEM_CONFIG',
      resource: 'system',
      operator,
      details: {
        oldValue,
        newValue: config.system,
        changes: Object.keys(systemConfig),
      },
    });

    return config.system;
  }

  /**
   * 记录审计日志
   */
  static async recordAuditLog(logData) {
    const auditLog = new SystemAuditLog({
      action: logData.action,
      resource: logData.resource,
      resourceId: logData.resourceId,
      operator: {
        userId: logData.operator?.id || 'system',
        username: logData.operator?.username || 'system',
        ipAddress: logData.operator?.ipAddress || '127.0.0.1',
      },
      details: logData.details || {},
      status: logData.status || 'success',
      error: logData.error,
      remarks: logData.remarks,
    });

    return await auditLog.save();
  }

  /**
   * 获取审计日志
   */
  static async getAuditLogs(filters = {}, limit = 100, skip = 0) {
    const query = {};

    if (filters.action) query.action = filters.action;
    if (filters.resource) query.resource = filters.resource;
    if (filters.startDate) query.timestamp = { $gte: new Date(filters.startDate) };
    if (filters.endDate) {
      query.timestamp = query.timestamp || {};
      query.timestamp.$lte = new Date(filters.endDate);
    }

    const logs = await SystemAuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);

    const total = await SystemAuditLog.countDocuments(query);

    return { logs, total };
  }

  /**
   * 自动清理过期数据
   */
  static async autoCleanExpiredData() {
    const config = await this.getConfig();

    if (!config.storage.local.autoClean.enabled) {
      return { success: false, message: '自动清理功能未启用' };
    }

    const retentionDays = config.storage.local.autoClean.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // 删除过期的Post记录
    const result = await Post.deleteMany({
      createdAt: { $lt: cutoffDate },
      taskId: { $exists: true },
    });

    // 删除相关的媒体文件
    // TODO: 实现媒体文件清理逻辑

    return {
      success: true,
      deletedRecords: result.deletedCount,
      cutoffDate,
    };
  }
}

module.exports = SystemConfigService;
