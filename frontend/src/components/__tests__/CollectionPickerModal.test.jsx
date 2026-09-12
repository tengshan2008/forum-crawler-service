import { describe, it, expect } from 'vitest';
import { findDuplicateCollectionName } from '../CollectionPickerModal';

// 收藏夹重名预检纯函数：与后端复合唯一索引 {userId, name} 同语义
describe('findDuplicateCollectionName', () => {
  const collections = [
    { _id: 'c1', name: '精选图片' },
    { _id: 'c2', name: '小说收藏' },
  ];

  it('精确重名时返回该收藏夹', () => {
    expect(findDuplicateCollectionName(collections, '精选图片')).toEqual(collections[0]);
    expect(findDuplicateCollectionName(collections, '小说收藏')).toEqual(collections[1]);
  });

  it('未重名时返回 null', () => {
    expect(findDuplicateCollectionName(collections, '新夹子')).toBeNull();
  });

  it('大小写敏感（与后端唯一索引精确匹配一致）', () => {
    expect(findDuplicateCollectionName([{ _id: 'c3', name: 'Work' }], 'work')).toBeNull();
  });

  it('collections 为空/undefined 时返回 null', () => {
    expect(findDuplicateCollectionName([], '任意')).toBeNull();
    expect(findDuplicateCollectionName(undefined, '任意')).toBeNull();
  });

  it('不做 trim（归一化由调用方负责，传入含空格名称视为未重名）', () => {
    expect(findDuplicateCollectionName(collections, ' 精选图片 ')).toBeNull();
  });
});
