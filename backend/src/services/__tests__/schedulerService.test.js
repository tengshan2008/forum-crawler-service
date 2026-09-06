jest.mock('../../models/Task', () => ({ find: jest.fn() }));
jest.mock('../../services/crawlerQueue', () => ({ addCrawlerTask: jest.fn() }));
jest.mock('../../services/taskService', () => ({
  markScheduledRun: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
}));

const schedulerService = require('../schedulerService');
const Task = require('../../models/Task');
const { addCrawlerTask } = require('../../services/crawlerQueue');
const taskService = require('../../services/taskService');

const makeTask = (overrides = {}) => ({
  _id: 't1',
  name: '定时任务',
  forumUrl: 'http://post/1',
  sectionUrl: 'http://section/1',
  crawlType: 'batch',
  taskType: 'novel',
  config: {},
  schedule: { enabled: true, interval: 24, lastRunTime: null },
  save: jest.fn().mockResolvedValue(undefined),
  errorLog: [],
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('schedulerService 定时调度（D3 状态机收敛到 taskService）', () => {
  it('到期任务：markScheduledRun 后按采集类型入队，并显式传递 crawlType', async () => {
    const now = new Date();
    const task = makeTask();

    await schedulerService.checkTaskExecution(task, now);

    expect(taskService.markScheduledRun).toHaveBeenCalledWith(task, now);
    expect(addCrawlerTask).toHaveBeenCalledWith('t1', 'http://section/1', 'novel', {}, 'batch');
    expect(task.save).not.toHaveBeenCalled(); // 状态变更不再绕过 taskService 直接落库
  });

  it('单帖定时任务使用 forumUrl 入队', async () => {
    const now = new Date();
    const task = makeTask({ crawlType: 'single' });

    await schedulerService.checkTaskExecution(task, now);

    expect(addCrawlerTask).toHaveBeenCalledWith('t1', 'http://post/1', 'novel', {}, 'single');
  });

  it('入队失败：委托 markFailed 记录失败', async () => {
    const now = new Date();
    const task = makeTask();
    addCrawlerTask.mockRejectedValue(new Error('redis down'));

    await schedulerService.checkTaskExecution(task, now);

    expect(taskService.markFailed).toHaveBeenCalledWith('t1', expect.any(Error));
    expect(task.status).not.toBe('failed'); // 失败标记由 taskService 负责，此处不直接改库
  });

  it('未到期任务：不做任何状态变更与入队', async () => {
    const now = new Date();
    const task = makeTask({
      schedule: { enabled: true, interval: 24, lastRunTime: new Date(now.getTime() - 60 * 1000) },
    });

    await schedulerService.checkTaskExecution(task, now);

    expect(taskService.markScheduledRun).not.toHaveBeenCalled();
    expect(addCrawlerTask).not.toHaveBeenCalled();
  });

  it('checkAndRunScheduledTasks：按条件筛选并逐个处理任务', async () => {
    const tasks = [makeTask({ _id: 'a' }), makeTask({ _id: 'b' })];
    Task.find.mockResolvedValue(tasks);

    await schedulerService.checkAndRunScheduledTasks();

    expect(Task.find).toHaveBeenCalledWith({
      'schedule.enabled': true,
      status: { $ne: 'running' },
    });
    expect(addCrawlerTask).toHaveBeenCalledTimes(2);
  });

  it('checkAndRunScheduledTasks：无任务时直接返回', async () => {
    Task.find.mockResolvedValue([]);

    await schedulerService.checkAndRunScheduledTasks();

    expect(addCrawlerTask).not.toHaveBeenCalled();
  });
});
