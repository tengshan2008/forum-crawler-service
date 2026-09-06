const { executeCrawler } = require('./crawlerExecutor');
const taskService = require('./taskService');

// Bull 队列消费逻辑（B1 收敛）：原先内联在 index.js 的 57 行 worker 迁移至此，
// 任务状态流转统一委托 taskService，失败时追加（而非覆盖）errorLog 并向 Bull 重抛
// 以保留 attempts/backoff 重试机制。
async function processCrawlerJob(job) {
  const { taskId, forumUrl, taskType, config: taskConfig, crawlType } = job.data;

  try {
    console.log(`[爬虫队列] 开始处理任务: ${taskId}`);

    await taskService.markRunning(taskId);

    const result = await executeCrawler(taskId, forumUrl, taskType, taskConfig, crawlType);

    await taskService.markCompleted(taskId, result);
    console.log(`[爬虫队列] 任务完成: ${taskId}`);

    job.progress(100);
    return result;
  } catch (error) {
    console.error(`[爬虫队列] 任务失败: ${taskId}`, error.message);
    await taskService.markFailed(taskId, error);
    throw error;
  }
}

module.exports = { processCrawlerJob };
