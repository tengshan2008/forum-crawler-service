const jwt = require('jsonwebtoken');

/**
 * JWT 认证中间件
 * 验证请求头中的访问令牌
 */
const authMiddleware = (req, res, next) => {
  try {
    // 从 Authorization 头获取令牌
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌',
      });
    }

    const token = authHeader.substring(7);

    // 验证令牌
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'secret_key'
    );

    // 将解码的用户信息存储在请求对象中
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '令牌已过期',
        code: 'TOKEN_EXPIRED',
      });
    }

    res.status(401).json({
      success: false,
      message: '无效的认证令牌',
    });
  }
};

/**
 * 角色检查中间件
 * 验证用户是否拥有所需的角色
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: '权限不足',
      });
    }

    next();
  };
};

/**
 * 所有权检查中间件
 * 验证用户是否拥有资源的所有权
 */
const requireOwnership = (modelName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '未认证',
        });
      }

      const { id } = req.params;
      const Model = require(`../models/${modelName}`);
      const resource = await Model.findById(id);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: '资源不存在',
        });
      }

      // 检查资源是否属于当前用户（或用户是管理员）
      if (
        resource.userId &&
        resource.userId.toString() !== req.user.userId &&
        req.user.role !== 'admin'
      ) {
        return res.status(403).json({
          success: false,
          message: '无权访问此资源',
        });
      }

      // 将资源存储在请求对象中
      req.resource = resource;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: '服务器错误: ' + error.message,
      });
    }
  };
};

module.exports = {
  authMiddleware,
  requireRole,
  requireOwnership,
};
