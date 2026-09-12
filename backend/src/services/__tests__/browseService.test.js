jest.mock('../../models/Post', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../../models/Collection', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
}));

const Post = require('../../models/Post');
const Collection = require('../../models/Collection');
const AppError = require('../../utils/AppError');
const service = require('../browseService');

beforeEach(() => jest.clearAllMocks());

// 可见性过滤测试用户：admin 全量；普通用户本人或 public
const adminUser = { userId: 'admin1', role: 'admin' };
const normalUser = { userId: 'u1', role: 'user' };
const normalVisibility = { $or: [{ userId: 'u1' }, { visibility: 'public' }] };

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
  it('buildImageFilter 基础条件 + taskId + 关键词 + 时间范围（结束日含全天）', () => {
    expect(service.buildImageFilter()).toEqual({
      postType: { $in: ['image', 'mixed'] },
      media: { $exists: true, $ne: [] },
    });

    const f = service.buildImageFilter({
      taskId: 't1',
      keyword: '  cat  ',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    });
    expect(f.taskId).toBe('t1');
    expect(f.$or).toEqual([
      { title: { $regex: 'cat', $options: 'i' } },
      { author: { $regex: 'cat', $options: 'i' } },
    ]);
    // 日期按本地自然日解释：开始日 00:00、结束日 23:59:59.999（含结束日全天）
    expect(f.createdAt.$gte).toEqual(new Date('2026-01-01T00:00:00'));
    expect(f.createdAt.$lte).toEqual(new Date('2026-02-01T23:59:59.999'));
  });

  it('buildImageFilter 关键词转义正则元字符，空白关键词被忽略', () => {
    const f = service.buildImageFilter({ keyword: 'a[b].c' });
    expect(f.$or).toEqual([
      { title: { $regex: 'a\\[b\\]\\.c', $options: 'i' } },
      { author: { $regex: 'a\\[b\\]\\.c', $options: 'i' } },
    ]);
    expect(service.buildImageFilter({ keyword: '   ' }).$or).toBeUndefined();
  });

  it('buildNovelFilter 仅在传入时附加 taskId/时间范围', () => {
    expect(service.buildNovelFilter()).toEqual({ postType: { $in: ['novel', 'text'] } });
    const f = service.buildNovelFilter({ startDate: '2026-03-01' });
    expect(f.taskId).toBeUndefined();
    expect(f.createdAt.$gte).toEqual(new Date('2026-03-01'));
    expect(f.createdAt.$lte).toBeUndefined();
  });

  it('buildImageGroups 产出分组与预览前 4 张，列表不携带全量 allImages', () => {
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
    expect(groups[0]).not.toHaveProperty('allImages');
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

  it('buildVisibilityFilter admin 全量，普通用户本人或 public', () => {
    expect(service.buildVisibilityFilter(adminUser)).toEqual({});
    expect(service.buildVisibilityFilter(normalUser)).toEqual(normalVisibility);
  });

  it('applyVisibility 无 $or 冲突时直接并入，有冲突时 $and 组合', () => {
    // 业务 filter 无 $or：可见性 $or 直接并入
    const f1 = service.applyVisibility({ postType: 'novel' }, normalUser);
    expect(f1).toEqual({ postType: 'novel', $or: normalVisibility.$or });

    // 业务 filter 已有 $or（关键词搜索）：组合为 $and，避免键互相覆盖
    const f2 = service.applyVisibility(
      {
        postType: 'novel',
        $or: [
          { title: { $regex: 'kw', $options: 'i' } },
          { author: { $regex: 'kw', $options: 'i' } },
        ],
      },
      normalUser
    );
    expect(f2.$or).toBeUndefined();
    expect(f2.$and).toEqual([
      {
        $or: [
          { title: { $regex: 'kw', $options: 'i' } },
          { author: { $regex: 'kw', $options: 'i' } },
        ],
      },
      normalVisibility,
    ]);

    // admin 可见性为空对象：filter 保持不变
    const f3 = service.applyVisibility({ postType: 'novel', $or: [{ title: 'x' }] }, adminUser);
    expect(f3).toEqual({ postType: 'novel', $or: [{ title: 'x' }] });
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

describe('browseService 图片列表/详情', () => {
  const posts = [
    {
      _id: 'p1',
      title: 'T1',
      media: [{ url: 'u1' }, { url: 'u2' }, { url: 'u3' }],
    },
  ];

  it('listImageGroups 按帖子分页并用 countDocuments 计数', async () => {
    Post.find.mockReturnValue(mockQuery(posts));
    Post.countDocuments.mockReturnValue(mockCount(7));

    const { items, pagination } = await service.listImageGroups(
      { page: '2', limit: '12', taskId: 't1' },
      adminUser
    );

    expect(items[0].totalImages).toBe(3);
    expect(pagination).toMatchObject({ page: 2, limit: 12, total: 7, pages: 1 });
  });

  it('listImageGroups 透传 keyword/startDate/endDate 到查询条件', async () => {
    Post.find.mockReturnValue(mockQuery(posts));
    Post.countDocuments.mockReturnValue(mockCount(1));

    await service.listImageGroups(
      {
        page: '1',
        limit: '12',
        taskId: 't1',
        keyword: 'a.b',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
      adminUser
    );

    const filter = Post.find.mock.calls[0][0];
    expect(filter.taskId).toBe('t1');
    expect(filter.$or).toEqual([
      { title: { $regex: 'a\\.b', $options: 'i' } },
      { author: { $regex: 'a\\.b', $options: 'i' } },
    ]);
    expect(filter.createdAt).toEqual({
      $gte: new Date('2026-01-01T00:00:00'),
      $lte: new Date('2026-01-31T23:59:59.999'),
    });
  });

  it('listImageGroups 普通用户查询携带可见性过滤', async () => {
    Post.find.mockReturnValue(mockQuery([]));
    Post.countDocuments.mockReturnValue(mockCount(0));

    await service.listImageGroups({ page: '1', limit: '12' }, normalUser);

    expect(Post.find).toHaveBeenCalledWith(
      expect.objectContaining({
        postType: { $in: ['image', 'mixed'] },
        $or: normalVisibility.$or,
      })
    );
  });

  it('listImageGroups 普通用户 + 关键词：可见性与关键词 $or 经 $and 组合', async () => {
    Post.find.mockReturnValue(mockQuery([]));
    Post.countDocuments.mockReturnValue(mockCount(0));

    await service.listImageGroups({ page: '1', limit: '12', keyword: 'kw' }, normalUser);

    const filter = Post.find.mock.calls[0][0];
    expect(filter.$or).toBeUndefined();
    expect(filter.$and).toEqual([
      {
        $or: [
          { title: { $regex: 'kw', $options: 'i' } },
          { author: { $regex: 'kw', $options: 'i' } },
        ],
      },
      normalVisibility,
    ]);
  });

  it('getImageGroupDetail 返回单组全量图片（详情入口）', async () => {
    Post.findOne.mockReturnValue(
      mockQuery({
        _id: 'p1',
        title: 'T1',
        author: 'a',
        sourceUrl: 's',
        taskId: 't1',
        createdAt: '2026-01-01T00:00:00',
        media: [{ url: 'u1', description: 'd1' }, { url: 'u2', originalUrl: 'o2' }],
      })
    );

    const group = await service.getImageGroupDetail('p1', adminUser);

    expect(Post.findOne).toHaveBeenCalledWith({ _id: 'p1' });
    expect(group.totalImages).toBe(2);
    expect(group.allImages).toEqual([
      { url: 'u1', description: 'd1' },
      { url: 'u2', description: undefined },
    ]);
    expect(group.title).toBe('T1');
  });

  it('getImageGroupDetail 普通用户查询携带可见性过滤，他人帖子 404', async () => {
    Post.findOne.mockReturnValue(mockQuery(null));
    await expectAppError(service.getImageGroupDetail('p1', normalUser), 404, '内容不存在');

    expect(Post.findOne).toHaveBeenCalledWith({ _id: 'p1', $or: normalVisibility.$or });
  });

  it('getImageGroupDetail 参数/资源校验', async () => {
    await expectAppError(service.getImageGroupDetail(), 400, '内容ID不能为空');
    expect(Post.findOne).not.toHaveBeenCalled();

    Post.findOne.mockReturnValue(mockQuery(null));
    await expectAppError(service.getImageGroupDetail('x', adminUser), 404, '内容不存在');

    Post.findOne.mockReturnValue(mockQuery({ _id: 'p1', media: [] }));
    await expectAppError(service.getImageGroupDetail('p1', adminUser), 404, '该内容没有图片');
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

    const { items, pagination } = await service.listNovels({ page: '1', limit: '500' }, adminUser);

    expect(items).toHaveLength(2);
    expect(items[0].wordCount).toBe(210);
    expect(pagination.limit).toBe(100);
    expect(pagination.total).toBe(42);
    expect(pagination.lastId).toBe('n2');
    expect(Post.countDocuments).toHaveBeenCalledTimes(1);

    // 第二次命中缓存，不再 countDocuments
    Post.find.mockReturnValue(mockQuery([]));
    const again = await service.listNovels({ page: '2', limit: '20' }, adminUser);
    expect(again.pagination.total).toBe(42);
    expect(Post.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('listNovels 计数缓存按用户隔离：不同用户不共享计数', async () => {
    Post.find.mockReturnValue(mockQuery([]));
    Post.countDocuments.mockReturnValue(mockCount(42));

    await service.listNovels({ page: '1', limit: '20' }, normalUser);
    // 另一个普通用户：缓存 key 不同，必须重新 countDocuments
    await service.listNovels({ page: '1', limit: '20' }, { userId: 'u2', role: 'user' });

    expect(Post.countDocuments).toHaveBeenCalledTimes(2);
    expect(service.countCache.data.novels_count_u1_all).toBeDefined();
    expect(service.countCache.data.novels_count_u2_all).toBeDefined();
  });

  it('listNovels 普通用户查询携带可见性过滤', async () => {
    Post.find.mockReturnValue(mockQuery([]));
    Post.countDocuments.mockReturnValue(mockCount(0));

    await service.listNovels({ page: '1', limit: '20' }, normalUser);

    expect(Post.find).toHaveBeenCalledWith(
      expect.objectContaining({ postType: { $in: ['novel', 'text'] }, $or: normalVisibility.$or })
    );
  });

  it('listNovels admin 强制索引提示，普通用户（$or）不强制', async () => {
    const qAdmin = mockQuery([]);
    Post.find.mockReturnValueOnce(qAdmin);
    await service.listNovels({ page: '1', limit: '20' }, adminUser);
    expect(qAdmin.hint).toHaveBeenCalledWith({ postType: 1, createdAt: -1 });

    const qUser = mockQuery([]);
    Post.countDocuments.mockReturnValue(mockCount(0));
    Post.find.mockReturnValueOnce(qUser);
    await service.listNovels({ page: '1', limit: '20' }, normalUser);
    expect(qUser.hint).not.toHaveBeenCalled();
  });

  it('listNovels 游标分页（lastId）使用 _id $lt 条件', async () => {
    const q = mockQuery([novels[1]]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockReturnValue(mockCount(42));

    const { items, pagination } = await service.listNovels(
      {
        lastId: 'n1',
        sortBy: '-createdAt',
        limit: '1',
      },
      adminUser
    );

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

    const { items, pagination } = await service.searchNovels(
      { keyword: '  修仙  ', useTextSearch: true },
      adminUser
    );

    const filter = Post.find.mock.calls[0][0];
    expect(filter.$text).toEqual({ $search: '修仙' });
    expect(q.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' }, createdAt: -1 });
    expect(pagination.total).toBe(1);
    expect(items[0].excerpt).toHaveLength(200);
  });

  it('searchNovels 普通用户文本搜索：$text 在根层、可见性 $or 并入', async () => {
    Post.find.mockReturnValue(mockQuery([]));
    Post.countDocuments.mockReturnValue(mockCount(0));

    await service.searchNovels({ keyword: 'kw', useTextSearch: true }, normalUser);

    const filter = Post.find.mock.calls[0][0];
    expect(filter.$text).toEqual({ $search: 'kw' });
    expect(filter.$or).toEqual(normalVisibility.$or);
  });

  it('searchNovels 正则回退：关键词转义后匹配 title/author', async () => {
    const q = mockQuery([]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockReturnValue(mockCount(0));

    await service.searchNovels({ keyword: 'a.b', useTextSearch: false }, adminUser);

    const filter = Post.find.mock.calls[0][0];
    expect(filter.$or).toEqual([
      { title: { $regex: 'a\\.b', $options: 'i' } },
      { author: { $regex: 'a\\.b', $options: 'i' } },
    ]);
    expect(filter.$text).toBeUndefined();
  });

  it('searchNovels 普通用户正则回退：关键词与可见性 $or 经 $and 组合', async () => {
    Post.find.mockReturnValue(mockQuery([]));
    Post.countDocuments.mockReturnValue(mockCount(0));

    await service.searchNovels({ keyword: 'kw', useTextSearch: false }, normalUser);

    const filter = Post.find.mock.calls[0][0];
    expect(filter.$or).toBeUndefined();
    expect(filter.$and).toEqual([
      {
        $or: [
          { title: { $regex: 'kw', $options: 'i' } },
          { author: { $regex: 'kw', $options: 'i' } },
        ],
      },
      normalVisibility,
    ]);
  });

  it('getNovelContent 存在时原子递增浏览量', async () => {
    Post.findOneAndUpdate.mockResolvedValue({ _id: 'n1', title: '书' });

    const novel = await service.getNovelContent('n1', adminUser);

    expect(Post.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'n1' },
      { $inc: { views: 1 } },
      { new: true }
    );
    expect(novel._id).toBe('n1');
  });

  it('getNovelContent 普通用户查询携带可见性过滤，不可见帖子 404', async () => {
    Post.findOneAndUpdate.mockResolvedValue(null);

    await expectAppError(service.getNovelContent('x', normalUser), 404, '小说不存在');

    expect(Post.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'x', $or: normalVisibility.$or },
      { $inc: { views: 1 } },
      { new: true }
    );
  });
});

// ============ 收藏夹 ============

describe('browseService 收藏夹（按用户归属隔离）', () => {
  it('createCollection 缺少用户身份抛 401', async () => {
    await expectAppError(service.createCollection(undefined, { name: '夹' }), 401, '缺少用户身份，无法创建收藏夹');
    expect(Collection.create).not.toHaveBeenCalled();
  });

  it('createCollection 名称为空抛 400', async () => {
    await expectAppError(service.createCollection('u1', {}), 400, '收藏夹名称不能为空');
    expect(Collection.create).not.toHaveBeenCalled();
  });

  it('createCollection 缺省值补全并携带归属落库', async () => {
    Collection.create.mockResolvedValue({ _id: 'c1', name: '夹' });

    const c = await service.createCollection('u1', { name: '夹' });

    expect(Collection.create).toHaveBeenCalledWith({
      name: '夹',
      description: '',
      isPublic: false,
      tags: [],
      userId: 'u1',
    });
    expect(c._id).toBe('c1');
  });

  it('listCollections 仅查询当前用户并携带 items', async () => {
    Collection.find.mockReturnValue(mockQuery([{ _id: 'c1', items: ['p1'] }]));
    Collection.countDocuments.mockResolvedValue(1);

    const { items, pagination } = await service.listCollections('u1', { page: '1', limit: '20' });

    expect(Collection.find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(Collection.countDocuments).toHaveBeenCalledWith({ userId: 'u1' });
    expect(items).toHaveLength(1);
    expect(pagination).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
  });

  it('getCollectionById 按 _id+userId 查询，不存在/越权统一 404', async () => {
    Collection.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expectAppError(service.getCollectionById('u1', 'x'), 404, '收藏夹不存在');
    expect(Collection.findOne).toHaveBeenCalledWith({ _id: 'x', userId: 'u1' });
  });

  it('addToCollection 幂等：已存在返回提示不重复保存', async () => {
    Post.findOne.mockResolvedValue({ _id: 'p1' });
    const save = jest.fn();
    Collection.findOne.mockResolvedValue({ items: ['p1'], save });

    const { message } = await service.addToCollection('u1', 'c1', 'p1', normalUser);

    expect(Post.findOne).toHaveBeenCalledWith({ _id: 'p1', $or: normalVisibility.$or });
    expect(Collection.findOne).toHaveBeenCalledWith({ _id: 'c1', userId: 'u1' });
    expect(message).toBe('内容已存在于收藏夹');
    expect(save).not.toHaveBeenCalled();
  });

  it('addToCollection 新内容追加并更新 itemCount', async () => {
    Post.findOne.mockResolvedValue({ _id: 'p2' });
    const save = jest.fn().mockResolvedValue(undefined);
    const collection = { items: ['p1'], itemCount: 1, save };
    Collection.findOne.mockResolvedValue(collection);

    const { message } = await service.addToCollection('u1', 'c1', 'p2', normalUser);

    expect(message).toBe('已添加到收藏夹');
    expect(collection.items).toContain('p2');
    expect(collection.itemCount).toBe(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('addToCollection 参数/资源校验', async () => {
    await expectAppError(
      service.addToCollection('u1', 'c1', undefined, normalUser),
      400,
      '内容ID不能为空'
    );
    Post.findOne.mockResolvedValue(null);
    await expectAppError(service.addToCollection('u1', 'c1', 'p1', normalUser), 404, '内容不存在');
    Post.findOne.mockResolvedValue({ _id: 'p1' });
    Collection.findOne.mockResolvedValue(null);
    await expectAppError(
      service.addToCollection('u1', 'c1', 'p1', normalUser),
      404,
      '收藏夹不存在'
    );
  });

  it('removeFromCollection 移除并更新计数', async () => {
    const save = jest.fn();
    Collection.findOne.mockResolvedValue({
      items: [{ toString: () => 'p1' }, { toString: () => 'p2' }],
      itemCount: 2,
      save,
    });

    const { message } = await service.removeFromCollection('u1', 'c1', 'p1');

    expect(message).toBe('已从收藏夹移除');
    expect(save).toHaveBeenCalled();
  });

  it('deleteCollection 按 _id+userId 删除，不存在/越权统一 404', async () => {
    Collection.findOneAndDelete.mockResolvedValue(null);
    await expectAppError(service.deleteCollection('u1', 'x'), 404, '收藏夹不存在');

    Collection.findOneAndDelete.mockResolvedValue({ _id: 'c1' });
    expect(await service.deleteCollection('u1', 'c1')).toBe('收藏夹已删除');
    expect(Collection.findOneAndDelete).toHaveBeenCalledWith({ _id: 'c1', userId: 'u1' });
  });

  it('createCollection 用户内重名（唯一索引 11000）转 409', async () => {
    const dup = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    Collection.create.mockRejectedValue(dup);

    await expectAppError(
      service.createCollection('u1', { name: '夹' }),
      409,
      '同名收藏夹已存在'
    );
  });

  it('createCollection 非重复键错误原样抛出', async () => {
    Collection.create.mockRejectedValue(new Error('boom'));
    await expect(service.createCollection('u1', { name: '夹' })).rejects.toThrow('boom');
  });

  it('updateCollection 重名（唯一索引 11000）转 409', async () => {
    const dup = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    Collection.findOneAndUpdate.mockRejectedValue(dup);

    await expectAppError(
      service.updateCollection('u1', 'c1', { name: '新' }),
      409,
      '同名收藏夹已存在'
    );
  });

  it('updateCollection 按 _id+userId 更新，不存在/越权统一 404', async () => {
    Collection.findOneAndUpdate.mockResolvedValue(null);
    await expectAppError(service.updateCollection('u1', 'x', {}), 404, '收藏夹不存在');

    Collection.findOneAndUpdate.mockResolvedValue({ _id: 'c1', name: '新' });
    const c = await service.updateCollection('u1', 'c1', { name: '新' });
    expect(Collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'c1', userId: 'u1' },
      { name: '新', description: undefined, isPublic: undefined, tags: undefined, coverImage: undefined },
      { new: true, runValidators: true }
    );
    expect(c.name).toBe('新');
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

    const stats = await service.getStats(adminUser);

    expect(stats.novels.total).toBe(10);
    expect(stats.images.total).toBe(20);
    expect(stats.cache.ttlSeconds).toBe(60);
  });

  it('getStats 普通用户按可见范围统计', async () => {
    Post.countDocuments
      .mockReturnValueOnce(mockCount(3))
      .mockReturnValueOnce(mockCount(4));

    const stats = await service.getStats(normalUser);

    expect(Post.countDocuments).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ $or: normalVisibility.$or, postType: { $in: ['novel', 'text'] } })
    );
    expect(Post.countDocuments).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ $or: normalVisibility.$or, postType: { $in: ['image', 'mixed'] } })
    );
    expect(stats.novels.total).toBe(3);
    expect(stats.images.total).toBe(4);
  });

  it('deleteNovel 作用域删除，成功时清缓存，不可见/不存在抛 404', async () => {
    Post.findOneAndDelete.mockResolvedValue(null);
    await expectAppError(service.deleteNovel('x', normalUser), 404, '小说不存在');
    expect(Post.findOneAndDelete).toHaveBeenCalledWith({ _id: 'x', $or: normalVisibility.$or });

    service.countCache.set('k', 1);
    Post.findOneAndDelete.mockResolvedValue({ _id: 'n1' });
    const { message } = await service.deleteNovel('n1', adminUser);
    expect(message).toBe('小说已删除');
    expect(Object.keys(service.countCache.data)).toHaveLength(0);
  });

  it('deleteImage 参数与资源校验', async () => {
    await expectAppError(service.deleteImage('p1', undefined, adminUser), 400, '图片URL不能为空');
    Post.findOne.mockResolvedValue(null);
    await expectAppError(service.deleteImage('p1', 'u1', adminUser), 404, '内容不存在');
  });

  it('deleteImage 删最后一张且无 content 时删除整个 Post', async () => {
    Post.findOne.mockResolvedValue({
      media: [{ url: 'u1' }],
      content: '',
    });
    Post.findByIdAndDelete.mockResolvedValue({ _id: 'p1' });
    service.countCache.set('k', 1);

    const { post, message } = await service.deleteImage('p1', 'u1', normalUser);

    expect(Post.findOne).toHaveBeenCalledWith({ _id: 'p1', $or: normalVisibility.$or });
    expect(post).toBeNull();
    expect(message).toContain('已删除整个 Post');
    expect(Post.findByIdAndDelete).toHaveBeenCalledWith('p1');
    expect(Object.keys(service.countCache.data)).toHaveLength(0);
  });

  it('deleteImage 图片仍有剩余时保存 Post', async () => {
    const save = jest.fn().mockResolvedValue({ _id: 'p1' });
    Post.findOne.mockResolvedValue({
      media: [{ url: 'u1' }, { url: 'u2' }],
      content: '正文',
      save,
    });

    const { post, message } = await service.deleteImage('p1', 'u1', adminUser);

    expect(message).toBe('图片已删除');
    expect(save).toHaveBeenCalled();
    expect(post._id).toBe('p1');
  });

  it('deleteImage 图片不存在抛 404', async () => {
    Post.findOne.mockResolvedValue({ media: [{ url: 'u2' }] });
    await expectAppError(service.deleteImage('p1', 'u1', adminUser), 404, '图片不存在');
  });

  it('deleteImages 入参非法抛 400', async () => {
    await expectAppError(service.deleteImages('p1', null, adminUser), 400, '图片URL列表不能为空');
    await expectAppError(service.deleteImages('p1', [], adminUser), 400, '图片URL列表不能为空');
    await expectAppError(service.deleteImages('p1', 'x', adminUser), 400, '图片URL列表不能为空');
  });

  it('deleteImages 批量删除并报告数量', async () => {
    const save = jest.fn().mockResolvedValue({ _id: 'p1' });
    Post.findOne.mockResolvedValue({
      media: [{ url: 'u1' }, { url: 'u2' }, { url: 'u3' }],
      content: '正文',
      save,
    });

    const { message } = await service.deleteImages('p1', ['u1', 'u3'], adminUser);

    expect(message).toBe('已删除 2 张图片');
    expect(save).toHaveBeenCalled();
  });

  it('deleteImages 清空且无内容时删除整个 Post', async () => {
    Post.findOne.mockResolvedValue({ media: [{ url: 'u1' }], content: '' });
    Post.findByIdAndDelete.mockResolvedValue({ _id: 'p1' });

    const { post, message } = await service.deleteImages('p1', ['u1'], adminUser);

    expect(post).toBeNull();
    expect(message).toContain('已删除 1 张图片');
    expect(message).toContain('已删除整个 Post');
  });
});
