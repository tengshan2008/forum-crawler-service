const express = require('express');
const browseController = require('../controllers/browseController');

const router = express.Router();

// ============ 图片浏览路由 ============

/**
 * GET /api/browse/images
 * 获取图片列表
 * 查询参数: page, limit, taskId, sortBy
 */
router.get('/images', browseController.getImages);

/**
 * GET /api/browse/images/groups
 * 获取按网页分组的图片列表
 * 查询参数: page, limit, taskId, sortBy
 */
router.get('/images/groups', browseController.getImageGroups);

/**
 * POST /api/browse/images/search
 * 搜索和筛选图片
 * 请求体: keyword, taskId, startDate, endDate, page, limit, sortBy
 */
router.post('/images/search', browseController.searchImages);

// ============ 小说浏览路由 ============

/**
 * GET /api/browse/novels
 * 获取小说列表
 * 查询参数: page, limit, taskId, sortBy
 */
router.get('/novels', browseController.getNovels);

/**
 * POST /api/browse/novels/search
 * 搜索和筛选小说
 * 请求体: keyword, taskId, startDate, endDate, minWords, maxWords, page, limit, sortBy
 */
router.post('/novels/search', browseController.searchNovels);

/**
 * GET /api/browse/novels/:id
 * 获取单个小说的详细内容
 */
router.get('/novels/:id', browseController.getNovelContent);

// ============ 收藏夹路由 ============

/**
 * POST /api/browse/collections
 * 创建收藏夹
 */
router.post('/collections', browseController.createCollection);

/**
 * GET /api/browse/collections
 * 获取所有收藏夹
 */
router.get('/collections', browseController.getCollections);

/**
 * GET /api/browse/collections/:id
 * 获取单个收藏夹详情
 */
router.get('/collections/:id', browseController.getCollection);

/**
 * PUT /api/browse/collections/:id
 * 更新收藏夹
 */
router.put('/collections/:id', browseController.updateCollection);

/**
 * DELETE /api/browse/collections/:id
 * 删除收藏夹
 */
router.delete('/collections/:id', browseController.deleteCollection);

/**
 * POST /api/browse/collections/:id/items
 * 添加内容到收藏夹
 */
router.post('/collections/:id/items', browseController.addToCollection);

/**
 * DELETE /api/browse/collections/:id/items
 * 从收藏夹移除内容
 */
router.delete('/collections/:id/items', browseController.removeFromCollection);

// ============ 缓存管理和统计路由 ============

/**
 * POST /api/browse/cache/clear
 * 清除计数缓存（当数据量变化较大时使用）
 */
router.post('/cache/clear', browseController.clearCache);

/**
 * GET /api/browse/stats
 * 获取数据库统计信息
 */
router.get('/stats', browseController.getStats);

module.exports = router;

