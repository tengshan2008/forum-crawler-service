const mockTask = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
};

jest.mock('../../models/Task', () => mockTask);
jest.mock('../../services/crawlerQueue', () => ({
  addCrawlerTask: jest.fn(),
  removeQueuedTask: jest.fn(),
  getQueueStats: jest.fn(),
}));
jest.mock('../../services/taskEventBus', () => ({
  publish: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn(),
  getRecent: jest.fn().mockResolvedValue([]),
  isTerminalEvent: jest.fn(),
}));
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

const service = require('../taskService');
const taskEventBus = require('../../services/taskEventBus');
const AppError = require('../../utils/AppError');
const path = require('path');

beforeEach(() => jest.clearAllMocks());

// 断言 next 风格外抛出的 AppError
async function expectAppError(promise, statusCode) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((err) => {
    expect(err.statusCode).toBe(statusCode);
  });
}

describe('taskService 角色数据可见性', () => {
  it('listTasks：普通用户只能看到自己的任务，并应用 status/crawlType 过滤', async () => {
    mockTask.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ _id: 't1' }]),
    });
    mockTask.countDocuments.mockResolvedValue(1);

    const result = await service.listTasks(
      { status: 'pending', crawlType: 'batch', page: '2', limit: '5', sort: '-createdAt' },
      { role: 'user', userId: 'u1' }
    );

    expect(mockTask.find.mock.calls[0][0]).toEqual({
      userId: 'u1',
      status: 'pending',
      crawlType: 'batch',
    });
    expect(result).toEqual({
      tasks: [{ _id: 't1' }],
      total: 1,
    });
  });

  it('listTasks：管理员不加 userId 过滤', async () => {
    mockTask.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });
    mockTask.countDocuments.mockResolvedValue(0);

    await service.listTasks({}, { role: 'admin', userId: 'a1' });

    expect(mockTask.find.mock.calls[0][0]).toEqual({});
  });

  it('getTask：普通用户查他人任务返回 404（查询被所有权约束）', async () => {
    mockTask.findOne.mockResolvedValue(null);

    await expectAppError(service.getTask('t1', { role: 'user', userId: 'u1' }), 404);
    expect(mockTask.findOne.mock.calls[0][0]).toEqual({ _id: 't1', userId: 'u1' });
  });

  it('getTask：管理员可查任意任务', async () => {
    mockTask.findOne.mockResolvedValue({ _id: 't1' });

    const task = await service.getTask('t1', { role: 'admin' });
    expect(mockTask.findOne.mock.calls[0][0]).toEqual({ _id: 't1' });
    expect(task).toEqual({ _id: 't1' });
  });
});

describe('taskService 创建校验与默认命名', () => {
  it('单帖采集缺少 forumUrl 抛 400', async () => {
    await expectAppError(
      service.createTask({ crawlType: 'single', sectionUrl: 'http://s' }, 'u1'),
      400
    );
    expect(mockTask.create).not.toHaveBeenCalled();
  });

  it('批量采集缺少 sectionUrl 抛 400', async () => {
    await expectAppError(
      service.createTask({ crawlType: 'batch', forumUrl: 'http://p' }, 'u1'),
      400
    );
    expect(mockTask.create).not.toHaveBeenCalled();
  });

  it('名称为空时按采集类型生成默认名称，状态固定 pending', async () => {
    mockTask.create.mockResolvedValue({ _id: 't9' });

    await service.createTask({ crawlType: 'batch', sectionUrl: 'http://s', name: '  ' }, 'u1');

    const payload = mockTask.create.mock.calls[0][0];
    expect(payload.name).toMatch(/^批量采集_\d{4}-/);
    expect(payload.status).toBe('pending');
    expect(payload.userId).toBe('u1');
  });

  it('单帖采集默认名称前缀为"单帖采集"，提供名称时原样使用', async () => {
    mockTask.create.mockResolvedValue({ _id: 't9' });

    await service.createTask({ crawlType: 'single', forumUrl: 'http://p', name: '我的任务' }, 'u1');

    expect(mockTask.create.mock.calls[0][0].name).toBe('我的任务');
  });
});

describe('taskService 更新白名单与所有权', () => {
  it('只接受白名单字段，忽略 status/userId 等敏感字段', async () => {
    mockTask.findOneAndUpdate.mockResolvedValue({ _id: 't1' });

    await service.updateTask(
      't1',
      { role: 'user', userId: 'u1' },
      { name: '新名字', description: 'desc', status: 'completed', userId: '别人' }
    );

    const [query, updates] = mockTask.findOneAndUpdate.mock.calls[0];
    expect(query).toEqual({ _id: 't1', userId: 'u1' });
    expect(updates).toEqual({ name: '新名字', description: 'desc' });
  });

  it('任务不存在抛 404', async () => {
    mockTask.findOneAndUpdate.mockResolvedValue(null);

    await expectAppError(
      service.updateTask('missing', { role: 'admin' }, {}),
      404
    );
  });
});

