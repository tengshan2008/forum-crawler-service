const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// 应用认证中间件
router.use(authMiddleware.authMiddleware);

// Crawler stats - 只有管理员可以访问（必须注册在 /:id 之前，否则会被 :id 匹配吞掉）
router.get('/crawler/stats', authMiddleware.requireRole(['admin']), taskController.getCrawlerStats);

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
router.post('/:id/cancel', taskController.cancelTask);
router.get('/:id/logs', taskController.getTaskLogs);
// SSE 实时事件流（EventSource 经 ?access_token= 鉴权，见 authMiddleware）
router.get('/:id/events', taskController.streamTaskEvents);

module.exports = router;
