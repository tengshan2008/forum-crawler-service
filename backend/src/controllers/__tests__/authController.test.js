// authService 为单例且模块加载即创建，需在 require 控制器前完成 mock
jest.mock('../../services/authService', () => ({
  register: jest.fn(),
  login: jest.fn(),
  refreshAccessToken: jest.fn(),
  logout: jest.fn(),
  getCurrentUser: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
}));

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

const { validationResult } = require('express-validator');
const authService = require('../../services/authService');
const controller = require('../authController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = (overrides = {}) => ({
  headers: {},
  body: {},
  user: { userId: 'u1', role: 'user' },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // 默认表单校验通过
  validationResult.mockReturnValue({
    isEmpty: jest.fn().mockReturnValue(true),
    array: jest.fn().mockReturnValue([]),
  });
});

const expectNextError = (next, statusCode, message) => {
  expect(next).toHaveBeenCalledTimes(1);
  const err = next.mock.calls[0][0];
  expect(err.statusCode).toBe(statusCode);
  expect(err.message).toBe(message);
};

describe('authController.register', () => {
  it('表单校验失败返回 400 {errors:[]} 且不调用 service', async () => {
    validationResult.mockReturnValue({
      isEmpty: jest.fn().mockReturnValue(false),
      array: jest.fn().mockReturnValue([{ msg: '邮箱格式不正确', param: 'email' }]),
    });
    const res = makeRes();
    await controller.register(makeReq({ body: { email: 'bad' } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      errors: [{ msg: '邮箱格式不正确', param: 'email' }],
    });
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('成功返回 201 与注册结果', async () => {
    authService.register.mockResolvedValue({ _id: 'u1', email: 'a@b.c' });
    const res = makeRes();
    const body = { email: 'a@b.c', password: 'Abcdef12' };

    await controller.register(makeReq({ body }), res, jest.fn());

    expect(authService.register).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'u1', email: 'a@b.c' },
      message: '注册成功',
    });
  });

  it('service 抛错时转为 400 交给错误中间件', async () => {
    authService.register.mockRejectedValue(new Error('邮箱已被注册'));
    const next = jest.fn();

    await controller.register(makeReq(), makeRes(), next);

    expectNextError(next, 400, '邮箱已被注册');
  });
});

describe('authController.login', () => {
  it('表单校验失败返回 400 {errors:[]}', async () => {
    validationResult.mockReturnValue({
      isEmpty: jest.fn().mockReturnValue(false),
      array: jest.fn().mockReturnValue([{ msg: '请输入密码', param: 'password' }]),
    });
    const res = makeRes();
    await controller.login(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      errors: [{ msg: '请输入密码', param: 'password' }],
    });
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('成功时设置 refreshToken cookie 并返回令牌信息', async () => {
    const loginResult = {
      user: { _id: 'u1', username: 'u' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
    };
    authService.login.mockResolvedValue(loginResult);
    const res = makeRes();
    const body = { email: 'a@b.c', password: 'Abcdef12' };

    await controller.login(makeReq({ body }), res, jest.fn());

    expect(authService.login).toHaveBeenCalledWith('a@b.c', 'Abcdef12');
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-1',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: { _id: 'u1', username: 'u' }, accessToken: 'access-1', expiresIn: 3600 },
      message: '登录成功',
    });
  });

  it('凭据错误时转为 401', async () => {
    authService.login.mockRejectedValue(new Error('密码错误'));
    const next = jest.fn();

    await controller.login(makeReq({ body: { email: 'a@b.c', password: 'x' } }), makeRes(), next);

    expectNextError(next, 401, '密码错误');
  });
});

