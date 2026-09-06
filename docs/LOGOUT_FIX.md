# Logout 功能修复说明

## 问题描述
用户点击登出时，后端返回错误：
```
{
  "success": false,
  "message": "Cannot read properties of undefined (reading 'refreshToken')"
}
```

## 根本原因
后端代码尝试访问 `req.cookies.refreshToken`，但 `req.cookies` 未定义。这是因为：
1. Express应用未配置cookie解析中间件（cookie-parser）
2. 代码假设 `req.cookies` 存在，导致当尝试读取其属性时抛出TypeError

## 解决方案
修改 [backend/src/controllers/authController.js](../backend/src/controllers/authController.js) 中的 `logout` 方法：

```javascript
// 修改前 - 会导致错误
const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

// 修改后 - 安全的访问
const refreshToken = req.body && req.body.refreshToken ? req.body.refreshToken : null;
```

### 关键改动
1. **移除对 `req.cookies` 的直接访问** - 改为只从 `req.body` 中读取
2. **添加防御性检查** - 确保 `req.body` 存在才访问其属性
3. **添加错误处理** - 将 `authService.logout()` 的调用包装在 try-catch 中

## 测试结果
✅ 登出功能已验证可正常工作：
- 用户登录并获得access token
- 用户访问受保护资源成功
- 用户执行登出请求，返回 `{"success": true, "message": "登出成功"}`
- 服务器端refresh tokens已清除

## 前端建议
在logout成功后，前端应该：
1. 清除 `localStorage` 中的 `token`
2. 清除 `localStorage` 中的 `user` 信息
3. 重定向用户到登录页面

```javascript
// 前端logout处理
const response = await fetch('/api/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

if (response.ok) {
  // 清除本地存储
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // 重定向到登录页
  window.location.href = '/login';
}
```

## 相关文件
- [authController.js - logout方法](../backend/src/controllers/authController.js#L99)
- [authService.js - logout方法](../backend/src/services/authService.js#L143)
- [authRoutes.js - logout路由](../backend/src/routes/authRoutes.js#L38)
