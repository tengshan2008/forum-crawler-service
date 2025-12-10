import axios from 'axios';

// 创建axios实例
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
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
  return JSON.parse(localStorage.getItem('user'));
};

// 更新用户信息
export const updateProfile = async (data) => {
  const response = await apiClient.put('/auth/profile', data);
  localStorage.setItem('user', JSON.stringify(response.data.data));
  return response.data;
};

// 修改密码
export const changePassword = async (oldPassword, newPassword) => {
  const response = await apiClient.put('/auth/change-password', { oldPassword, newPassword });
  return response.data;
};

// 检查用户是否已登录
export const isAuthenticated = () => {
  return !!localStorage.getItem('user');
};