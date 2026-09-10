const taskService = require('../services/taskService');
const { getQueueStats } = require('../services/crawlerQueue');
const { openTaskEventStream } = require('../services/taskStreamService');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/respond');

// controller 只负责：参数读取 → 调 service → 组装响应
// 角色可见性、创建校验、白名单、状态机等业务规则下沉至 taskService

// Get all tasks
exports.getAllTasks = catchAsync(async (req, res) => {
  const { tasks, total } = await taskService.listTasks(req.query, req.user);
  const { page = 1, limit = 10 } = req.query;

  sendSuccess(res, {
    data: tasks,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  });
});

// Get task stats (total / running / failed / todayCreated)
exports.getTaskStats = catchAsync(async (req, res) => {
  const stats = await taskService.getTaskStats(req.user);

  sendSuccess(res, { data: stats });
});

// Get single task by ID
exports.getTaskById = catchAsync(async (req, res) => {
  const task = await taskService.getTask(req.params.id, req.user);

  sendSuccess(res, { data: task });
});

// Create new task
exports.createTask = catchAsync(async (req, res) => {
  const task = await taskService.createTask(req.body, req.user.userId);

  console.log(`[任务创建] 任务ID: ${task._id}, 用户ID: ${task.userId}`);

  sendSuccess(res, { status: 201, data: task, message: 'Task created successfully' });
});

// Update task
exports.updateTask = catchAsync(async (req, res) => {
  const task = await taskService.updateTask(req.params.id, req.user, req.body);

  sendSuccess(res, { data: task, message: 'Task updated successfully' });
});

// Delete task
exports.deleteTask = catchAsync(async (req, res) => {
  await taskService.deleteTask(req.params.id, req.user);

  sendSuccess(res, { message: 'Task deleted successfully' });
});

// Start task
exports.startTask = catchAsync(async (req, res) => {
  const task = await taskService.startTask(req.params.id, req.user);

  sendSuccess(res, { data: task, message: 'Task started' });
});

// Pause task
exports.pauseTask = catchAsync(async (req, res) => {
  const task = await taskService.pauseTask(req.params.id, req.user);

  sendSuccess(res, { data: task, message: 'Task paused' });
});

// Resume task
exports.resumeTask = catchAsync(async (req, res) => {
  const task = await taskService.resumeTask(req.params.id, req.user);

  sendSuccess(res, { data: task, message: 'Task resumed' });
});

// Cancel queued task
exports.cancelTask = catchAsync(async (req, res) => {
  const task = await taskService.cancelTask(req.params.id, req.user);

  sendSuccess(res, { data: task, message: 'Task cancelled' });
});

// Get task execution logs (tail)
exports.getTaskLogs = catchAsync(async (req, res) => {
  const { task, logs, exists } = await taskService.getTaskLogs(req.params.id, req.user, {
    lines: parseInt(req.query.lines) || undefined,
  });

  sendSuccess(res, { data: { taskId: task._id, logs, exists } });
});

// SSE：任务执行事件流（进度/日志/状态实时推送，跨实例经 Redis 中转）
// 流的协议细节（snapshot/回放/订阅/心跳/终态关流）下沉至 taskStreamService；
// EventSource 无法自定义请求头，令牌经 ?access_token= 传递（authMiddleware 已支持）。
exports.streamTaskEvents = catchAsync(async (req, res) => {
  // 鉴权在写 SSE 头之前完成，失败走 errorHandler 返回 JSON
  const task = await taskService.getTask(req.params.id, req.user);
  const taskId = String(task._id);
  const lastEventId = req.headers['last-event-id'] || req.query.lastEventId;

  await openTaskEventStream(res, taskId, {
    lastEventId,
    snapshot: {
      taskId,
      status: task.status,
      progress: task.progress,
      crawledItems: task.crawledItems,
      name: task.name,
    },
  });
});

// Get crawler queue stats
exports.getCrawlerStats = catchAsync(async (req, res) => {
  const stats = await getQueueStats();

  sendSuccess(res, { data: stats, message: 'Crawler queue stats' });
});
