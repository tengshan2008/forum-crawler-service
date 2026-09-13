const Task = require('../models/Task');
const AppError = require('../utils/AppError');
const { addCrawlerTask, removeQueuedTask, findActiveJobForTask } = require('./crawlerQueue');
const taskEventBus = require('./taskEventBus');
const fs = require('fs').promises;
const path = require('path');

// updateTask 可更新字段白名单，防止 req.body 批量赋值篡改 status/userId 等敏感字段
const TASK_UPDATE_FIELDS = [
  'name',
  'description',
  'forumUrl',
  'sectionUrl',
  'crawlType',
  'taskType',
  'config',
  'schedule',
];

// 角色数据可见性：管理员可见全部，普通用户仅本人数据
function buildVisibilityFilter(user) {
  return user.role === 'admin' ? {} : { userId: user.userId };
}

// 转义正则特殊字符，避免 keyword 中的元字符（如 ( ) . *）破坏模糊查询语义
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 字符串去首尾空白；非字符串（undefined/数字等）原样返回
function trimString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// 地址必须以 http:// 或 https:// 开头
function isValidHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

// 单条查询的所有权约束（管理员不受限）
function scopedQuery(taskId, user) {
  const query = { _id: taskId };
  if (user.role !== 'admin') {
    query.userId = user.userId;
  }
  return query;
}

async function listTasks(query, user) {
  const { status, crawlType, keyword, page = 1, limit = 10, sort = '-createdAt' } = query;

  const filter = buildVisibilityFilter(user);
  if (status) {
    filter.status = status;
  }
  if (crawlType) {
    filter.crawlType = crawlType;
  }
  const trimmedKeyword = (keyword || '').trim();
  if (trimmedKeyword) {
    // 按任务名大小写不敏感模糊匹配（自动取名任务也可被搜到）
    filter.name = new RegExp(escapeRegExp(trimmedKeyword), 'i');
  }

  const skip = (page - 1) * limit;

  const tasks = await Task.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Task.countDocuments(filter);

  return { tasks, total };
}

// 任务统计概览：返回总数/运行中/失败/今日新增，应用角色可见性过滤
async function getTaskStats(user) {
  const base = buildVisibilityFilter(user);

  // 当天 0 点作为"今日新增"的起始时间
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, running, failed, todayCreated] = await Promise.all([
    Task.countDocuments(base),
    Task.countDocuments({ ...base, status: 'running' }),
    Task.countDocuments({ ...base, status: 'failed' }),
    Task.countDocuments({ ...base, createdAt: { $gte: startOfToday } }),
  ]);

  return { total, running, failed, todayCreated };
}

async function getTask(taskId, user) {
  const task = await Task.findOne(scopedQuery(taskId, user));
  if (!task) {
    throw new AppError('Task not found', 404);
  }
  return task;
}

async function createTask(body, userId) {
  // 文本字段统一去首尾空白，防止纯空格绕过必填校验
  const crawlType = body.crawlType;
  const name = trimString(body.name);
  const description = trimString(body.description);
  const forumUrl = trimString(body.forumUrl);
  const sectionUrl = trimString(body.sectionUrl);
  const { taskType, config, schedule } = body;

  // 创建校验（trim 后空串为 falsy，纯空格无法再绕过）
  if (crawlType === 'single') {
    if (!forumUrl) {
      throw new AppError('单帖采集时请输入帖子地址', 400);
    }
    if (!isValidHttpUrl(forumUrl)) {
      throw new AppError('帖子地址必须以 http:// 或 https:// 开头', 400);
    }
  }
  if (crawlType === 'batch') {
    if (!sectionUrl) {
      throw new AppError('批量采集时请输入版块地址', 400);
    }
    if (!isValidHttpUrl(sectionUrl)) {
      throw new AppError('版块地址必须以 http:// 或 https:// 开头', 400);
    }
  }

  // 默认命名
  let taskName = name;
  if (!taskName || taskName === '') {
    const now = new Date();
    taskName = `${crawlType === 'single' ? '单帖' : '批量'}采集_${now.toISOString().slice(0, 19).replace(/[:-]/g, '-')}`;
  }

  return Task.create({
    name: taskName,
    description,
    forumUrl,
    sectionUrl,
    crawlType,
    taskType,
    config,
    schedule,
    status: 'pending',
    userId,
  });
}

