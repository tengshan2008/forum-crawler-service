require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  host: process.env.HOST || '0.0.0.0',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/forum-crawler',
    testUri: process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/forum-crawler-test',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiration: process.env.JWT_EXPIRATION || '24h',
  },

  files: {
    maxSize: process.env.MAX_FILE_SIZE || 10485760,
    uploadDir: process.env.UPLOAD_DIR || './uploads',
  },

  crawler: {
    timeout: process.env.CRAWLER_TIMEOUT || 600000,
    retryAttempts: process.env.CRAWLER_RETRY_ATTEMPTS || 3,
    maxConcurrentTasks: process.env.MAX_CONCURRENT_TASKS || 5,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// S1 安全自检：安全密钥缺失或仍为示例/弱默认值时拒绝启动，避免静默降级为可伪造密钥
const REQUIRED_SECRET_ENVS = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const KNOWN_INSECURE_SECRETS = new Set([
  'your-secret-key-here',
  'secret_key',
  'refresh_secret_key',
  'change-me-to-a-strong-random-secret',
  'change-me-to-another-strong-random-secret',
]);

function validateEnv() {
  const problems = REQUIRED_SECRET_ENVS.filter((name) => {
    const value = process.env[name];
    return !value || KNOWN_INSECURE_SECRETS.has(value);
  });

  if (problems.length > 0) {
    throw new Error(
      `安全环境变量缺失或为不安全的默认值: ${problems.join(', ')}。` +
        '请设置强随机密钥（如 openssl rand -hex 32）后重启，参见 backend/.env.example。'
    );
  }
}

module.exports = config;
module.exports.validateEnv = validateEnv;
