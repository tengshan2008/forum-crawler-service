const config = require('../config');

describe('validateEnv 启动安全自检', () => {
  beforeEach(() => {
    // 显式清空密钥 env，使各用例不依赖文件执行顺序（对其他文件的 env 泄漏免疫）
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  it('密钥缺失时抛出错误并指出缺失项', () => {
    expect(() => config.validateEnv()).toThrow(/JWT_SECRET/);
  });

  it('JWT_REFRESH_SECRET 缺失时抛出错误', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    expect(() => config.validateEnv()).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('使用了已知示例/弱默认值时拒绝启动', () => {
    process.env.JWT_SECRET = 'your-secret-key-here';
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    expect(() => config.validateEnv()).toThrow(/JWT_SECRET/);
  });

  it('两个密钥均为强随机值时通过', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    expect(() => config.validateEnv()).not.toThrow();
  });
});
