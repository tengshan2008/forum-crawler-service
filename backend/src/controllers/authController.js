const authService = require('../services/authService');
const { validationResult } = require('express-validator');

/**
 * 用户注册
 */
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const result = await authService.register(req.body);

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 用户登录
 */
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const result = await authService.login(email, password);

    // 设置刷新令牌到httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
    });

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 刷新访问令牌
 */
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken =
      req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: '刷新令牌缺失',
      });
    }

    const result = await authService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      message: '令牌已更新',
      data: result,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 用户登出
 * 注意：此接口不要求认证，因为用户可能因为令牌过期而需要登出
 */
exports.logout = async (req, res) => {
  try {
    // 首先尝试从令牌中获取用户ID（如果有令牌）
    let userId = null;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET
        );
        userId = decoded.userId;
      } catch (error) {
        // 忽略令牌验证错误，继续执行登出逻辑
        console.log('登出时令牌验证失败，继续执行登出:', error.message);
      }
    }
    
    // 获取刷新令牌（仅从body中获取，避免req.cookies未定义错误）
    const refreshToken = req.body && req.body.refreshToken ? req.body.refreshToken : null;

    // 清除刷新令牌cookie（无论是否有有效令牌）
    res.clearCookie('refreshToken');

    // 如果有用户ID，则从数据库中移除刷新令牌
    if (userId) {
      try {
        await authService.logout(userId, refreshToken);
      } catch (dbError) {
        console.error('数据库登出错误:', dbError.message);
        // 继续执行，不中断登出流程
      }
    } else {
      // 即使没有有效令牌，也返回成功（因为cookie已清除）
      console.log('登出请求中没有有效令牌，但cookie已清除');
    }

    res.json({
      success: true,
      message: '登出成功',
    });
  } catch (error) {
    console.error('登出控制器错误:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 获取当前用户信息
 */
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await authService.getCurrentUser(req.user.userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 更新用户信息
 */
exports.updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await authService.updateProfile(
      req.user.userId,
      req.body
    );

    res.json({
      success: true,
      message: '个人信息已更新',
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * 修改密码
 */
exports.changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { oldPassword, newPassword, confirmPassword } = req.body;

    const result = await authService.changePassword(
      req.user.userId,
      oldPassword,
      newPassword,
      confirmPassword
    );

    // 密码修改成功后清除所有刷新令牌，强制重新登录
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
