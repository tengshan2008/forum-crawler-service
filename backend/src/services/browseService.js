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
    // 仅系列代表帖参与列表/搜索：实现书级分页，避免同系列跨页重复
    isSeriesHead: true,
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
 * 将一页「系列代表帖」补充为完整的书目列表项。
 * - 无 series 的帖子（t66y 一帖一本）：直接用自身字段，chapterCount=1
 * - 有 series 的代表帖：按 series 批量拉取全部章节（走 series 索引，文档量小），
 *   在应用层聚合 chapterCount/wordCount/views/likes/replies/latestChapterAt，
 *   摘要取章节号最小者的正文前 200 字。
 * 这样列表分页在书级别进行，同一系列不会跨页重复。
 */
const enrichSeriesHeads = async (heads, user) => {
  if (!heads.length) return [];

  const seriesNames = [...new Set(heads.map((h) => h.series).filter(Boolean))];
  let seriesStats = new Map();
  if (seriesNames.length) {
    const chapters = await Post.find(applyVisibility({ series: { $in: seriesNames } }, user))
      .select('_id series chapterNo content views likes replies createdAt')
      .lean();
    for (const c of chapters) {
      const key = String(c.series);
      let s = seriesStats.get(key);
      if (!s) {
        s = { chapterCount: 0, wordCount: 0, views: 0, likes: 0, replies: 0,
              latestChapterAt: c.createdAt, firstChapter: null };
        seriesStats.set(key, s);
      }
      s.chapterCount += 1;
      s.wordCount += (c.content || '').length;
      s.views += c.views || 0;
      s.likes += c.likes || 0;
      s.replies += c.replies || 0;
      if (c.createdAt > s.latestChapterAt) s.latestChapterAt = c.createdAt;
      const cn = c.chapterNo != null ? c.chapterNo : Number.MAX_SAFE_INTEGER;
      if (!s.firstChapter || cn < s.firstChapter.chapterNo) {
        s.firstChapter = { chapterNo: cn, excerpt: (c.content || '').substring(0, 200) };
      }
    }
  }

  return heads.map((h) => {
    if (h.series) {
      const s = seriesStats.get(String(h.series)) || {};
      return {
        _id: h._id,
        series: h.series,
        title: h.series,
        author: h.author,
        sourceUrl: h.sourceUrl,
        taskId: h.taskId,
        createdAt: s.latestChapterAt || h.createdAt,
        latestChapterAt: s.latestChapterAt || h.createdAt,
        chapterCount: s.chapterCount || 1,
        wordCount: s.wordCount || 0,
        views: s.views || 0,
        likes: s.likes || 0,
        replies: s.replies || 0,
        excerpt: s.firstChapter?.excerpt || '',
      };
    }
    const content = h.content || '';
    return {
      _id: h._id,
      series: null,
      title: h.title,
      author: h.author,
      sourceUrl: h.sourceUrl,
      taskId: h.taskId,
      createdAt: h.createdAt,
      latestChapterAt: h.createdAt,
      chapterCount: 1,
      wordCount: content.length,
      views: h.views || 0,
      likes: h.likes || 0,
      replies: h.replies || 0,
      excerpt: content.substring(0, 200),
    };
  });
};

