const AppError = require('./AppError');

const catchAsync = (fn) => (req, res, next) => {
  // 返回 promise：Express 无需 await，但便于单元测试与错误追踪
  return fn(req, res, next).catch(next);
};

module.exports = catchAsync;
