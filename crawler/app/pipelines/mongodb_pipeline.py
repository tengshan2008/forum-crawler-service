from pymongo import MongoClient
from app.config import MONGODB_URI
from app.logger import logger

class MongoDBPipeline:
    """Pipeline for saving data to MongoDB"""
    
    def __init__(self):
        self.client = MongoClient(MONGODB_URI)
        self.db = self.client['forum-crawler']
        self.posts_collection = self.db['posts']
        self.media_collection = self.db['media']
    
    def save_post(self, task_id, post_data):
        """Save post to MongoDB"""
        try:
            post_data['taskId'] = task_id
            result = self.posts_collection.insert_one(post_data)
            logger.info(f'Post saved with ID: {result.inserted_id}')
            return result.inserted_id
        except Exception as e:
            logger.error(f'Error saving post: {str(e)}')
            raise
    
    def save_media(self, task_id, post_id, media_data):
        """Save media to MongoDB"""
        try:
            media_data['taskId'] = task_id
            media_data['postId'] = post_id
            result = self.media_collection.insert_one(media_data)
            logger.info(f'Media saved with ID: {result.inserted_id}')
            return result.inserted_id
        except Exception as e:
            logger.error(f'Error saving media: {str(e)}')
            raise
    
    def update_task_progress(self, task_id, progress_data):
        """Update task progress"""
        try:
            task_collection = self.db['crawler_tasks']
            task_collection.update_one(
                {'_id': task_id},
                {'$set': progress_data}
            )
        except Exception as e:
            logger.error(f'Error updating task progress: {str(e)}')
    
    def close(self):
        """Close MongoDB connection"""
        self.client.close()
