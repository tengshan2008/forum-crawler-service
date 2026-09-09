const { executeCrawler } = require('./crawlerExecutor');
const taskService = require('./taskService');
const taskEventBus = require('./taskEventBus');

// Bull 队列消费逻辑（B1 收敛）：原先内联在 index.js 的 57 行 worker 迁移至此，
// 任务状态流转统一委托 taskService，失败时追加（而非覆盖）errorLog 并向 Bull 重抛
// 以保留 attempts/backoff 重试机制。
// SSE：任务状态事件（running/completed/failed）在此统一发布，
// progress/crawled/title/log 事件由 crawlerExecutor 解析爬虫输出时发布。
async function processCrawlerJob(job) {
  const { taskId, forumUrl, taskType, config: taskConfig, crawlType } = job.data;

  try {
    console.log(`[爬虫队列] 开始处理任务: ${taskId}`);

    await taskService.markRunning(taskId);
    taskEventBus.publish(taskId, 'status', { status: 'running' }).catch(() => {});

    const result = await executeCrawler(taskId, forumUrl, taskType, taskConfig, crawlType);

    await taskService.markCompleted(taskId, result);
    taskEventBus
      .publish(taskId, 'status', {
        status: 'completed',
        progress: 100,
        data: {
          crawledItems: result?.crawled_posts,
          skippedItems: result?.skipped_posts,
          failedItems: result?.failed_posts,
        },
      })
      .catch(() => {});
    console.log(`[爬虫队列] 任务完成: ${taskId}`);

    job.progress(100);
    return result;
  } catch (error) {
    console.error(`[爬虫队列] 任务失败: ${taskId}`, error.message);
    await taskService.markFailed(taskId, error);
    taskEventBus
      .publish(taskId, 'status', { status: 'failed', error: error.message })
      .catch(() => {});
    throw error;
  }
}

module.exports = { processCrawlerJob };
