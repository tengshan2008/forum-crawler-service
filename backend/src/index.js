const express = require('express');
const helmet = require('helmet');
const path = require('path');
require('express-async-errors');
const corsMiddleware = require('./middlewares/cors');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');
const config = require('./config/config');
const { connectDB } = require('./config/database');
const { crawlerQueue } = require('./services/crawlerQueue');
const { executeCrawler } = require('./services/crawlerExecutor');
const Task = require('./models/Task');
const schedulerService = require('./services/schedulerService');

const app = express();

// CORS middleware - must be before helmet to ensure headers are set correctly
app.use(corsMiddleware);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Static files middleware - serve downloaded images
// Add CORS headers explicitly for static files
app.use('/public', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../../public')));

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
    // Connect to database
    await connectDB();

    // 设置爬虫队列处理
    console.log('⊙ 初始化爬虫队列...');
    crawlerQueue.process(1, async (job) => {
      const { taskId, forumUrl, taskType, config: taskConfig } = job.data;

      try {
        console.log(`[爬虫队列] 开始处理任务: ${taskId}`);

        // 更新任务状态为运行中
        await Task.findByIdAndUpdate(taskId, {
          status: 'running',
          progress: 5,
          lastCrawlTime: new Date(),
        });

        // 执行爬虫
        const result = await executeCrawler(taskId, forumUrl, taskType, taskConfig);

        // 获取任务信息，检查是否需要从标题更新名称
        const task = await Task.findById(taskId);
        if ((!task.name || task.name === '') && result.title) {
          // 如果任务名称为空或未设置，使用爬虫返回的标题
          task.name = result.title;
          await task.save();
          console.log(`[任务] 任务名称已更新为: ${result.title}`);
        }

        // 更新任务状态为完成
        await Task.findByIdAndUpdate(taskId, {
          status: 'completed',
          progress: 100,
          crawledItems: result.crawled_posts || 1,
          totalItems: result.total_posts || 1,
          endTime: new Date(),
        });

        job.progress(100);
        return result;
      } catch (error) {
        console.error(`[爬虫队列] 任务失败: ${taskId}`, error.message);

        // 更新任务状态为失败
        await Task.findByIdAndUpdate(
          taskId,
          {
            status: 'failed',
            errorLog: [
              {
                timestamp: new Date(),
                message: error.message,
              },
            ],
          },
          { new: true }
        );

        throw error;
      }
    });

    console.log('✓ 爬虫队列已初始化');

    // 启动定时任务调度器
    await schedulerService.start();

    const server = app.listen(config.port, config.host, () => {
      console.log(`✓ Server running on http://${config.host}:${config.port}`);
      console.log(`✓ Environment: ${config.env}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: closing HTTP server');
      
      // 停止定时任务调度器
      schedulerService.stop();
      
      await crawlerQueue.close();
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    
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
