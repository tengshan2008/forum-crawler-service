import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import api, { taskApi, changePassword } from '../api';

// 用自定义 adapter 拦截真实 axios 实例，避免真实网络请求
let capturedConfig;
let adapterResponse;
let adapterReject;

api.defaults.adapter = async (config) => {
  capturedConfig = config;
  if (adapterReject) {
    throw adapterReject;
  }
  return adapterResponse || {
    data: { success: true },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};

beforeEach(() => {
  localStorage.clear();
  capturedConfig = null;
  adapterResponse = null;
  adapterReject = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('api.js 基础配置', () => {
  it('默认 baseURL 为相对路径 /api（走 nginx 代理）', async () => {
    vi.resetModules();
    const fresh = (await import('../api')).default;
    expect(fresh.defaults.baseURL).toBe('/api');
  });

  it('VITE_API_BASE_URL 环境变量覆盖默认 baseURL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://example.com/api');
    vi.resetModules();
    const fresh = (await import('../api')).default;
    expect(fresh.defaults.baseURL).toBe('http://example.com/api');
  });

  it('VITE_API_TIMEOUT 环境变量覆盖默认超时', async () => {
    vi.stubEnv('VITE_API_TIMEOUT', '5000');
    vi.resetModules();
    const fresh = (await import('../api')).default;
    expect(fresh.defaults.timeout).toBe(5000);
  });
});

describe('api.js 请求拦截器', () => {
  it('为普通请求附加 Bearer token', async () => {
    localStorage.setItem('accessToken', 'tok-123');
    await taskApi.getAll();
    expect(capturedConfig.headers.Authorization).toBe('Bearer tok-123');
  });

  it('登出请求不强制附加 token', async () => {
    localStorage.setItem('accessToken', 'tok-123');
    await api.post('/auth/logout');
    expect(capturedConfig.headers.Authorization).toBeUndefined();
  });
});

describe('api.js 响应拦截器', () => {
  it('401 时清除本地认证并触发跳转登录页', async () => {
    localStorage.setItem('user', 'u');
    localStorage.setItem('accessToken', 'tok-123');
    adapterReject = { response: { status: 401, data: {} }, config: {} };

    await expect(api.get('/tasks')).rejects.toBeTruthy();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    // jsdom 不支持真实导航，location.href 赋值结果无法断言，仅验证清理逻辑
  });
});

describe('api.js 用户接口', () => {
  it('changePassword 走 PUT /auth/password（与后端真实端点一致）', async () => {
    localStorage.setItem('accessToken', 'tok-123');

    await changePassword({ oldPassword: 'old', newPassword: 'NewPass123', confirmPassword: 'NewPass123' });

    expect(capturedConfig.method).toBe('put');
    expect(capturedConfig.url).toBe('/auth/password');
    expect(JSON.parse(capturedConfig.data)).toEqual({
      oldPassword: 'old',
      newPassword: 'NewPass123',
      confirmPassword: 'NewPass123',
    });
  });
});
