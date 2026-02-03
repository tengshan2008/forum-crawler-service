const SystemMonitor = require('../models/SystemMonitor');
const SystemConfig = require('../models/SystemConfig');
const Task = require('../models/Task');
const os = require('os');

class SystemMonitoringService {
  /**
   * 收集系统指标
   */
  static async collectMetrics() {
    const metrics = {
      timestamp: new Date(),
      crawler: await this.collectCrawlerMetrics(),
      system: await this.collectSystemMetrics(),
      database: await this.collectDatabaseMetrics(),
      cache: await this.collectCacheMetrics(),
      errors: await this.collectErrorMetrics(),
    };

    // 保存到数据库
    const monitor = new SystemMonitor(metrics);
    await monitor.save();

    return metrics;
  }

  /**
   * 收集爬虫相关指标
   */
  static async collectCrawlerMetrics() {
    const activeTasks = await Task.countDocuments({ status: 'running' });
    const completedTasks = await Task.countDocuments({ status: 'completed' });
    const failedTasks = await Task.countDocuments({ status: 'failed' });

    return {
      activeTasks,
      completedTasks,
      failedTasks,
      totalRequests: Math.floor(Math.random() * 10000), // 模拟数据
      failedRequests: Math.floor(Math.random() * 100),
      averageRequestTime: Math.floor(Math.random() * 5000),
      requestsPerSecond: Math.random() * 100,
    };
  }

  /**
   * 收集系统资源指标
   */
  static async collectSystemMetrics() {
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - os.freemem();
    const cpus = os.cpus();
    
    // 计算CPU使用率
    let cpuUsage = 0;
    if (process.cpuUsage) {
      const usage = process.cpuUsage();
      cpuUsage = ((usage.user + usage.system) / 1000000) * 100;
    }

    return {
      cpuUsage: Math.min(cpuUsage, 100),
      memoryUsage: {
        total: totalMemory,
        used: usedMemory,
        percentage: (usedMemory / totalMemory) * 100,
      },
      diskUsage: {
        total: 1000000000000, // 1TB - 模拟
        used: 500000000000,
        percentage: 50,
      },
      networkBandwidth: {
        incoming: Math.floor(Math.random() * 1000000),
        outgoing: Math.floor(Math.random() * 1000000),
      },
    };
  }

  /**
   * 收集数据库相关指标
   */
  static async collectDatabaseMetrics() {
    return {
      operationsPerSecond: Math.floor(Math.random() * 100),
      connectionCount: Math.floor(Math.random() * 50),
      queryTime: Math.floor(Math.random() * 100),
      slowQueries: Math.floor(Math.random() * 10),
    };
  }

  /**
   * 收集缓存相关指标
   */
  static async collectCacheMetrics() {
    return {
      hits: Math.floor(Math.random() * 10000),
      misses: Math.floor(Math.random() * 1000),
      hitRate: Math.random() * 100,
      memoryUsed: Math.floor(Math.random() * 100000000),
    };
  }

  /**
   * 收集错误统计
   */
  static async collectErrorMetrics() {
    return {
      total: Math.floor(Math.random() * 100),
      by_type: {
        network: Math.floor(Math.random() * 30),
        parse: Math.floor(Math.random() * 20),
        timeout: Math.floor(Math.random() * 20),
        database: Math.floor(Math.random() * 15),
        other: Math.floor(Math.random() * 15),
      },
      by_severity: {
        critical: Math.floor(Math.random() * 5),
        high: Math.floor(Math.random() * 10),
        medium: Math.floor(Math.random() * 30),
        low: Math.floor(Math.random() * 50),
      },
    };
  }

  /**
   * 获取历史指标数据
   */
  static async getMetricsHistory(timeRange = 'hour') {
    let startDate = new Date();

    switch (timeRange) {
      case 'hour':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate.setHours(startDate.getHours() - 1);
    }

    const metrics = await SystemMonitor.find({
      timestamp: { $gte: startDate },
    })
      .sort({ timestamp: 1 })
      .limit(1000);

    return metrics;
  }

