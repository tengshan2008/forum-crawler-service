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

  // 关键词搜索（标题/作者）：必须转义正则元字符，否则用户输入 "["、"." 等会抛
  // Invalid regular expression 变 500（与任务列表 keyword 的处理保持一致）
  const trimmedKeyword = (keyword || '').trim();
  if (trimmedKeyword) {
    const escaped = escapeRegExp(trimmedKeyword);
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { author: { $regex: escaped, $options: 'i' } },
    ];
  }

  // 时间范围筛选（日期字符串按本地自然日解释，结束日含全天）
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(`${startDate}T00:00:00`);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(`${endDate}T23:59:59.999`);
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
 * 按帖子（网页源）构建图片分组
 * 列表场景只返回前 4 张预览：单组可能有数百张图，全量 URL 会让列表响应膨胀十几倍；
 * 详情视图（getImageGroupDetail）按 postId 单独拉全量
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

/**
 * 帖子可见性过滤（语义与 postController 一致）：
 * admin 全量；普通用户仅本人帖子或 visibility 为 public 的帖子
 */
const buildVisibilityFilter = (user) =>
  user.role === 'admin' ? {} : { $or: [{ userId: user.userId }, { visibility: 'public' }] };

/**
 * 将可见性过滤合并进业务 filter（原地修改，返回同一引用）
 * 关键词搜索可能已占用顶层 $or，此时与可见性 $or 组合为 $and 避免键冲突；
 * $text 等其余顶层键不受影响（Mongo 要求 $text 位于查询根层）
 */
const applyVisibility = (filter, user) => {
  const visibility = buildVisibilityFilter(user);
  if (visibility.$or) {
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, visibility];
      delete filter.$or;
    } else {
      filter.$or = visibility.$or;
    }
  }
  return filter;
};

const POST_LIST_SELECT = 'title author sourceUrl taskId media createdAt';
const NOVEL_SELECT = 'title author content sourceUrl taskId createdAt views likes replies';

// ============ 数据访问 ============

/**
 * 获取按网页分组的图片列表（支持任务/关键词标题作者/时间范围筛选，按用户可见性隔离）
 */
