const Queue = require('bull');
const config = require('../config/config');

// 创建爬虫任务队列
const crawlerQueue = new Queue('crawler', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: 0,
  },
});

// 队列事件监听
crawlerQueue.on('completed', (job) => {
  console.log(`✓ 爬虫任务 ${job.data.taskId} 完成`);
});

crawlerQueue.on('failed', (job, error) => {
  console.error(`✗ 爬虫任务 ${job.data.taskId} 失败:`, error.message);
});

crawlerQueue.on('progress', (job, progress) => {
  console.log(`⊙ 爬虫任务 ${job.data.taskId} 进度: ${progress}%`);
});

// 添加爬虫任务到队列
async function addCrawlerTask(taskId, forumUrl, taskType, taskConfig, crawlType = 'single') {
  try {
    const job = await crawlerQueue.add(
      {
        taskId,
        forumUrl,
        taskType,
        config: taskConfig,
        crawlType,
      },
      {
        attempts: 3, // 重试 3 次
        backoff: {
          type: 'exponential',
          delay: 2000, // 初始延迟 2 秒
        },
        removeOnComplete: true, // 完成后删除任务
        removeOnFail: false, // 失败时保留任务便于调试
      }
    );

    console.log(`爬虫任务已加入队列: ${job.id}`);
    return job;
  } catch (error) {
    console.error('添加爬虫任务失败:', error);
    throw error;
  }
}

// 获取队列统计信息
async function getQueueStats() {
  const counts = await crawlerQueue.getJobCounts();
  return {
    active: counts.active,
    waiting: counts.waiting,
    completed: counts.completed,
    failed: counts.failed,
    paused: counts.paused,
    delayed: counts.delayed,
  };
}

// 移除指定任务在等待/延迟队列中的 job（D4 取消任务）
// running 中的 job 由 Bull 锁定无法移除；返回是否成功移除了至少一个 job
async function removeQueuedTask(taskId) {
  const jobs = await crawlerQueue.getJobs(['waiting', 'delayed']);
  const matched = jobs.filter((job) => job.data && job.data.taskId === taskId);
  if (matched.length === 0) {
    return false;
  }
  await Promise.all(matched.map((job) => job.remove()));
  console.log(`已从队列移除任务 ${taskId} 的 ${matched.length} 个待执行 job`);
  return true;
}

// 清空队列
async function clearQueue() {
  await crawlerQueue.empty();
  console.log('爬虫队列已清空');
}

module.exports = {
  crawlerQueue,
  addCrawlerTask,
  removeQueuedTask,
  getQueueStats,
  clearQueue,
};
