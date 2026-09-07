import axios from 'axios';

// 动态确定 API 基础 URL
// 在浏览器中，相对 URL 会基于当前位置
// Nginx 会在 /api 路径下代理到后端
const getApiBaseUrl = () => {
  // 如果定义了环境变量，使用它
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // 否则使用相对路径，通过 Nginx 代理访问
  // 这样 /api 请求会被 Nginx 代理到后端服务
  return '/api';
};

// 创建axios实例
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true, // 允许携带cookie
});

// 登录功能
export const login = async (email, password) => {
  const response = await apiClient.post('/auth/login', { email, password });
  localStorage.setItem('user', JSON.stringify(response.data.data.user));
  localStorage.setItem('accessToken', response.data.data.accessToken);
  return response.data;
};

// 注册功能
export const register = async (email, username, password, confirmPassword) => {
  const response = await apiClient.post('/auth/register', { email, username, password, confirmPassword });
  return response.data;
};

// 登出功能
export const logout = async () => {
  const response = await apiClient.post('/auth/logout');
  localStorage.removeItem('user');
  localStorage.removeItem('accessToken');
  return response.data;
};

// 获取当前用户信息
export const getCurrentUser = () => {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Failed to parse user data from localStorage:', error);
    // 如果解析失败，清除损坏的数据
    localStorage.removeItem('user');
    return null;
  }
};

// 更新用户信息
export const updateProfile = async (data) => {
  const response = await apiClient.put('/auth/profile', data);
  localStorage.setItem('user', JSON.stringify(response.data.data));
  return response.data;
};

// 修改密码（后端校验 newPassword ≥8 位且含大小写字母和数字）
export const changePassword = async (oldPassword, newPassword, confirmPassword) => {
  const response = await apiClient.put('/auth/password', { oldPassword, newPassword, confirmPassword });
  return response.data;
};

// 检查用户是否已登录
export const isAuthenticated = () => {
  return !!localStorage.getItem('user');
};