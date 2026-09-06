const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// 用户注册
router.post(
  '/register',
  [
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('username').isLength({ min: 3, max: 30 }).withMessage('用户名长度必须在3到30个字符之间'),
    body('password').isLength({ min: 8 }).withMessage('密码长度必须至少8个字符'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('密码不匹配');
      }
      return true;
    })
  ],
  authController.register
);

// 用户登录
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('请输入有效的邮箱'),
    body('password').exists().withMessage('请输入密码')
  ],
  authController.login
);

// 刷新访问令牌
router.post('/refresh', authController.refreshToken);

// 用户登出 - 移除认证中间件，允许没有令牌也能登出
router.post('/logout', authController.logout);

// 获取当前用户信息
router.get('/me', authMiddleware, authController.getCurrentUser);

// 更新用户信息
router.put(
  '/profile',
  authMiddleware,
  [
    body('username').optional().isLength({ min: 3, max: 30 }).withMessage('用户名长度必须在3到30个字符之间')
  ],
  authController.updateProfile
);

// 修改密码
router.put(
  '/password',
  authMiddleware,
  [
    body('oldPassword').exists().withMessage('请输入旧密码'),
    body('newPassword').isLength({ min: 8 }).withMessage('新密码长度必须至少8个字符'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('新密码不匹配');
      }
      return true;
    })
  ],
  authController.changePassword
);

module.exports = router;
