const { createAuthRateLimiter } = require('../rateLimiter');

const makeRes = () => {
  const res = {};
  res.setHeader = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const runLimiter = async (limiter, ip) => {
  const res = makeRes();
  const next = jest.fn();
  // express-rate-limit 的 trustProxy 校验会访问 req.app.get('trust proxy')
  await limiter(
    { ip, method: 'POST', url: '/api/auth/login', headers: {}, app: { get: jest.fn() } },
    res,
    next
  );
  return { res, next };
};

describe('auth 速率限制中间件', () => {
  it('窗口期内同一 IP 未超限时放行', async () => {
    const limiter = createAuthRateLimiter({ windowMs: 60_000, limit: 3 });

    for (let i = 0; i < 3; i += 1) {
      const { res, next } = await runLimiter(limiter, '1.1.1.1');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  it('同一 IP 超过限制后返回 429 与统一错误格式', async () => {
    const limiter = createAuthRateLimiter({ windowMs: 60_000, limit: 2 });

    await runLimiter(limiter, '2.2.2.2');
    await runLimiter(limiter, '2.2.2.2');

    const { res, next } = await runLimiter(limiter, '2.2.2.2');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('不同 IP 互不影响', async () => {
    const limiter = createAuthRateLimiter({ windowMs: 60_000, limit: 1 });

    await runLimiter(limiter, '3.3.3.3');
    const { res, next } = await runLimiter(limiter, '4.4.4.4');

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
