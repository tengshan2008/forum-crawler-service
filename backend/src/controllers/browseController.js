const Post = require('../models/Post');
const Collection = require('../models/Collection');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * 获取图片列表
 */
exports.getImages = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt' } = req.query;
  const skip = (page - 1) * limit;

  // 构建查询条件
  const filter = {
    postType: { $in: ['image', 'mixed'] },
    media: { $exists: true, $ne: [] }, // 确保有图片
  };

  if (taskId) {
    filter.taskId = taskId;
  }

  // 查询图片
  const images = await Post.find(filter)
    .select('title author sourceUrl taskId media createdAt')
    .sort(sortBy)
    .skip(skip)
    .limit(parseInt(limit));

  // 统计总数
  const total = await Post.countDocuments(filter);

  // 扁平化处理：每个图片作为一个单独的项
  const flatImages = [];
  images.forEach((post) => {
    if (post.media && post.media.length > 0) {
      post.media.forEach((img) => {
        flatImages.push({
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

  res.status(200).json({
    success: true,
    data: flatImages,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
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

  const skip = (page - 1) * limit;
  const images = await Post.find(filter)
    .select('title author sourceUrl taskId media createdAt')
    .sort(sortBy)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Post.countDocuments(filter);

  const flatImages = [];
  images.forEach((post) => {
    if (post.media && post.media.length > 0) {
      post.media.forEach((img) => {
        flatImages.push({
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

  res.status(200).json({
    success: true,
    data: flatImages,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * 获取小说列表
 */
exports.getNovels = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt' } = req.query;
  const skip = (page - 1) * limit;

  // 构建查询条件
  const filter = {
    postType: { $in: ['novel', 'text', 'mixed'] },
    content: { $exists: true, $ne: '' }, // 确保有内容
  };

  if (taskId) {
    filter.taskId = taskId;
  }

  // 查询小说
  const novels = await Post.find(filter)
    .select(
      'title author content sourceUrl taskId createdAt views likes replies'
    )
    .sort(sortBy)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // 为每个小说添加字数统计和摘要
  const enrichedNovels = novels.map((novel) => ({
    ...novel,
    wordCount: novel.content ? novel.content.length : 0,
    excerpt: novel.content ? novel.content.substring(0, 200) : '',
  }));

  // 统计总数
  const total = await Post.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: enrichedNovels,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * 搜索和筛选小说
 */
exports.searchNovels = catchAsync(async (req, res) => {
  const {
    keyword,
    taskId,
    startDate,
    endDate,
    minWords,
    maxWords,
    page = 1,
    limit = 20,
    sortBy = '-createdAt',
  } = req.body;

  const filter = {
    postType: { $in: ['novel', 'text', 'mixed'] },
    content: { $exists: true, $ne: '' },
  };

  // 关键词搜索
  if (keyword) {
    filter.$or = [
      { title: { $regex: keyword, $options: 'i' } },
      { author: { $regex: keyword, $options: 'i' } },
      { content: { $regex: keyword, $options: 'i' } },
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

  // 字数范围筛选（通过正则表达式的长度）
  // 注意：MongoDB 不直接支持字符长度查询，这里使用 $where（有性能问题）或在应用层过滤
  // 为了性能考虑，建议在应用层过滤

  const skip = (page - 1) * limit;
  let novels = await Post.find(filter)
    .select(
      'title author content sourceUrl taskId createdAt views likes replies'
    )
    .sort(sortBy)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // 应用层过滤字数范围
  if (minWords || maxWords) {
    novels = novels.filter((novel) => {
      const wordCount = novel.content ? novel.content.length : 0;
      if (minWords && wordCount < parseInt(minWords)) return false;
      if (maxWords && wordCount > parseInt(maxWords)) return false;
      return true;
    });
  }

  // 为每个小说添加字数统计和摘要
  const enrichedNovels = novels.map((novel) => ({
    ...novel,
    wordCount: novel.content ? novel.content.length : 0,
    excerpt: novel.content ? novel.content.substring(0, 200) : '',
  }));

  const total = await Post.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: enrichedNovels,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
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
