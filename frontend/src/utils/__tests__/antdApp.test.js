import { describe, it, expect, vi, afterEach } from 'vitest';
import { message, modal, bindAppApi } from '../antdApp';

describe('antdApp 主题感知静态入口', () => {
  afterEach(() => bindAppApi(null));

  it('桥接前回退 antd 静态方法（方法可调用、不丢失）', () => {
    expect(typeof message.success).toBe('function');
    expect(typeof modal.confirm).toBe('function');
  });

  it('桥接后转发到 App.useApp() 实例（主题感知实例优先）', () => {
    const themed = {
      message: { success: vi.fn((...args) => args) },
      modal: { confirm: vi.fn((opts) => opts) },
    };
    bindAppApi(themed);

    expect(message.success('已保存')).toEqual(['已保存']);
    expect(themed.message.success).toHaveBeenCalledWith('已保存');

    const opts = { title: '确认删除？' };
    expect(modal.confirm(opts)).toBe(opts);
    expect(themed.modal.confirm).toHaveBeenCalledWith(opts);
  });

  it('解绑后再次回退静态方法', () => {
    bindAppApi({ message: { success: vi.fn() }, modal: { confirm: vi.fn() } });
    bindAppApi(null);
    expect(typeof message.error).toBe('function');
  });
});
