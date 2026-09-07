jest.mock('../../models/Post', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../../models/Collection', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

const Post = require('../../models/Post');
const Collection = require('../../models/Collection');
const AppError = require('../../utils/AppError');
const service = require('../browseService');

beforeEach(() => jest.clearAllMocks());

const expectAppError = async (p, statusCode, message) => {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await expect(p).rejects.toMatchObject({ statusCode, message });
};

// 可链式调用且本身可 await（thenable）的查询 mock
const mockQuery = (result) => {
  const q = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    hint: jest.fn().mockReturnThis(),
    maxTimeMS: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue(result),
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return q;
};

const mockCount = (n) => ({
  maxTimeMS: jest.fn().mockReturnThis(),
  then(resolve, reject) {
    return Promise.resolve(n).then(resolve, reject);
  },
});

// ============ 纯函数 ============

describe('browseService 纯函数', () => {
  it('buildImageFilter 基础条件 + taskId + 关键词 + 时间范围', () => {
    expect(service.buildImageFilter()).toEqual({
      postType: { $in: ['image', 'mixed'] },
      media: { $exists: true, $ne: [] },
    });

    const f = service.buildImageFilter({
      taskId: 't1',
      keyword: 'cat',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    });
    expect(f.taskId).toBe('t1');
    expect(f.$or).toEqual([
      { title: { $regex: 'cat', $options: 'i' } },
      { author: { $regex: 'cat', $options: 'i' } },
    ]);
    expect(f.createdAt.$gte).toEqual(new Date('2026-01-01'));
    expect(f.createdAt.$lte).toEqual(new Date('2026-02-01'));
  });

  it('buildNovelFilter 仅在传入时附加 taskId/时间范围', () => {
    expect(service.buildNovelFilter()).toEqual({ postType: { $in: ['novel', 'text'] } });
    const f = service.buildNovelFilter({ startDate: '2026-03-01' });
    expect(f.taskId).toBeUndefined();
    expect(f.createdAt.$gte).toEqual(new Date('2026-03-01'));
    expect(f.createdAt.$lte).toBeUndefined();
  });

  it('flattenPostsToImages 将 media 扁平化并生成复合 _id', () => {
    const posts = [
      {
        _id: 'p1',
        title: 'T1',
        author: 'a',
        sourceUrl: 's1',
        taskId: 't1',
        media: [{ url: 'u1', originalUrl: 'o1', description: 'd1' }, { url: 'u2' }],
      },
      { _id: 'p2', title: 'T2', media: [] },
      { _id: 'p3', title: 'T3' },
    ];
    const images = service.flattenPostsToImages(posts);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({
      _id: 'p1-u1',
      postId: 'p1',
      postTitle: 'T1',
      url: 'u1',
      originalUrl: 'o1',
    });
    expect(images[1].url).toBe('u2');
  });

  it('buildImageGroups 产出分组、预览前 4 张与全部图片', () => {
    const posts = [
      {
        _id: 'p1',
        title: 'T1',
        media: Array.from({ length: 6 }, (_, i) => ({ url: `u${i}`, description: `d${i}` })),
      },
    ];
    const groups = service.buildImageGroups(posts);
    expect(groups[0].totalImages).toBe(6);
    expect(groups[0].previewImages).toHaveLength(4);
    expect(groups[0].allImages).toHaveLength(6);
  });

  it('enrichNovels 计算字数与 200 字摘要且不泄露完整 content', () => {
    const novels = [
      { _id: 'n1', title: '书', content: 'x'.repeat(250), views: 3, likes: 1, replies: 0 },
      { _id: 'n2', title: '空' },
    ];
    const out = service.enrichNovels(novels);
    expect(out[0].wordCount).toBe(250);
    expect(out[0].excerpt).toHaveLength(200);
    expect(out[0]).not.toHaveProperty('content');
    expect(out[1].wordCount).toBe(0);
    expect(out[1].excerpt).toBe('');
  });

  it('escapeRegExp 转义正则元字符', () => {
    expect(service.escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
    expect(service.escapeRegExp('$^{}()[]|\\+?')).toContain('\\');
  });

  it('buildPagination 计算总页数并合并额外字段', () => {
    expect(service.buildPagination({ page: 2, limit: 10, total: 25 })).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      pages: 3,
    });
    const withExtra = service.buildPagination({ page: 1, limit: 20, total: 5, extra: { lastId: 'x' } });
    expect(withExtra.lastId).toBe('x');
  });
});

