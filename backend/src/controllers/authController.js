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
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user.userId;
    const refreshToken =
      req.cookies.refreshToken || req.body.refreshToken;

    await authService.logout(userId, refreshToken);

    // 清除刷新令牌cookie
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: '登出成功',
    });
  } catch (error) {
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