/**
 * 转义正则特殊字符（正则回退搜索用）
 */
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 校验 MongoDB ObjectId 形态（24 位十六进制）
 * 图片按任务落盘在 /public/images/uploads/<taskId>/，前端支持直接粘贴该目录 ID 查询；
 * 入口不校验会让非法值穿透到 Mongoose 触发 CastError 变成 500
 */
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const isValidObjectId = (id) => OBJECT_ID_PATTERN.test(String(id || ''));

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
const NOVEL_SELECT = 'title author content sourceUrl taskId createdAt views likes replies series chapterNo';

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

  // taskId 即图片存储路径 /public/images/uploads/<taskId>/ 中的目录 ID，
  // 支持前端直接粘贴查询；非法形态在入口拒绝，避免 Mongoose CastError 变 500
  const normalizedTaskId = (taskId || '').trim();
  if (normalizedTaskId && !isValidObjectId(normalizedTaskId)) {
    throw new AppError('ID 格式无效：图片存储路径中的 ID 应为 24 位字符串', 400);
  }

  const pageNum = parseInt(page);
  const pageSize = parseInt(limit);
  const skip = (pageNum - 1) * pageSize;

  const filter = applyVisibility(
    buildImageFilter({ taskId: normalizedTaskId || undefined, keyword, startDate, endDate }),
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
 * 获取小说列表（书级分页：仅查询 isSeriesHead=true 的代表帖，按系列聚合统计）
 * 每本书一条记录，同一系列不会跨页重复；计数用 countDocuments 精确到书。
 */
async function listNovels(query, user) {
  const { page = 1, limit = 20, taskId, sortBy = '-createdAt' } = query;
  const pageNum = parseInt(page);
  const pageSize = Math.min(parseInt(limit), NOVEL_PAGE_SIZE_CAP);
  const skip = (pageNum - 1) * pageSize;

  const filter = applyVisibility(buildNovelFilter({ taskId }), user);

  // 索引提示仅在无可见性 $or（admin 全量）时安全
  const applyHint = (q) =>
    filter.$or
      ? q
      : q.hint(taskId ? { postType: 1, taskId: 1, createdAt: -1 } : { isSeriesHead: 1, postType: 1, createdAt: -1 });

  const heads = await applyHint(
    Post.find(filter)
      .select(NOVEL_SELECT)
      .sort(sortBy)
      .skip(skip)
      .limit(pageSize)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean()
  );

  const items = await enrichSeriesHeads(heads, user);

  // 总数：countDocuments 直接走 isSeriesHead 索引，精确到书
  const cacheKey = `novels_count_${user.userId}_${taskId || 'all'}`;
  let total = countCache.get(cacheKey);
  if (total === null) {
    const countQ = Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
    if (!filter.$or) countQ.hint({ isSeriesHead: 1, postType: 1, createdAt: -1 });
    total = await countQ;
    countCache.set(cacheKey, total);
  }

  return {
    items,
    pagination: buildPagination({ page: pageNum, limit: pageSize, total }),
  };
}

/**
 * 搜索和筛选小说（文本索引优先，正则回退，页内按 series 分组）
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
      // 文本索引搜索：$text 保持查询根层，score 投影用于相关性排序
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
      // 正则回退：仅搜索 title 和 author
      const escapedKeyword = escapeRegExp(trimmedKeyword);
      filter.$or = [
        { title: { $regex: escapedKeyword, $options: 'i' } },
        { author: { $regex: escapedKeyword, $options: 'i' } },
      ];
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
    applyVisibility(filter, user);
    let q = Post.find(filter)
      .select(NOVEL_SELECT)
      .sort(sortBy)
      .skip(skip)
      .limit(pageSize);
    if (!filter.$or) {
      q = q.hint({ isSeriesHead: 1, postType: 1, createdAt: -1 });
    }
    novels = await q.maxTimeMS(QUERY_TIMEOUT_MS).lean();

    const cacheKey = `search_count_${user.userId}_${taskId || 'all'}_${startDate || ''}_${endDate || ''}`;
    total = countCache.get(cacheKey);
    if (total === null) {
      const countQ = Post.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS);
      if (!filter.$or) countQ.hint({ isSeriesHead: 1, postType: 1, createdAt: -1 });
      total = await countQ;
      countCache.set(cacheKey, total);
    }
  }

  return {
    items: await enrichSeriesHeads(novels, user),
    pagination: buildPagination({ page: pageNum, limit: pageSize, total }),
  };
}

/**
 * 获取小说详细内容（原子递增浏览量，按用户可见性隔离）
 * - 普通帖子（无 series）：原样返回
 * - 系列帖子（有 series）：拉取该系列全部章节，按 chapterNo 升序拼接 content，
 *   返回对象以系列名为 title、拼接文本为 content，并附 chapterCount 供阅读器展示
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

  // 非系列帖子直接返回
  if (!novel.series) {
    return novel;
  }

  // 系列：拉取同 series 全部章节，按 chapterNo 升序拼接
  const chapters = await Post.find(applyVisibility({ series: novel.series }, user))
    .select('title author content chapterNo series sourceUrl createdAt')
    .sort({ chapterNo: 1, createdAt: 1 })
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();

  if (chapters.length === 0) {
    return novel;
  }

  const combinedContent = chapters
    .map((ch) => {
      const header = ch.chapterNo != null ? `【第${ch.chapterNo}章】${ch.title}\n\n` : `${ch.title}\n\n`;
      return header + (ch.content || '');
    })
    .join('\n\n');

  return {
    ...novel.toObject(),
    title: novel.series,
    content: combinedContent,
    chapterCount: chapters.length,
    // 阅读器按 _id 恢复阅读进度，系列统一用首个章节 id 作为锚点
    _id: chapters[0]._id,
  };
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
      total: await Post.countDocuments({ ...visibility, postType: { $in: ['novel', 'text'] }, isSeriesHead: true }).maxTimeMS(QUERY_TIMEOUT_MS),
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
  isValidObjectId,
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