// ============ 图片数据访问 ============

describe('browseService 图片列表/搜索', () => {
  const posts = [
    {
      _id: 'p1',
      title: 'T1',
      media: [{ url: 'u1' }, { url: 'u2' }, { url: 'u3' }],
    },
  ];

  it('listImages 扁平化后应用层分页', async () => {
    Post.find.mockReturnValue(mockQuery(posts));

    const { items, pagination } = await service.listImages({ page: '1', limit: '2' });

    expect(items).toHaveLength(2);
    expect(pagination.total).toBe(3);
    expect(pagination.pages).toBe(2);
    expect(Post.find).toHaveBeenCalledWith(
      expect.objectContaining({
        postType: { $in: ['image', 'mixed'] },
        media: { $exists: true, $ne: [] },
      })
    );
    expect(Post.find.mock.calls[0][0].taskId).toBeUndefined();
  });

  it('listImageGroups 按帖子分页并用 countDocuments 计数', async () => {
    Post.find.mockReturnValue(mockQuery(posts));
    Post.countDocuments.mockReturnValue(mockCount(7));

    const { items, pagination } = await service.listImageGroups({
      page: '2',
      limit: '12',
      taskId: 't1',
    });

    expect(items[0].totalImages).toBe(3);
    expect(pagination).toMatchObject({ page: 2, limit: 12, total: 7, pages: 1 });
  });

  it('searchImages 关键词进入查询条件', async () => {
    Post.find.mockReturnValue(mockQuery(posts));

    const { items } = await service.searchImages({ keyword: 'cat', limit: '10' });

    expect(items).toHaveLength(3);
    const filter = Post.find.mock.calls[0][0];
    expect(filter.$or).toBeDefined();
  });
});

// ============ 小说数据访问 ============