async function updateTask(taskId, user, body) {
  const updates = {};
  for (const field of TASK_UPDATE_FIELDS) {
    if (body[field] !== undefined) {
      // 文本字段统一 trim，与创建口径一致
      updates[field] = ['name', 'description', 'forumUrl', 'sectionUrl'].includes(field)
        ? trimString(body[field])
        : body[field];
    }
  }

  const task = await Task.findOneAndUpdate(scopedQuery(taskId, user), updates, {
    new: true,
    runValidators: true,
  });

  if (!task) {
    throw new AppError('Task not found', 404);
  }
  return task;
}

async function deleteTask(taskId, user) {
  const task = await Task.findOneAndDelete(scopedQuery(taskId, user));
  if (!task) {
    throw new AppError('Task not found', 404);
  }
  return task;
}

// start/pause/resume 共用的归属检查：兼容旧数据自动归属，否则非所有者（且非管理员）拒绝
// 返回 autoClaimed 供 startTask 在归属后立即落库（保持原有行为）
async function findAndAuthorize(taskId, user, { zh, en }) {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  let autoClaimed = false;
  if (!task.userId) {
    console.log(`[任务${zh}] 检测到任务 ${task._id} 缺少 userId，自动关联当前用户`);
    task.userId = user.userId;
    autoClaimed = true;
  } else if (task.userId.toString() !== user.userId && user.role !== 'admin') {
    throw new AppError(`You do not have permission to ${en} this task`, 403);
  }

  return { task, autoClaimed };
}

async function startTask(taskId, user) {
  const { task, autoClaimed } = await findAndAuthorize(taskId, user, {
    zh: '启动',
    en: 'start',
  });

  if (autoClaimed) {
    await task.save();
  }

  // 状态机校验：running 状态不允许重复启动
  if (task.status === 'running') {
    throw new AppError('Task is already running', 400);
  }

  task.status = 'running';
  task.startTime = new Date();
  task.progress = 0;
  task.crawledItems = 0;
  await task.save();

  // 异步入队，失败则任务置 failed 并记录日志（保持原有行为）
  try {
    const url = task.crawlType === 'single' ? task.forumUrl : task.sectionUrl;
    await addCrawlerTask(task._id.toString(), url, task.taskType, task.config, task.crawlType);
    console.log(`爬虫任务已加入队列: ${task._id}`);
  } catch (error) {
    console.error(`添加爬虫任务失败:`, error);
    task.status = 'failed';
    task.errorLog.push({
      timestamp: new Date(),
      error: error.message,
    });
    await task.save();
  }

  return task;
}

async function pauseTask(taskId, user) {
  const { task } = await findAndAuthorize(taskId, user, { zh: '暂停', en: 'pause' });

  // 状态机：只有执行中/等待中的任务可以暂停
  if (task.status !== 'running' && task.status !== 'pending') {
    throw new AppError('只有执行中或等待中的任务可以暂停', 400);
  }

  if (task.status === 'pending') {
    // 排队中（尚未被 worker 领取）：先移出 waiting/delayed 队列，
    // 否则 job 被领取时 markRunning 会把 paused 覆盖回 running。
    // 返回 false 可能是 job 恰好在此刻转为 active——无需报错，
    // active 的爬虫会在暂停闸门（crawl.py wait_if_paused）上挂起。
    await removeQueuedTask(taskId).catch((err) => {
      console.error(`[任务暂停] 移出等待队列失败（继续按执行中暂停处理）: ${err.message}`);
    });
  }

  task.status = 'paused';
  await task.save();

  // running 任务：爬虫进程在帖子/分页边界检测到 paused 后自行挂起（无需后端发信号）
  taskEventBus.publish(taskId, 'status', { status: 'paused' }).catch(() => {});
  return task;
}

