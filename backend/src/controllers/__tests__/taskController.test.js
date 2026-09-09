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
  getQueueStats: jest.fn(),
}));
jest.mock('../../services/taskStreamService', () => ({
  openTaskEventStream: jest.fn().mockResolvedValue(jest.fn()),
}));

const controller = require('../taskController');
const { openTaskEventStream } = require('../../services/taskStreamService');
const AppError = require('../../utils/AppError');

// 构造可链式调用的 res mock，错误经 catchAsync 交给 next
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe('taskController.updateTask 字段白名单', () => {
  it('只传递白名单字段，忽略 status/userId 等敏感字段', async () => {
    mockTask.findOneAndUpdate.mockResolvedValue({ _id: 't1', name: '新名字' });

    const req = {
      params: { id: 't1' },
      user: { role: 'user', userId: 'u1' },
      body: {
        name: '新名字',
        status: 'completed', // 应被忽略
        userId: '别人', // 应被忽略
        description: 'desc',
      },
    };
    const res = makeRes();
    await controller.updateTask(req, res, jest.fn());

    const updates = mockTask.findOneAndUpdate.mock.calls[0][1];
    expect(updates).toEqual({ name: '新名字', description: 'desc' });
    expect(updates.status).toBeUndefined();
    expect(updates.userId).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('普通用户只能更新自己的任务', async () => {
    mockTask.findOneAndUpdate.mockResolvedValue({ _id: 't1' });
    const req = {
      params: { id: 't1' },
      user: { role: 'user', userId: 'u1' },
      body: { name: 'x' },
    };
    await controller.updateTask(req, makeRes(), jest.fn());

    const query = mockTask.findOneAndUpdate.mock.calls[0][0];
    expect(query).toEqual({ _id: 't1', userId: 'u1' });
  });

  it('管理员可更新任意任务', async () => {
    mockTask.findOneAndUpdate.mockResolvedValue({ _id: 't1' });
    const req = {
      params: { id: 't1' },
      user: { role: 'admin', userId: 'admin1' },
      body: {},
    };
    await controller.updateTask(req, makeRes(), jest.fn());

    expect(mockTask.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: 't1' });
  });

  it('任务不存在时抛出 404', async () => {
    mockTask.findOneAndUpdate.mockResolvedValue(null);
    const next = jest.fn();
    await controller.updateTask(
      { params: { id: 'missing' }, user: { role: 'admin' }, body: {} },
      makeRes(),
      next
    );

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
  });
});

describe('taskController.createTask 校验', () => {
  it('单帖采集缺少 forumUrl 时抛出 400', async () => {
    const next = jest.fn();
    await controller.createTask(
      { body: { crawlType: 'single', sectionUrl: 'http://s' }, user: { userId: 'u1' } },
      makeRes(),
      next
    );

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(mockTask.create).not.toHaveBeenCalled();
  });

  it('批量采集缺少 sectionUrl 时抛出 400', async () => {
    const next = jest.fn();
    await controller.createTask(
      { body: { crawlType: 'batch', forumUrl: 'http://p' }, user: { userId: 'u1' } },
      makeRes(),
      next
    );

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(mockTask.create).not.toHaveBeenCalled();
  });

  it('名称为空时自动生成默认名称并创建任务', async () => {
    mockTask.create.mockResolvedValue({ _id: 't9', name: expect.any(String) });
    const res = makeRes();
    await controller.createTask(
      { body: { crawlType: 'batch', sectionUrl: 'http://s', name: '   ' }, user: { userId: 'u1' } },
      res,
      jest.fn()
    );

    const created = mockTask.create.mock.calls[0][0];
    expect(created.name).toMatch(/^批量采集_\d{4}-/);
    expect(created.status).toBe('pending');
    expect(created.userId).toBe('u1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('提供名称时原样使用', async () => {
    mockTask.create.mockResolvedValue({ _id: 't9', name: '我的任务' });
    await controller.createTask(
      { body: { crawlType: 'single', forumUrl: 'http://p', name: '我的任务' }, user: { userId: 'u1' } },
      makeRes(),
      jest.fn()
    );

    expect(mockTask.create.mock.calls[0][0].name).toBe('我的任务');
  });
});

describe('taskController.getAllTasks 权限过滤', () => {
  it('普通用户只能看到自己的任务', async () => {
    mockTask.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ _id: 't1', userId: 'u1' }]),
    });
    mockTask.countDocuments.mockResolvedValue(1);

    const res = makeRes();
    const next = jest.fn();
    await controller.getAllTasks(
      { query: {}, user: { role: 'user', userId: 'u1' } },
      res,
      next
    );

    // next 不应收到任何异常
    expect(next.mock.calls).toHaveLength(0);

    const filter = mockTask.find.mock.calls[0][0];
    expect(filter.userId).toBe('u1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ _id: 't1', userId: 'u1' }],
        pagination: expect.objectContaining({ total: 1, page: 1 }),
      })
    );
  });

  it('管理员可以看到所有任务', async () => {
    mockTask.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });
    mockTask.countDocuments.mockResolvedValue(0);

    await controller.getAllTasks(
      { query: { status: 'pending' }, user: { role: 'admin', userId: 'a1' } },
      makeRes(),
      jest.fn()
    );

    const filter = mockTask.find.mock.calls[0][0];
    expect(filter).toEqual({ status: 'pending' });
  });
});

describe('taskController.streamTaskEvents (SSE)', () => {
  it('鉴权通过后委托 openTaskEventStream，传入快照与 Last-Event-ID', async () => {
    mockTask.findOne.mockResolvedValue({
      _id: 't1',
      status: 'running',
      progress: 10,
      crawledItems: 2,
      name: '我的任务',
    });

    const req = {
      params: { id: 't1' },
      user: { role: 'user', userId: 'u1' },
      headers: { 'last-event-id': '7' },
      query: {},
    };
    await controller.streamTaskEvents(req, makeRes(), jest.fn());

    // 所有权过滤：普通用户带 userId
    expect(mockTask.findOne).toHaveBeenCalledWith({ _id: 't1', userId: 'u1' });
    expect(openTaskEventStream).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      expect.objectContaining({
        lastEventId: '7',
        snapshot: expect.objectContaining({
          taskId: 't1',
          status: 'running',
          progress: 10,
          crawledItems: 2,
          name: '我的任务',
        }),
      })
    );
  });

  it('任务不存在时抛 404（SSE 头未发送，错误走 errorHandler）', async () => {
    mockTask.findOne.mockResolvedValue(null);
    const next = jest.fn();

    await controller.streamTaskEvents(
      { params: { id: 'missing' }, user: { role: 'admin', userId: 'a1' }, headers: {}, query: {} },
      makeRes(),
      next
    );

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(openTaskEventStream).not.toHaveBeenCalled();
  });
});
