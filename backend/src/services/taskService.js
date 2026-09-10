const Task = require('../models/Task');
const AppError = require('../utils/AppError');
const { addCrawlerTask, removeQueuedTask } = require('./crawlerQueue');
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
  const { name, description, forumUrl, sectionUrl, crawlType, taskType, config, schedule } = body;

  // 创建校验
  if (crawlType === 'single' && !forumUrl) {
    throw new AppError('单帖采集时请输入帖子地址', 400);
  }
  if (crawlType === 'batch' && !sectionUrl) {
    throw new AppError('批量采集时请输入版块地址', 400);
  }

  // 默认命名
  let taskName = name;
  if (!taskName || taskName.trim() === '') {
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
      updates[field] = body[field];
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
  task.status = 'paused';
  await task.save();
  return task;
}

async function resumeTask(taskId, user) {
  const { task } = await findAndAuthorize(taskId, user, { zh: '恢复', en: 'resume' });
  task.status = 'running';
  await task.save();
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
  task.endTime = new Date();
  await task.save();
  return task;
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
  cancelTask,
  getTaskLogs,
};
