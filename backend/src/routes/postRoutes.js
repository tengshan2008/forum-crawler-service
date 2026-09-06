const express = require('express');
const postController = require('../controllers/postController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// 应用认证中间件
router.use(authMiddleware.authMiddleware);

// Post routes
router.get('/', postController.getAllPosts);
router.post('/', postController.createPost); // 爬虫使用，内部已处理用户ID
router.get('/:id', postController.getPostById);
router.put('/:id', postController.updatePost);
router.delete('/:id', postController.deletePost);

// Task-specific post routes
router.get('/task/:taskId', postController.getPostsByTaskId);
router.get('/task/:taskId/stats', postController.getPostStats);

module.exports = router;
