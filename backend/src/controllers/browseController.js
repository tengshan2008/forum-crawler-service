const browseService = require('../services/browseService');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/respond');

/**
 * 浏览域控制器：仅做参数与响应组装，业务规则在 browseService
 */

/**
 * 获取按网页分组的图片列表
 */
exports.getImageGroups = catchAsync(async (req, res) => {
  const { items, pagination } = await browseService.listImageGroups(req.query);
  sendSuccess(res, { data: items, pagination });
});

/**
 * 获取单个网页分组的全部图片（详情视图）
 */
exports.getImageGroupDetail = catchAsync(async (req, res) => {
  const group = await browseService.getImageGroupDetail(req.params.postId);
  sendSuccess(res, { data: group });
});

/**
 * 获取小说列表
 */
exports.getNovels = catchAsync(async (req, res) => {
  const { items, pagination } = await browseService.listNovels(req.query);
  sendSuccess(res, { data: items, pagination });
});

/**
 * 搜索和筛选小说
 */
exports.searchNovels = catchAsync(async (req, res) => {
  const { items, pagination } = await browseService.searchNovels(req.body);
  sendSuccess(res, { data: items, pagination });
});

/**
 * 获取单个小说的详细内容
 */
exports.getNovelContent = catchAsync(async (req, res) => {
  const novel = await browseService.getNovelContent(req.params.id);
  sendSuccess(res, { data: novel });
});

/**
 * 创建收藏夹
 */
exports.createCollection = catchAsync(async (req, res) => {
  const collection = await browseService.createCollection(req.user.userId, req.body);
  sendSuccess(res, { status: 201, data: collection });
});

/**
 * 获取所有收藏夹
 */
exports.getCollections = catchAsync(async (req, res) => {
  const { items, pagination } = await browseService.listCollections(req.user.userId, req.query);
  sendSuccess(res, { data: items, pagination });
});

/**
 * 获取单个收藏夹详情
 */
exports.getCollection = catchAsync(async (req, res) => {
  const collection = await browseService.getCollectionById(req.user.userId, req.params.id);
  sendSuccess(res, { data: collection });
});

/**
 * 添加内容到收藏夹
 */
exports.addToCollection = catchAsync(async (req, res) => {
  const { collection, message } = await browseService.addToCollection(
    req.user.userId,
    req.params.id,
    req.body.postId
  );
  sendSuccess(res, { data: collection, message });
});

/**
 * 从收藏夹移除内容
 */
exports.removeFromCollection = catchAsync(async (req, res) => {
  const { collection, message } = await browseService.removeFromCollection(
    req.user.userId,
    req.params.id,
    req.body.postId
  );
  sendSuccess(res, { data: collection, message });
});

/**
 * 删除收藏夹
 */
exports.deleteCollection = catchAsync(async (req, res) => {
  const message = await browseService.deleteCollection(req.user.userId, req.params.id);
  sendSuccess(res, { message });
});

/**
 * 更新收藏夹
 */
exports.updateCollection = catchAsync(async (req, res) => {
  const collection = await browseService.updateCollection(req.user.userId, req.params.id, req.body);
  sendSuccess(res, { data: collection });
});

/**
 * 清除计数缓存
 */
exports.clearCache = catchAsync(async (req, res) => {
  const message = browseService.clearCache();
  sendSuccess(res, { message });
});

/**
 * 获取数据库统计信息
 */
exports.getStats = catchAsync(async (req, res) => {
  const stats = await browseService.getStats();
  sendSuccess(res, { data: stats });
});

/**
 * 删除小说（整个 Post）
 */
exports.deleteNovel = catchAsync(async (req, res) => {
  const { post, message } = await browseService.deleteNovel(req.params.id);
  sendSuccess(res, { data: post, message });
});

/**
 * 删除图片（从 Post 中移除单个图片）
 */
exports.deleteImage = catchAsync(async (req, res) => {
  const { post, message } = await browseService.deleteImage(req.params.id, req.body.imageUrl);
  sendSuccess(res, { data: post, message });
});

/**
 * 批量删除图片
 */
exports.deleteImages = catchAsync(async (req, res) => {
  const { post, message } = await browseService.deleteImages(req.params.id, req.body.imageUrls);
  sendSuccess(res, { data: post, message });
});
