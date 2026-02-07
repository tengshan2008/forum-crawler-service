import axios from 'axios';
import { message } from 'antd';

// 动态确定 API 基础 URL
// 在浏览器中，相对 URL 会基于当前位置
// Nginx 会在 /api 路径下代理到后端
const getApiBaseUrl = () => {
  // 如果定义了环境变量，使用它
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL;
  }
  
  // 否则使用相对路径，通过 Nginx 代理访问
  // 这样 /api 请求会被 Nginx 代理到 http://backend:5000/api
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();
const API_TIMEOUT = process.env.REACT_APP_API_TIMEOUT || 30000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加认证令牌
api.interceptors.request.use(
  (config) => {
    // 对于登出请求，不强制要求令牌，因为可能由于令牌过期而需要登出
    const isLogoutRequest = config.url && config.url.endsWith('/auth/logout');
    
    if (!isLogoutRequest) {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 处理网络错误或超时
    if (!error.response) {
      message.error('网络连接失败，请检查服务器是否运行');
    } else if (error.response.status === 500) {
      message.error('服务器错误：' + (error.response.data?.message || '未知错误'));
    } else if (error.response.status === 404) {
      message.error('资源不存在');
    } else if (error.response.status === 401) {
      // 处理所有认证失败情况，包括令牌过期和无效令牌
      message.error(error.response.data?.message || '登录已过期，请重新登录');
      // 清除本地存储的认证信息
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      // 跳转到登录页面
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Task API
export const taskApi = {
  getAll: (params) => api.get('/tasks', { params }),
  getById: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  start: (id) => api.post(`/tasks/${id}/start`),
  pause: (id) => api.post(`/tasks/${id}/pause`),
  resume: (id) => api.post(`/tasks/${id}/resume`),
};

// Post API
export const postApi = {
  getAll: (params) => api.get('/posts', { params }),
  getById: (id) => api.get(`/posts/${id}`),
  getByTaskId: (taskId, params) => api.get(`/posts/task/${taskId}`, { params }),
  getStats: (taskId) => api.get(`/posts/task/${taskId}/stats`),
  create: (data) => api.post('/posts', data),
  update: (id, data) => api.put(`/posts/${id}`, data),
  delete: (id) => api.delete(`/posts/${id}`),
};

// Browse API
export const browseApi = {
  // Image API
  getImages: (params) => api.get('/browse/images', { params }),
  getImageGroups: (params) => api.get('/browse/images/groups', { params }),
  searchImages: (data) => api.post('/browse/images/search', data),
  
  // Novel API
  getNovels: (params) => api.get('/browse/novels', { params }),
  searchNovels: (data) => api.post('/browse/novels/search', data),
  getNovelContent: (id) => api.get(`/browse/novels/${id}`),
  deleteNovel: (id) => api.delete(`/browse/novels/${id}`),
  
  // Image Delete API
  deleteImage: (postId, imageUrl) => api.delete(`/browse/posts/${postId}/images`, { data: { imageUrl } }),
  deleteImages: (postId, imageUrls) => api.delete(`/browse/posts/${postId}/images/batch`, { data: { imageUrls } }),
  
  // Collection API
  createCollection: (data) => api.post('/browse/collections', data),
  getCollections: (params) => api.get('/browse/collections', { params }),
  getCollection: (id) => api.get(`/browse/collections/${id}`),
  updateCollection: (id, data) => api.put(`/browse/collections/${id}`, data),
  deleteCollection: (id) => api.delete(`/browse/collections/${id}`),
  addToCollection: (id, data) => api.post(`/browse/collections/${id}/items`, data),
  removeFromCollection: (id, itemId) => api.delete(`/browse/collections/${id}/items/${itemId}`),
};

// User API
export const updateProfile = (data) => api.put('/users/profile', data);

export const changePassword = (data) => api.post('/users/change-password', data);

export default api;
