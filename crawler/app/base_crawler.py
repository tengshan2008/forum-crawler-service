import requests
from bs4 import BeautifulSoup
from .config import CRAWLER_TIMEOUT, USER_AGENT
from .logger import logger

class BaseCrawler:
    """Base crawler class for forum scraping"""
    
    def __init__(self, task_id, config=None):
        self.task_id = task_id
        self.config = config or {}
        self.session = self._init_session()
        self.timeout = self.config.get('timeout', CRAWLER_TIMEOUT)
        self.retry_attempts = self.config.get('retry_attempts', 3)
    
    def _init_session(self):
        """Initialize requests session with headers"""
        session = requests.Session()
        session.headers.update({
            'User-Agent': self.config.get('user_agent', USER_AGENT),
            **self.config.get('headers', {})
        })
        return session
    
    def fetch_page(self, url):
        """Fetch page content with retry logic"""
        for attempt in range(self.retry_attempts):
            try:
                logger.info(f'Fetching: {url} (Attempt {attempt + 1})')
                response = self.session.get(url, timeout=self.timeout / 1000)
                response.raise_for_status()
                return response.text
            except Exception as e:
                logger.warning(f'Fetch failed: {str(e)}')
                if attempt == self.retry_attempts - 1:
                    raise
        return None
    
    def parse_html(self, html):
        """Parse HTML content"""
        return BeautifulSoup(html, 'html.parser')
    
    def extract_posts(self, url):
        """Extract posts from URL - implement in subclass"""
        raise NotImplementedError
    
    def extract_media(self, html):
        """Extract media URLs from HTML - implement in subclass"""
        raise NotImplementedError
    
    def close(self):
        """Close session"""
        self.session.close()