async function listImageGroups(query, user) {
  const {
    page = 1,
    limit = 12,
    taskId,
    keyword,
    startDate,
    endDate,
    sortBy = '-createdAt',
  } = query;
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  const filter = applyVisibility(
    buildImageFilter({ taskId, keyword, startDate, endDate }),
    user
  );

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
 * 获取单个网页分组的全部图片（详情视图）
 * 列表接口只带前 4 张预览以压缩响应体，进入详情时再按 postId 拉全量；
 * 限定可见范围：非本人/非 public/不存在统一 404，不泄露存在性
 */
async function getImageGroupDetail(postId, user) {
  if (!postId) {
    throw new AppError('内容ID不能为空', 400);
  }

  const post = await Post.findOne(applyVisibility({ _id: postId }, user))
    .select(POST_LIST_SELECT)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();

  if (!post) {
    throw new AppError('内容不存在', 404);
  }

  const media = Array.isArray(post.media) ? post.media : [];
  if (media.length === 0) {
    throw new AppError('该内容没有图片', 404);
  }

  return {
    _id: post._id,
    title: post.title,
    author: post.author,
    sourceUrl: post.sourceUrl,
    taskId: post.taskId,
    createdAt: post.createdAt,
    totalImages: media.length,
    allImages: media.map((img) => ({
      url: img.url,
      description: img.description,
    })),
  };
}

/**
 * 获取小说列表（支持游标分页/索引提示/计数缓存，按用户可见性隔离）
 */
async function listNovels(query, user) {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt', lastId } = query;
  const pageNum = parseInt(page);
  const pageSize = Math.min(parseInt(limit), NOVEL_PAGE_SIZE_CAP);

  const filter = applyVisibility(buildNovelFilter({ taskId }), user);

  // 索引提示仅在无可见性 $or（admin 全量）时安全：$or 场景下强制 hint 会放弃
  // userId/visibility 分支索引（{userId:1,...}/{visibility:1,...}），退化为全量拉取过滤
  const applyHint = (q) =>
    filter.$or
      ? q
      : q.hint(taskId ? { postType: 1, taskId: 1, createdAt: -1 } : { postType: 1, createdAt: -1 });

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

  // 获取总数（使用缓存；key 携带 userId，避免不同用户的可见范围计数互相污染）
  const cacheKey = `novels_count_${user.userId}_${taskId || 'all'}`;
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
 * 搜索和筛选小说（文本索引优先，正则回退，按用户可见性隔离）
 */
async function searchNovels(body, user) {
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
      // 使用 MongoDB 文本索引搜索（推荐，性能更好）；$text 保持在查询根层
      filter.$text = { $search: trimmedKeyword };
      applyVisibility(filter, user);

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
      // 关键词 $or 已占用，可见性经 $and 组合
      applyVisibility(filter, user);

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
    // 无关键词时直接查询；可见性 $or 场景不加 hint（同 listNovels，保留 $or 分支索引选择权）
    applyVisibility(filter, user);
    let q = Post.find(filter)
      .select(NOVEL_SELECT)
      .sort(sortBy)
      .skip(skip)
      .limit(pageSize);
    if (!filter.$or) {
      q = q.hint({ postType: 1, createdAt: -1 });
    }
    novels = await q.maxTimeMS(QUERY_TIMEOUT_MS).lean();

    // 使用缓存获取总数（key 携带 userId，避免跨用户计数污染）
    const cacheKey = `search_count_${user.userId}_${taskId || 'all'}_${startDate || ''}_${endDate || ''}`;
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
 * 获取单个小说的详细内容（原子递增浏览量，按用户可见性隔离）
 */
async function getNovelContent(id, user) {
  // 使用 findOneAndUpdate 原子更新浏览量，避免 save() 触发 validation 错误
  // （部分老数据可能缺少 userId 等必填字段）；作用域过滤防止越权读取他人帖子
  const novel = await Post.findOneAndUpdate(
    applyVisibility({ _id: id }, user),
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
async function createCollection(userId, { name, description, isPublic, tags }) {
  if (!userId) {
    throw new AppError('缺少用户身份，无法创建收藏夹', 401);
  }
  if (!name) {
    throw new AppError('收藏夹名称不能为空', 400);
  }

  try {
    return await Collection.create({
      name,
      description: description || '',
      isPublic: isPublic || false,
      tags: tags || [],
      userId,
    });
  } catch (err) {
    // 复合唯一索引 {userId, name}：用户内同名冲突
    if (err && err.code === 11000) {
      throw new AppError('同名收藏夹已存在', 409);
    }
    throw err;
  }
}

/**
 * 获取收藏夹列表
 * 返回体携带 items（Post ObjectId 数组）：前端一次请求即可推导内容的已收藏状态，
 * 无需进入详情逐夹查询；items 为纯 id 引用，响应体增量可忽略
 */
async function listCollections(userId, query) {
  const { page = 1, limit = 20 } = query;
  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  // 个人收藏夹：仅返回当前用户所有（历史全局数据经迁移脚本归属到首个 admin）
  const filter = { userId };

  const collections = await Collection.find(filter)
    .select('name description coverImage items itemCount isPublic tags createdAt')
    .sort('-createdAt')
    .skip(skip)
    .limit(pageSize);

  const total = await Collection.countDocuments(filter);

  return {
    items: collections,
    pagination: buildPagination({ page: pageNum, limit: pageSize, total }),
  };
}

/**
 * 获取单个收藏夹详情
 */
async function getCollectionById(userId, id) {
  // _id+userId 联合查询：他人/不存在的收藏夹统一 404，不泄露存在性
  const collection = await Collection.findOne({ _id: id, userId }).populate({
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
async function addToCollection(userId, id, postId, user) {
  if (!postId) {
    throw new AppError('内容ID不能为空', 400);
  }

  // 作用域校验：不可收藏当前用户不可见（他人且非 public）的帖子
  const post = await Post.findOne(applyVisibility({ _id: postId }, user));
  if (!post) {
    throw new AppError('内容不存在', 404);
  }

  const collection = await Collection.findOne({ _id: id, userId });
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
async function removeFromCollection(userId, id, postId) {
  if (!postId) {
    throw new AppError('内容ID不能为空', 400);
  }

  const collection = await Collection.findOne({ _id: id, userId });
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
async function deleteCollection(userId, id) {
  const collection = await Collection.findOneAndDelete({ _id: id, userId });
  if (!collection) {
    throw new AppError('收藏夹不存在', 404);
  }
  return '收藏夹已删除';
}

/**
 * 更新收藏夹
 */
async function updateCollection(userId, id, fields) {
  const { name, description, isPublic, tags, coverImage } = fields;

  let collection;
  try {
    collection = await Collection.findOneAndUpdate(
      { _id: id, userId },
      { name, description, isPublic, tags, coverImage },
      { new: true, runValidators: true }
    );
  } catch (err) {
    // 复合唯一索引 {userId, name}：重命名为用户内已有名称
    if (err && err.code === 11000) {
      throw new AppError('同名收藏夹已存在', 409);
    }
    throw err;
  }

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
 * 获取数据库统计信息（监控/调试用，按用户可见范围统计）
 */
async function getStats(user) {
  const visibility = buildVisibilityFilter(user);
  return {
    novels: {
      total: await Post.countDocuments({ ...visibility, postType: { $in: ['novel', 'text'] } }).maxTimeMS(QUERY_TIMEOUT_MS),
    },
    images: {
      total: await Post.countDocuments({ ...visibility, postType: { $in: ['image', 'mixed'] } }).maxTimeMS(QUERY_TIMEOUT_MS),
    },
    cache: {
      entries: Object.keys(countCache.data).length,
      ttlSeconds: countCache.ttl / 1000,
    },
  };
}

// ============ 删除操作 ============

/**
 * 删除小说（整个 Post，按用户可见性隔离）
 */
async function deleteNovel(id, user) {
  const post = await Post.findOneAndDelete(applyVisibility({ _id: id }, user));
  if (!post) {
    throw new AppError('小说不存在', 404);
  }

  countCache.clear();
  return { post, message: '小说已删除' };
}

/**
 * 删除单个图片（从 Post.media 移除；media 与 content 均空时删除整个 Post；按用户可见性隔离）
 */
async function deleteImage(id, imageUrl, user) {
  if (!imageUrl) {
    throw new AppError('图片URL不能为空', 400);
  }

  const post = await Post.findOne(applyVisibility({ _id: id }, user));
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
 * 批量删除图片（按用户可见性隔离）
 */
async function deleteImages(id, imageUrls, user) {
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new AppError('图片URL列表不能为空', 400);
  }

  const post = await Post.findOne(applyVisibility({ _id: id }, user));
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
  buildImageGroups,
  enrichNovels,
  escapeRegExp,
  buildVisibilityFilter,
  applyVisibility,
  countCache,
  // 数据访问
  listImageGroups,
  getImageGroupDetail,
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
