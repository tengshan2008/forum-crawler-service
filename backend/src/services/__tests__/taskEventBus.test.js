// taskEventBus：Redis pub/sub + 历史留存的事件总线
// mock ioredis：每个连接是带 jest.fn 方法的 EventEmitter，便于 emit('message') 模拟推送
// 注意：jest 工厂 new 出来返回的对象不会进 mock.instances，需自行收集到 _connections
jest.mock('ioredis', () => {
  const { EventEmitter } = require('events');
  const makePipe = () => ({
    expire: jest.fn().mockReturnThis(),
    lpush: jest.fn().mockReturnThis(),
    ltrim: jest.fn().mockReturnThis(),
    publish: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  });
  const RedisMock = jest.fn();
  RedisMock._connections = [];
  RedisMock.mockImplementation(() => {
    const conn = new EventEmitter();
    conn.incr = jest.fn().mockResolvedValue(1);
    conn.pipeline = jest.fn().mockImplementation(makePipe);
    conn.lrange = jest.fn().mockResolvedValue([]);
    conn.subscribe = jest.fn().mockResolvedValue(1);
    conn.unsubscribe = jest.fn().mockResolvedValue();
    conn.disconnect = jest.fn();
    RedisMock._connections.push(conn);
    return conn;
  });
  return RedisMock;
});

const Redis = require('ioredis');
const taskEventBus = require('../taskEventBus');

beforeEach(() => {
  jest.clearAllMocks();
  Redis._connections.length = 0;
  taskEventBus._reset(); // 清掉发布连接单例，保证每个用例拿到全新 mock 实例
});

describe('taskEventBus.publish', () => {
  it('生成递增 id，写历史（LPUSH+LTRIM+TTL）并 PUBLISH，事件结构统一', async () => {
    await taskEventBus.publish('t1', 'log', { line: 'hello' });

    const pub = Redis.mock.instances[0];
    expect(pub.incr).toHaveBeenCalledWith('task:events:seq:t1');

    const pipe = pub.pipeline.mock.results[0].value;
    const [historyKey, payload] = pipe.lpush.mock.calls[0];
    expect(historyKey).toBe('task:events:history:t1');

    const event = JSON.parse(payload);
    expect(event).toMatchObject({ id: 1, type: 'log', taskId: 't1', data: { line: 'hello' } });
    expect(typeof event.ts).toBe('number');

    expect(pipe.publish).toHaveBeenCalledWith('task:events:t1', payload);
    expect(pipe.ltrim).toHaveBeenCalledWith('task:events:history:t1', 0, taskEventBus.HISTORY_MAX - 1);
    expect(pipe.expire).toHaveBeenCalled();
  });

  it('taskId 被统一字符串化', async () => {
    await taskEventBus.publish(12345, 'status', { status: 'running' });
    const pub = Redis.mock.instances[0];
    const payload = pub.pipeline.mock.results[0].value.publish.mock.calls[0][1];
    expect(JSON.parse(payload).taskId).toBe('12345');
  });

  it('Redis 故障时吞掉错误（fire-and-forget），不影响调用方', async () => {
    await taskEventBus.publish('t2', 'status', { status: 'running' }); // 先建发布连接
    const pub = Redis.mock.instances[0];
    pub.incr.mockRejectedValueOnce(new Error('redis down'));

    await expect(taskEventBus.publish('t2', 'log', { line: 'x' })).resolves.toBeUndefined();
  });
});

describe('taskEventBus.subscribe', () => {
  it('订阅对应频道，消息 JSON 解析后交给 handler；坏消息不炸', async () => {
    const handler = jest.fn();
    const unsubscribe = await taskEventBus.subscribe('t3', handler);

    const sub = Redis.mock.instances[0];
    expect(sub.subscribe).toHaveBeenCalledWith('task:events:t3');

    const event = { id: 5, type: 'log', taskId: 't3', ts: 123, data: { line: 'a' } };
    sub.emit('message', 'task:events:t3', JSON.stringify(event));
    expect(handler).toHaveBeenCalledWith(event);

    sub.emit('message', 'task:events:t3', 'not-json');
    expect(handler).toHaveBeenCalledTimes(1);

    await unsubscribe();
    expect(sub.unsubscribe).toHaveBeenCalledWith('task:events:t3');
    expect(sub.disconnect).toHaveBeenCalled();

    // 重复取消幂等
    await unsubscribe();
    expect(sub.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('taskEventBus.getRecent', () => {
  it('LPUSH 新→旧存储，读取时反转为升序', async () => {
    await taskEventBus.publish('t4', 'log', { line: 'first' }); // 建发布连接
    const pub = Redis.mock.instances[0];
    pub.lrange.mockResolvedValueOnce([
      JSON.stringify({ id: 3, type: 'log', taskId: 't4', ts: 3, data: { line: 'c' } }),
      JSON.stringify({ id: 2, type: 'log', taskId: 't4', ts: 2, data: { line: 'b' } }),
      JSON.stringify({ id: 1, type: 'log', taskId: 't4', ts: 1, data: { line: 'a' } }),
    ]);

    const events = await taskEventBus.getRecent('t4');
    expect(events.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(pub.lrange).toHaveBeenCalledWith('task:events:history:t4', 0, -1);
  });

  it('支持 lastEventId 断点续传：只返回 id 更大的事件', async () => {
    const pub = Redis.mock.instances[0] || (await taskEventBus.publish('t5', 'log', {}), Redis.mock.instances[0]);
    pub.lrange.mockResolvedValueOnce([
      JSON.stringify({ id: 3, type: 'log', taskId: 't5', ts: 3, data: {} }),
      JSON.stringify({ id: 2, type: 'log', taskId: 't5', ts: 2, data: {} }),
    ]);

    const events = await taskEventBus.getRecent('t5', '2');
    expect(events.map((e) => e.id)).toEqual([3]);
  });

  it('坏 JSON 条目被过滤', async () => {
    await taskEventBus.publish('t6', 'log', {});
    const pub = Redis.mock.instances[0];
    pub.lrange.mockResolvedValueOnce(['broken', JSON.stringify({ id: 1, type: 'log', data: {} })]);

    const events = await taskEventBus.getRecent('t6');
    expect(events).toHaveLength(1);
  });
});

describe('taskEventBus.isTerminalEvent', () => {
  it('仅 status=completed/failed 判定为终态', () => {
    expect(taskEventBus.isTerminalEvent({ type: 'status', data: { status: 'completed' } })).toBe(true);
    expect(taskEventBus.isTerminalEvent({ type: 'status', data: { status: 'failed' } })).toBe(true);
    expect(taskEventBus.isTerminalEvent({ type: 'status', data: { status: 'running' } })).toBe(false);
    expect(taskEventBus.isTerminalEvent({ type: 'log', data: {} })).toBe(false);
    expect(taskEventBus.isTerminalEvent(null)).toBe(false);
  });
});
