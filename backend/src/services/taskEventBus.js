const Redis = require('ioredis');
const config = require('../config/config');

// 任务执行事件总线（SSE 支撑）：
// 爬虫实际执行节点（如 Docker 容器）与提供 API 的节点可能不是同一个进程，
// 进程内 EventEmitter 无法跨实例；事件统一经 Redis 中转：
//   PUBLISH task:events:<taskId>          实时扇出给所有 SSE 订阅者
//   LPUSH/LTRIM task:events:history:<id> 最近 HISTORY_MAX 条留存，供晚加入/断线重连回放
// 事件结构统一为 { id, type, taskId, ts, data }，消费方只按 type 过滤。

const CHANNEL_PREFIX = 'task:events:';
const HISTORY_PREFIX = 'task:events:history:';
const SEQ_PREFIX = 'task:events:seq:';

const HISTORY_MAX = 500; // 每个任务保留最近 500 条事件
const HISTORY_TTL_SECONDS = 24 * 60 * 60; // 历史留存 24 小时

// 终态事件：SSE 推完终态后即可关流
const TERMINAL_STATUS = new Set(['completed', 'failed']);

function channelOf(taskId) {
  return `${CHANNEL_PREFIX}${taskId}`;
}
function historyKeyOf(taskId) {
  return `${HISTORY_PREFIX}${taskId}`;
}
function seqKeyOf(taskId) {
  return `${SEQ_PREFIX}${taskId}`;
}

function createRedisConnection() {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });
}

// 发布连接（共享一个；命令失败只记录日志，绝不阻塞爬虫主流程）
let publisher = null;
function getPublisher() {
  if (!publisher) {
    publisher = createRedisConnection();
    publisher.on('error', (err) => {
      console.error('[任务事件总线] redis 连接错误:', err.message);
    });
  }
  return publisher;
}

/**
 * 发布一条任务事件（fire-and-forget，调用方无需 await）
 * @param {string} taskId
 * @param {string} type   status | progress | crawled | title | log
 * @param {object} data
 */
async function publish(taskId, type, data = {}) {
  try {
    const redis = getPublisher();
    const seqKey = seqKeyOf(taskId);
    const historyKey = historyKeyOf(taskId);
    const id = await redis.incr(seqKey);

    const event = { id, type, taskId: String(taskId), ts: Date.now(), data };
    const payload = JSON.stringify(event);

    const pipe = redis.pipeline();
    pipe.expire(seqKey, HISTORY_TTL_SECONDS);
    pipe.lpush(historyKey, payload);
    pipe.ltrim(historyKey, 0, HISTORY_MAX - 1);
    pipe.expire(historyKey, HISTORY_TTL_SECONDS);
    pipe.publish(channelOf(taskId), payload);
    await pipe.exec();
  } catch (err) {
    // 事件通道故障不影响爬虫执行与状态流转
    console.error(`[任务事件总线] 发布事件失败 task=${taskId} type=${type}:`, err.message);
  }
}

/**
 * 订阅任务事件频道（每个订阅使用独立连接，ioredis 订阅模式要求连接专用）
 * @param {string} taskId
 * @param {(event: object) => void} handler
 * @returns {Promise<() => Promise<void>>} 取消订阅函数
 */
async function subscribe(taskId, handler) {
  const sub = createRedisConnection();
  sub.on('error', (err) => {
    console.error('[任务事件总线] 订阅连接错误:', err.message);
  });

  await sub.subscribe(channelOf(taskId));
  sub.on('message', (_channel, message) => {
    try {
      handler(JSON.parse(message));
    } catch (err) {
      console.error('[任务事件总线] 事件解析失败:', err.message);
    }
  });

  let closed = false;
  return async function unsubscribe() {
    if (closed) return;
    closed = true;
    try {
      await sub.unsubscribe(channelOf(taskId));
    } catch {
      // 连接已断开时忽略
    }
    sub.disconnect();
  };
}

/**
 * 读取任务最近事件（升序），支持 Last-Event-ID 断点续传
 * @param {string} taskId
 * @param {number|string} [lastEventId] 只返回 id 大于该值的事件
 * @returns {Promise<object[]>}
 */
async function getRecent(taskId, lastEventId) {
  const redis = getPublisher();
  const raw = await redis.lrange(historyKeyOf(taskId), 0, -1);
  const afterId = Number.parseInt(lastEventId, 10);
  return raw
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse() // LPUSH 存的是新→旧，反转为升序
    .filter((event) => !Number.isFinite(afterId) || event.id > afterId);
}

function isTerminalEvent(event) {
  return Boolean(
    event && event.type === 'status' && TERMINAL_STATUS.has(event.data && event.data.status)
  );
}

module.exports = {
  publish,
  subscribe,
  getRecent,
  isTerminalEvent,
  HISTORY_MAX,
  // 导出供测试重置连接
  _reset() {
    if (publisher) {
      publisher.disconnect();
      publisher = null;
    }
  },
};