describe('taskService 删除', () => {
  it('普通用户删除他人任务返回 404（查询被所有权约束）', async () => {
    mockTask.findOneAndDelete.mockResolvedValue(null);

    await expectAppError(service.deleteTask('t2', { role: 'user', userId: 'u1' }), 404);
    expect(mockTask.findOneAndDelete.mock.calls[0][0]).toEqual({ _id: 't2', userId: 'u1' });
  });
});

describe('taskService 状态机与归属（start/pause/resume）', () => {
  const makeTask = (overrides = {}) => ({
    _id: 't1',
    userId: 'u1',
    status: 'pending',
    save: jest.fn().mockResolvedValue(undefined),
    errorLog: [],
    ...overrides,
  });

  it('startTask：非所有者且非管理员抛 403', async () => {
    mockTask.findById.mockResolvedValue(makeTask({ userId: 'owner' }));

    await expectAppError(
      service.startTask('t1', { role: 'user', userId: 'u1' }),
      403
    );
  });

  it('startTask：管理员可启动他人任务', async () => {
    const task = makeTask({ userId: 'owner' });
    mockTask.findById.mockResolvedValue(task);

    await service.startTask('t1', { role: 'admin', userId: 'a1' });

    expect(task.status).toBe('running');
    expect(task.startTime).toBeInstanceOf(Date);
    expect(task.progress).toBe(0);
    expect(task.crawledItems).toBe(0);
    expect(task.save).toHaveBeenCalled();
  });

  it('startTask：running 状态再次启动抛 400（状态机校验）', async () => {
    mockTask.findById.mockResolvedValue(makeTask({ status: 'running' }));

    await expectAppError(
      service.startTask('t1', { role: 'user', userId: 'u1' }),
      400
    );
  });

  it('startTask：兼容旧数据，缺 userId 时自动归属当前用户', async () => {
    const task = makeTask({ userId: null });
    mockTask.findById.mockResolvedValue(task);

    await service.startTask('t1', { role: 'user', userId: 'u1' });

    expect(task.userId).toBe('u1');
    expect(task.status).toBe('running');
  });

  it('startTask：入队失败时任务标记 failed 并写入 errorLog', async () => {
    const task = makeTask({ crawlType: 'single', forumUrl: 'http://p' });
    mockTask.findById.mockResolvedValue(task);
    const { addCrawlerTask } = require('../../services/crawlerQueue');
    addCrawlerTask.mockRejectedValue(new Error('redis down'));

    const result = await service.startTask('t1', { role: 'user', userId: 'u1' });

    expect(task.status).toBe('failed');
    expect(task.errorLog).toHaveLength(1);
    expect(task.errorLog[0].error).toBe('redis down');
    expect(result).toBe(task);
  });

  it('startTask：成功路径按采集类型选择 URL 并入队', async () => {
    const task = makeTask({ crawlType: 'batch', sectionUrl: 'http://s' });
    mockTask.findById.mockResolvedValue(task);
    const { addCrawlerTask } = require('../../services/crawlerQueue');
    addCrawlerTask.mockResolvedValue(undefined);

    await service.startTask('t1', { role: 'user', userId: 'u1' });

    expect(addCrawlerTask).toHaveBeenCalledWith('t1', 'http://s', task.taskType, task.config, 'batch');
  });

  it('pauseTask：running 状态暂停成功；非所有者抛 403', async () => {
    const task = makeTask({ status: 'running' });
    mockTask.findById.mockResolvedValue(task);
    await service.pauseTask('t1', { role: 'user', userId: 'u1' });
    expect(task.status).toBe('paused');

    mockTask.findById.mockResolvedValue(makeTask({ userId: 'owner' }));
    await expectAppError(
      service.pauseTask('t1', { role: 'user', userId: 'u1' }),
      403
    );
  });

  it('resumeTask：paused 状态恢复为 running', async () => {
    const task = makeTask({ status: 'paused' });
    mockTask.findById.mockResolvedValue(task);

    await service.resumeTask('t1', { role: 'user', userId: 'u1' });

    expect(task.status).toBe('running');
    expect(task.save).toHaveBeenCalled();
  });

  it('任务不存在时 start/pause/resume 均抛 404', async () => {
    mockTask.findById.mockResolvedValue(null);

    await expectAppError(service.startTask('x', { role: 'admin' }), 404);
    await expectAppError(service.pauseTask('x', { role: 'admin' }), 404);
    await expectAppError(service.resumeTask('x', { role: 'admin' }), 404);
  });
});

