import os
from dotenv import load_dotenv

load_dotenv()

# Database
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/forum-crawler')

# Redis
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '')

# Crawler Settings
CRAWLER_TIMEOUT = int(os.getenv('CRAWLER_TIMEOUT', 30000))
CRAWLER_RETRY_ATTEMPTS = int(os.getenv('CRAWLER_RETRY_ATTEMPTS', 3))
MAX_CONCURRENT_TASKS = int(os.getenv('MAX_CONCURRENT_TASKS', 5))

# Download Settings
DOWNLOAD_DELAY = 1  # in seconds
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

# Media Download
MEDIA_DOWNLOAD_DIR = os.getenv('MEDIA_DOWNLOAD_DIR', './downloads')
MAX_MEDIA_SIZE = 100 * 1024 * 1024  # 100MB

# Logging
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
