from .base_crawler import BaseCrawler
from .spiders.generic_forum import GenericForumCrawler
from .pipelines.mongodb_pipeline import MongoDBPipeline
from .pipelines.media_download import MediaDownloadPipeline
from .logger import logger

class CrawlerEngine:
    """Main crawler engine orchestrating the crawling process"""
    
    def __init__(self):
        self.mongodb_pipeline = MongoDBPipeline()
        self.media_pipeline = MediaDownloadPipeline()
    
    def run_task(self, task_id, task_config):
        """Run a crawler task"""
        try:
            logger.info(f'Starting crawler task: {task_id}')
            
            crawler = GenericForumCrawler(task_id, task_config)
            
            # Get URLs to crawl from task
            urls = task_config.get('urls', [])
            forum_url = task_config.get('forumUrl', '')
            
            if forum_url:
                urls.append(forum_url)
            
            total_posts = 0
            
            for url in urls:
                try:
                    posts = crawler.extract_posts(url)
                    
                    for post in posts:
                        # Save post to database
                        post_id = self.mongodb_pipeline.save_post(task_id, post)
                        
                        # Download media if available
                        if post.get('media'):
                            for media in post['media']:
                                self.media_pipeline.download_media(
                                    media['url'],
                                    post_id,
                                    task_id
                                )
                        
                        total_posts += 1
                    
                    # Update progress
                    progress = {
                        'progress': int((total_posts / max(1, len(urls))) * 100),
                        'crawledItems': total_posts,
                    }
                    self.mongodb_pipeline.update_task_progress(task_id, progress)
                
                except Exception as e:
                    logger.error(f'Error processing URL {url}: {str(e)}')
            
            logger.info(f'Crawler task completed: {task_id}. Total posts: {total_posts}')
            return {
                'success': True,
                'task_id': task_id,
                'total_posts': total_posts,
            }
        
        except Exception as e:
            logger.error(f'Error running crawler task: {str(e)}')
            return {
                'success': False,
                'task_id': task_id,
                'error': str(e),
            }
    
    def close(self):
        """Close all connections"""
        self.mongodb_pipeline.close()

# Singleton instance
engine = CrawlerEngine()
