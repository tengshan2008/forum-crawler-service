jest.mock('../../models/Post', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  create: jest.fn(),
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../../models/Task', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('mongoose', () => ({
  Types: { ObjectId: jest.fn((id) => `oid_${id}`) },
}));

const controller = require('../postController');
const Post = require('../../models/Post');
const Task = require('../../models/Task');

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
  user: { role: 'user', userId: 'u1' },
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// Post.find 链式调用的统一桩；getAllPosts 以 populate 收尾，其余以 limit 收尾
const stubPostFind = (docs, { populate = false } = {}) => {
  const terminal = populate
    ? { limit: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue(docs) }
    : { limit: jest.fn().mockResolvedValue(docs) };
  Post.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    ...terminal,
  });
};

describe('postController.getAllPosts', () => {
  it('普通用户仅查询本人与公开帖子，响应含分页', async () => {
    stubPostFind([{ _id: 'p1' }], { populate: true });
    Post.countDocuments.mockResolvedValue(21);
    const res = makeRes();

    await controller.getAllPosts(makeReq({ query: { page: '2', limit: '5', taskId: 't1', postType: 'novel' } }), res);

    expect(Post.find.mock.calls[0][0]).toEqual({
      $or: [{ userId: 'u1' }, { visibility: 'public' }],
      taskId: 't1',
      postType: 'novel',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ _id: 'p1' }],
      pagination: { total: 21, page: 2, limit: 5, pages: 5 },
    });
  });

  it('管理员不加可见性过滤', async () => {
    stubPostFind([], { populate: true });
    Post.countDocuments.mockResolvedValue(0);
    const res = makeRes();

    await controller.getAllPosts(makeReq({ user: { role: 'admin', userId: 'a1' } }), res);

    expect(Post.find.mock.calls[0][0]).toEqual({});
  });
});

describe('postController.getPostById', () => {
  it('查到帖子返回 200 与 data', async () => {
    Post.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: 'p1' }),
    });
    const res = makeRes();

    await controller.getPostById(makeReq({ params: { id: 'p1' } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'p1' } });
  });

  it('帖子不存在抛 404', async () => {
    Post.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const res = makeRes();

    await expect(controller.getPostById(makeReq({ params: { id: 'x' } }), res)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('postController.getPostsByTaskId', () => {
  it('普通用户访问他人任务抛 404；本人任务正常返回', async () => {
    const res1 = makeRes();
    Task.findOne.mockResolvedValueOnce(null);
    await expect(
      controller.getPostsByTaskId(makeReq({ params: { taskId: 't1' } }), res1)
    ).rejects.toMatchObject({ statusCode: 404 });

    Task.findOne.mockResolvedValueOnce({ _id: 't1', userId: 'u1' });
    stubPostFind([{ _id: 'p1' }]);
    Post.countDocuments.mockResolvedValue(1);
    const res2 = makeRes();

    await controller.getPostsByTaskId(makeReq({ params: { taskId: 't1' } }), res2);

    expect(Task.findOne.mock.calls[1][0]).toEqual({ _id: 't1', userId: 'u1' });
    expect(res2.json).toHaveBeenCalledWith({
      success: true,
      data: [{ _id: 'p1' }],
      pagination: { total: 1, page: 1, limit: 20, pages: 1 },
    });
  });
});

describe('postController.createPost', () => {
  it('body 无 userId 时从任务归属补齐后创建，返回 201', async () => {
    Task.findById.mockResolvedValue({ _id: 't1', userId: 'owner1' });
    Post.create.mockResolvedValue({ _id: 'p9', content: 'x' });
    const res = makeRes();
    const req = makeReq({ body: { taskId: 't1', content: 'x' } });

    await controller.createPost(req, res);

    expect(Post.create).toHaveBeenCalledWith({ taskId: 't1', content: 'x', userId: 'owner1' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'p9', content: 'x' } });
  });
});

describe('postController.updatePost', () => {
  it('仅能更新本人帖子，找到时返回 200', async () => {
    Post.findOneAndUpdate.mockResolvedValue({ _id: 'p1', content: 'new' });
    const res = makeRes();

    await controller.updatePost(makeReq({ params: { id: 'p1' }, body: { content: 'new' } }), res);

    expect(Post.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: 'p1', userId: 'u1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'p1', content: 'new' } });
  });

  it('只接受白名单字段，忽略 taskId/userId/sourceUrl/contentHash 等敏感字段', async () => {
    Post.findOneAndUpdate.mockResolvedValue({ _id: 'p1' });
    const res = makeRes();

    await controller.updatePost(
      makeReq({
        params: { id: 'p1' },
        body: {
          title: '新标题',
          content: '新内容',
          tags: ['a'],
          status: 'archived',
          // 越权字段应被忽略
          userId: 'someone-else',
          taskId: 'tampered-task',
          sourceUrl: 'http://evil',
          contentHash: 'tampered',
          postType: 'novel',
          likes: 99999,
        },
      }),
      res
    );

    expect(Post.findOneAndUpdate.mock.calls[0][1]).toEqual({
      title: '新标题',
      content: '新内容',
      tags: ['a'],
      status: 'archived',
    });
  });

  it('帖子不存在抛 404', async () => {
    Post.findOneAndUpdate.mockResolvedValue(null);
    const res = makeRes();

    await expect(controller.updatePost(makeReq({ params: { id: 'x' } }), res)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('postController.deletePost', () => {
  it('删除成功返回 200 与 message', async () => {
    Post.findOneAndDelete.mockResolvedValue({ _id: 'p1' });
    const res = makeRes();

    await controller.deletePost(makeReq({ params: { id: 'p1' } }), res);

    expect(Post.findOneAndDelete).toHaveBeenCalledWith({ _id: 'p1', userId: 'u1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: null,
      message: 'Post deleted successfully',
    });
  });

  it('帖子不存在抛 404', async () => {
    Post.findOneAndDelete.mockResolvedValue(null);
    const res = makeRes();

    await expect(controller.deletePost(makeReq({ params: { id: 'x' } }), res)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('postController.getPostStats', () => {
  it('校验任务权限后返回聚合统计', async () => {
    Task.findOne.mockResolvedValue({ _id: 't1' });
    Post.aggregate.mockResolvedValue([{ _id: 'novel', count: 3 }]);
    const res = makeRes();

    await controller.getPostStats(makeReq({ params: { taskId: 't1' } }), res);

    expect(Task.findOne).toHaveBeenCalledWith({ _id: 't1', userId: 'u1' });
    expect(Post.aggregate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'novel', count: 3 }] });
  });
});
