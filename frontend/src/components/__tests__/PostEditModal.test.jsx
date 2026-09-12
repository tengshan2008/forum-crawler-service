import { describe, it, expect } from 'vitest';
import { buildPostUpdatePayload } from '../PostEditModal';

describe('buildPostUpdatePayload', () => {
  it('标题 trim，可见性透传，标签去空/去空格/去重', () => {
    const payload = buildPostUpdatePayload(
      {
        title: '  新标题  ',
        visibility: 'public',
        tags: ['小说', ' 小说 ', '', '  ', '历史'],
      },
      { title: '旧标题' }
    );
    expect(payload).toEqual({
      title: '新标题',
      visibility: 'public',
      tags: ['小说', '历史'],
    });
  });

  it('标题为空时回退到原标题，再回退到未命名', () => {
    expect(buildPostUpdatePayload({ title: '   ', tags: [] }, { title: '原标题' }).title).toBe(
      '原标题'
    );
    expect(buildPostUpdatePayload({ title: '', tags: [] }, {}).title).toBe('未命名');
  });

  it('tags 缺省为空数组，不影响后端白名单', () => {
    const payload = buildPostUpdatePayload({ title: 't', visibility: 'private' }, {});
    expect(payload.tags).toEqual([]);
    expect(payload.visibility).toBe('private');
  });
});