describe('authController.refreshToken', () => {
  it('缺少刷新令牌时返回 401', async () => {
    const next = jest.fn();
    await controller.refreshToken(makeReq(), makeRes(), next);

    expectNextError(next, 401, '刷新令牌缺失');
    expect(authService.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('从 cookie 取令牌并返回新访问令牌', async () => {
    authService.refreshAccessToken.mockResolvedValue({ accessToken: 'new', expiresIn: 3600 });
    const res = makeRes();

    await controller.refreshToken(makeReq({ cookies: { refreshToken: 'rt-1' } }), res, jest.fn());

    expect(authService.refreshAccessToken).toHaveBeenCalledWith('rt-1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { accessToken: 'new', expiresIn: 3600 },
      message: '令牌已更新',
    });
  });

  it('无效令牌时转为 401', async () => {
    authService.refreshAccessToken.mockRejectedValue(new Error('无效的刷新令牌'));
    const next = jest.fn();

    await controller.refreshToken(
      makeReq({ body: { refreshToken: 'bad' } }),
      makeRes(),
      next
    );

    expectNextError(next, 401, '无效的刷新令牌');
  });
});

describe('authController.logout', () => {
  it('无认证头时清 cookie 并返回成功，不调用 service', async () => {
    const res = makeRes();
    await controller.logout(makeReq(), res, jest.fn());

    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(authService.logout).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null, message: '登出成功' });
  });

  it('携带有效 Bearer 令牌时按用户移除刷新令牌', async () => {
    process.env.JWT_SECRET = 'test_secret';
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 'u1' }, 'test_secret');
    const res = makeRes();

    await controller.logout(
      makeReq({ headers: { authorization: `Bearer ${token}` }, body: { refreshToken: 'rt-1' } }),
      res,
      jest.fn()
    );

    expect(authService.logout).toHaveBeenCalledWith('u1', 'rt-1');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null, message: '登出成功' });
    delete process.env.JWT_SECRET;
  });

  it('service 失败不阻断登出响应（尽力而为）', async () => {
    process.env.JWT_SECRET = 'test_secret';
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 'u1' }, 'test_secret');
    authService.logout.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    const next = jest.fn();

    await controller.logout(makeReq({ headers: { authorization: `Bearer ${token}` } }), res, next);

    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null, message: '登出成功' });
    expect(next).not.toHaveBeenCalled();
    delete process.env.JWT_SECRET;
  });
});

describe('authController.getCurrentUser', () => {
  it('返回当前用户资料', async () => {
    authService.getCurrentUser.mockResolvedValue({ _id: 'u1', username: 'u' });
    const res = makeRes();

    await controller.getCurrentUser(makeReq(), res, jest.fn());

    expect(authService.getCurrentUser).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'u1', username: 'u' },
    });
  });

  it('service 抛错时转为 400', async () => {
    authService.getCurrentUser.mockRejectedValue(new Error('用户不存在'));
    const next = jest.fn();

    await controller.getCurrentUser(makeReq(), makeRes(), next);

    expectNextError(next, 400, '用户不存在');
  });
});

describe('authController.updateProfile', () => {
  it('表单校验失败返回 400 {errors:[]}', async () => {
    validationResult.mockReturnValue({
      isEmpty: jest.fn().mockReturnValue(false),
      array: jest.fn().mockReturnValue([{ msg: '邮箱格式不正确', param: 'email' }]),
    });
    const res = makeRes();
    await controller.updateProfile(makeReq({ body: { email: 'bad' } }), res, jest.fn());

    expect(authService.updateProfile).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      errors: [{ msg: '邮箱格式不正确', param: 'email' }],
    });
  });

  it('成功返回更新后的用户资料', async () => {
    authService.updateProfile.mockResolvedValue({ _id: 'u1', email: 'new@b.c' });
    const res = makeRes();
    const body = { email: 'new@b.c' };

    await controller.updateProfile(makeReq({ body }), res, jest.fn());

    expect(authService.updateProfile).toHaveBeenCalledWith('u1', body);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'u1', email: 'new@b.c' },
      message: '个人信息已更新',
    });
  });

  it('service 抛错时转为 400', async () => {
    authService.updateProfile.mockRejectedValue(new Error('邮箱已被使用'));
    const next = jest.fn();

    await controller.updateProfile(makeReq({ body: { email: 'x@b.c' } }), makeRes(), next);

    expectNextError(next, 400, '邮箱已被使用');
  });
});

describe('authController.changePassword', () => {
  it('表单校验失败返回 400 {errors:[]}', async () => {
    validationResult.mockReturnValue({
      isEmpty: jest.fn().mockReturnValue(false),
      array: jest.fn().mockReturnValue([{ msg: '新密码不匹配', param: 'confirmPassword' }]),
    });
    const res = makeRes();
    await controller.changePassword(makeReq(), res, jest.fn());

    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      errors: [{ msg: '新密码不匹配', param: 'confirmPassword' }],
    });
  });

  it('成功时清刷新令牌 cookie 并返回 service 消息', async () => {
    authService.changePassword.mockResolvedValue({ message: '密码已更新' });
    const res = makeRes();
    const body = { oldPassword: 'old', newPassword: 'NewPass123', confirmPassword: 'NewPass123' };

    await controller.changePassword(makeReq({ body }), res, jest.fn());

    expect(authService.changePassword).toHaveBeenCalledWith('u1', 'old', 'NewPass123', 'NewPass123');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: null,
      message: '密码已更新',
    });
  });

  it('旧密码错误时转为 400', async () => {
    authService.changePassword.mockRejectedValue(new Error('原密码错误'));
    const next = jest.fn();

    await controller.changePassword(makeReq({ body: {} }), makeRes(), next);

    expectNextError(next, 400, '原密码错误');
  });
});
