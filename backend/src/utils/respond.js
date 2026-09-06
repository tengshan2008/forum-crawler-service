// 统一成功响应约定：{ success: true, data, message?, ...extra }
// extra 用于携带 pagination 等附加字段；message 仅在提供时输出，与既有响应保持兼容
const sendSuccess = (res, { status = 200, data = null, message, ...extra } = {}) => {
  const body = { success: true, data, ...extra };
  if (message !== undefined) {
    body.message = message;
  }
  return res.status(status).json(body);
};

module.exports = { sendSuccess };
