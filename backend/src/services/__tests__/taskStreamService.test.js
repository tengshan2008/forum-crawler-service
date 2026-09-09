// taskStreamService：SSE 长连接的协议层（帧编码/快照/回放去重/心跳/终态关流/清理）
// taskEventBus 整体 mock，本文件只验证流的行为
jest.mock('../../services/taskEventBus', () => ({
  subscribe: jest.fn(),
  getRecent: jest.fn(),
  isTerminalEvent: jest.fn(
    (e) => e && e.type === 'status' && ['completed', 'failed'].includes(e.data && e.data.status)
  ),
}));

const { EventEmitter } = require('events');
const taskEventBus = require('../../services/taskEventBus');
const {
  openTaskEventStream,
  HEARTBEAT_INTERVAL_MS,
  TERMINAL_CLOSE_DELAY_MS,
} = require('../taskStreamService');

function makeRes() {
  const res = new EventEmitter();
  res.writableEnded = false;
  res.destroyed = false;
  res.write = jest.fn(() => !res.writableEnded);
  res.end = jest.fn(() => {
    res.writableEnded = true;
  });
  res.set = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.flushHeaders = jest.fn();
  return res;
}

const historyEvent = (id, extra = {}) => ({ id, type: 'log', taskId: 't', ts: id, data: { line: `line-${id}` }, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  taskEventBus.getRecent.mockResolvedValue([]);
  taskEventBus.subscribe.mockResolvedValue(jest.fn().mockResolvedValue());
});

describe('openTaskEventStream 连接建立', () => {
  it('写 SSE 响应头并 flush', async () => {
    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });

    expect(res.status).toHaveBeenCalledWith(200);
    const headers = res.set.mock.calls[0][0];
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(headers['X-Accel-Buffering']).toBe('no');
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('连接即发 snapshot 事件（无 id 行，不影响断点续传）', async () => {
    const res = makeRes();
    await openTaskEventStream(res, 't', {
      snapshot: { taskId: 't', status: 'running', progress: 10 },
    });

    const first = res.write.mock.calls[0][0];
    expect(first).toContain('event: snapshot');
    expect(first).toContain('"status":"running"');
    expect(first).not.toContain('id:');
  });

  it('历史事件按 SSE 帧格式回放（id:/event:/data:）', async () => {
    taskEventBus.getRecent.mockResolvedValueOnce([historyEvent(1), historyEvent(2)]);
    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });

    const frames = res.write.mock.calls.map((c) => c[0]);
    const frame1 = frames.find((f) => f.includes('"line":"line-1"'));
    expect(frame1).toBe('id: 1\nevent: log\ndata: {"line":"line-1"}\n\n');
  });

  it('lastEventId 透传给 getRecent（含 Last-Event-ID 头）', async () => {
    const res = makeRes();
    await openTaskEventStream(res, 't', { lastEventId: '42', snapshot: { status: 'running' } });
    expect(taskEventBus.getRecent).toHaveBeenCalledWith('t', '42');
  });
});

describe('openTaskEventStream 不丢不重', () => {
  it('先订阅再回放；回放期间到达的实时事件缓冲补发，重叠 id 去重', async () => {
    let liveHandler;
    taskEventBus.subscribe.mockImplementationOnce(async (_taskId, handler) => {
      liveHandler = handler;
      return jest.fn().mockResolvedValue();
    });
    taskEventBus.getRecent.mockImplementationOnce(async () => {
      // 回放进行中：id=2 与历史重叠，id=3 是回放期间的新事件
      liveHandler(historyEvent(2));
      liveHandler(historyEvent(3));
      return [historyEvent(1), historyEvent(2)];
    });

    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });

    const written = res.write.mock.calls.map((c) => c[0]).join('');
    expect((written.match(/id: 2\n/g) || []).length).toBe(1); // 历史与缓冲重叠只发一次
    expect(written).toContain('id: 3'); // 缓冲新事件补发
    expect(written.indexOf('id: 1')).toBeLessThan(written.indexOf('id: 3'));
  });

  it('回放结束后的实时事件直接下发', async () => {
    let liveHandler;
    taskEventBus.subscribe.mockImplementationOnce(async (_taskId, handler) => {
      liveHandler = handler;
      return jest.fn().mockResolvedValue();
    });
    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });

    liveHandler(historyEvent(99));
    const written = res.write.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('id: 99');
  });
});

describe('openTaskEventStream 关流', () => {
  it('收到终态事件后延迟关流并取消订阅', async () => {
    jest.useFakeTimers();
    let liveHandler;
    const unsubscribe = jest.fn().mockResolvedValue();
    taskEventBus.subscribe.mockImplementationOnce(async (_taskId, handler) => {
      liveHandler = handler;
      return unsubscribe;
    });

    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });
    expect(res.end).not.toHaveBeenCalled();

    liveHandler({ id: 10, type: 'status', taskId: 't', ts: 1, data: { status: 'completed' } });
    const written = res.write.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('event: status');
    expect(written).toContain('"status":"completed"');

    await jest.advanceTimersByTimeAsync(TERMINAL_CLOSE_DELAY_MS);
    expect(unsubscribe).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('任务已终态但历史无终态事件（历史过期）：补发完即关流', async () => {
    taskEventBus.getRecent.mockResolvedValueOnce([historyEvent(1)]);
    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { taskId: 't', status: 'completed', progress: 100 } });

    expect(res.end).toHaveBeenCalled();
  });

  it('运行中任务保持连接（不主动关流）', async () => {
    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });
    expect(res.end).not.toHaveBeenCalled();
  });

  it('客户端断开时清理订阅并结束响应', async () => {
    const unsubscribe = jest.fn().mockResolvedValue();
    taskEventBus.subscribe.mockResolvedValueOnce(unsubscribe);
    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });

    res.emit('close');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(unsubscribe).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it('订阅失败不致命：仍完成历史回放', async () => {
    taskEventBus.subscribe.mockRejectedValueOnce(new Error('subscribe failed'));
    taskEventBus.getRecent.mockResolvedValueOnce([historyEvent(1)]);
    const res = makeRes();

    await expect(openTaskEventStream(res, 't', { snapshot: { status: 'running' } })).resolves.toBeDefined();
    const written = res.write.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('id: 1');
  });
});

describe('openTaskEventStream 心跳', () => {
  it('每 15s 发送心跳注释行', async () => {
    jest.useFakeTimers();
    const res = makeRes();
    await openTaskEventStream(res, 't', { snapshot: { status: 'running' } });

    await jest.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(res.write).toHaveBeenCalledWith(': ping\n\n');
    jest.useRealTimers();
  });
});
