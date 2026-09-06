const rateLimit = require('express-rate-limit');

// S3：登录/注册/刷新令牌等认证端点的限流，防暴力破解
// 默认每 IP 15 分钟最多 20 次，测试可通过工厂参数覆盖
const createAuthRateLimiter = (options = {}) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    // 统一响应格式（覆盖 v8 默认的 res.send(message) 行为）
    handler: (_req, res) => {
      res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
    },
    ...options,
  });

const authRateLimiter = createAuthRateLimiter();

module.exports = { createAuthRateLimiter, authRateLimiter };