describe('browseService 小说列表/搜索', () => {
  const novels = [
    { _id: 'n1', title: '书1', content: 'a'.repeat(210) },
    { _id: 'n2', title: '书2', content: 'b' },
  ];

  beforeEach(() => {
    service.countCache.clear();
  });

  it('listNovels skip 分页：limit 上限 100，首次计数未命中缓存', async () => {
    Post.find.mockReturnValue(mockQuery(novels));
    Post.countDocuments.mockReturnValue(mockCount(42));

    const { items, pagination } = await service.listNovels({ page: '1', limit: '500' });

    expect(items).toHaveLength(2);
    expect(items[0].wordCount).toBe(210);
    expect(pagination.limit).toBe(100);
    expect(pagination.total).toBe(42);
    expect(pagination.lastId).toBe('n2');
    expect(Post.countDocuments).toHaveBeenCalledTimes(1);

    // 第二次命中缓存，不再 countDocuments
    Post.find.mockReturnValue(mockQuery([]));
    const again = await service.listNovels({ page: '2', limit: '20' });
    expect(again.pagination.total).toBe(42);
    expect(Post.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('listNovels 游标分页（lastId）使用 _id $lt 条件', async () => {
    const q = mockQuery([novels[1]]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockReturnValue(mockCount(42));

    const { items, pagination } = await service.listNovels({
      lastId: 'n1',
      sortBy: '-createdAt',
      limit: '1',
    });

    const filter = Post.find.mock.calls[0][0];
    expect(filter._id).toEqual({ $lt: 'n1' });
    expect(q.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(q.hint).toHaveBeenCalled();
    expect(pagination.lastId).toBe('n2');
    expect(items).toHaveLength(1);
  });

  it('searchNovels 文本搜索走 $text 且按相关性排序', async () => {
    const q = mockQuery([novels[0]]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockReturnValue(mockCount(1));

    const { items, pagination } = await service.searchNovels({
      keyword: '  修仙  ',
      useTextSearch: true,
    });

    const filter = Post.find.mock.calls[0][0];
    expect(filter.$text).toEqual({ $search: '修仙' });
    expect(q.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' }, createdAt: -1 });
    expect(pagination.total).toBe(1);
    expect(items[0].excerpt).toHaveLength(200);
  });

  it('searchNovels 正则回退：关键词转义后匹配 title/author', async () => {
    const q = mockQuery([]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockReturnValue(mockCount(0));

    await service.searchNovels({ keyword: 'a.b', useTextSearch: false });

    const filter = Post.find.mock.calls[0][0];
    expect(filter.$or).toEqual([
      { title: { $regex: 'a\\.b', $options: 'i' } },
      { author: { $regex: 'a\\.b', $options: 'i' } },
    ]);
    expect(filter.$text).toBeUndefined();
  });

  it('getNovelContent 存在时原子递增浏览量', async () => {
    Post.findByIdAndUpdate.mockResolvedValue({ _id: 'n1', title: '书' });

    const novel = await service.getNovelContent('n1');

    expect(Post.findByIdAndUpdate).toHaveBeenCalledWith(
      'n1',
      { $inc: { views: 1 } },
      { new: true }
    );
    expect(novel._id).toBe('n1');
  });

  it('getNovelContent 不存在抛 404', async () => {
    Post.findByIdAndUpdate.mockResolvedValue(null);
    await expectAppError(service.getNovelContent('x'), 404, '小说不存在');
  });
});

// ============ 收藏夹 ============

describe('browseService 收藏夹', () => {
  it('createCollection 名称为空抛 400', async () => {
    await expectAppError(service.createCollection({}), 400, '收藏夹名称不能为空');
    expect(Collection.create).not.toHaveBeenCalled();
  });

  it('createCollection 缺省值补全并落库', async () => {
    Collection.create.mockResolvedValue({ _id: 'c1', name: '夹' });

    const c = await service.createCollection({ name: '夹' });

    expect(Collection.create).toHaveBeenCalledWith({
      name: '夹',
      description: '',
      isPublic: false,
      tags: [],
    });
    expect(c._id).toBe('c1');
  });

  it('listCollections 分页元数据', async () => {
    Collection.find.mockReturnValue(mockQuery([{ _id: 'c1' }]));
    Collection.countDocuments.mockResolvedValue(1);

    const { items, pagination } = await service.listCollections({ page: '1', limit: '20' });

    expect(items).toHaveLength(1);
    expect(pagination).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
  });

  it('getCollectionById 不存在抛 404', async () => {
    Collection.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expectAppError(service.getCollectionById('x'), 404, '收藏夹不存在');
  });

  it('addToCollection 幂等：已存在返回提示不重复保存', async () => {
    Post.findById.mockResolvedValue({ _id: 'p1' });
    const save = jest.fn();
    Collection.findById.mockResolvedValue({ items: ['p1'], save });

    const { message } = await service.addToCollection('c1', 'p1');

    expect(message).toBe('内容已存在于收藏夹');
    expect(save).not.toHaveBeenCalled();
  });

  it('addToCollection 新内容追加并更新 itemCount', async () => {
    Post.findById.mockResolvedValue({ _id: 'p2' });
    const save = jest.fn().mockResolvedValue(undefined);
    const collection = { items: ['p1'], itemCount: 1, save };
    Collection.findById.mockResolvedValue(collection);

    const { message } = await service.addToCollection('c1', 'p2');

    expect(message).toBe('已添加到收藏夹');
    expect(collection.items).toContain('p2');
    expect(collection.itemCount).toBe(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('addToCollection 参数/资源校验', async () => {
    await expectAppError(service.addToCollection('c1', undefined), 400, '内容ID不能为空');
    Post.findById.mockResolvedValue(null);
    await expectAppError(service.addToCollection('c1', 'p1'), 404, '内容不存在');
    Post.findById.mockResolvedValue({ _id: 'p1' });
    Collection.findById.mockResolvedValue(null);
    await expectAppError(service.addToCollection('c1', 'p1'), 404, '收藏夹不存在');
  });

  it('removeFromCollection 移除并更新计数', async () => {
    const save = jest.fn();
    Collection.findById.mockResolvedValue({
      items: [{ toString: () => 'p1' }, { toString: () => 'p2' }],
      itemCount: 2,
      save,
    });

    const { message } = await service.removeFromCollection('c1', 'p1');

    expect(message).toBe('已从收藏夹移除');
    expect(save).toHaveBeenCalled();
  });

  it('deleteCollection 不存在抛 404，存在返回消息', async () => {
    Collection.findByIdAndDelete.mockResolvedValue(null);
    await expectAppError(service.deleteCollection('x'), 404, '收藏夹不存在');

    Collection.findByIdAndDelete.mockResolvedValue({ _id: 'c1' });
    expect(await service.deleteCollection('c1')).toBe('收藏夹已删除');
  });

  it('updateCollection 不存在抛 404', async () => {
    Collection.findByIdAndUpdate.mockResolvedValue(null);
    await expectAppError(service.updateCollection('x', {}), 404, '收藏夹不存在');
  });
});

// ============ 缓存/统计/删除 ============

describe('browseService 缓存/统计/删除', () => {
  it('clearCache 清空计数缓存', () => {
    service.countCache.set('k', 1);
    expect(Object.keys(service.countCache.data)).toHaveLength(1);
    expect(service.clearCache()).toBe('缓存已清除');
    expect(Object.keys(service.countCache.data)).toHaveLength(0);
  });

  it('getStats 汇总小说/图片计数与缓存状态', async () => {
    Post.countDocuments
      .mockReturnValueOnce(mockCount(10))
      .mockReturnValueOnce(mockCount(20));

    const stats = await service.getStats();

    expect(stats.novels.total).toBe(10);
    expect(stats.images.total).toBe(20);
    expect(stats.cache.ttlSeconds).toBe(60);
  });

  it('deleteNovel 成功时清缓存，不存在抛 404', async () => {
    Post.findByIdAndDelete.mockResolvedValue(null);
    await expectAppError(service.deleteNovel('x'), 404, '小说不存在');

    service.countCache.set('k', 1);
    Post.findByIdAndDelete.mockResolvedValue({ _id: 'n1' });
    const { message } = await service.deleteNovel('n1');
    expect(message).toBe('小说已删除');
    expect(Object.keys(service.countCache.data)).toHaveLength(0);
  });

  it('deleteImage 参数与资源校验', async () => {
    await expectAppError(service.deleteImage('p1', undefined), 400, '图片URL不能为空');
    Post.findById.mockResolvedValue(null);
    await expectAppError(service.deleteImage('p1', 'u1'), 404, '内容不存在');
  });

  it('deleteImage 删最后一张且无 content 时删除整个 Post', async () => {
    Post.findById.mockResolvedValue({
      media: [{ url: 'u1' }],
      content: '',
    });
    Post.findByIdAndDelete.mockResolvedValue({ _id: 'p1' });
    service.countCache.set('k', 1);

    const { post, message } = await service.deleteImage('p1', 'u1');

    expect(post).toBeNull();
    expect(message).toContain('已删除整个 Post');
    expect(Post.findByIdAndDelete).toHaveBeenCalledWith('p1');
    expect(Object.keys(service.countCache.data)).toHaveLength(0);
  });

  it('deleteImage 图片仍有剩余时保存 Post', async () => {
    const save = jest.fn().mockResolvedValue({ _id: 'p1' });
    Post.findById.mockResolvedValue({
      media: [{ url: 'u1' }, { url: 'u2' }],
      content: '正文',
      save,
    });

    const { post, message } = await service.deleteImage('p1', 'u1');

    expect(message).toBe('图片已删除');
    expect(save).toHaveBeenCalled();
    expect(post._id).toBe('p1');
  });

  it('deleteImage 图片不存在抛 404', async () => {
    Post.findById.mockResolvedValue({ media: [{ url: 'u2' }] });
    await expectAppError(service.deleteImage('p1', 'u1'), 404, '图片不存在');
  });

  it('deleteImages 入参非法抛 400', async () => {
    await expectAppError(service.deleteImages('p1', null), 400, '图片URL列表不能为空');
    await expectAppError(service.deleteImages('p1', []), 400, '图片URL列表不能为空');
    await expectAppError(service.deleteImages('p1', 'x'), 400, '图片URL列表不能为空');
  });

  it('deleteImages 批量删除并报告数量', async () => {
    const save = jest.fn().mockResolvedValue({ _id: 'p1' });
    Post.findById.mockResolvedValue({
      media: [{ url: 'u1' }, { url: 'u2' }, { url: 'u3' }],
      content: '正文',
      save,
    });

    const { message } = await service.deleteImages('p1', ['u1', 'u3']);

    expect(message).toBe('已删除 2 张图片');
    expect(save).toHaveBeenCalled();
  });

  it('deleteImages 清空且无内容时删除整个 Post', async () => {
    Post.findById.mockResolvedValue({ media: [{ url: 'u1' }], content: '' });
    Post.findByIdAndDelete.mockResolvedValue({ _id: 'p1' });

    const { post, message } = await service.deleteImages('p1', ['u1']);

    expect(post).toBeNull();
    expect(message).toContain('已删除 1 张图片');
    expect(message).toContain('已删除整个 Post');
  });
});
