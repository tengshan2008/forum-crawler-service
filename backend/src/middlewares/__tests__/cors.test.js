const corsMiddleware = require('../cors');

const makeRes = () => {
  const res = {};
  res.headers = {};
  res.header = jest.fn((name, value) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  });
  res.get = jest.fn((name) => res.headers[name.toLowerCase()]);
  res.sendStatus = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = ({ origin, method = 'GET' } = {}) => ({
  headers: origin ? { origin } : {},
  method,
});

afterEach(() => {
  delete process.env.CORS_ORIGIN;
});

describe('CORS 白名单中间件', () => {
  it('来源在白名单中时反射 Origin 并允许凭据', () => {
    process.env.CORS_ORIGIN = 'http://a.com, http://b.com';
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(makeReq({ origin: 'http://a.com' }), res, next);

    expect(res.headers['access-control-allow-origin']).toBe('http://a.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(next).toHaveBeenCalled();
  });

  it('来源不在白名单时不设置任何跨域放行头', () => {
    process.env.CORS_ORIGIN = 'http://a.com';
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(makeReq({ origin: 'http://evil.com' }), res, next);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(next).toHaveBeenCalled(); // 仍放行到路由，由浏览器拒绝响应
  });

  it('未配置 CORS_ORIGIN 时默认拒绝跨域', () => {
    delete process.env.CORS_ORIGIN;
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(makeReq({ origin: 'http://a.com' }), res, next);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('显式配置 * 时仅放行无凭据跨域', () => {
    process.env.CORS_ORIGIN = '*';
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(makeReq({ origin: 'http://a.com' }), res, next);

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('无 Origin 头的同源请求直接放行', () => {
    process.env.CORS_ORIGIN = 'http://a.com';
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(makeReq({}), res, next);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('白名单命中的预检请求返回 200', () => {
    process.env.CORS_ORIGIN = 'http://a.com';
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(makeReq({ origin: 'http://a.com', method: 'OPTIONS' }), res, next);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('白名单未命中的预检请求返回 403', () => {
    process.env.CORS_ORIGIN = 'http://a.com';
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(makeReq({ origin: 'http://evil.com', method: 'OPTIONS' }), res, next);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