async function resumeTask(taskId, user) {
  const { task } = await findAndAuthorize(taskId, user, { zh: '恢复', en: 'resume' });

  // 状态机：只有已暂停的任务可以恢复
  if (task.status !== 'paused') {
    throw new AppError('只有已暂停的任务可以恢复', 400);
  }

  // 判断爬虫进程是否还活着：
  // - 有 active job：进程正阻塞在暂停闸门上，置回 running 后闸门（≤3s 轮询）自动放行
  // - 无 active job：暂停的是排队 job（已移出队列），或进程随旧执行节点退出，需要重新入队
  const activeJob = await findActiveJobForTask(taskId).catch((err) => {
    console.error(`[任务恢复] 查询 active job 失败，按重新入队处理: ${err.message}`);
    return null;
  });

  task.status = 'running';
  if (!activeJob) {
    // 重新入队等价于一次新的执行：重置本轮进度与计数
    task.startTime = new Date();
    task.progress = 0;
    task.crawledItems = 0;
  }
  await task.save();

  if (!activeJob) {
    try {
      const url = task.crawlType === 'single' ? task.forumUrl : task.sectionUrl;
      await addCrawlerTask(task._id.toString(), url, task.taskType, task.config, task.crawlType);
      console.log(`[任务恢复] 暂停任务已重新入队: ${task._id}`);
    } catch (error) {
      console.error(`[任务恢复] 重新入队失败:`, error);
      task.status = 'failed';
      appendErrorLog(task, { timestamp: new Date(), message: error.message });
      await task.save();
      throw new AppError(`任务恢复失败：${error.message}`, 500);
    }
  }

  taskEventBus.publish(taskId, 'status', { status: 'running' }).catch(() => {});
  return task;
}

// ===== 系统内部状态流转（队列 worker / 调度器专用）=====
// 与用户侧 start/pause/resume 不同：由系统触发，不做归属检查，
// 保证任务状态规则全系统只有 taskService 一份（B1/D3 收敛）。

// errorLog 上限，防止长期运行任务的失败日志无限增长（B5）
const ERROR_LOG_LIMIT = 50;

function appendErrorLog(task, entry) {
  task.errorLog.push(entry);
  if (task.errorLog.length > ERROR_LOG_LIMIT) {
    task.errorLog.splice(0, task.errorLog.length - ERROR_LOG_LIMIT);
  }
}

// 队列开始消费：置运行中并记录本次爬取时间
async function markRunning(taskId) {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', 404);
  }
  task.status = 'running';
  task.progress = 5;
  task.lastCrawlTime = new Date();
  await task.save();
  return task;
}

// 队列执行成功：置完成并落统计；任务名为空时采用爬虫返回的标题（保持原 worker 行为）
async function markCompleted(taskId, result = {}) {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', 404);
  }
  if ((!task.name || task.name === '') && result.title) {
    task.name = result.title;
  }
  task.status = 'completed';
  task.progress = 100;
  task.crawledItems = result.crawled_posts || 1;
  task.totalItems = result.total_posts || 1;
  // 跳过/失败统计与明细原先由 crawlerExecutor 直接写库；状态写入收敛到 taskService 后随结果一起落库
  if (result.skipped_posts !== undefined) {
    task.skippedItems = result.skipped_posts;
  }
  if (result.failed_posts !== undefined) {
    task.failedItems = result.failed_posts;
  }
  if (Array.isArray(result.skip_details)) {
    task.skipReasons = result.skip_details;
  }
  task.endTime = new Date();
  await task.save();
  return task;
}

