const express = require('express');
const postController = require('../controllers/postController');

const router = express.Router();

// Post routes
router.get('/', postController.getAllPosts);
router.post('/', postController.createPost);
router.get('/:id', postController.getPostById);
router.put('/:id', postController.updatePost);
router.delete('/:id', postController.deletePost);

// Task-specific post routes
router.get('/task/:taskId', postController.getPostsByTaskId);
router.get('/task/:taskId/stats', postController.getPostStats);

module.exports = router;