describe('taskService 系统内部状态流转（队列 worker / 调度器专用）', () => {
  const makeTask = (overrides = {}) => ({
    _id: 't1',
    status: 'pending',
    name: '',
    save: jest.fn().mockResolvedValue(undefined),
    errorLog: [],
    schedule: {},
    ...overrides,
  });

  describe('markRunning', () => {
    it('置 running/progress 5/lastCrawlTime 并保存', async () => {
      const task = makeTask();
      mockTask.findById.mockResolvedValue(task);

      const result = await service.markRunning('t1');

      expect(task.status).toBe('running');
      expect(task.progress).toBe(5);
      expect(task.lastCrawlTime).toBeInstanceOf(Date);
      expect(task.save).toHaveBeenCalled();
      expect(result).toBe(task);
    });

    it('任务不存在抛 404', async () => {
      mockTask.findById.mockResolvedValue(null);
      await expectAppError(service.markRunning('x'), 404);
    });
  });

  describe('markCompleted', () => {
    it('置 completed/progress 100/统计与 endTime，空名称时采用爬虫标题', async () => {
      const task = makeTask({ name: '' });
      mockTask.findById.mockResolvedValue(task);

      await service.markCompleted('t1', { title: '帖子标题', crawled_posts: 3, total_posts: 5 });

      expect(task.name).toBe('帖子标题');
      expect(task.status).toBe('completed');
      expect(task.progress).toBe(100);
      expect(task.crawledItems).toBe(3);
      expect(task.totalItems).toBe(5);
      expect(task.endTime).toBeInstanceOf(Date);
      expect(task.save).toHaveBeenCalled();
    });

    it('统计字段缺失时回退为 1；已有名称不被覆盖', async () => {
      const task = makeTask({ name: '既有名称' });
      mockTask.findById.mockResolvedValue(task);

      await service.markCompleted('t1', {});

      expect(task.name).toBe('既有名称');
      expect(task.crawledItems).toBe(1);
      expect(task.totalItems).toBe(1);
    });

    it('任务不存在抛 404', async () => {
      mockTask.findById.mockResolvedValue(null);
      await expectAppError(service.markCompleted('x', {}), 404);
    });
  });

  describe('markFailed（含 errorLog 上限）', () => {
    it('置 failed 并追加 errorLog（message 格式），不再整体覆盖', async () => {
      const existing = [{ timestamp: new Date(), message: '旧日志' }];
      const task = makeTask({ errorLog: existing });
      mockTask.findById.mockResolvedValue(task);

      await service.markFailed('t1', new Error('crawl crashed'));

      expect(task.status).toBe('failed');
      expect(task.errorLog).toHaveLength(2);
      expect(task.errorLog[0].message).toBe('旧日志');
      expect(task.errorLog[1].message).toBe('crawl crashed');
      expect(task.errorLog[1].timestamp).toBeInstanceOf(Date);
      expect(task.save).toHaveBeenCalled();
    });

    it('errorLog 超过 50 条时裁剪，保留最近的 50 条', async () => {
      const task = makeTask({ errorLog: Array.from({ length: 50 }, (_, i) => ({ timestamp: new Date(), message: `m${i}` })) });
      mockTask.findById.mockResolvedValue(task);

      await service.markFailed('t1', new Error('newest'));

      expect(task.errorLog).toHaveLength(50);
      expect(task.errorLog[49].message).toBe('newest');
      expect(task.errorLog[0].message).toBe('m1'); // 最旧的 m0 被裁剪
    });

    it('任务不存在抛 404', async () => {
      mockTask.findById.mockResolvedValue(null);
      await expectAppError(service.markFailed('x', new Error('e')), 404);
    });
  });

  describe('markScheduledRun', () => {
    it('重置进度与计数，记录本轮调度时间', async () => {
      const now = new Date();
      const task = makeTask({ schedule: {}, progress: 80, crawledItems: 9, failedItems: 2 });
      mockTask.findById.mockResolvedValue(task);

      const result = await service.markScheduledRun(task, now);

      expect(task.status).toBe('running');
      expect(task.schedule.lastRunTime).toBe(now);
      expect(task.progress).toBe(0);
      expect(task.crawledItems).toBe(0);
      expect(task.failedItems).toBe(0);
      expect(task.save).toHaveBeenCalled();
      expect(result).toBe(task);
    });
  });
});