  /**
   * 获取实时系统状态
   */
  static async getRealTimeStatus() {
    const latestMetric = await SystemMonitor.findOne()
      .sort({ timestamp: -1 });

    if (!latestMetric) {
      return { success: false, message: '暂无监控数据' };
    }

    const metrics = latestMetric.toObject();
    const config = await SystemConfig.findOne();

    // 检查告警条件
    const alerts = this.checkAlertConditions(metrics, config);

    return {
      success: true,
      metrics,
      alerts,
      timestamp: new Date(),
    };
  }

  /**
   * 检查告警条件
   */
  static checkAlertConditions(metrics, config) {
    const alerts = [];

    // CPU使用率告警
    if (metrics.system.cpuUsage > 80) {
      alerts.push({
        severity: 'high',
        message: `CPU使用率过高: ${metrics.system.cpuUsage.toFixed(2)}%`,
        timestamp: new Date(),
      });
    }

    // 内存使用率告警
    if (metrics.system.memoryUsage.percentage > 85) {
      alerts.push({
        severity: 'high',
        message: `内存使用率过高: ${metrics.system.memoryUsage.percentage.toFixed(2)}%`,
        timestamp: new Date(),
      });
    }

    // 磁盘使用率告警
    if (metrics.system.diskUsage.percentage > 90) {
      alerts.push({
        severity: 'critical',
        message: `磁盘使用率过高: ${metrics.system.diskUsage.percentage.toFixed(2)}%`,
        timestamp: new Date(),
      });
    }

    // 错误率告警
    const totalRequests = metrics.crawler.totalRequests;
    const failedRequests = metrics.crawler.failedRequests;
    if (totalRequests > 0) {
      const errorRate = (failedRequests / totalRequests) * 100;
      if (errorRate > 10) {
        alerts.push({
          severity: 'medium',
          message: `错误率过高: ${errorRate.toFixed(2)}%`,
          timestamp: new Date(),
        });
      }
    }

    // 数据库性能告警
    if (metrics.database.queryTime > 1000) {
      alerts.push({
        severity: 'medium',
        message: `数据库查询时间过长: ${metrics.database.queryTime}ms`,
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  /**
   * 初始化定期监控任务
   */
  static startMonitoringTask(interval = 60000) {
    // 每60秒收集一次指标
    setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (err) {
        console.error('收集系统指标失败:', err);
      }
    }, interval);

    console.log('系统监控任务已启动，收集间隔:', interval, 'ms');
  }

  /**
   * 生成性能报告
   */
  static async generatePerformanceReport(timeRange = 'day') {
    const metrics = await this.getMetricsHistory(timeRange);

    // 如果无可用数据，返回默认的空报告结构
    if (metrics.length === 0) {
      return {
        success: true,
        timeRange,
        period: {
          start: new Date(),
          end: new Date(),
        },
        summary: {
          avgCpuUsage: 0,
          avgMemoryUsage: 0,
          avgQueryTime: 0,
          errorRate: 0,
          totalRequests: 0,
          totalErrors: 0,
        },
        metrics: [],
      };
    }

    // 计算平均值
    const avgCpuUsage =
      metrics.reduce((sum, m) => sum + m.system.cpuUsage, 0) / metrics.length;
    const avgMemoryUsage =
      metrics.reduce((sum, m) => sum + m.system.memoryUsage.percentage, 0) /
      metrics.length;
    const avgQueryTime =
      metrics.reduce((sum, m) => sum + m.database.queryTime, 0) / metrics.length;

    // 计算错误率
    const totalErrors = metrics.reduce((sum, m) => sum + m.errors.total, 0);
    const totalRequests = metrics.reduce(
      (sum, m) => sum + m.crawler.totalRequests,
      0
    );
    const errorRate =
      totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0;

    return {
      success: true,
      timeRange,
      period: {
        start: metrics[0].timestamp,
        end: metrics[metrics.length - 1].timestamp,
      },
      summary: {
        avgCpuUsage: avgCpuUsage.toFixed(2),
        avgMemoryUsage: avgMemoryUsage.toFixed(2),
        avgQueryTime: avgQueryTime.toFixed(2),
        errorRate: errorRate,
        totalRequests,
        totalErrors,
      },
      metrics: metrics.slice(-10), // 最后10条记录
    };
  }
}

module.exports = SystemMonitoringService;
