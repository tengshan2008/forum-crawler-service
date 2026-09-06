module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  // 单测通过 jest.mock 隔离 Mongoose/Bull 等外部依赖，无需真实数据库
};