describe('taskService.cancelTask（D4 取消排队任务）', () => {
  const { removeQueuedTask } = require('../../services/crawlerQueue');
  const adminUser = { role: 'admin', userId: 'admin1' };

  const makeTask = (overrides = {}) => ({
    _id: 't1',
    status: 'pending',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  it('running 任务不可取消（400）', async () => {
    mockTask.findById.mockResolvedValue(makeTask({ status: 'running' }));

    await expectAppError(service.cancelTask('t1', adminUser), 400);
    expect(removeQueuedTask).not.toHaveBeenCalled();
  });

  it('任务不在等待队列中时返回 400', async () => {
    mockTask.findById.mockResolvedValue(makeTask({ status: 'pending' }));
    removeQueuedTask.mockResolvedValue(false);

    await expectAppError(service.cancelTask('t1', adminUser), 400);
  });

  it('排队任务取消成功：移除队列 job 并回退到 paused', async () => {
    const task = makeTask({ status: 'pending' });
    mockTask.findById.mockResolvedValue(task);
    removeQueuedTask.mockResolvedValue(true);

    const result = await service.cancelTask('t1', adminUser);

    expect(removeQueuedTask).toHaveBeenCalledWith('t1');
    expect(task.status).toBe('paused');
    expect(task.save).toHaveBeenCalled();
    expect(result).toBe(task);
  });
});

describe('taskService.getTaskLogs（D2 任务日志尾部）', () => {
  const fsPromises = require('fs').promises;
  const adminUser = { role: 'admin', userId: 'admin1' };

  beforeEach(() => jest.clearAllMocks());

  it('返回日志文件尾部（默认 100 行）且 exists 为 true', async () => {
    mockTask.findById.mockResolvedValue({ _id: 't1' });
    const allLines = Array.from({ length: 150 }, (_, i) => `line-${i + 1}`);
    fsPromises.readFile.mockResolvedValue(allLines.join('\n') + '\n');

    const result = await service.getTaskLogs('t1', adminUser);

    expect(fsPromises.readFile).toHaveBeenCalledWith(
      expect.stringContaining(`crawler${path.sep}logs${path.sep}task_t1.log`),
      'utf-8'
    );
    expect(result.exists).toBe(true);
    expect(result.logs).toHaveLength(100);
    expect(result.logs[0]).toBe('line-51');
    expect(result.logs[99]).toBe('line-150');
  });

  it('日志文件不存在时返回空列表且 exists 为 false', async () => {
    mockTask.findById.mockResolvedValue({ _id: 't2' });
    fsPromises.readFile.mockRejectedValue(Object.assign(new Error('no file'), { code: 'ENOENT' }));

    const result = await service.getTaskLogs('t2', adminUser);

    expect(result.exists).toBe(false);
    expect(result.logs).toEqual([]);
  });

  it('其他读文件错误原样抛出', async () => {
    mockTask.findById.mockResolvedValue({ _id: 't3' });
    fsPromises.readFile.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    await expect(service.getTaskLogs('t3', adminUser)).rejects.toThrow('EACCES');
  });

  it('Redis 事件历史存在时优先返回事件日志，且不再读本地文件（跨实例可见）', async () => {
    mockTask.findById.mockResolvedValue({ _id: 't4' });
    taskEventBus.getRecent.mockResolvedValue([
      { id: 1, type: 'progress', data: { progress: 10 } },
      { id: 2, type: 'log', data: { line: '第一行日志', stream: 'stdout' } },
      { id: 3, type: 'log', data: { line: '第二行日志', stream: 'stderr' } },
    ]);

    const result = await service.getTaskLogs('t4', adminUser, { lines: 100 });

    expect(taskEventBus.getRecent).toHaveBeenCalledWith('t4');
    expect(fsPromises.readFile).not.toHaveBeenCalled();
    expect(result.exists).toBe(true);
    expect(result.source).toBe('events');
    expect(result.logs).toEqual(['第一行日志', '第二行日志']);
  });

  it('事件历史超过 lines 上限时只返回尾部', async () => {
    mockTask.findById.mockResolvedValue({ _id: 't5' });
    taskEventBus.getRecent.mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => ({
        id: i + 1,
        type: 'log',
        data: { line: `L${i + 1}` },
      }))
    );

    const result = await service.getTaskLogs('t5', adminUser, { lines: 200 });

    expect(result.logs).toHaveLength(200);
    expect(result.logs[0]).toBe('L101');
    expect(result.logs[199]).toBe('L300');
  });

  it('事件总线异常时静默回退文件日志', async () => {
    mockTask.findById.mockResolvedValue({ _id: 't6' });
    taskEventBus.getRecent.mockRejectedValue(new Error('redis down'));
    fsPromises.readFile.mockResolvedValue('文件日志A\n文件日志B\n');

    const result = await service.getTaskLogs('t6', adminUser);

    expect(result.source).toBe('file');
    expect(result.logs).toEqual(['文件日志A', '文件日志B']);
  });
});
