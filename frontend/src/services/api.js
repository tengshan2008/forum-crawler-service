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

export default api;
