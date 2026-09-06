// CORS 白名单中间件（S2 安全改造）：
// - CORS_ORIGIN 为逗号分隔白名单，命中则反射 Origin 并允许携带凭据
// - 未命中（含未配置 CORS_ORIGIN 的场景）一律不放行跨域
// - 显式配置 * 时仅允许无凭据跨域（规范禁止 * 与 credentials 同用）
const corsMiddleware = (req, res, next) => {
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const origin = req.headers.origin;

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Vary', 'Origin');

  if (allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(res.get('Access-Control-Allow-Origin') ? 200 : 403);
  }

  return next();
};

module.exports = corsMiddleware;
