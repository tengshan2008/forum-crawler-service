import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import api, { taskApi, browseApi } from '../api';

// 用自定义 adapter 拦截真实 axios 实例，避免真实网络请求
let capturedConfig;
let adapterResponse;
let adapterReject;
// 可编排的 adapter（如 401→刷新成功→重放序列）；优先于 adapterResponse/adapterReject
let adapterHandler;

api.defaults.adapter = async (config) => {
  capturedConfig = config;
  if (adapterHandler) {
    return adapterHandler(config);
  }
  if (adapterReject) {
    // 透传真实 config：拦截器依赖 config.url/_authRefresh 等标记判定，
    // 静态 config 会让刷新请求丢失标记，无法模拟真实 axios 行为
    throw { ...adapterReject, config };
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
  adapterHandler = null;
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
  it('401 且刷新失败时清除本地认证并触发跳转登录页', async () => {
    localStorage.setItem('user', 'u');
    localStorage.setItem('accessToken', 'tok-123');
    adapterReject = { response: { status: 401, data: {} }, config: {} };

    await expect(api.get('/tasks')).rejects.toBeTruthy();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    // jsdom 不支持真实导航，location.href 赋值结果无法断言，仅验证清理逻辑
  });

  it('401 时静默用 refresh 换新令牌并重放原请求（用户无感）', async () => {
    localStorage.setItem('accessToken', 'old-tok');
    const calls = [];
    adapterHandler = vi.fn(async (config) => {
      calls.push(config.url);
      if (config.url === '/auth/refresh') {
        return {
          data: { success: true, data: { accessToken: 'new-tok', expiresIn: 3600 } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      // 首次 /tasks 用旧令牌 → 401；刷新后重放 → 200
      if (config.headers.Authorization === 'Bearer old-tok') {
        // eslint-disable-next-line no-throw-literal
        throw { response: { status: 401, data: {} }, config };
      }
      return {
        data: { data: [{ id: 1 }] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    });

    const res = await taskApi.getAll();

    // 调用序列：原请求 401 → /auth/refresh → 重放原请求
    expect(calls).toEqual(['/tasks', '/auth/refresh', '/tasks']);
    expect(res.data.data).toEqual([{ id: 1 }]);
    expect(localStorage.getItem('accessToken')).toBe('new-tok');
    // 重放请求携带新令牌
    expect(capturedConfig.headers.Authorization).toBe('Bearer new-tok');
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
