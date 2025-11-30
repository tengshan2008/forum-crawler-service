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

const app = express();

// Security middleware
app.use(helmet());

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// CORS middleware
app.use(corsMiddleware);

// Static files middleware - serve downloaded images
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
        });

        // 执行爬虫
        const result = await executeCrawler(taskId, forumUrl, taskType, taskConfig);

        // 更新任务状态为完成
        await Task.findByIdAndUpdate(taskId, {
          status: 'completed',
          progress: 100,
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
                error: error.message,
              },
            ],
          },
          { new: true }
        );

        throw error;
      }
    });

    console.log('✓ 爬虫队列已初始化');

    const server = app.listen(config.port, config.host, () => {
      console.log(`✓ Server running on http://${config.host}:${config.port}`);
      console.log(`✓ Environment: ${config.env}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: closing HTTP server');
      await crawlerQueue.close();
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if this is the main module
if (require.main === module) {
  startServer();
}

module.exports = app;
