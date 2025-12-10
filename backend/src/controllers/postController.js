const Post = require('../models/Post');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Get all posts
exports.getAllPosts = catchAsync(async (req, res) => {
  const { taskId, postType, status, page = 1, limit = 20, sort = '-createdAt' } = req.query;

  const filter = { $or: [{ userId: req.user.id }, { visibility: 'public' }] };
  if (taskId) filter.taskId = taskId;
  if (postType) filter.postType = postType;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const posts = await Post.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate('taskId', 'name');

  const total = await Post.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: posts,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  });
});

// Get single post by ID
exports.getPostById = catchAsync(async (req, res) => {
  const post = await Post.findOne({
    _id: req.params.id,
    $or: [{ userId: req.user.id }, { visibility: 'public' }]
  })
    .populate('taskId', 'name');

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  res.status(200).json({
    success: true,
    data: post,
  });
});

// Get posts by task ID
exports.getPostsByTaskId = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, sort = '-createdAt', postType } = req.query;
  const { taskId } = req.params;

  // 验证用户是否有权限访问该任务
  const task = await require('../models/Task').findOne({ _id: taskId, userId: req.user.id });
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const filter = { taskId };
  if (postType) filter.postType = postType;

  const skip = (page - 1) * limit;

  const posts = await Post.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Post.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: posts,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  });
});

// Create post (internal use by crawler)
exports.createPost = catchAsync(async (req, res) => {
  // 为帖子添加用户ID，从任务中获取
  if (!req.body.userId) {
    const task = await require('../models/Task').findById(req.body.taskId);
    if (task) {
      req.body.userId = task.userId;
    }
  }

  const post = await Post.create(req.body);

  res.status(201).json({
    success: true,
    data: post,
  });
});

// Update post
exports.updatePost = catchAsync(async (req, res) => {
  const post = await Post.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    req.body,
    {
      new: true,
      runValidators: true,
    }
  );

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  res.status(200).json({
    success: true,
    data: post,
  });
});

// Delete post
exports.deletePost = catchAsync(async (req, res) => {
  const post = await Post.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  res.status(200).json({
    success: true,
    data: null,
    message: 'Post deleted successfully',
  });
});

// Get post statistics
exports.getPostStats = catchAsync(async (req, res) => {
  const { taskId } = req.params;

  // 验证用户是否有权限访问该任务
  const task = await require('../models/Task').findOne({ _id: taskId, userId: req.user.id });
  if (!task) {
    throw new AppError('Task not found', 404);
  }

  const stats = await Post.aggregate([
    { $match: { taskId: require('mongoose').Types.ObjectId(taskId) } },
    {
      $group: {
        _id: '$postType',
        count: { $sum: 1 },
        avgLikes: { $avg: '$likes' },
        avgViews: { $avg: '$views' },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: stats,
  });
});
