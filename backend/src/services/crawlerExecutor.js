const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Task = require('../models/Task');
const config = require('../config/config');
const taskEventBus = require('./taskEventBus');

// 事件发布为 fire-and-forget：Redis 故障只记录日志，不影响爬虫执行
function publishEvent(taskId, type, data) {
  taskEventBus.publish(taskId, type, data).catch(() => {});
}

// 爬虫脚本路径解析：
// 1. 环境变量 CRAWLER_SCRIPT_PATH（本地非 Docker 运行时显式指定）
// 2. Docker 容器内默认路径 /app/crawler/crawl.py
// 3. 回退到仓库内 crawler/crawl.py（本地源码运行）
const DOCKER_CRAWLER_SCRIPT = '/app/crawler/crawl.py';
const LOCAL_CRAWLER_SCRIPT = path.resolve(__dirname, '../../../crawler/crawl.py');
function resolveCrawlerScript() {
  if (process.env.CRAWLER_SCRIPT_PATH) return process.env.CRAWLER_SCRIPT_PATH;
  if (fs.existsSync(DOCKER_CRAWLER_SCRIPT)) return DOCKER_CRAWLER_SCRIPT;
  return LOCAL_CRAWLER_SCRIPT;
}

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
      const crawlerScript = resolveCrawlerScript();

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

      // 执行超时（墙钟），但任务暂停期间冻结计时：
      // 爬虫在暂停闸门上挂起时不消耗执行额度，恢复后用剩余时间重新计时。
      // deadline 在暂停区间不外推，天然排除暂停时长。
      let timeoutDeadline = Date.now() + timeout;
      let runTimer = null;
      let timerPaused = false;

      const clearRunTimer = () => {
        if (runTimer) {
          clearTimeout(runTimer);
          runTimer = null;
        }
      };
      const armRunTimer = (delay) => {
        clearRunTimer();
        runTimer = setTimeout(() => {
          console.error(`[爬虫] 任务 ${taskId} 执行超时，发送 SIGTERM`);
          crawlerProcess.kill('SIGTERM');
          reject(new Error(`爬虫执行超时 (${timeout}ms)`));
        }, delay);
      };
      const pauseRunTimer = () => {
        if (timerPaused) return;
        timerPaused = true;
        clearRunTimer();
        console.log(`[爬虫] 任务 ${taskId} 已暂停，冻结执行超时计时`);
      };
      const resumeRunTimer = () => {
        if (!timerPaused) return;
        timerPaused = false;
        const remaining = Math.max(timeoutDeadline - Date.now(), 1000);
        armRunTimer(remaining);
        console.log(`[爬虫] 任务 ${taskId} 已恢复，剩余执行时间 ${Math.round(remaining / 1000)}s`);
      };
      armRunTimer(timeout);

      // 处理标准输出
      crawlerProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[爬虫输出] ${text.trim()}`);

        // 尝试解析进度信息
        try {
          const lines = text.split('\n');
          for (const rawLine of lines) {
            const line = rawLine.replace(/\s+$/, '');
            if (!line) continue;

            // 原始日志行推给 SSE 日志流（结构化行同时推送，前端日志区按行展示）
            publishEvent(taskId, 'log', { line, stream: 'stdout' });

            // 标准格式: PROGRESS:XX
            if (line.includes('PROGRESS:')) {
              const progress = parseInt(line.split('PROGRESS:')[1], 10);
              updateTaskProgress(taskId, progress);
              publishEvent(taskId, 'progress', { progress });
            }
            // 替代格式: [图片下载] 进度: X/Y
            else if (line.includes('[图片下载] 进度:')) {
              const match = line.match(/进度:\s*(\d+)\/(\d+)/);
              if (match) {
                const current = parseInt(match[1], 10);
                const total = parseInt(match[2], 10);
                const progress = total > 0 ? Math.round((current / total) * 100) : 0;
                updateTaskProgress(taskId, progress);
                publishEvent(taskId, 'progress', { progress });
              }
            }
            // 爬取数量: CRAWLED:XX
            else if (line.includes('CRAWLED:')) {
              const count = parseInt(line.split('CRAWLED:')[1], 10);
              updateTaskCrawledCount(taskId, count);
              publishEvent(taskId, 'crawled', { count });
            }
            // 页面标题: TITLE:XXX
            else if (line.includes('TITLE:')) {
              const title = line.split('TITLE:')[1]?.trim();
              if (title) {
                crawlerOutput.title = title;
                publishEvent(taskId, 'title', { title });
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
            // 暂停闸门标记（crawl.py wait_if_paused）：冻结/恢复执行超时计时
            else if (line.includes('PAUSED:')) {
              pauseRunTimer();
            }
            else if (line.includes('RESUMED:')) {
              resumeRunTimer();
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      });

      // 处理标准错误
      crawlerProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[爬虫错误] ${text.trim()}`);
        text.split('\n').forEach((rawLine) => {
          const line = rawLine.replace(/\s+$/, '');
          if (line) publishEvent(taskId, 'log', { line, stream: 'stderr' });
        });
      });

      // 处理进程结束
      crawlerProcess.on('close', async (code) => {
        clearRunTimer();

        if (code === 0) {
          console.log(`[爬虫] 任务 ${taskId} 完成`);

          // 状态与统计一律由 worker 经 taskService.markCompleted 落库
          //（状态流转只能在 taskService，避免完成写入覆盖用户的暂停等状态）。
          // 仅组装爬虫结果返回；crawlerResult 含 crawled_posts/skipped_posts/failed_posts/skip_details。
          resolve({
            success: true,
            taskId,
            output,
            ...crawlerOutput, // 包含从输出中解析的信息（如标题）
            ...crawlerResult, // 包含爬虫返回的详细结果
          });
        } else {
          console.error(`[爬虫] 任务 ${taskId} 失败，退出码: ${code}`);
          // 不直接写 failed：由 worker catch 统一 taskService.markFailed（追加 errorLog + SSE）
          reject(new Error(`爬虫进程退出，代码: ${code}\n${errorOutput}`));
        }
      });

      // 处理进程错误
      crawlerProcess.on('error', (error) => {
        clearRunTimer();
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
