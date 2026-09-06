
import os
from pymongo import MongoClient
import sys

def check_linebreaks():
    """
    Connects to MongoDB and checks for newline characters in novel posts.
    """
    mongodb_uri = os.environ.get(
        'MONGODB_URI',
        'mongodb://admin:admin123@localhost:27017/forum-crawler?authSource=admin'
    )

    try:
        client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        db = client['forum-crawler']
        posts_collection = db['posts']
        print("✓ MongoDB connection successful.")

        # Find one document with postType 'novel'
        novel_post = posts_collection.find_one({'postType': 'novel'})

        if not novel_post:
            print("✗ No novel posts found in the database.")
            return

        content = novel_post.get('content', '')

        if '\n' in content:
            print("✓ Newline character (\\n) found in the content of a novel post.")
        else:
            print("✗ No newline character (\\n) found in the content of the checked novel post.")

    except Exception as e:
        print(f"✗ An error occurred: {e}", file=sys.stderr)
    finally:
        if 'client' in locals() and client:
            client.close()

if __name__ == '__main__':
    check_linebreaks()
