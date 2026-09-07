// 服务为静态方法类，mock 为同名方法集合
jest.mock('../../services/systemConfigService', () => ({
  getConfig: jest.fn(),
  updateCrawlerConfig: jest.fn(),
  addProxy: jest.fn(),
  removeProxy: jest.fn(),
  updateStorageConfig: jest.fn(),
  calculateStorageStats: jest.fn(),
  updateMonitoringConfig: jest.fn(),
  updateSystemConfig: jest.fn(),
  getAuditLogs: jest.fn(),
  autoCleanExpiredData: jest.fn(),
}));

jest.mock('../../services/systemMonitoringService', () => ({
  getRealTimeStatus: jest.fn(),
  getMetricsHistory: jest.fn(),
  generatePerformanceReport: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn(),
}));

const SystemConfigService = require('../../services/systemConfigService');
const SystemMonitoringService = require('../../services/systemMonitoringService');
const User = require('../../models/User');
const controller = require('../adminController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = (overrides = {}) => ({
  ip: '10.0.0.1',
  user: { userId: 'admin-1', username: 'root' },
  params: {},
  query: {},
  body: {},
  ...overrides,
});

const expectOperator = (callArg) => {
  expect(callArg).toEqual({ id: 'admin-1', username: 'root', ipAddress: '10.0.0.1' });
};

const expectNextError = (next, statusCode, message) => {
  expect(next).toHaveBeenCalledTimes(1);
  const err = next.mock.calls[0][0];
  expect(err.statusCode).toBe(statusCode);
  expect(err.message).toBe(message);
};

beforeEach(() => jest.clearAllMocks());

describe('adminController 系统/爬虫/存储/监控配置', () => {
  it('getSystemConfig 返回配置数据', async () => {
    SystemConfigService.getConfig.mockResolvedValue({ crawler: {} });
    const res = makeRes();

    await controller.getSystemConfig(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { crawler: {} } });
  });

  it('updateCrawlerConfig 携带请求体与操作人上下文', async () => {
    SystemConfigService.updateCrawlerConfig.mockResolvedValue({ ok: true });
    const res = makeRes();

    await controller.updateCrawlerConfig(makeReq({ body: { delay: 2000 } }), res, jest.fn());

    expect(SystemConfigService.updateCrawlerConfig).toHaveBeenCalledTimes(1);
    const [body, operator] = SystemConfigService.updateCrawlerConfig.mock.calls[0];
    expect(body).toEqual({ delay: 2000 });
    expectOperator(operator);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { ok: true },
      message: '爬虫配置已更新',
    });
  });

  it('addProxy 缺少 proxyUrl 时抛 400', async () => {
    const next = jest.fn();
    await controller.addProxy(makeReq({ body: {} }), makeRes(), next);

    expectNextError(next, 400, '代理URL不能为空');
    expect(SystemConfigService.addProxy).not.toHaveBeenCalled();
  });

  it('addProxy 成功时传递 url/description/操作人', async () => {
    SystemConfigService.addProxy.mockResolvedValue({ proxyUrl: 'http://p:8080' });
    const res = makeRes();

    await controller.addProxy(
      makeReq({ body: { proxyUrl: 'http://p:8080', description: '备用' } }),
      res,
      jest.fn()
    );

    const [url, desc, operator] = SystemConfigService.addProxy.mock.calls[0];
    expect(url).toBe('http://p:8080');
    expect(desc).toBe('备用');
    expectOperator(operator);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { proxyUrl: 'http://p:8080' },
      message: '代理已添加',
    });
  });

  it('removeProxy 按路径参数删除并携带操作人', async () => {
    SystemConfigService.removeProxy.mockResolvedValue({ removed: 1 });
    const res = makeRes();

    await controller.removeProxy(
      makeReq({ params: { proxyUrl: 'http://p:8080' } }),
      res,
      jest.fn()
    );

    const [url, operator] = SystemConfigService.removeProxy.mock.calls[0];
    expect(url).toBe('http://p:8080');
    expectOperator(operator);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { removed: 1 },
      message: '代理已删除',
    });
  });

  it('updateStorageConfig / updateMonitoringConfig / updateSystemConfig 均委托并返回更新消息', async () => {
    SystemConfigService.updateStorageConfig.mockResolvedValue({ section: 'storage' });
    SystemConfigService.updateMonitoringConfig.mockResolvedValue({ section: 'monitoring' });
    SystemConfigService.updateSystemConfig.mockResolvedValue({ section: 'system' });

    const cases = [
      [controller.updateStorageConfig, SystemConfigService.updateStorageConfig, '存储配置已更新', { section: 'storage' }],
      [controller.updateMonitoringConfig, SystemConfigService.updateMonitoringConfig, '监控配置已更新', { section: 'monitoring' }],
      [controller.updateSystemConfig, SystemConfigService.updateSystemConfig, '系统设置已更新', { section: 'system' }],
    ];

    for (const [fn, svc, message, data] of cases) {
      const res = makeRes();
      await fn(makeReq({ body: { k: 1 } }), res, jest.fn());
      expect(svc).toHaveBeenCalledWith({ k: 1 }, expect.objectContaining({ id: 'admin-1' }));
      expect(res.json).toHaveBeenCalledWith({ success: true, data, message });
    }
  });

  it('getStorageStats 返回统计数据', async () => {
    SystemConfigService.calculateStorageStats.mockResolvedValue({ used: 100 });
    const res = makeRes();

    await controller.getStorageStats(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { used: 100 } });
  });
});

