jest.mock('../../services/browseService', () => ({
  listImageGroups: jest.fn(),
  getImageGroupDetail: jest.fn(),
  listNovels: jest.fn(),
  searchNovels: jest.fn(),
  getNovelContent: jest.fn(),
  createCollection: jest.fn(),
  listCollections: jest.fn(),
  getCollectionById: jest.fn(),
  addToCollection: jest.fn(),
  removeFromCollection: jest.fn(),
  deleteCollection: jest.fn(),
  updateCollection: jest.fn(),
  clearCache: jest.fn(),
  getStats: jest.fn(),
  deleteNovel: jest.fn(),
  deleteImage: jest.fn(),
  deleteImages: jest.fn(),
}));

const browseService = require('../../services/browseService');
const controller = require('../browseController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = (overrides = {}) => ({
  params: {},
  query: {},
  body: {},
  user: { userId: 'u1' },
  ...overrides,
});

const listResult = (items) => ({ items, pagination: { page: 1, limit: 20, total: 1, pages: 1 } });

beforeEach(() => jest.clearAllMocks());

describe('browseController 图片/小说浏览', () => {
  it('getImageGroups 委托 listImageGroups', async () => {
    browseService.listImageGroups.mockResolvedValue(listResult([{ _id: 'g1' }]));
    const res = makeRes();

    await controller.getImageGroups(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('getImageGroupDetail 透传 postId 并输出详情', async () => {
    browseService.getImageGroupDetail.mockResolvedValue({ _id: 'g1', totalImages: 2 });

    const res = makeRes();
    await controller.getImageGroupDetail(makeReq({ params: { postId: 'g1' } }), res, jest.fn());

    expect(browseService.getImageGroupDetail).toHaveBeenCalledWith('g1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'g1', totalImages: 2 },
    });
  });

  it('getNovels/searchNovels 分别委托 query/body', async () => {
    browseService.listNovels.mockResolvedValue(listResult([{ _id: 'n1' }]));
    browseService.searchNovels.mockResolvedValue(listResult([]));

    await controller.getNovels(makeReq({ query: { lastId: 'x' } }), makeRes(), jest.fn());
    expect(browseService.listNovels).toHaveBeenCalledWith({ lastId: 'x' });

    await controller.searchNovels(makeReq({ body: { keyword: 'k' } }), makeRes(), jest.fn());
    expect(browseService.searchNovels).toHaveBeenCalledWith({ keyword: 'k' });
  });

  it('getNovelContent 输出小说数据', async () => {
    browseService.getNovelContent.mockResolvedValue({ _id: 'n1', content: '正文' });
    const res = makeRes();

    await controller.getNovelContent(makeReq({ params: { id: 'n1' } }), res, jest.fn());

    expect(browseService.getNovelContent).toHaveBeenCalledWith('n1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'n1', content: '正文' },
    });
  });
});

describe('browseController 收藏夹', () => {
  it('createCollection 返回 201', async () => {
    browseService.createCollection.mockResolvedValue({ _id: 'c1', name: '夹' });
    const res = makeRes();

    await controller.createCollection(makeReq({ body: { name: '夹' } }), res, jest.fn());

    expect(browseService.createCollection).toHaveBeenCalledWith('u1', { name: '夹' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'c1', name: '夹' },
    });
  });

  it('getCollections 输出分页列表', async () => {
    browseService.listCollections.mockResolvedValue(listResult([{ _id: 'c1' }]));
    const res = makeRes();

    await controller.getCollections(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pagination: expect.any(Object) }));
  });

  it('getCollection 输出详情', async () => {
    browseService.getCollectionById.mockResolvedValue({ _id: 'c1', items: [] });
    const res = makeRes();

    await controller.getCollection(makeReq({ params: { id: 'c1' } }), res, jest.fn());

    expect(browseService.getCollectionById).toHaveBeenCalledWith('u1', 'c1');
  });

  it('addToCollection 透传 id/postId 与消息', async () => {
    browseService.addToCollection.mockResolvedValue({
      collection: { _id: 'c1' },
      message: '已添加到收藏夹',
    });
    const res = makeRes();

    await controller.addToCollection(
      makeReq({ params: { id: 'c1' }, body: { postId: 'p1' } }),
      res,
      jest.fn()
    );

    expect(browseService.addToCollection).toHaveBeenCalledWith('u1', 'c1', 'p1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'c1' },
      message: '已添加到收藏夹',
    });
  });

  it('removeFromCollection 透传 id/postId', async () => {
    browseService.removeFromCollection.mockResolvedValue({
      collection: { _id: 'c1' },
      message: '已从收藏夹移除',
    });

    await controller.removeFromCollection(
      makeReq({ params: { id: 'c1' }, body: { postId: 'p1' } }),
      makeRes(),
      jest.fn()
    );

    expect(browseService.removeFromCollection).toHaveBeenCalledWith('u1', 'c1', 'p1');
  });

  it('deleteCollection 输出消息（data 为 null）', async () => {
    browseService.deleteCollection.mockResolvedValue('收藏夹已删除');
    const res = makeRes();

    await controller.deleteCollection(makeReq({ params: { id: 'c1' } }), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: null,
      message: '收藏夹已删除',
    });
  });

  it('updateCollection 透传 id 与 body', async () => {
    browseService.updateCollection.mockResolvedValue({ _id: 'c1', name: '新' });

    await controller.updateCollection(
      makeReq({ params: { id: 'c1' }, body: { name: '新' } }),
      makeRes(),
      jest.fn()
    );

    expect(browseService.updateCollection).toHaveBeenCalledWith('u1', 'c1', { name: '新' });
  });
});

describe('browseController 缓存/统计/删除', () => {
  it('clearCache 为同步调用并输出消息', async () => {
    browseService.clearCache.mockReturnValue('缓存已清除');
    const res = makeRes();

    await controller.clearCache(makeReq(), res, jest.fn());

    expect(browseService.clearCache).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null, message: '缓存已清除' });
  });

  it('getStats 输出统计数据', async () => {
    browseService.getStats.mockResolvedValue({ novels: { total: 1 }, images: { total: 2 } });
    const res = makeRes();

    await controller.getStats(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { novels: { total: 1 }, images: { total: 2 } },
    });
  });

  it('deleteNovel 透传 id 并输出消息+数据', async () => {
    browseService.deleteNovel.mockResolvedValue({ post: { _id: 'n1' }, message: '小说已删除' });
    const res = makeRes();

    await controller.deleteNovel(makeReq({ params: { id: 'n1' } }), res, jest.fn());

    expect(browseService.deleteNovel).toHaveBeenCalledWith('n1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { _id: 'n1' },
      message: '小说已删除',
    });
  });

  it('deleteImage 透传 id 与 imageUrl', async () => {
    browseService.deleteImage.mockResolvedValue({ post: null, message: '已删除整个 Post' });

    await controller.deleteImage(
      makeReq({ params: { id: 'p1' }, body: { imageUrl: 'u1' } }),
      makeRes(),
      jest.fn()
    );

    expect(browseService.deleteImage).toHaveBeenCalledWith('p1', 'u1');
  });

  it('deleteImages 透传 id 与 imageUrls 数组', async () => {
    browseService.deleteImages.mockResolvedValue({ post: { _id: 'p1' }, message: '已删除 2 张图片' });
    const res = makeRes();

    await controller.deleteImages(
      makeReq({ params: { id: 'p1' }, body: { imageUrls: ['u1', 'u2'] } }),
      res,
      jest.fn()
    );

    expect(browseService.deleteImages).toHaveBeenCalledWith('p1', ['u1', 'u2']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '已删除 2 张图片' }));
  });
});
