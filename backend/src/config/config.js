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
    secret: process.env.JWT_SECRET || 'your-secret-key-here',
    expiration: process.env.JWT_EXPIRATION || '24h',
  },

  files: {
    maxSize: process.env.MAX_FILE_SIZE || 10485760,
    uploadDir: process.env.UPLOAD_DIR || './uploads',
  },

  crawler: {
    timeout: process.env.CRAWLER_TIMEOUT || 30000,
    retryAttempts: process.env.CRAWLER_RETRY_ATTEMPTS || 3,
    maxConcurrentTasks: process.env.MAX_CONCURRENT_TASKS || 5,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

module.exports = config;
