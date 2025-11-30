const express = require('express');
const taskController = require('../controllers/taskController');

const router = express.Router();

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

// Crawler stats
router.get('/crawler/stats', taskController.getCrawlerStats);

module.exports = router;
