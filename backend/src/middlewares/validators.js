const { body } = require('express-validator');

/**
 * 注册验证规则
 */
const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('请输入有效的邮箱地址'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('用户名长度必须在3-30个字符之间')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('用户名只能包含字母、数字、下划线和连字符'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('密码必须至少8个字符')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('密码必须包含大小写字母和数字'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('密码不匹配'),
];

/**
 * 登录验证规则
 */
const validateLogin = [
  body('email')
    .notEmpty()
    .withMessage('邮箱或用户名不能为空'),
  body('password')
    .notEmpty()
    .withMessage('密码不能为空'),
];

/**
 * 更新个人信息验证规则
 */
const validateUpdateProfile = [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('用户名长度必须在3-30个字符之间')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('用户名只能包含字母、数字、下划线和连字符'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('头像必须是有效的URL'),
];

/**
 * 修改密码验证规则
 */
const validateChangePassword = [
  body('oldPassword')
    .notEmpty()
    .withMessage('原密码不能为空'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('新密码必须至少8个字符')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('新密码必须包含大小写字母和数字'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('密码不匹配'),
];

module.exports = {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
};
