const crypto = require('crypto');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// S4：单用户保留的刷新令牌上限（超出裁剪最旧的）
const MAX_REFRESH_TOKENS = 10;
// S4：刷新令牌入库前做 SHA-256 哈希，防拖库后明文令牌被直接冒用
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
// 刷新令牌有效期 30 天（与 JWT expiresIn '30d' 对齐），登录时清理超期的入库令牌
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class AuthService {
  /**
   * 注册新用户
   */
  async register(data) {
    const { email, username, password, confirmPassword } = data;

    // 验证密码匹配
    if (password !== confirmPassword) {
      throw new Error('密码不匹配');
    }

    // 验证密码强度（至少8个字符，包含大小写字母、数字）
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      throw new Error('密码必须至少8个字符，并包含大小写字母和数字');
    }

    // 检查邮箱是否已存在
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      throw new Error('邮箱已被注册');
    }

    // 检查用户名是否已存在
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      throw new Error('用户名已被注册');
    }

    // 加密密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 创建用户
    const user = new User({
      email: email.toLowerCase(),
      username,
      password: hashedPassword,
    });

    await user.save();

    // 返回用户信息（不包含密码）
    return this.formatUserResponse(user);
  }

  /**
   * 用户登录
   */
  async login(email, password) {
    const identifier = email.toLowerCase();

    // 查找用户（包含密码字段）
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).select('+password');

    if (!user) {
      throw new Error('用户不存在');
    }

    // 检查账户是否被锁定
    if (user.isAccountLocked()) {
      throw new Error('账户已被锁定，请稍后再试');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      throw new Error('密码错误');
    }

    // 重置登录尝试次数
    await user.resetLoginAttempts();

    // 生成 JWT 令牌
    const tokens = this.generateTokens(user);

    // 应用层清理超过 30 天的旧刷新令牌。
    // 不能使用 Mongo TTL 索引：TTL 作用于整条文档而非数组元素，
    // refreshTokens 中最旧令牌到期会导致整个用户文档被 TTL 监控线程删除（账号消失根因）。
    const now = Date.now();
    user.refreshTokens = user.refreshTokens.filter(
      (t) => !t.createdAt || now - new Date(t.createdAt).getTime() < REFRESH_TOKEN_TTL_MS
    );

    // 保存刷新令牌到数据库：先剔除超过 30 天的旧令牌（TTL），再仅存哈希，最后按上限裁剪最旧的
    const refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - refreshTokenTtlMs;
    user.refreshTokens = user.refreshTokens.filter(
      (t) => !t.createdAt || new Date(t.createdAt).getTime() >= cutoff
    );

    user.refreshTokens.push({
      token: hashToken(tokens.refreshToken),
    });
    if (user.refreshTokens.length > MAX_REFRESH_TOKENS) {
      user.refreshTokens = user.refreshTokens.slice(-MAX_REFRESH_TOKENS);
    }
    await user.save();

    return {
      user: this.formatUserResponse(user),
      ...tokens,
    };
  }

  /**
   * 使用刷新令牌获取新的访问令牌
   */
  async refreshAccessToken(refreshToken) {
    try {
      // 验证刷新令牌
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET
      );

      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      // 检查刷新令牌是否在用户的令牌列表中
      // 检查刷新令牌是否在用户的令牌列表中（库内为哈希值）
      const tokenExists = user.refreshTokens.some((t) => t && t.token === hashToken(refreshToken));
      if (!tokenExists) {
        throw new Error('无效的刷新令牌');
      }

      // 生成新的访问令牌
      const accessToken = jwt.sign(
        {
          userId: user._id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      return {
        accessToken,
        expiresIn: 3600,
      };
    } catch (error) {
      throw new Error('无效的刷新令牌: ' + error.message);
    }
  }

  /**
   * 登出用户
   */
  async logout(userId, refreshToken) {
    // 确保userId存在
    if (!userId) {
      throw new Error('用户ID不存在，无法登出');
    }

    const user = await User.findById(userId);
    if (user && user.refreshTokens && Array.isArray(user.refreshTokens)) {
      // 从数据库中删除该刷新令牌
      if (refreshToken) {
        // 从数据库中删除该刷新令牌（库内为哈希值，比对前同样哈希）
        user.refreshTokens = user.refreshTokens.filter((t) => t && t.token !== hashToken(refreshToken));
      } else {
        // 如果没有提供refreshToken，清除所有令牌（登出所有设备）
        user.refreshTokens = [];
      }
      await user.save();
    }
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }
    return this.formatUserResponse(user);
  }

  /**
   * 更新用户信息
   */
  async updateProfile(userId, data) {
    const { username, email, avatar } = data;

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    // 如果更改用户名，检查是否已被使用
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        throw new Error('用户名已被使用');
      }
      user.username = username;
    }

    // 如果更改邮箱，检查是否已被使用（与注册一致规范化为小写）
    if (email && email.toLowerCase() !== user.email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        throw new Error('邮箱已被使用');
      }
      user.email = email.toLowerCase();
    }

    if (avatar) {
      user.avatar = avatar;
    }

    user.updatedAt = new Date();
    await user.save();

    return this.formatUserResponse(user);
  }

  /**
   * 修改密码
   */
  async changePassword(userId, oldPassword, newPassword, confirmPassword) {
    if (newPassword !== confirmPassword) {
      throw new Error('新密码不匹配');
    }

    // 验证新密码强度
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      throw new Error('新密码必须至少8个字符，并包含大小写字母和数字');
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new Error('原密码错误');
    }

    // 加密新密码
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.updatedAt = new Date();

    await user.save();

    return { message: '密码已更新' };
  }

  /**
   * 生成 JWT 令牌
   */
  generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
    };
  }

  /**
   * 格式化用户响应（移除敏感信息）
   */
  formatUserResponse(user) {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password;
    delete userObj.refreshTokens;
    delete userObj.loginAttempts;
    delete userObj.lockUntil;
    return userObj;
  }
}

module.exports = new AuthService();
