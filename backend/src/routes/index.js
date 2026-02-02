const express = require('express');
const taskRoutes = require('./taskRoutes');
const postRoutes = require('./postRoutes');
const authRoutes = require('./authRoutes');
const browseRoutes = require('./browseRoutes');
const adminRoutes = require('./adminRoutes');

const router = express.Router();

// API routes
router.use('/api/auth', authRoutes);
router.use('/api/tasks', taskRoutes);
router.use('/api/posts', postRoutes);
router.use('/api/browse', browseRoutes);
router.use('/api/admin', adminRoutes);

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date(),
  });
});

module.exports = router;
