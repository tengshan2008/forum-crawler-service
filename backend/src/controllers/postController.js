const Post = require('../models/Post');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/respond');

// Get all posts
exports.getAllPosts = catchAsync(async (req, res) => {
  const { taskId, postType, status, page = 1, limit = 20, sort = '-createdAt' } = req.query;

  // 管理员可以看到所有帖子，普通用户只能看到自己的和公开的帖子
  const filter = req.user.role === 'admin' ? {} : { $or: [{ userId: req.user.userId }, { visibility: 'public' }] };
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

  sendSuccess(res, {
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
  // 管理员可以查看任何帖子，普通用户只能查看自己的和公开的帖子
  const query = { _id: req.params.id };
  if (req.user.role !== 'admin') {
    query.$or = [{ userId: req.user.userId }, { visibility: 'public' }];
  }
  const post = await Post.findOne(query)
    .populate('taskId', 'name');

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  sendSuccess(res, { data: post });
});

// Get posts by task ID
exports.getPostsByTaskId = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, sort = '-createdAt', postType } = req.query;
  const { taskId } = req.params;

  // 验证用户是否有权限访问该任务
  // 管理员可以访问任何任务，普通用户只能访问自己的任务
  const taskQuery = { _id: taskId };
  if (req.user.role !== 'admin') {
    taskQuery.userId = req.user.userId;
  }
  const task = await require('../models/Task').findOne(taskQuery);
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

  sendSuccess(res, {
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

  sendSuccess(res, { status: 201, data: post });
});

// updatePost 可更新字段白名单，防止 req.body 批量赋值篡改 userId/taskId/sourceUrl/contentHash 等敏感字段
const POST_UPDATE_FIELDS = ['title', 'content', 'visibility', 'status', 'tags'];

// Update post
exports.updatePost = catchAsync(async (req, res) => {
  const updates = {};
  for (const field of POST_UPDATE_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const post = await Post.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.userId },
    updates,
    {
      new: true,
      runValidators: true,
    }
  );

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  sendSuccess(res, { data: post });
});

// Delete post
exports.deletePost = catchAsync(async (req, res) => {
  const post = await Post.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });

  if (!post) {
    throw new AppError('Post not found', 404);
  }

  sendSuccess(res, { data: null, message: 'Post deleted successfully' });
});

// Get post statistics
exports.getPostStats = catchAsync(async (req, res) => {
  const { taskId } = req.params;

  // 验证用户是否有权限访问该任务
  // 管理员可以访问任何任务，普通用户只能访问自己的任务
  const taskQuery = { _id: taskId };
  if (req.user.role !== 'admin') {
    taskQuery.userId = req.user.userId;
  }
  const task = await require('../models/Task').findOne(taskQuery);
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

  sendSuccess(res, { data: stats });
});
