const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-zA-Z0-9_-]+$/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // 不自动返回密码字段
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'user', 'guest'],
      default: 'user',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
          expires: 2592000, // 30 days TTL
        },
      },
    ],
    settings: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      privateProfile: {
        type: Boolean,
        default: false,
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// 创建索引
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'refreshTokens.createdAt': 1 });

// 账户锁定检查方法
userSchema.methods.isAccountLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// 增加登录尝试次数
userSchema.methods.incLoginAttempts = function () {
  // 如果上次尝试超过2小时，重置计数
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.loginAttempts += 1;
    // 5次失败后锁定账户2小时
    if (this.loginAttempts >= 5) {
      this.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
    }
  }
  return this.save();
};

// 重置登录尝试次数
userSchema.methods.resetLoginAttempts = function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.lastLogin = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
