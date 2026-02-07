const Task = require('../models/Task');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { addCrawlerTask, getQueueStats } = require('../services/crawlerQueue');

// Get all tasks
exports.getAllTasks = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10, sort = '-createdAt' } = req.query;
  
  const filter = { userId: req.user.id };
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
  const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });

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
  const { name, description, forumUrl, sectionUrl, crawlType, taskType, config, schedule } = req.body;

  // 自定义验证逻辑
  if (crawlType === 'single' && !forumUrl) {
    throw new AppError('单帖采集时请输入帖子地址', 400);
  }
  if (crawlType === 'batch' && !sectionUrl) {
    throw new AppError('批量采集时请输入版块地址', 400);
  }

  // 如果没有提供名称，生成一个默认名称
  let taskName = name;
  if (!taskName || taskName.trim() === '') {
    const now = new Date();
    taskName = `${crawlType === 'single' ? '单帖' : '批量'}采集_${now.toISOString().slice(0, 19).replace(/[:-]/g, '-')}`;
  }

  const task = await Task.create({
    name: taskName,
    description,
    forumUrl,
    sectionUrl,
    crawlType,
    taskType,
    config,
    schedule,
    status: 'pending',
    userId: req.user.id,
  });

  console.log(`[任务创建] 任务ID: ${task._id}, 用户ID: ${task.userId}`);

  res.status(201).json({
    success: true,
    data: task,
    message: 'Task created successfully',
  });
});

// Update task
exports.updateTask = catchAsync(async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    req.body,
    {
      new: true,
      runValidators: true,
    }
  );

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
  const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

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
  // 先查找任务，不带 userId 过滤（兼容旧任务）
  let task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  // 检查权限或自动补充 userId
  if (!task.userId) {
    console.log(`[任务启动] 检测到任务 ${task._id} 缺少 userId，自动关联当前用户`);
    task.userId = req.user.id;
    await task.save();
  } else if (task.userId.toString() !== req.user.id) {
    // 用户不是任务的所有者
    throw new AppError('You do not have permission to start this task', 403);
  }

  console.log(`[任务启动] 任务ID: ${task._id}, 用户ID: ${task.userId}`);

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
    // 根据采集类型选择要传递的URL
    const url = task.crawlType === 'single' ? task.forumUrl : task.sectionUrl;
    await addCrawlerTask(
      task._id.toString(),
      url,
      task.taskType,
      task.config,
      task.crawlType  // 传递采集类型
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
  // 先查找任务，不带 userId 过滤（兼容旧任务）
  let task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  // 检查权限或自动补充 userId
  if (!task.userId) {
    console.log(`[任务暂停] 检测到任务 ${task._id} 缺少 userId，自动关联当前用户`);
    task.userId = req.user.id;
  } else if (task.userId.toString() !== req.user.id) {
    throw new AppError('You do not have permission to pause this task', 403);
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
  // 先查找任务，不带 userId 过滤（兼容旧任务）
  let task = await Task.findById(req.params.id);

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  // 检查权限或自动补充 userId
  if (!task.userId) {
    console.log(`[任务恢复] 检测到任务 ${task._id} 缺少 userId，自动关联当前用户`);
    task.userId = req.user.id;
  } else if (task.userId.toString() !== req.user.id) {
    throw new AppError('You do not have permission to resume this task', 403);
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
