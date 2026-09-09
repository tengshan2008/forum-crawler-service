const jwt = require('jsonwebtoken');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

const { authMiddleware, requireRole } = require('../authMiddleware');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test_jwt_secret';
});

describe('authMiddleware JWT 认证', () => {
  it('缺少 Authorization 头时返回 401', () => {
    const res = makeRes();
    const next = jest.fn();

    authMiddleware({ headers: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: '未提供认证令牌' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('非 Bearer 格式时返回 401', () => {
    const res = makeRes();
    authMiddleware({ headers: { authorization: 'Basic abc' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('令牌过期时返回 401 并携带 TOKEN_EXPIRED', () => {
    jwt.verify.mockImplementation(() => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      throw err;
    });

    const res = makeRes();
    authMiddleware(
      { headers: { authorization: 'Bearer expired-token' } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TOKEN_EXPIRED', message: '令牌已过期' })
    );
  });

  it('令牌无效时返回 401', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const res = makeRes();
    authMiddleware(
      { headers: { authorization: 'Bearer bad-token' } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '无效的认证令牌' })
    );
  });

  it('令牌有效时挂载 req.user 并放行', () => {
    const decoded = { userId: 'u1', role: 'user' };
    jwt.verify.mockReturnValue(decoded);

    const req = { headers: { authorization: 'Bearer good-token' } };
    const next = jest.fn();
    authMiddleware(req, makeRes(), next);

    expect(jwt.verify).toHaveBeenCalledWith('good-token', 'test_jwt_secret');
    expect(req.user).toEqual(decoded);
    expect(next).toHaveBeenCalled();
  });

  it('SSE 场景：无 Authorization 头时接受 ?access_token= 查询参数令牌', () => {
    const decoded = { userId: 'u1', role: 'user' };
    jwt.verify.mockReturnValue(decoded);

    const req = { headers: {}, query: { access_token: 'sse-token' } };
    const next = jest.fn();
    authMiddleware(req, makeRes(), next);

    expect(jwt.verify).toHaveBeenCalledWith('sse-token', 'test_jwt_secret');
    expect(req.user).toEqual(decoded);
    expect(next).toHaveBeenCalled();
  });

  it('Authorization 头优先于查询参数令牌', () => {
    jwt.verify.mockReturnValue({ userId: 'u1', role: 'user' });

    const req = { headers: { authorization: 'Bearer header-token' }, query: { access_token: 'query-token' } };
    authMiddleware(req, makeRes(), jest.fn());

    expect(jwt.verify).toHaveBeenCalledWith('header-token', 'test_jwt_secret');
  });
});

describe('requireRole 角色检查', () => {
  it('未认证时返回 401', () => {
    const res = makeRes();
    requireRole('admin')({}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('角色不匹配时返回 403', () => {
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'user' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('角色匹配时放行', () => {
    const next = jest.fn();
    requireRole('admin', 'user')({ user: { role: 'user' } }, makeRes(), next);

    expect(next).toHaveBeenCalled();
  });
});
