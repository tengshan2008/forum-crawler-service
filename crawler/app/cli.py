#!/usr/bin/env python3
"""
爬虫命令行入口点
用法: python3 -m app.cli --url <url> --type <type> --task-id <task-id> [options]
"""

import sys
import argparse
import os
import json
from pathlib import Path

from app.engine import CrawlerEngine
from app.config import LOGGER, MONGODB_URI, REDIS_HOST, REDIS_PORT
from app.logger import logger

def parse_arguments():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description='Forum Crawler CLI')
    
    parser.add_argument('--url', required=True, help='论坛 URL')
    parser.add_argument('--type', required=True, help='爬虫类型 (novel, image, mixed)')
    parser.add_argument('--task-id', required=True, help='任务 ID')
    parser.add_argument('--max-depth', type=int, default=3, help='最大深度')
    parser.add_argument('--delay', type=int, default=1000, help='请求延迟 (ms)')
    parser.add_argument('--timeout', type=int, default=30000, help='超时时间 (ms)')
    
    return parser.parse_args()

def main():
    """主入口函数"""
    try:
        args = parse_arguments()
        
        # 构建任务配置
        task_config = {
            'forumUrl': args.url,
            'taskType': args.type,
            'maxDepth': args.max_depth,
            'delay': args.delay,
            'timeout': args.timeout,
        }
        
        logger.info(f'Starting crawler task {args.task_id}')
        logger.info(f'URL: {args.url}')
        logger.info(f'Type: {args.type}')
        
        # 创建爬虫引擎
        engine = CrawlerEngine()
        
        # 运行爬虫任务
        result = engine.run_task(args.task_id, task_config)
        
        if result['success']:
            logger.info(f'Crawler task completed successfully: {args.task_id}')
            print(f'CRAWLED:{result.get("total_posts", 0)}')
            sys.exit(0)
        else:
            logger.error(f'Crawler task failed: {result.get("error")}')
            print(f'ERROR:{result.get("error")}', file=sys.stderr)
            sys.exit(1)
    
    except KeyboardInterrupt:
        logger.warning('Crawler interrupted by user')
        sys.exit(130)
    except Exception as e:
        logger.error(f'Fatal error: {str(e)}')
        print(f'ERROR:{str(e)}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