describe('adminController 监控与审计', () => {
  it('getRealTimeStatus 返回实时状态', async () => {
    SystemMonitoringService.getRealTimeStatus.mockResolvedValue({ cpu: 10 });
    const res = makeRes();

    await controller.getRealTimeStatus(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { cpu: 10 } });
  });

  it('getMetricsHistory 默认 hour，可被 query 覆盖', async () => {
    SystemMonitoringService.getMetricsHistory.mockResolvedValue([{ t: 1 }]);

    await controller.getMetricsHistory(makeReq(), makeRes(), jest.fn());
    expect(SystemMonitoringService.getMetricsHistory).toHaveBeenCalledWith('hour');

    await controller.getMetricsHistory(
      makeReq({ query: { timeRange: 'week' } }),
      makeRes(),
      jest.fn()
    );
    expect(SystemMonitoringService.getMetricsHistory).toHaveBeenLastCalledWith('week');
  });

  it('generatePerformanceReport 默认 day，可被 query 覆盖', async () => {
    SystemMonitoringService.generatePerformanceReport.mockResolvedValue({ score: 99 });

    await controller.generatePerformanceReport(makeReq(), makeRes(), jest.fn());
    expect(SystemMonitoringService.generatePerformanceReport).toHaveBeenCalledWith('day');

    await controller.generatePerformanceReport(
      makeReq({ query: { timeRange: 'month' } }),
      makeRes(),
      jest.fn()
    );
    expect(SystemMonitoringService.generatePerformanceReport).toHaveBeenLastCalledWith('month');
  });

  it('getAuditLogs 解析 query 并传 parseInt 后的分页', async () => {
    SystemConfigService.getAuditLogs.mockResolvedValue([{ _id: 'log-1' }]);
    const res = makeRes();

    await controller.getAuditLogs(
      makeReq({ query: { action: 'login', resource: 'user', startDate: '2026-01-01', endDate: '2026-02-01', limit: '50', skip: '10' } }),
      res,
      jest.fn()
    );

    const [filter, limit, skip] = SystemConfigService.getAuditLogs.mock.calls[0];
    expect(filter).toEqual({ action: 'login', resource: 'user', startDate: '2026-01-01', endDate: '2026-02-01' });
    expect(limit).toBe(50);
    expect(skip).toBe(10);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'log-1' }] });
  });

  it('getAuditLogs 默认分页 100/0', async () => {
    SystemConfigService.getAuditLogs.mockResolvedValue([]);

    await controller.getAuditLogs(makeReq(), makeRes(), jest.fn());

    const [, limit, skip] = SystemConfigService.getAuditLogs.mock.calls[0];
    expect(limit).toBe(100);
    expect(skip).toBe(0);
  });
});

