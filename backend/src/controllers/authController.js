const authService = require('../services/authService');
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/respond');

// 表单校验失败沿用 express-validator 的 { errors: [] } 结构
// （全系统统一错误结构的历史例外，见 docs/api.md），已响应则返回 true
const validationFailed = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
};

/**
 * 用户注册
 */
exports.register = catchAsync(async (req, res) => {
  if (validationFailed(req, res)) return;

  try {
    const result = await authService.register(req.body);
    sendSuccess(res, { status: 201, data: result, message: '注册成功' });
  } catch (error) {
    throw new AppError(error.message, 400);
  }
});

/**
 * 用户登录
 */
exports.login = catchAsync(async (req, res) => {
  if (validationFailed(req, res)) return;

  let result;
  try {
    result = await authService.login(req.body.email, req.body.password);
  } catch (error) {
    throw new AppError(error.message, 401);
  }

  // 设置刷新令牌到httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
  });

  sendSuccess(res, {
    message: '登录成功',
    data: {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    },
  });
});

/**
 * 刷新访问令牌
 */
exports.refreshToken = catchAsync(async (req, res) => {
  const refreshToken =
    (req.cookies && req.cookies.refreshToken) || (req.body && req.body.refreshToken);

  if (!refreshToken) {
    throw new AppError('刷新令牌缺失', 401);
  }

  try {
    const result = await authService.refreshAccessToken(refreshToken);
    sendSuccess(res, { message: '令牌已更新', data: result });
  } catch (error) {
    throw new AppError(error.message, 401);
  }
});

/**
 * 用户登出
 * 注意：此接口不要求认证，因为用户可能因为令牌过期而需要登出
 */
exports.logout = catchAsync(async (req, res) => {
  // 首先尝试从令牌中获取用户ID（如果有令牌）
  let userId = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

  // 如果有用户ID，则从数据库中移除刷新令牌（失败不阻断登出流程）
  if (userId) {
    try {
      await authService.logout(userId, refreshToken);
    } catch (dbError) {
      console.error('数据库登出错误:', dbError.message);
      // 继续执行，不中断登出流程
    }
  }

  sendSuccess(res, { message: '登出成功' });
});

/**
 * 获取当前用户信息
 */
exports.getCurrentUser = catchAsync(async (req, res) => {
  try {
    const user = await authService.getCurrentUser(req.user.userId);
    sendSuccess(res, { data: user });
  } catch (error) {
    throw new AppError(error.message, 400);
  }
});

/**
 * 更新用户信息
 */
exports.updateProfile = catchAsync(async (req, res) => {
  if (validationFailed(req, res)) return;

  try {
    const user = await authService.updateProfile(req.user.userId, req.body);
    sendSuccess(res, { message: '个人信息已更新', data: user });
  } catch (error) {
    throw new AppError(error.message, 400);
  }
});

/**
 * 修改密码
 */
exports.changePassword = catchAsync(async (req, res) => {
  if (validationFailed(req, res)) return;

  const { oldPassword, newPassword, confirmPassword } = req.body;

  try {
    const result = await authService.changePassword(
      req.user.userId,
      oldPassword,
      newPassword,
      confirmPassword
    );

    // 密码修改成功后清除刷新令牌cookie，强制重新登录
    res.clearCookie('refreshToken');

    sendSuccess(res, { message: result.message });
  } catch (error) {
    throw new AppError(error.message, 400);
  }
});
