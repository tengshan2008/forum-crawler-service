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
 * @param {string} crawlType - 采集类型 (single, batch)
 * @returns {Promise} 爬虫执行结果
 */
async function executeCrawler(taskId, forumUrl, taskType, taskConfig, crawlType = 'single') {
  return new Promise((resolve, reject) => {
    try {
      // 构建 Python 爬虫命令
      const pythonPath = process.env.PYTHON_PATH || 'python3';
      const crawlerScript = '/app/crawler/crawl.py';

      // 构建参数
      // 批量采集需要更长的超时时间
      // 计算方式: 
      // - 每页约100个帖子，每个帖子需要 600-900 秒（获取、解析、保存、延迟）
      // - 所以每页需要 6000-9000 秒 (25-30分钟)
      // - 为了安全，设置为每页 360 分钟 (21600秒)
      const maxPages = taskConfig?.maxPages !== undefined ? taskConfig.maxPages : 10;

      let defaultTimeout;
      if (crawlType === 'batch') {
        // 批量采集: 每页 21600 秒 (360分钟) + 30秒缓冲
        const timePerPage = 21600;  // 秒
        const bufferTime = 30;     // 秒
        const calculatedTimeout = (maxPages * timePerPage + bufferTime) * 1000;  // 转换为毫秒
        defaultTimeout = Math.max(1800000, calculatedTimeout);  // 至少30分钟
        console.log(`[爬虫] 批量采集配置: maxPages=${maxPages}, 预计超时时间=${defaultTimeout}ms (${(defaultTimeout / 1000 / 60).toFixed(1)}分钟)`);
      } else {
        // 单贴采集: 30分钟
        defaultTimeout = 1800000;
        console.log(`[爬虫] 单贴采集配置: 超时时间=${defaultTimeout}ms (30分钟)`);
      }

      // 始终使用计算出的 defaultTimeout，忽略数据库中可能存储的旧 timeout 值
      const timeout = defaultTimeout;
      const startPage = taskConfig?.startPage || 1;
      const args = [
        crawlerScript,
        '--url', forumUrl,
        '--type', taskType,
        '--task-id', taskId,
        '--crawl-type', crawlType,  // 添加采集类型参数
        '--max-depth', taskConfig?.maxDepth || 3,
        '--delay', taskConfig?.delay || 1000,
        '--timeout', timeout,
        '--max-pages', maxPages, // 添加最大页数参数
        '--start-page', startPage, // 添加起始页参数
      ];

      // 构建完整的命令字符串用于日志记录
      const commandStr = `${pythonPath} ${args.join(' ')}`;
      console.log(`[爬虫] 启动爬虫: ${commandStr}`);

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
      let crawlerResult = null; // 用于存储爬虫返回的 JSON 结果

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
            // 爬虫返回的 JSON 结果: RESULT:{...}
            else if (line.includes('RESULT:')) {
              try {
                const jsonStr = line.split('RESULT:')[1];
                crawlerResult = JSON.parse(jsonStr);
                console.log(`[爬虫] 解析到爬虫结果:`, crawlerResult);
              } catch (e) {
                console.warn(`[爬虫] 解析爬虫 JSON 结果失败:`, e.message);
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
      crawlerProcess.on('close', async (code) => {
        clearTimeout(timer);

        if (code === 0) {
          console.log(`[爬虫] 任务 ${taskId} 完成`);

          // 构建更新数据
          const updateData = {
            status: 'completed',
            progress: 100,
            endTime: new Date(),
          };

          // 如果有爬虫结果，更新统计信息
          if (crawlerResult) {
            if (crawlerResult.crawled_posts !== undefined) {
              updateData.crawledItems = crawlerResult.crawled_posts;
            }
            if (crawlerResult.skipped_posts !== undefined) {
              updateData.skippedItems = crawlerResult.skipped_posts;
            }
            if (crawlerResult.failed_posts !== undefined) {
              updateData.failedItems = crawlerResult.failed_posts;
            }
            // 保存跳过原因详情
            if (crawlerResult.skip_details && Array.isArray(crawlerResult.skip_details)) {
              updateData.skipReasons = crawlerResult.skip_details;
              console.log(`[爬虫] 保存跳过原因: ${crawlerResult.skip_details.length} 条`);
            }
          }

          // 如果解析到标题，更新任务名称
          if (crawlerOutput.title) {
            updateData.name = crawlerOutput.title;
          }

          try {
            await Task.findByIdAndUpdate(taskId, updateData, { new: true });
            if (crawlerOutput.title) {
              console.log(`[爬虫] 更新任务 ${taskId} 名称为: ${crawlerOutput.title}`);
            }
          } catch (error) {
            console.error(`[爬虫] 更新任务失败: ${error.message}`);
          }

          resolve({
            success: true,
            taskId,
            output,
            ...crawlerOutput, // 包含从输出中解析的信息（如标题）
            ...crawlerResult, // 包含爬虫返回的详细结果
          });
        } else {
          console.error(`[爬虫] 任务 ${taskId} 失败，退出码: ${code}`);
          // 标记任务为失败
          try {
            await Task.findByIdAndUpdate(
              taskId,
              {
                status: 'failed',
                endTime: new Date(),
              },
              { new: true }
            );
          } catch (error) {
            console.error(`[爬虫] 更新任务状态失败: ${error.message}`);
          }
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
