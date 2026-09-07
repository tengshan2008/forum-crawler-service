const express = require('express');
const helmet = require('helmet');
const { consola } = require('consola');
const path = require('path');
require('express-async-errors');
const corsMiddleware = require('./middlewares/cors');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');
const config = require('./config/config');
const { connectDB } = require('./config/database');
const { crawlerQueue } = require('./services/crawlerQueue');
const { processCrawlerJob } = require('./services/crawlerQueueWorker');
const schedulerService = require('./services/schedulerService');
const SystemMonitoringService = require('./services/systemMonitoringService');

const app = express();

// CORS middleware - must be before helmet to ensure headers are set correctly
app.use(corsMiddleware);

// HTTP request logger using consola
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const msg = `${req.method} ${req.url} ${status} ${duration}ms`;

    if (status >= 500) consola.error(msg);
    else if (status >= 400) consola.warn(msg);
    else consola.success(msg);
  });
  next();
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Static files middleware - serve downloaded images
// S5：跨域策略统一由全局 corsMiddleware（白名单）与 helmet CORP 管理，
// 不再对静态资源单独放开 Access-Control-Allow-Origin: *（<img> 引用不受 CORS 限制）
app.use('/public', express.static(path.join(__dirname, '../../public')));

// Routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // S1 安全自检：密钥未配置或为弱默认值时拒绝启动
    config.validateEnv();

    // Connect to database
    await connectDB();

    // 启动系统监控服务
    console.log('⊙ 启动系统监控服务...');
    SystemMonitoringService.startMonitoringTask(60000); // 每60秒收集一次指标
    consola.success('系统监控服务已启动');

    // 设置爬虫队列处理（B1 收敛：worker 逻辑在 crawlerQueueWorker，状态流转在 taskService）
    crawlerQueue.process(1, processCrawlerJob);

    consola.success('爬虫队列已初始化');

    // 启动定时任务调度器
    await schedulerService.start();

    const server = app.listen(config.port, config.host, () => {
      consola.ready({
        message: `Server running on http://${config.host}:${config.port}`,
        badge: true
      });
      consola.info(`Environment: ${config.env}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      consola.info('SIGTERM signal received: closing HTTP server');

      // 停止定时任务调度器
      schedulerService.stop();

      await crawlerQueue.close();
      server.close(() => {
        consola.success('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    consola.error('Failed to start server:', error);

    // 如果启动失败，尝试停止定时任务调度器
    try {
      schedulerService.stop();
    } catch (stopError) {
      console.error('Error stopping scheduler:', stopError);
    }

    process.exit(1);
  }
};

// Start server if this is the main module
if (require.main === module) {
  startServer();
}

module.exports = app;
