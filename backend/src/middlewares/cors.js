const corsMiddleware = (req, res, next) => {
  const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['*'];
  const origin = req.headers.origin;
  
  // 如果允许所有来源或者当前来源在允许列表中
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    // 如果是通配符，根据请求头动态设置来源，以支持 credentials
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
};

module.exports = corsMiddleware;
