const Post = require('../models/Post');
const Collection = require('../models/Collection');
const AppError = require('../utils/AppError');

// 查询超时时间 (毫秒)
const QUERY_TIMEOUT_MS = 10000;
const NOVEL_PAGE_SIZE_CAP = 100;

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
  },
};

// ============ 纯函数（无 IO，单测直接覆盖） ============

/**
 * 构建分页元数据
 */
const buildPagination = ({ page, limit, total, extra = {} }) => ({
  page,
  limit,
  total,
  pages: limit > 0 ? Math.ceil(total / limit) : 0,
  ...extra,
});

/**
 * 构建图片类帖子的查询条件
 */
const buildImageFilter = ({ taskId, keyword, startDate, endDate } = {}) => {
  const filter = {
    postType: { $in: ['image', 'mixed'] },
    media: { $exists: true, $ne: [] }, // 确保有图片
  };

  if (taskId) {
    filter.taskId = taskId;
  }

  // 关键词搜索（标题/作者）
  if (keyword) {
    filter.$or = [
      { title: { $regex: keyword, $options: 'i' } },
      { author: { $regex: keyword, $options: 'i' } },
    ];
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

  return filter;
};

/**
 * 构建小说类帖子的查询条件
 */
const buildNovelFilter = ({ taskId, startDate, endDate } = {}) => {
  const filter = {
    postType: { $in: ['novel', 'text'] },
  };

  if (taskId) {
    filter.taskId = taskId;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }

  return filter;
};

/**
 * 将帖子的 media 扁平化为单图片项列表
 */
const flattenPostsToImages = (posts) => {
  const images = [];
  posts.forEach((post) => {
    if (post.media && post.media.length > 0) {
      post.media.forEach((img) => {
        images.push({
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
  return images;
};

/**
 * 按帖子（网页源）构建图片分组
 */
const buildImageGroups = (posts) =>
  posts.map((post) => ({
    _id: post._id,
    title: post.title,
    author: post.author,
    sourceUrl: post.sourceUrl,
    taskId: post.taskId,
    createdAt: post.createdAt,
    totalImages: post.media.length,
    previewImages: post.media.slice(0, 4).map((img) => ({
      url: img.url,
      description: img.description,
    })),
    allImages: post.media.map((img) => ({
      url: img.url,
      originalUrl: img.originalUrl,
      description: img.description,
    })),
  }));

/**
 * 小说列表项：应用层计算字数、截取摘要，不传输完整 content
 */
const enrichNovels = (novels) =>
  novels.map((novel) => ({
    _id: novel._id,
    title: novel.title,
    author: novel.author,
    sourceUrl: novel.sourceUrl,
    taskId: novel.taskId,
    createdAt: novel.createdAt,
    views: novel.views,
    likes: novel.likes,
    replies: novel.replies,
    wordCount: novel.content ? novel.content.length : 0,
    excerpt: novel.content ? novel.content.substring(0, 200) : '',
  }));

/**
 * 转义正则特殊字符（正则回退搜索用）
 */
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const POST_LIST_SELECT = 'title author sourceUrl taskId media createdAt';
const NOVEL_SELECT = 'title author content sourceUrl taskId createdAt views likes replies';

// ============ 数据访问 ============

/**
 * 获取图片列表（扁平化 + 应用层分页）
 */
async function listImages(query) {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt' } = query;
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  const filter = buildImageFilter({ taskId });

  const allPosts = await Post.find(filter)
    .select(POST_LIST_SELECT)
    .sort(sortBy);

  const allImages = flattenPostsToImages(allPosts);
  const items = allImages.slice(skip, skip + pageSize);

  return {
    items,
    pagination: buildPagination({ page: pageNum, limit: pageSize, total: allImages.length }),
  };
}

/**
 * 获取按网页分组的图片列表
 */
async function listImageGroups(query) {
  const { page = 1, limit = 12, taskId, sortBy = '-createdAt' } = query;
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  const filter = buildImageFilter({ taskId });

  const posts = await Post.find(filter)
    .select(POST_LIST_SELECT)
    .sort(sortBy)
    .skip(skip)
    .limit(pageSize);

  const total = await Post.countDocuments(filter);

  return {
    items: buildImageGroups(posts),
    pagination: buildPagination({ page: pageNum, limit: pageSize, total }),
  };
}

/**
 * 搜索和筛选图片
 */
async function searchImages(body) {
  const {
    keyword,
    taskId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sortBy = '-createdAt',
  } = body;

  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  const filter = buildImageFilter({ keyword, taskId, startDate, endDate });

  const allPosts = await Post.find(filter)
    .select(POST_LIST_SELECT)
    .sort(sortBy);

  const allImages = flattenPostsToImages(allPosts);
  const items = allImages.slice(skip, skip + pageSize);

  return {
    items,
    pagination: buildPagination({ page: pageNum, limit: pageSize, total: allImages.length }),
  };
}

/**
 * 获取小说列表（支持游标分页/索引提示/计数缓存）
 */
async function listNovels(query) {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt', lastId } = query;
  const pageNum = parseInt(page);
  const pageSize = Math.min(parseInt(limit), NOVEL_PAGE_SIZE_CAP);

  const filter = buildNovelFilter({ taskId });

  // 使用复合索引提示（taskId 维度用三元复合索引，否则用 postType+createdAt）
  const applyHint = (q) =>
    q.hint(taskId ? { postType: 1, taskId: 1, createdAt: -1 } : { postType: 1, createdAt: -1 });

  // 游标分页：lastId + 默认排序时用 _id 翻页，大数据量下比 skip 高效
  let novels;
  let cursorLastId = null;
  if (lastId && sortBy === '-createdAt') {
    filter._id = { $lt: lastId };
    novels = await applyHint(
      Post.find(filter)
        .select(NOVEL_SELECT)
        .sort({ _id: -1 })
        .limit(pageSize)
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .lean()
    );
  } else {
    const skip = (pageNum - 1) * pageSize;
    novels = await applyHint(
      Post.find(filter)
        .select(NOVEL_SELECT)
        .sort(sortBy)
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .lean()
    );
  }

  const items = enrichNovels(novels);
  if (novels.length > 0) {
    cursorLastId = novels[novels.length - 1]._id;
  }

  // 获取总数（使用缓存）
  const cacheKey = `novels_count_${taskId || 'all'}`;
  let total = countCache.get(cacheKey);
  if (total === null) {
    total = await Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
    countCache.set(cacheKey, total);
  }

  return {
    items,
    pagination: buildPagination({
      page: pageNum,
      limit: pageSize,
      total,
      extra: { lastId: cursorLastId },
    }),
  };
}

/**
 * 搜索和筛选小说（文本索引优先，正则回退）
 */
async function searchNovels(body) {
  const {
    keyword,
    taskId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sortBy = '-createdAt',
    useTextSearch = true,
  } = body;

  const pageNum = parseInt(page);
  const pageSize = Math.min(parseInt(limit), NOVEL_PAGE_SIZE_CAP);
  const skip = (pageNum - 1) * pageSize;

  const filter = buildNovelFilter({ taskId, startDate, endDate });

  let novels;
  let total;

  if (keyword && keyword.trim()) {
    const trimmedKeyword = keyword.trim();

    if (useTextSearch) {
      // 使用 MongoDB 文本索引搜索（推荐，性能更好）
      filter.$text = { $search: trimmedKeyword };

      novels = await Post.find(filter, { score: { $meta: 'textScore' } })
        .select(NOVEL_SELECT)
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .lean();

      total = await Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
    } else {
      // 回退到正则表达式搜索（仅搜索 title 和 author）
      const escapedKeyword = escapeRegExp(trimmedKeyword);
      filter.$or = [
        { title: { $regex: escapedKeyword, $options: 'i' } },
        { author: { $regex: escapedKeyword, $options: 'i' } },
      ];

      novels = await Post.find(filter)
        .select(NOVEL_SELECT)
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
      .select(NOVEL_SELECT)
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

  return {
    items: enrichNovels(novels),
    pagination: buildPagination({ page: pageNum, limit: pageSize, total }),
  };
}

/**
 * 获取单个小说的详细内容（原子递增浏览量）
 */
async function getNovelContent(id) {
  // 使用 findByIdAndUpdate 原子更新浏览量，避免 save() 触发 validation 错误
  // （部分老数据可能缺少 userId 等必填字段）
  const novel = await Post.findByIdAndUpdate(
    id,
    { $inc: { views: 1 } },
    { new: true }
  );

  if (!novel) {
    throw new AppError('小说不存在', 404);
  }

  return novel;
}

// ============ 收藏夹 ============

/**
 * 创建收藏夹
 */
async function createCollection({ name, description, isPublic, tags }) {
  if (!name) {
    throw new AppError('收藏夹名称不能为空', 400);
  }

  return Collection.create({
    name,
    description: description || '',
    isPublic: isPublic || false,
    tags: tags || [],
  });
}

/**
 * 获取收藏夹列表
 */
async function listCollections(query) {
  const { page = 1, limit = 20 } = query;
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  const collections = await Collection.find()
    .select('name description coverImage itemCount isPublic tags createdAt')
    .sort('-createdAt')
    .skip(skip)
    .limit(pageSize);

  const total = await Collection.countDocuments();

  return {
    items: collections,
    pagination: buildPagination({ page: pageNum, limit: pageSize, total }),
  };
}

/**
 * 获取单个收藏夹详情
 */
async function getCollectionById(id) {
  const collection = await Collection.findById(id).populate({
    path: 'items',
    select: 'title author media content postType createdAt',
  });

  if (!collection) {
    throw new AppError('收藏夹不存在', 404);
  }

  return collection;
}

/**
 * 添加内容到收藏夹（已存在时幂等返回）
 */
async function addToCollection(id, postId) {
  if (!postId) {
    throw new AppError('内容ID不能为空', 400);
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw new AppError('内容不存在', 404);
  }

  const collection = await Collection.findById(id);
  if (!collection) {
    throw new AppError('收藏夹不存在', 404);
  }

  // 避免重复添加
  if (collection.items.includes(postId)) {
    return { collection, message: '内容已存在于收藏夹' };
  }

  collection.items.push(postId);
  collection.itemCount = collection.items.length;
  await collection.save();

  return { collection, message: '已添加到收藏夹' };
}

/**
 * 从收藏夹移除内容
 */
async function removeFromCollection(id, postId) {
  if (!postId) {
    throw new AppError('内容ID不能为空', 400);
  }

  const collection = await Collection.findById(id);
  if (!collection) {
    throw new AppError('收藏夹不存在', 404);
  }

  collection.items = collection.items.filter(
    (item) => item.toString() !== postId
  );
  collection.itemCount = collection.items.length;
  await collection.save();

  return { collection, message: '已从收藏夹移除' };
}

/**
 * 删除收藏夹
 */
async function deleteCollection(id) {
  const collection = await Collection.findByIdAndDelete(id);
  if (!collection) {
    throw new AppError('收藏夹不存在', 404);
  }
  return '收藏夹已删除';
}

/**
 * 更新收藏夹
 */
async function updateCollection(id, fields) {
  const { name, description, isPublic, tags, coverImage } = fields;

  const collection = await Collection.findByIdAndUpdate(
    id,
    { name, description, isPublic, tags, coverImage },
    { new: true, runValidators: true }
  );

  if (!collection) {
    throw new AppError('收藏夹不存在', 404);
  }

  return collection;
}

// ============ 缓存与统计 ============

/**
 * 清除计数缓存
 */
function clearCache() {
  countCache.clear();
  return '缓存已清除';
}

/**
 * 获取数据库统计信息（监控/调试用）
 */
async function getStats() {
  return {
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
}

// ============ 删除操作 ============

/**
 * 删除小说（整个 Post）
 */
async function deleteNovel(id) {
  const post = await Post.findByIdAndDelete(id);
  if (!post) {
    throw new AppError('小说不存在', 404);
  }

  countCache.clear();
  return { post, message: '小说已删除' };
}

/**
 * 删除单个图片（从 Post.media 移除；media 与 content 均空时删除整个 Post）
 */
async function deleteImage(id, imageUrl) {
  if (!imageUrl) {
    throw new AppError('图片URL不能为空', 400);
  }

  const post = await Post.findById(id);
  if (!post) {
    throw new AppError('内容不存在', 404);
  }

  const mediaIndex = post.media.findIndex((img) => img.url === imageUrl);
  if (mediaIndex === -1) {
    throw new AppError('图片不存在', 404);
  }

  post.media.splice(mediaIndex, 1);

  // 删除后没有图片和内容，则删除整个 Post
  if (post.media.length === 0 && !post.content) {
    await Post.findByIdAndDelete(id);
    countCache.clear();
    return { post: null, message: '图片已删除，由于内容为空已删除整个 Post' };
  }

  const updatedPost = await post.save();
  return { post: updatedPost, message: '图片已删除' };
}

/**
 * 批量删除图片
 */
async function deleteImages(id, imageUrls) {
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new AppError('图片URL列表不能为空', 400);
  }

  const post = await Post.findById(id);
  if (!post) {
    throw new AppError('内容不存在', 404);
  }

  const originalCount = post.media.length;
  post.media = post.media.filter((img) => !imageUrls.includes(img.url));
  const removedCount = originalCount - post.media.length;

  // 删除后没有图片和内容，则删除整个 Post
  if (post.media.length === 0 && !post.content) {
    await Post.findByIdAndDelete(id);
    countCache.clear();
    return {
      post: null,
      message: `已删除 ${removedCount} 张图片，由于内容为空已删除整个 Post`,
    };
  }

  const updatedPost = await post.save();
  return { post: updatedPost, message: `已删除 ${removedCount} 张图片` };
}

module.exports = {
  // 纯函数
  buildPagination,
  buildImageFilter,
  buildNovelFilter,
  flattenPostsToImages,
  buildImageGroups,
  enrichNovels,
  escapeRegExp,
  countCache,
  // 数据访问
  listImages,
  listImageGroups,
  searchImages,
  listNovels,
  searchNovels,
  getNovelContent,
  createCollection,
  listCollections,
  getCollectionById,
  addToCollection,
  removeFromCollection,
  deleteCollection,
  updateCollection,
  clearCache,
  getStats,
  deleteNovel,
  deleteImage,
  deleteImages,
};
