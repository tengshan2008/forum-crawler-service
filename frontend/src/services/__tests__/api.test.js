import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import api, { taskApi, browseApi } from '../api';

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

describe('api.js 409 透传（收藏夹重名）', () => {
  it('409 响应原样 reject 且携带后端 message（无全局副作用提示）', async () => {
    adapterReject = {
      isAxiosError: true,
      response: {
        status: 409,
        data: { success: false, message: '同名收藏夹已存在' },
      },
    };

    await expect(browseApi.createCollection({ name: '测试夹' })).rejects.toMatchObject({
      response: {
        status: 409,
        data: { message: '同名收藏夹已存在' },
      },
    });
  });
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

describe('browseApi 收藏夹端点', () => {
  it('getCollections 走 GET /browse/collections 并透传分页参数', async () => {
    await browseApi.getCollections({ page: 1, limit: 100 });
    expect(capturedConfig.method).toBe('get');
    expect(capturedConfig.url).toBe('/browse/collections');
    expect(capturedConfig.params).toEqual({ page: 1, limit: 100 });
  });

  it('addToCollection 以 { postId } 为请求体 POST /items', async () => {
    await browseApi.addToCollection('c1', 'p1');
    expect(capturedConfig.method).toBe('post');
    expect(capturedConfig.url).toBe('/browse/collections/c1/items');
    expect(capturedConfig.data).toBe(JSON.stringify({ postId: 'p1' }));
  });

  it('removeFromCollection 与后端路由对齐：DELETE /items + body { postId }', async () => {
    await browseApi.removeFromCollection('c1', 'p1');
    expect(capturedConfig.method).toBe('delete');
    expect(capturedConfig.url).toBe('/browse/collections/c1/items');
    expect(capturedConfig.data).toBe(JSON.stringify({ postId: 'p1' }));
  });

  it('createCollection 走 POST /browse/collections', async () => {
    await browseApi.createCollection({ name: '默认收藏夹' });
    expect(capturedConfig.method).toBe('post');
    expect(capturedConfig.url).toBe('/browse/collections');
    expect(capturedConfig.data).toBe(JSON.stringify({ name: '默认收藏夹' }));
  });
});
