import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 axios.create：捕获实例方法，断言端点与载荷
const stubClient = {
  post: vi.fn(),
  put: vi.fn(),
};

vi.mock('axios', () => ({
  default: {
    create: () => stubClient,
  },
}));

const authService = await import('../authService');

beforeEach(() => {
  localStorage.clear();
  stubClient.post.mockReset();
  stubClient.put.mockReset();
});

describe('authService 登录/登出', () => {
  it('login 保存 user 与 accessToken 并返回响应数据', async () => {
    const payload = {
      data: {
        data: { user: { id: 'u1', email: 'a@b.c' }, accessToken: 'tok-1' },
      },
    };
    stubClient.post.mockResolvedValue(payload);

    const result = await authService.login('a@b.c', 'pw');

    expect(stubClient.post).toHaveBeenCalledWith('/auth/login', {
      email: 'a@b.c',
      password: 'pw',
    });
    expect(JSON.parse(localStorage.getItem('user'))).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(localStorage.getItem('accessToken')).toBe('tok-1');
    expect(result).toBe(payload.data);
  });

  it('logout 调用端点并清除本地认证信息', async () => {
    localStorage.setItem('user', 'u');
    localStorage.setItem('accessToken', 'tok-1');
    stubClient.post.mockResolvedValue({ data: { success: true } });

    await authService.logout();

    expect(stubClient.post).toHaveBeenCalledWith('/auth/logout');
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});

describe('authService 本地会话', () => {
  it('getCurrentUser 正常解析 localStorage 中的用户', () => {
    localStorage.setItem('user', JSON.stringify({ id: 'u1' }));
    expect(authService.getCurrentUser()).toEqual({ id: 'u1' });
  });

  it('getCurrentUser 解析失败时清除损坏数据并返回 null', () => {
    localStorage.setItem('user', '{broken-json');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(authService.getCurrentUser()).toBeNull();
    // 清除损坏数据的副作用验证（不依赖 removeItem spy）
    expect(localStorage.getItem('user')).toBeNull();
    errSpy.mockRestore();
  });

  it('isAuthenticated 依据 user 记录判断', () => {
    expect(authService.isAuthenticated()).toBe(false);
    localStorage.setItem('user', JSON.stringify({ id: 'u1' }));
    expect(authService.isAuthenticated()).toBe(true);
  });
});

describe('authService 资料与密码', () => {
  it('updateProfile 更新用户信息并刷新本地存储', async () => {
    const updated = { id: 'u1', username: '新名' };
    stubClient.put.mockResolvedValue({ data: { data: updated } });

    const result = await authService.updateProfile({ username: '新名' });

    expect(stubClient.put).toHaveBeenCalledWith('/auth/profile', { username: '新名' });
    expect(JSON.parse(localStorage.getItem('user'))).toEqual(updated);
    expect(result).toEqual({ data: updated });
  });

  it('changePassword 调用修改密码端点', async () => {
    stubClient.put.mockResolvedValue({ data: { success: true } });

    await authService.changePassword('old', 'new');

    expect(stubClient.put).toHaveBeenCalledWith('/auth/change-password', {
      oldPassword: 'old',
      newPassword: 'new',
    });
  });
});
