const Post = require('../models/Post');
const Collection = require('../models/Collection');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// 简单内存缓存，用于缓存文档计数
const countCache = {
  data: {},
  ttl: 60000, // 缓存 TTL 60秒

  get(key) {
    const item = this.data[key];
    if (item && Date.now() - item.timestamp < this.ttl) {
      return item.value;
    }
    return null;
  },

  set(key, value) {
    this.data[key] = { value, timestamp: Date.now() };
  },

  clear() {
    this.data = {};
  }
};

// 查询超时时间 (毫秒)
const QUERY_TIMEOUT_MS = 10000;

/**
 * 获取图片列表
 */
exports.getImages = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt' } = req.query;
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  // 构建查询条件
  const filter = {
    postType: { $in: ['image', 'mixed'] },
    media: { $exists: true, $ne: [] }, // 确保有图片
  };

  if (taskId) {
    filter.taskId = taskId;
  }

  // 先查询所有匹配的帖子（不分页）
  const allPosts = await Post.find(filter)
    .select('title author sourceUrl taskId media createdAt')
    .sort(sortBy);

  // 扁平化处理：每个图片作为一个单独的项
  const allImages = [];
  allPosts.forEach((post) => {
    if (post.media && post.media.length > 0) {
      post.media.forEach((img) => {
        allImages.push({
          _id: `${post._id}-${img.url}`,
          postId: post._id,
          postTitle: post.title,
          author: post.author,
          sourceUrl: post.sourceUrl,
          taskId: post.taskId,
          url: img.url,
          originalUrl: img.originalUrl,
          description: img.description,
          createdAt: post.createdAt,
        });
      });
    }
  });

  // 对扁平化后的图片进行分页
  const paginatedImages = allImages.slice(skip, skip + pageSize);
  const total = allImages.length;

  res.status(200).json({
    success: true,
    data: paginatedImages,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    },
  });
});

/**
 * 搜索和筛选图片
 */
exports.searchImages = catchAsync(async (req, res) => {
  const {
    keyword,
    taskId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sortBy = '-createdAt',
  } = req.body;

  const filter = {
    postType: { $in: ['image', 'mixed'] },
    media: { $exists: true, $ne: [] },
  };

  // 关键词搜索
  if (keyword) {
    filter.$or = [
      { title: { $regex: keyword, $options: 'i' } },
      { author: { $regex: keyword, $options: 'i' } },
    ];
  }

  // 任务筛选
  if (taskId) {
    filter.taskId = taskId;
  }

  // 时间范围筛选
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }

  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  // 先查询所有匹配的帖子（不分页）
  const allPosts = await Post.find(filter)
    .select('title author sourceUrl taskId media createdAt')
    .sort(sortBy);

  // 扁平化处理：每个图片作为一个单独的项
  const allImages = [];
  allPosts.forEach((post) => {
    if (post.media && post.media.length > 0) {
      post.media.forEach((img) => {
        allImages.push({
          _id: `${post._id}-${img.url}`,
          postId: post._id,
          postTitle: post.title,
          author: post.author,
          sourceUrl: post.sourceUrl,
          taskId: post.taskId,
          url: img.url,
          originalUrl: img.originalUrl,
          description: img.description,
          createdAt: post.createdAt,
        });
      });
    }
  });

  // 对扁平化后的图片进行分页
  const paginatedImages = allImages.slice(skip, skip + pageSize);
  const total = allImages.length;

  res.status(200).json({
    success: true,
    data: paginatedImages,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    },
  });
});

/**
 * 获取小说列表 - 已优化
 * 优化点：
 * 1. 使用 hint 强制使用复合索引
 * 2. 不查询 content 字段，只查询必要字段
 * 3. 使用缓存减少 countDocuments 调用
 * 4. 添加查询超时保护
 */
