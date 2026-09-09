jest.mock('../../services/taskService', () => ({
  markRunning: jest.fn(),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
}));
jest.mock('../../services/crawlerExecutor', () => ({
  executeCrawler: jest.fn(),
}));
jest.mock('../../services/taskEventBus', () => ({
  publish: jest.fn().mockResolvedValue(undefined),
}));

const { processCrawlerJob } = require('../crawlerQueueWorker');
const taskService = require('../../services/taskService');
const taskEventBus = require('../../services/taskEventBus');
const { executeCrawler } = require('../../services/crawlerExecutor');

const makeJob = (overrides = {}) => ({
  data: {
    taskId: 't1',
    forumUrl: 'http://post/1',
    taskType: 'novel',
    config: { maxPages: 3 },
    crawlType: 'single',
    ...overrides,
  },
  progress: jest.fn(),
});

beforeEach(() => jest.clearAllMocks());

describe('crawlerQueueWorker 队列消费（B1/D3 状态机收敛）', () => {
  it('成功路径：markRunning → executeCrawler → markCompleted → progress(100)', async () => {
    const job = makeJob();
    const crawlResult = { title: '标题', crawled_posts: 2, total_posts: 3 };
    executeCrawler.mockResolvedValue(crawlResult);
    taskService.markCompleted.mockResolvedValue({ _id: 't1' });

    const result = await processCrawlerJob(job);

    expect(taskService.markRunning).toHaveBeenCalledWith('t1');
    expect(executeCrawler).toHaveBeenCalledWith('t1', 'http://post/1', 'novel', { maxPages: 3 }, 'single');
    expect(taskService.markCompleted).toHaveBeenCalledWith('t1', crawlResult);
    expect(job.progress).toHaveBeenCalledWith(100);
    expect(result).toBe(crawlResult);

    // SSE 状态事件：running + completed
    expect(taskEventBus.publish).toHaveBeenCalledWith('t1', 'status', { status: 'running' });
    expect(taskEventBus.publish).toHaveBeenCalledWith(
      't1',
      'status',
      expect.objectContaining({ status: 'completed', progress: 100 })
    );
  });

  it('执行失败：markFailed 记录后向 Bull 重抛（保留重试/退避机制）', async () => {
    const job = makeJob();
    const error = new Error('python exited');
    executeCrawler.mockRejectedValue(error);

    await expect(processCrawlerJob(job)).rejects.toThrow('python exited');

    expect(taskService.markRunning).toHaveBeenCalledWith('t1');
    expect(taskService.markFailed).toHaveBeenCalledWith('t1', error);
    expect(taskService.markCompleted).not.toHaveBeenCalled();
    expect(job.progress).not.toHaveBeenCalled();
    // SSE：失败也发布终态事件
    expect(taskEventBus.publish).toHaveBeenCalledWith(
      't1',
      'status',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('markRunning 失败同样走 markFailed 并重抛', async () => {
    const job = makeJob();
    const error = new Error('Task not found');
    taskService.markRunning.mockRejectedValue(error);

    await expect(processCrawlerJob(job)).rejects.toThrow('Task not found');

    expect(taskService.markFailed).toHaveBeenCalledWith('t1', error);
    expect(executeCrawler).not.toHaveBeenCalled();
  });
});
