const taskService = require('../services/taskService');
const { getQueueStats } = require('../services/crawlerQueue');
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

// Get crawler queue stats
exports.getCrawlerStats = catchAsync(async (req, res) => {
  const stats = await getQueueStats();

  sendSuccess(res, { data: stats, message: 'Crawler queue stats' });
});
