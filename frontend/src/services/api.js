import axios from 'axios';
import { message } from 'antd';

// 动态确定 API 基础 URL
// 在浏览器中，相对 URL 会基于当前位置
// Nginx 会在 /api 路径下代理到后端
const getApiBaseUrl = () => {
  // 如果定义了环境变量，使用它
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // 否则使用相对路径，通过 Nginx 代理访问
  // 这样 /api 请求会被 Nginx 代理到 http://backend:5000/api
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();
const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 30000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  // 刷新令牌在 httpOnly cookie 中，/auth/refresh 必须携带凭证才能读到
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 401 单飞刷新：并发请求同时过期时只发一次 /auth/refresh，其余请求共享同一 Promise
let refreshPromise = null;

const clearAuthAndRedirect = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('accessToken');
  window.location.href = '/login';
};

// 这些端点的 401 不触发刷新（本身就是认证流程或刷新请求），直接按未登录处理
const isAuthRequest = (url = '') =>
  ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].some((p) => url.includes(p));

// 用 refreshToken cookie 换新 accessToken（刷新结果全实例复用，不重复刷新）
const ensureRefreshedToken = () => {
  if (!refreshPromise) {
    // 标记 _authRefresh：该请求自身若再遇 401，不再递归刷新
    refreshPromise = api
      .post('/auth/refresh', null, { _authRefresh: true })
      .then((res) => {
        const newToken = res.data?.data?.accessToken;
        if (!newToken) throw new Error('刷新响应缺少 accessToken');
        localStorage.setItem('accessToken', newToken);
        return newToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

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
      const originalRequest = error.config || {};
      // 认证类端点（登录/注册/刷新/登出）、已重放过的请求、刷新请求自身不再刷新，
      // 直接按会话失效处理，避免无限递归
      if (
        isAuthRequest(originalRequest.url) ||
        originalRequest._retry ||
        originalRequest._authRefresh
      ) {
        message.error(error.response.data?.message || '登录已过期，请重新登录');
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      // accessToken 过期：静默用 refreshToken cookie 换新令牌后重放原请求（用户无感）
      return ensureRefreshedToken()
        .then((newToken) => {
          originalRequest._retry = true;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        })
        .catch((refreshError) => {
          message.error('登录已过期，请重新登录');
          clearAuthAndRedirect();
          return Promise.reject(refreshError);
        });
    }
    return Promise.reject(error);
  }
);

// Task API
export const taskApi = {
  getAll: (params) => api.get('/tasks', { params }),
  getStats: () => api.get('/tasks/stats'),
  getById: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  start: (id) => api.post(`/tasks/${id}/start`),
  pause: (id) => api.post(`/tasks/${id}/pause`),
  resume: (id) => api.post(`/tasks/${id}/resume`),
  cancel: (id) => api.post(`/tasks/${id}/cancel`),
  logs: (id, params) => api.get(`/tasks/${id}/logs`, { params }),
  // SSE 事件流地址（EventSource 无法自定义 Authorization 头，令牌走 query 参数；
  // 相对路径走 Vite/Nginx 的 /api 代理）
  eventsUrl: (id) =>
    `${API_BASE_URL}/tasks/${id}/events?access_token=${encodeURIComponent(
      localStorage.getItem('accessToken') || ''
    )}`,
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
  // Image API（列表仅含每组前 4 张预览，全量走 getImageGroupDetail）
  getImageGroups: (params) => api.get('/browse/images/groups', { params }),
  getImageGroupDetail: (postId) => api.get(`/browse/images/groups/${postId}`),
  
  // Novel API
  getNovels: (params) => api.get('/browse/novels', { params }),
  searchNovels: (data) => api.post('/browse/novels/search', data),
  getNovelContent: (id) => api.get(`/browse/novels/${id}`),
  deleteNovel: (id) => api.delete(`/browse/novels/${id}`),
  
  // Image Delete API
  deleteImage: (postId, imageUrl) => api.delete(`/browse/posts/${postId}/images`, { data: { imageUrl } }),
  deleteImages: (postId, imageUrls) => api.delete(`/browse/posts/${postId}/images/batch`, { data: { imageUrls } }),
  
  // Collection API（收藏粒度为整个 Post，items 为 postId 数组）
  createCollection: (data) => api.post('/browse/collections', data),
  getCollections: (params) => api.get('/browse/collections', { params }),
  getCollection: (id) => api.get(`/browse/collections/${id}`),
  updateCollection: (id, data) => api.put(`/browse/collections/${id}`, data),
  deleteCollection: (id) => api.delete(`/browse/collections/${id}`),
  addToCollection: (id, postId) => api.post(`/browse/collections/${id}/items`, { postId }),
  removeFromCollection: (id, postId) =>
    api.delete(`/browse/collections/${id}/items`, { data: { postId } }),
};

export default api;
