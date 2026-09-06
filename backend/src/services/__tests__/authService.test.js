// mockUser 必须可作为构造函数（register 中会 new User({...})）
const mockUser = Object.assign(
  jest.fn().mockImplementation(function (data) {
    Object.assign(this, data || {});
    this.save = jest.fn().mockResolvedValue(undefined);
    this.refreshTokens = this.refreshTokens || [];
    this.isAccountLocked = jest.fn().mockReturnValue(false);
    this.incLoginAttempts = jest.fn().mockResolvedValue(undefined);
    this.resetLoginAttempts = jest.fn().mockResolvedValue(undefined);
    this.toObject = function () {
      return { ...this, refreshTokens: [...this.refreshTokens] };
    };
  }),
  {
    findOne: jest.fn(),
    findById: jest.fn(),
  }
);

jest.mock('../../models/User', () => mockUser);

// 注意：AuthService 模块加载时即创建单例，需在 require 前完成 jest.mock
const authService = require('../authService');

// 每个用例使用全新的"已查到用户"实例，避免状态串扰
let foundUser;

beforeEach(() => {
  jest.clearAllMocks();
  foundUser = new mockUser({
    _id: 'u1',
    email: 'user@test.com',
    username: 'user',
    password: 'hashed',
    role: 'user',
  });
  mockUser.findById.mockResolvedValue(foundUser);
});

describe('authService.register 注册校验', () => {
  it('两次密码不一致时抛错', async () => {
    await expect(
      authService.register({
        email: 'a@test.com',
        username: 'a',
        password: 'Abcdef12',
        confirmPassword: 'Abcdef13',
      })
    ).rejects.toThrow('密码不匹配');
    expect(mockUser.findOne).not.toHaveBeenCalled();
  });

  it('密码强度不足时抛错（缺大写字母）', async () => {
    await expect(
      authService.register({
        email: 'a@test.com',
        username: 'a',
        password: 'abcdef12',
        confirmPassword: 'abcdef12',
      })
    ).rejects.toThrow('密码必须至少8个字符');
  });

  it('邮箱已注册时抛错', async () => {
    mockUser.findOne.mockResolvedValueOnce({ _id: 'x' }); // email 已存在
    await expect(
      authService.register({
        email: 'a@test.com',
        username: 'a',
        password: 'Abcdef12',
        confirmPassword: 'Abcdef12',
      })
    ).rejects.toThrow('邮箱已被注册');
  });

  it('用户名已注册时抛错', async () => {
    mockUser.findOne
      .mockResolvedValueOnce(null) // email 不存在
      .mockResolvedValueOnce({ _id: 'x' }); // username 已存在

    await expect(
      authService.register({
        email: 'a@test.com',
        username: 'taken',
        password: 'Abcdef12',
        confirmPassword: 'Abcdef12',
      })
    ).rejects.toThrow('用户名已被注册');
  });

  it('注册成功时邮箱规范化为小写，返回不含密码的用户信息', async () => {
    mockUser.findOne
      .mockResolvedValueOnce(null) // email 不存在
      .mockResolvedValueOnce(null); // username 不存在

    const result = await authService.register({
      email: 'New@Test.com',
      username: 'newuser',
      password: 'Abcdef12',
      confirmPassword: 'Abcdef12',
    });

    expect(mockUser.findOne.mock.calls[0][0]).toEqual({ email: 'new@test.com' });
    expect(result.email).toBe('new@test.com');
    expect(result.username).toBe('newuser');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('refreshTokens');
  });
});

describe('authService.login 登录', () => {
  it('用户不存在时抛错', async () => {
    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    await expect(authService.login('nobody@test.com', 'Abcdef12')).rejects.toThrow('用户不存在');
  });

  it('账户被锁定时抛错', async () => {
    foundUser.isAccountLocked = jest.fn().mockReturnValue(true);
    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(foundUser),
    });

    await expect(authService.login('user@test.com', 'Abcdef12')).rejects.toThrow('账户已被锁定');
  });

  it('密码错误时记录登录尝试并抛错', async () => {
    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(foundUser),
    });
    const bcrypt = require('bcryptjs');
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    await expect(authService.login('user@test.com', 'Wrong123')).rejects.toThrow('密码错误');
    expect(foundUser.incLoginAttempts).toHaveBeenCalled();
    bcrypt.compare.mockRestore();
  });

  it('登录成功时返回令牌并将刷新令牌入库', async () => {
    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(foundUser),
    });
    const bcrypt = require('bcryptjs');
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const result = await authService.login('user@test.com', 'Abcdef12');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.expiresIn).toBe(3600);
    expect(foundUser.refreshTokens).toHaveLength(1);
    expect(foundUser.resetLoginAttempts).toHaveBeenCalled();
    expect(result.user).not.toHaveProperty('password');
    bcrypt.compare.mockRestore();
  });
});

describe('authService.generateTokens / refreshAccessToken', () => {
  it('访问令牌可验证并携带用户信息', () => {
    const jwt = require('jsonwebtoken');
    process.env.JWT_SECRET = 'test_access_secret';

    const tokens = authService.generateTokens(foundUser);
    const decoded = jwt.verify(tokens.accessToken, 'test_access_secret');

    expect(decoded.userId).toBe('u1');
    expect(decoded.role).toBe('user');
    expect(tokens.expiresIn).toBe(3600);
    delete process.env.JWT_SECRET;
  });

  it('刷新令牌在用户令牌列表中时签发新访问令牌', async () => {
    const jwt = require('jsonwebtoken');
    process.env.JWT_SECRET = 'test_access_secret';
    process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

    const refreshToken = jwt.sign({ userId: 'u1' }, 'test_refresh_secret');
    foundUser.refreshTokens = [{ token: refreshToken }];

    const result = await authService.refreshAccessToken(refreshToken);

    expect(result).toHaveProperty('accessToken');
    expect(result.expiresIn).toBe(3600);
    const payload = jwt.verify(result.accessToken, 'test_access_secret');
    expect(payload.userId).toBe('u1');
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  it('刷新令牌不在用户令牌列表中时拒绝', async () => {
    const jwt = require('jsonwebtoken');
    process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

    const refreshToken = jwt.sign({ userId: 'u1' }, 'test_refresh_secret');
    foundUser.refreshTokens = []; // 空列表

    await expect(authService.refreshAccessToken(refreshToken)).rejects.toThrow('无效的刷新令牌');
    delete process.env.JWT_REFRESH_SECRET;
  });
});

describe('authService.formatUserResponse', () => {
  it('剥离 password/refreshTokens/loginAttempts/lockUntil', () => {
    const raw = {
      _id: 'u1',
      email: 'a@test.com',
      username: 'a',
      password: 'secret',
      refreshTokens: [{ token: 'x' }],
      loginAttempts: 3,
      lockUntil: new Date(),
      toObject() {
        const { toObject, ...rest } = this;
        return rest;
      },
    };

    const safe = authService.formatUserResponse(raw);
    expect(safe).not.toHaveProperty('password');
    expect(safe).not.toHaveProperty('refreshTokens');
    expect(safe).not.toHaveProperty('loginAttempts');
    expect(safe).not.toHaveProperty('lockUntil');
    expect(safe.email).toBe('a@test.com');
  });
});
