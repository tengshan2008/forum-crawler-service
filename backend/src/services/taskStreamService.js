const taskEventBus = require('./taskEventBus');

// SSE 任务事件流：HTTP 长连接层
// 事件生产/分发由 taskEventBus（Redis pub/sub + 历史留存）负责，本模块只做：
//   1. SSE 响应头与帧编码（id:/event:/data:）
//   2. 连接即发任务快照（snapshot，不带 id，不影响 Last-Event-ID 断点续传）
//   3. 先订阅再回放历史，回放期间实时事件入缓冲，补发时按事件 id 去重（不丢不重）
//   4. 心跳注释行保活（代理/浏览器对空闲连接有超时）
//   5. 终态事件（status=completed/failed）发完后延迟关流；
//      任务已是终态但历史中无终态事件（历史过期）时，补发完即关流
//   6. 客户端断开即清理订阅与定时器
// 断线续传：浏览器 EventSource 自动带 Last-Event-ID 头（也支持 ?lastEventId= 兜底）。

const HEARTBEAT_INTERVAL_MS = 15000;
const TERMINAL_CLOSE_DELAY_MS = 500;

function writeSseHeaders(res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // 禁用 Nginx 缓冲，确保事件即时到达浏览器
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

// 快照事件允许无 id（不参与断点续传）；业务事件必须带数字 id
function writeEvent(res, event) {
  if (res.writableEnded || res.destroyed) return;
  const idLine =
    event.id !== undefined && event.id !== null ? `id: ${event.id}\n` : '';
  res.write(`${idLine}event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

function writeHeartbeat(res) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(': ping\n\n');
  }
}

/**
 * 打开任务事件 SSE 流
 * @param {import('express').Response} res
 * @param {string} taskId
 * @param {{ lastEventId?: number|string, snapshot?: object }} [options]
 *        snapshot 连接时任务状态快照，作为首个无 id 的 snapshot 事件下发
 * @returns {Promise<() => Promise<void>>} 关闭流的清理函数
 */
async function openTaskEventStream(res, taskId, { lastEventId, snapshot } = {}) {
  writeSseHeaders(res);

  let closed = false;
  let unsubscribe = null;
  let replayDone = false;
  let maxSentId = 0;
  let terminalDelivered = false;
  const liveBuffer = [];

  const heartbeat = setInterval(() => {
    if (!closed) writeHeartbeat(res);
  }, HEARTBEAT_INTERVAL_MS);
  let closeTimer = null;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    if (closeTimer) clearTimeout(closeTimer);
    if (unsubscribe) {
      try {
        await unsubscribe();
      } catch {
        // 连接已断开时忽略
      }
      unsubscribe = null;
    }
    try {
      if (!res.writableEnded) res.end();
    } catch {
      // 响应已关闭时忽略
    }
  };

  // 客户端断开（关弹窗/导航离开）时释放 Redis 订阅连接
  res.on('close', cleanup);
  res.on('error', cleanup);

  const deliver = (event) => {
    if (closed || !event || typeof event.id !== 'number') return;
    if (event.id <= maxSentId) return; // 回放与实时缓冲重叠去重
    writeEvent(res, event);
    maxSentId = event.id;
    if (taskEventBus.isTerminalEvent(event)) {
      terminalDelivered = true;
      // 留短暂时间确保终态帧刷出，再主动关流（避免 EventSource 对终态自动重连）
      closeTimer = setTimeout(cleanup, TERMINAL_CLOSE_DELAY_MS);
    }
  };

  // 1) 连接即发任务快照，前端可立即渲染状态/进度
  if (snapshot) {
    writeEvent(res, { type: 'snapshot', data: snapshot });
  }

  // 2) 先订阅：避免「回放历史 → 建立订阅」之间的事件丢失
  try {
    unsubscribe = await taskEventBus.subscribe(taskId, (event) => {
      if (replayDone) {
        deliver(event);
      } else {
        liveBuffer.push(event);
      }
    });
  } catch (err) {
    console.error('[任务事件流] 订阅实时频道失败（仅提供历史回放）:', err.message);
  }

  // 3) 历史回放（支持 Last-Event-ID 断点续传）
  try {
    const recent = await taskEventBus.getRecent(taskId, lastEventId);
    for (const event of recent) {
      if (closed) return cleanup;
      deliver(event);
    }
  } catch (err) {
    console.error('[任务事件流] 历史事件回放失败:', err.message);
  }

  // 4) 补发回放期间缓冲的实时事件（按 id 升序，deliver 内去重）
  replayDone = true;
  liveBuffer.sort((a, b) => a.id - b.id);
  for (const event of liveBuffer) {
    if (closed) return cleanup;
    deliver(event);
  }
  liveBuffer.length = 0;

  // 5) 任务已是终态但历史里没有终态事件（旧任务/历史已过期）：不会再有新事件，发完即关流
  if (!closed && !terminalDelivered && snapshot && (snapshot.status === 'completed' || snapshot.status === 'failed')) {
    await cleanup();
  }

  return cleanup;
}

module.exports = {
  openTaskEventStream,
  writeSseHeaders,
  writeEvent,
  writeHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  TERMINAL_CLOSE_DELAY_MS,
};
