import os
import requests
from PIL import Image
from io import BytesIO
from app.config import MEDIA_DOWNLOAD_DIR, MAX_MEDIA_SIZE
from app.logger import logger

class MediaDownloadPipeline:
    """Pipeline for downloading and processing media"""
    
    def __init__(self):
        self.download_dir = MEDIA_DOWNLOAD_DIR
        os.makedirs(self.download_dir, exist_ok=True)
    
    def download_media(self, url, post_id, task_id):
        """Download media from URL"""
        try:
            logger.info(f'Downloading media from: {url}')
            
            response = requests.get(url, timeout=30, stream=True)
            response.raise_for_status()
            
            # Check file size
            file_size = int(response.headers.get('content-length', 0))
            if file_size > MAX_MEDIA_SIZE:
                logger.warning(f'File too large: {file_size} bytes')
                return None
            
            # Determine media type
            content_type = response.headers.get('content-type', '')
            media_type = self._get_media_type(content_type)
            
            # Save media
            filename = self._generate_filename(post_id, task_id, media_type)
            filepath = os.path.join(self.download_dir, filename)
            
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            # Create thumbnail for images
            thumbnail = None
            if media_type == 'image':
                thumbnail = self._create_thumbnail(filepath)
            
            logger.info(f'Media saved to: {filepath}')
            
            return {
                'filename': filename,
                'filepath': filepath,
                'mediaType': media_type,
                'size': os.path.getsize(filepath),
                'mimeType': content_type,
                'thumbnail': thumbnail,
            }
        except Exception as e:
            logger.error(f'Error downloading media: {str(e)}')
            return None
    
    def _get_media_type(self, content_type):
        """Determine media type from content-type"""
        if 'image' in content_type:
            return 'image'
        elif 'video' in content_type:
            return 'video'
        elif 'audio' in content_type:
            return 'audio'
        else:
            return 'document'
    
    def _generate_filename(self, post_id, task_id, media_type):
        """Generate filename for media"""
        import uuid
        from datetime import datetime
        
        ext = '.jpg' if media_type == 'image' else '.mp4'
        filename = f"{task_id}_{post_id}_{uuid.uuid4().hex[:8]}{ext}"
        return filename
    
    def _create_thumbnail(self, filepath):
        """Create thumbnail for image"""
        try:
            img = Image.open(filepath)
            img.thumbnail((150, 150))
            
            thumb_dir = os.path.join(self.download_dir, 'thumbnails')
            os.makedirs(thumb_dir, exist_ok=True)
            
            thumb_path = os.path.join(thumb_dir, os.path.basename(filepath))
            img.save(thumb_path)
            
            return thumb_path
        except Exception as e:
            logger.warning(f'Error creating thumbnail: {str(e)}')
            return None
