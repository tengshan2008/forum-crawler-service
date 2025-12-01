const { spawn } = require('child_process');
const path = require('path');
const Task = require('../models/Task');
const config = require('../config/config');

/**
 * 使用 Python 子进程执行爬虫
 * @param {string} taskId - 任务 ID
 * @param {string} forumUrl - 论坛 URL
 * @param {string} taskType - 任务类型 (novel, image, mixed)
 * @param {object} taskConfig - 爬虫配置
 * @returns {Promise} 爬虫执行结果
 */
async function executeCrawler(taskId, forumUrl, taskType, taskConfig) {
  return new Promise((resolve, reject) => {
    try {
      // 构建 Python 爬虫命令
      const pythonPath = process.env.PYTHON_PATH || 'python3';
      const crawlerScript = '/app/crawler/crawl.py';
      
      // 构建参数
      const timeout = taskConfig?.timeout || 600000; // 默认 10 分钟超时
      const args = [
        crawlerScript,
        '--url', forumUrl,
        '--type', taskType,
        '--task-id', taskId,
        '--max-depth', taskConfig?.maxDepth || 3,
        '--delay', taskConfig?.delay || 1000,
        '--timeout', timeout,
      ];

      console.log(`[爬虫] 启动爬虫: ${pythonPath} crawl.py --task-id ${taskId}`);

      // 启动爬虫进程
      const crawlerProcess = spawn(pythonPath, args, {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          MONGODB_URI: config.mongodb.uri,
          REDIS_HOST: config.redis.host,
          REDIS_PORT: config.redis.port,
          TASK_ID: taskId,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      let output = '';
      let errorOutput = '';
      let crawlerOutput = {}; // 用于存储从爬虫输出中解析的信息（如标题）

      // 设置超时
      const timer = setTimeout(() => {
        crawlerProcess.kill('SIGTERM');
        reject(new Error(`爬虫执行超时 (${timeout}ms)`));
      }, timeout);

      // 处理标准输出
      crawlerProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`[爬虫输出] ${data.toString().trim()}`);

        // 尝试解析进度信息
        try {
          const lines = data.toString().trim().split('\n');
          for (const line of lines) {
            // 标准格式: PROGRESS:XX
            if (line.includes('PROGRESS:')) {
              const progress = parseInt(line.split('PROGRESS:')[1]);
              updateTaskProgress(taskId, progress);
            } 
            // 替代格式: [图片下载] 进度: X/Y
            else if (line.includes('[图片下载] 进度:')) {
              const match = line.match(/进度:\s*(\d+)\/(\d+)/);
              if (match) {
                const current = parseInt(match[1]);
                const total = parseInt(match[2]);
                const progress = total > 0 ? Math.round((current / total) * 100) : 0;
                updateTaskProgress(taskId, progress);
              }
            } 
            // 爬取数量: CRAWLED:XX
            else if (line.includes('CRAWLED:')) {
              const count = parseInt(line.split('CRAWLED:')[1]);
              updateTaskCrawledCount(taskId, count);
            }
            // 页面标题: TITLE:XXX
            else if (line.includes('TITLE:')) {
              const title = line.split('TITLE:')[1]?.trim();
              if (title) {
                crawlerOutput.title = title;
              }
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      });

      // 处理标准错误
      crawlerProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`[爬虫错误] ${data.toString().trim()}`);
      });

      // 处理进程结束
      crawlerProcess.on('close', (code) => {
        clearTimeout(timer);

        if (code === 0) {
          console.log(`[爬虫] 任务 ${taskId} 完成`);
          resolve({
            success: true,
            taskId,
            output,
            ...crawlerOutput, // 包含从输出中解析的信息（如标题）
          });
        } else {
          console.error(`[爬虫] 任务 ${taskId} 失败，退出码: ${code}`);
          reject(new Error(`爬虫进程退出，代码: ${code}\n${errorOutput}`));
        }
      });

      // 处理进程错误
      crawlerProcess.on('error', (error) => {
        clearTimeout(timer);
        console.error(`[爬虫] 进程错误:`, error);
        reject(error);
      });

    } catch (error) {
      reject(new Error(`启动爬虫失败: ${error.message}`));
    }
  });
}

/**
 * 更新任务进度
 */
async function updateTaskProgress(taskId, progress) {
  try {
    await Task.findByIdAndUpdate(
      taskId,
      { progress: Math.min(progress, 99) }, // 不超过 99%，直到完成时为 100%
      { new: true }
    );
  } catch (error) {
    console.error(`更新任务进度失败: ${error.message}`);
  }
}

/**
 * 更新任务爬取数量
 */
async function updateTaskCrawledCount(taskId, count) {
  try {
    await Task.findByIdAndUpdate(
      taskId,
      { crawledItems: count },
      { new: true }
    );
  } catch (error) {
    console.error(`更新爬取数量失败: ${error.message}`);
  }
}

module.exports = {
  executeCrawler,
  updateTaskProgress,
  updateTaskCrawledCount,
};