// worker 领取 job 后的启动闸门：
// 服务重启 / Bull stalled 重投递时，用户可能仍把任务保持在 paused——
// 此时绝不能 markRunning 覆盖暂停意图，轮询等待用户恢复后再执行。
// 返回 true=可以执行；false=放弃该 job（任务已删除，或已处于终态，不做任何状态写入）。
async function awaitTaskRunnable(taskId, { pollInterval = 2000 } = {}) {
  for (;;) {
    const task = await Task.findById(taskId);
    if (!task) {
      console.warn(`[爬虫队列] 任务 ${taskId} 已不存在，放弃执行该 job`);
      return false;
    }
    if (task.status === 'paused') {
      console.log(`[爬虫队列] 任务 ${taskId} 处于暂停状态，worker 等待恢复...`);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      continue;
    }
    if (task.status === 'completed' || task.status === 'failed') {
      console.warn(`[爬虫队列] 任务 ${taskId} 已处于终态 ${task.status}，跳过该 job`);
      return false;
    }
    return true;
  }
}

// 执行失败：追加（而非覆盖）errorLog
async function markFailed(taskId, error) {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', 404);
  }
  task.status = 'failed';
  appendErrorLog(task, { timestamp: new Date(), message: error.message });
  await task.save();
  return task;
}

// 定时调度触发：重置进度与计数，记录本轮调度时间
async function markScheduledRun(task, now) {
  task.status = 'running';
  task.schedule.lastRunTime = now;
  task.progress = 0;
  task.crawledItems = 0;
  task.failedItems = 0;
  await task.save();
  return task;
}

// 取消排队中的任务（D4）：running 任务不可取消；取消后回退到 paused
async function cancelTask(taskId, user) {
  const { task } = await findAndAuthorize(taskId, user, { zh: '取消', en: 'cancel' });

  if (task.status === 'running') {
    throw new AppError('任务正在执行中，无法取消', 400);
  }

  const removed = await removeQueuedTask(taskId);
  if (!removed) {
    throw new AppError('任务不在等待队列中', 400);
  }

  task.status = 'paused';
  await task.save();
  return task;
}

// 任务执行日志尾部：
// 首选 Redis 事件历史（跨实例可见——爬虫可能在其它节点/容器执行）；
// Redis 无事件时（历史过期或旧版本任务）回退读本机 crawler/logs/task_<id>.log。
const DEFAULT_LOG_LINES = 100;

async function getTaskLogs(taskId, user, { lines = DEFAULT_LOG_LINES } = {}) {
  const { task } = await findAndAuthorize(taskId, user, { zh: '查看', en: 'view' });

  let events = [];
  try {
    events = await taskEventBus.getRecent(taskId);
  } catch (err) {
    console.error('[任务日志] 读取事件历史失败，回退文件日志:', err.message);
  }

  const eventLines = events
    .filter((event) => event.type === 'log' && event.data && typeof event.data.line === 'string')
    .map((event) => event.data.line);

  if (eventLines.length > 0) {
    return {
      task,
      logs: eventLines.slice(-lines),
      exists: true,
      source: 'events',
    };
  }

  // 回退：本机文件日志（仅同节点执行的任务可见）
  const logPath = path.join(__dirname, '..', '..', '..', 'crawler', 'logs', `task_${taskId}.log`);
  let content;
  try {
    content = await fs.readFile(logPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { task, logs: [], logFile: logPath, exists: false, source: 'none' };
    }
    throw err;
  }

  const allLines = content.split('\n').filter((line) => line.length > 0);
  return {
    task,
    logs: allLines.slice(-lines),
    logFile: logPath,
    exists: true,
    source: 'file',
  };
}

module.exports = {
  buildVisibilityFilter,
  listTasks,
  getTaskStats,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  startTask,
  pauseTask,
  resumeTask,
  markRunning,
  markCompleted,
  markFailed,
  markScheduledRun,
  awaitTaskRunnable,
  cancelTask,
  getTaskLogs,
};
