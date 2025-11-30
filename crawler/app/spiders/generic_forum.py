from .base_crawler import BaseCrawler
from .logger import logger

class GenericForumCrawler(BaseCrawler):
    """Generic forum crawler for extracting posts and images"""
    
    def extract_posts(self, url):
        """
        Extract posts from forum page
        Returns list of post data
        """
        try:
            html = self.fetch_page(url)
            soup = self.parse_html(html)
            posts = []
            
            # Generic post extraction - customize based on forum structure
            post_elements = soup.find_all('div', class_=['post', 'thread', 'topic'])
            
            for element in post_elements:
                post = self._parse_post_element(element)
                if post:
                    posts.append(post)
            
            logger.info(f'Extracted {len(posts)} posts from {url}')
            return posts
        except Exception as e:
            logger.error(f'Error extracting posts: {str(e)}')
            return []
    
    def _parse_post_element(self, element):
        """Parse individual post element"""
        try:
            post = {
                'title': self._extract_text(element, 'h1, h2, h3, .title, .subject'),
                'content': self._extract_text(element, 'p, .content, .message, .post-content'),
                'author': self._extract_text(element, '.author, .username, .nickname'),
                'sourceUrl': element.get('href') or element.get('data-url'),
                'postType': 'text',
            }
            
            # Extract media if present
            media = self.extract_media(element)
            if media:
                post['media'] = media
                post['postType'] = 'image' if media else 'text'
            
            return post if post.get('title') else None
        except Exception as e:
            logger.warning(f'Error parsing post element: {str(e)}')
            return None
    
    def _extract_text(self, element, selector):
        """Extract text from element using selector"""
        el = element.select_one(selector) if element else None
        return el.get_text(strip=True) if el else ''
    
    def extract_media(self, element):
        """Extract media URLs from element"""
        media_list = []
        
        # Extract images
        images = element.find_all('img')
        for img in images:
            src = img.get('src') or img.get('data-src')
            if src:
                media_list.append({
                    'type': 'image',
                    'url': src,
                    'description': img.get('alt', ''),
                })
        
        # Extract videos
        videos = element.find_all(['video', 'iframe'])
        for video in videos:
            src = video.get('src') or video.get('data-src')
            if src:
                media_list.append({
                    'type': 'video',
                    'url': src,
                })
        
        return media_list
