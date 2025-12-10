const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// 应用认证中间件
router.use(authMiddleware.authMiddleware);

// Task routes
router.get('/', taskController.getAllTasks);
router.post('/', taskController.createTask);
router.get('/:id', taskController.getTaskById);
router.put('/:id', taskController.updateTask);
router.delete('/:id', taskController.deleteTask);

// Task control routes
router.post('/:id/start', taskController.startTask);
router.post('/:id/pause', taskController.pauseTask);
router.post('/:id/resume', taskController.resumeTask);

// Crawler stats - 只有管理员可以访问
router.get('/crawler/stats', authMiddleware.requireRole(['admin']), taskController.getCrawlerStats);

module.exports = router;
