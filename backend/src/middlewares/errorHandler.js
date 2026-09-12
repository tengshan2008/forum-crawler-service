const { consola } = require('consola');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // 打印错误日志，确保 docker logs 能看到
  consola.error({
    message: err.message,
    badge: true,
    additional: JSON.stringify({
      stack: err.stack,
      name: err.name,
      path: req.path,
      method: req.method
    }, null, 2)
  });

  // Wrong MongoDB ID error
  if (err.name === 'CastError') {
    const message = `Resource not found. Invalid: ${err.path}`;
    err.statusCode = 400;
    err.message = message;
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    const message = 'JSON Web Token is invalid';
    err.statusCode = 401;
    err.message = message;
  }

  // JWT expired error
  if (err.name === 'TokenExpiredError') {
    const message = 'JSON Web Token has expired';
    err.statusCode = 401;
    err.message = message;
  }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
  });
};

module.exports = errorHandler;