exports.getNovels = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt', lastId } = req.query;
  const pageNum = parseInt(page);
  const pageSize = Math.min(parseInt(limit), 100); // 限制最大每页数量

  // 构建查询条件
  const filter = {
    postType: { $in: ['novel', 'text'] },
  };

  if (taskId) {
    filter.taskId = taskId;
  }

  // 游标分页优化：如果提供了 lastId，使用 _id 进行分页
  // 这比 skip 在大数据量时效率高得多
  let query;
  if (lastId && sortBy === '-createdAt') {
    filter._id = { $lt: lastId };
    query = Post.find(filter)
      .select('title author sourceUrl taskId createdAt views likes replies')
      .sort({ _id: -1 })
      .limit(pageSize)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean();
  } else {
    const skip = (pageNum - 1) * pageSize;
    query = Post.find(filter)
      .select('title author sourceUrl taskId createdAt views likes replies')
      .sort(sortBy)
      .skip(skip)
      .limit(pageSize)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean();
  }

  // 使用复合索引提示
  if (taskId) {
    query = query.hint({ postType: 1, taskId: 1, createdAt: -1 });
  } else {
    query = query.hint({ postType: 1, createdAt: -1 });
  }

  const novels = await query;

  // 获取总数（使用缓存）
  const cacheKey = `novels_count_${taskId || 'all'}`;
  let total = countCache.get(cacheKey);
  if (total === null) {
    total = await Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
    countCache.set(cacheKey, total);
  }

  res.status(200).json({
    success: true,
    data: novels,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
      // 返回最后一条记录的 ID，用于游标分页
      lastId: novels.length > 0 ? novels[novels.length - 1]._id : null,
    },
  });
});

/**
 * 搜索和筛选小说 - 已优化
 * 优化点：
 * 1. 使用 MongoDB 文本索引替代正则表达式（性能提升 10-100 倍）
 * 2. 不查询 content 字段减少数据传输
 * 3. 添加查询超时保护
 * 4. 支持回退到正则表达式搜索（当文本索引不适用时）
 */
exports.searchNovels = catchAsync(async (req, res) => {
  const {
    keyword,
    taskId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sortBy = '-createdAt',
    useTextSearch = true, // 是否使用文本索引搜索
  } = req.body;

  const pageNum = parseInt(page);
  const pageSize = Math.min(parseInt(limit), 100);
  const skip = (pageNum - 1) * pageSize;

  const filter = {
    postType: { $in: ['novel', 'text'] },
  };

  // 任务筛选
  if (taskId) {
    filter.taskId = taskId;
  }

  // 时间范围筛选
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }

  let novels;
  let total;

  if (keyword && keyword.trim()) {
    const trimmedKeyword = keyword.trim();

    if (useTextSearch) {
      // 使用 MongoDB 文本索引搜索（推荐，性能更好）
      filter.$text = { $search: trimmedKeyword };

      // 文本搜索时，按相关性分数排序
      novels = await Post.find(filter, { score: { $meta: 'textScore' } })
        .select('title author sourceUrl taskId createdAt views likes replies')
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .lean();

      total = await Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
    } else {
      // 回退到正则表达式搜索（仅搜索 title 和 author，不搜索 content）
      // 使用前缀匹配可以利用索引
      const escapedKeyword = trimmedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: escapedKeyword, $options: 'i' } },
        { author: { $regex: escapedKeyword, $options: 'i' } },
      ];

      novels = await Post.find(filter)
        .select('title author sourceUrl taskId createdAt views likes replies')
        .sort(sortBy)
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .lean();

      total = await Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
    }
  } else {
    // 无关键词时直接查询
    novels = await Post.find(filter)
      .select('title author sourceUrl taskId createdAt views likes replies')
      .sort(sortBy)
      .skip(skip)
      .limit(pageSize)
      .hint({ postType: 1, createdAt: -1 })
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean();

    // 使用缓存获取总数
    const cacheKey = `search_count_${taskId || 'all'}_${startDate || ''}_${endDate || ''}`;
    total = countCache.get(cacheKey);
    if (total === null) {
      total = await Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
      countCache.set(cacheKey, total);
    }
  }

  res.status(200).json({
    success: true,
    data: novels,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    },
  });
});

/**
 * 获取单个小说的详细内容
 */
exports.getNovelContent = catchAsync(async (req, res) => {
  const { id } = req.params;

  const novel = await Post.findById(id);

  if (!novel) {
    return next(new AppError('小说不存在', 404));
  }

  // 更新浏览次数
  novel.views = (novel.views || 0) + 1;
  await novel.save();

  res.status(200).json({
    success: true,
    data: novel,
  });
});

/**
 * 创建收藏夹
 */
