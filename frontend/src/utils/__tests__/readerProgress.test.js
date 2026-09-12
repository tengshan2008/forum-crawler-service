import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProgress,
  saveProgress,
  clearProgress,
  getProgressKey,
  READER_PROGRESS_PREFIX,
} from '../readerProgress';

describe('readerProgress 阅读器进度', () => {
  beforeEach(() => localStorage.clear());

  it('key 按小说 id 隔离', () => {
    expect(getProgressKey('abc')).toBe(`${READER_PROGRESS_PREFIX}:abc`);
  });

  it('保存并原样恢复页码与阅读设置', () => {
    saveProgress('n1', { page: 5, fontSize: 20, lineHeight: 2, theme: 'dark' });
    expect(loadProgress('n1')).toMatchObject({
      page: 5,
      fontSize: 20,
      lineHeight: 2,
      theme: 'dark',
    });
  });

  it('部分字段写入与既有字段合并', () => {
    saveProgress('n2', { page: 3 });
    saveProgress('n2', { page: 4 });
    expect(loadProgress('n2').page).toBe(4);
    expect(loadProgress('n2').fontSize).toBe(16);
  });

  it('损坏 JSON / 非法页码 / 非法枚举返回 null', () => {
    localStorage.setItem(getProgressKey('bad'), '{not-json');
    expect(loadProgress('bad')).toBeNull();
    localStorage.setItem(getProgressKey('bad2'), JSON.stringify({ page: 0 }));
    expect(loadProgress('bad2')).toBeNull();
    localStorage.setItem(getProgressKey('bad3'), JSON.stringify({ page: 2, theme: 'pink' }));
    const p = loadProgress('bad3');
    expect(p.page).toBe(2);
    expect(p.theme).toBeNull();
  });

  it('clearProgress 删除记录且不同小说互不影响', () => {
    saveProgress('a', { page: 2 });
    saveProgress('b', { page: 9 });
    clearProgress('a');
    expect(loadProgress('a')).toBeNull();
    expect(loadProgress('b').page).toBe(9);
  });
});