describe('adminController.autoClean', () => {
  it('自动清理未启用时保持 200 + success:false 契约', async () => {
    SystemConfigService.autoCleanExpiredData.mockResolvedValue({
      success: false,
      message: '自动清理功能未启用',
    });
    const res = makeRes();

    await controller.autoClean(makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: '自动清理功能未启用',
      data: { success: false, message: '自动清理功能未启用' },
    });
  });

  it('清理成功返回 service 结果与消息', async () => {
    SystemConfigService.autoCleanExpiredData.mockResolvedValue({
      success: true,
      message: '已清理 10 条过期数据',
      cleaned: 10,
    });
    const res = makeRes();

    await controller.autoClean(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { success: true, message: '已清理 10 条过期数据', cleaned: 10 },
      message: '已清理 10 条过期数据',
    });
  });
});

describe('adminController 用户管理', () => {
  it('getUserList 支持角色过滤并返回分页数据结构', async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([{ _id: 'u1', role: 'editor' }]),
    });
    User.countDocuments.mockResolvedValue(1);
    const res = makeRes();

    await controller.getUserList(
      makeReq({ query: { role: 'editor', limit: '20', skip: '0' } }),
      res,
      jest.fn()
    );

    expect(User.find).toHaveBeenCalledWith({ role: 'editor' });
    expect(User.countDocuments).toHaveBeenCalledWith({ role: 'editor' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        users: [{ _id: 'u1', role: 'editor' }],
        total: 1,
        limit: 20,
        skip: 0,
      },
    });
  });

  it('updateUserRole 非法角色抛 400', async () => {
    const next = jest.fn();
    await controller.updateUserRole(
      makeReq({ params: { userId: 'u1' }, body: { role: 'hacker' } }),
      makeRes(),
      next
    );

    expectNextError(next, 400, '无效的角色');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('updateUserRole 合法角色更新并返回用户', async () => {
    User.findByIdAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', role: 'editor' }),
    });
    const res = makeRes();

    await controller.updateUserRole(
      makeReq({ params: { userId: 'u1' }, body: { role: 'editor' } }),
      res,
      jest.fn()
    );

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', { role: 'editor' }, { new: true });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'u1', role: 'editor' },
      message: '用户角色已更新',
    });
  });

  it('toggleUserStatus 使用聚合管道切换并按新状态生成消息', async () => {
    User.findByIdAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', active: false }),
    });
    const res = makeRes();

    await controller.toggleUserStatus(makeReq({ params: { userId: 'u1' } }), res, jest.fn());

    const [id, pipeline] = User.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('u1');
    expect(pipeline).toEqual([{ $set: { active: { $not: '$active' } } }]);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'u1', active: false },
      message: '用户已禁用',
    });
  });

  it('resetUserPassword 密码过短抛 400', async () => {
    const next = jest.fn();
    await controller.resetUserPassword(
      makeReq({ params: { userId: 'u1' }, body: { newPassword: '123' } }),
      makeRes(),
      next
    );

    expectNextError(next, 400, '密码长度至少6个字符');
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('resetUserPassword 用户不存在抛 404', async () => {
    User.findById.mockResolvedValue(null);
    const next = jest.fn();

    await controller.resetUserPassword(
      makeReq({ params: { userId: 'ghost' }, body: { newPassword: 'NewPass123' } }),
      makeRes(),
      next
    );

    expectNextError(next, 404, '用户不存在');
  });

  it('resetUserPassword 成功时赋值并保存', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    User.findById.mockResolvedValue({ _id: 'u1', password: 'old', save });
    const res = makeRes();

    await controller.resetUserPassword(
      makeReq({ params: { userId: 'u1' }, body: { newPassword: 'NewPass123' } }),
      res,
      jest.fn()
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null, message: '用户密码已重置' });
  });
});
