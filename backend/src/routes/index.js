const express = require('express');
const taskRoutes = require('./taskRoutes');
const postRoutes = require('./postRoutes');

const router = express.Router();

// API routes
router.use('/api/tasks', taskRoutes);
router.use('/api/posts', postRoutes);

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date(),
  });
});

module.exports = router;
