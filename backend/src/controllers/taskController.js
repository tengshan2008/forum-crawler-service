const Task = require('../models/Task');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { addCrawlerTask, getQueueStats } = require('../services/crawlerQueue');

// Get all tasks
exports.getAllTasks = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10, sort = '-createdAt' } = req.query;
  
  const filter = {};
  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * limit;
  
  const tasks = await Task.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Task.countDocuments(filter);

  res.status(200).json({
    success: true,
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
  const task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  res.status(200).json({
    success: true,
    data: task,
  });
});

// Create new task
exports.createTask = catchAsync(async (req, res) => {
  const { name, description, forumUrl, taskType, config } = req.body;

  const task = await Task.create({
    name,
    description,
    forumUrl,
    taskType,
    config,
    status: 'pending',
  });

  res.status(201).json({
    success: true,
    data: task,
    message: 'Task created successfully',
  });
});

// Update task
exports.updateTask = catchAsync(async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  res.status(200).json({
    success: true,
    data: task,
    message: 'Task updated successfully',
  });
});

// Delete task
exports.deleteTask = catchAsync(async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  res.status(200).json({
    success: true,
    data: null,
    message: 'Task deleted successfully',
  });
});

// Start task
exports.startTask = catchAsync(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  if (task.status === 'running') {
    throw new AppError('Task is already running', 400);
  }

  task.status = 'running';
  task.startTime = new Date();
  task.progress = 0;
  task.crawledItems = 0;
  await task.save();

  // 异步启动爬虫任务（不阻塞响应）
  try {
    await addCrawlerTask(
      task._id.toString(),
      task.forumUrl,
      task.taskType,
      task.config
    );
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

  res.status(200).json({
    success: true,
    data: task,
    message: 'Task started',
  });
});

// Pause task
exports.pauseTask = catchAsync(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  task.status = 'paused';
  await task.save();

  res.status(200).json({
    success: true,
    data: task,
    message: 'Task paused',
  });
});

// Resume task
exports.resumeTask = catchAsync(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  task.status = 'running';
  await task.save();

  res.status(200).json({
    success: true,
    data: task,
    message: 'Task resumed',
  });
});

// Get crawler queue stats
exports.getCrawlerStats = catchAsync(async (req, res) => {
  const stats = await getQueueStats();

  res.status(200).json({
    success: true,
    data: stats,
    message: 'Crawler queue stats',
  });
});