exports.createCollection = catchAsync(async (req, res) => {
  const { name, description, isPublic, tags } = req.body;

  if (!name) {
    return next(new AppError('收藏夹名称不能为空', 400));
  }

  const collection = await Collection.create({
    name,
    description: description || '',
    isPublic: isPublic || false,
    tags: tags || [],
  });

  res.status(201).json({
    success: true,
    data: collection,
  });
});

/**
 * 获取所有收藏夹
 */
exports.getCollections = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const collections = await Collection.find()
    .select('name description coverImage itemCount isPublic tags createdAt')
    .sort('-createdAt')
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Collection.countDocuments();

  res.status(200).json({
    success: true,
    data: collections,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * 获取单个收藏夹详情
 */
exports.getCollection = catchAsync(async (req, res) => {
  const { id } = req.params;

  const collection = await Collection.findById(id).populate({
    path: 'items',
    select: 'title author media content postType createdAt',
  });

  if (!collection) {
    return next(new AppError('收藏夹不存在', 404));
  }

  res.status(200).json({
    success: true,
    data: collection,
  });
});

/**
 * 添加内容到收藏夹
 */
exports.addToCollection = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { postId } = req.body;

  if (!postId) {
    return next(new AppError('内容ID不能为空', 400));
  }

  // 检查内容是否存在
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError('内容不存在', 404));
  }

  // 检查收藏夹是否存在
  let collection = await Collection.findById(id);
  if (!collection) {
    return next(new AppError('收藏夹不存在', 404));
  }

  // 避免重复添加
  if (collection.items.includes(postId)) {
    return res.status(200).json({
      success: true,
      message: '内容已存在于收藏夹',
      data: collection,
    });
  }

  // 添加到收藏夹
  collection.items.push(postId);
  collection.itemCount = collection.items.length;
  await collection.save();

  res.status(200).json({
    success: true,
    message: '已添加到收藏夹',
    data: collection,
  });
});

/**
 * 从收藏夹移除内容
 */
exports.removeFromCollection = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { postId } = req.body;

  if (!postId) {
    return next(new AppError('内容ID不能为空', 400));
  }

  const collection = await Collection.findById(id);
  if (!collection) {
    return next(new AppError('收藏夹不存在', 404));
  }

  // 移除内容
  collection.items = collection.items.filter(
    (item) => item.toString() !== postId
  );
  collection.itemCount = collection.items.length;
  await collection.save();

  res.status(200).json({
    success: true,
    message: '已从收藏夹移除',
    data: collection,
  });
});

/**
 * 删除收藏夹
 */
exports.deleteCollection = catchAsync(async (req, res) => {
  const { id } = req.params;

  const collection = await Collection.findByIdAndDelete(id);

  if (!collection) {
    return next(new AppError('收藏夹不存在', 404));
  }

  res.status(200).json({
    success: true,
    message: '收藏夹已删除',
  });
});

/**
 * 更新收藏夹
 */
exports.updateCollection = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, description, isPublic, tags, coverImage } = req.body;

  const collection = await Collection.findByIdAndUpdate(
    id,
    {
      name,
      description,
      isPublic,
      tags,
      coverImage,
    },
    { new: true, runValidators: true }
  );

  if (!collection) {
    return next(new AppError('收藏夹不存在', 404));
  }

  res.status(200).json({
    success: true,
    data: collection,
  });
});

/**
 * 清除计数缓存
 * 当数据发生变化时调用以获取最新的计数
 */
exports.clearCache = catchAsync(async (req, res) => {
  countCache.clear();

  res.status(200).json({
    success: true,
    message: '缓存已清除',
  });
});

/**
 * 获取数据库统计信息
 * 用于监控和调试
 */
exports.getStats = catchAsync(async (req, res) => {
  const stats = {
    novels: {
      total: await Post.countDocuments({ postType: { $in: ['novel', 'text'] } }).maxTimeMS(QUERY_TIMEOUT_MS),
    },
    images: {
      total: await Post.countDocuments({ postType: { $in: ['image', 'mixed'] } }).maxTimeMS(QUERY_TIMEOUT_MS),
    },
    cache: {
      entries: Object.keys(countCache.data).length,
      ttlSeconds: countCache.ttl / 1000,
    },
  };

  res.status(200).json({
    success: true,
    data: stats,
  });
});

