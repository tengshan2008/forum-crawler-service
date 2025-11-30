const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/config');

/**
 * 图片下载和存储服务
 */

// 定义图片存储目录
const IMAGES_BASE_DIR = path.join(process.cwd(), '..', 'public', 'images');
const IMAGES_UPLOAD_DIR = path.join(IMAGES_BASE_DIR, 'uploads');

/**
 * 初始化图片目录
 */
function initializeImageDirs() {
  try {
    if (!fs.existsSync(IMAGES_BASE_DIR)) {
      fs.mkdirSync(IMAGES_BASE_DIR, { recursive: true });
    }
    if (!fs.existsSync(IMAGES_UPLOAD_DIR)) {
      fs.mkdirSync(IMAGES_UPLOAD_DIR, { recursive: true });
    }
    console.log('✓ 图片目录已初始化:', IMAGES_UPLOAD_DIR);
  } catch (error) {
    console.error('✗ 初始化图片目录失败:', error.message);
  }
}

/**
 * 生成唯一的文件名
 * @param {string} url - 图片URL
 * @param {string} extension - 文件扩展名
 */
function generateFileName(url, extension) {
  // 使用URL的哈希作为文件名的一部分，确保相同的URL总是对应同一个文件
  const hash = crypto
    .createHash('md5')
    .update(url)
    .digest('hex')
    .substring(0, 16);
  
  return `${hash}.${extension || 'jpg'}`;
}

/**
 * 从URL提取文件扩展名
 * @param {string} url - 图片URL
 */
function getExtensionFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = path.extname(pathname).toLowerCase().substring(1) || 'jpg';
    
    // 过滤掉不合法的扩展名
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    return validExts.includes(ext) ? ext : 'jpg';
  } catch (error) {
    return 'jpg';
  }
}

/**
 * 下载单张图片
 * @param {string} url - 图片URL
 * @param {string} taskId - 任务ID
 * @returns {Promise<object>} { success: boolean, localPath: string, error?: string }
 */
async function downloadImage(url, taskId) {
  if (!url || !url.startsWith('http')) {
    return { success: false, error: '无效的URL' };
  }

  try {
    // 获取文件扩展名
    const extension = getExtensionFromUrl(url);
    const fileName = generateFileName(url, extension);
    
    // 创建任务特定的目录
    const taskImageDir = path.join(IMAGES_UPLOAD_DIR, taskId);
    if (!fs.existsSync(taskImageDir)) {
      fs.mkdirSync(taskImageDir, { recursive: true });
    }

    const filePath = path.join(taskImageDir, fileName);

    // 如果文件已经存在，直接返回
    if (fs.existsSync(filePath)) {
      const localPath = `/public/images/uploads/${taskId}/${fileName}`;
      return { success: true, localPath };
    }

    // 下载图片
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
    });

    // 检查文件大小（限制为 50MB）
    if (response.data.length > 50 * 1024 * 1024) {
      return { success: false, error: '文件过大' };
    }

    // 保存文件
    fs.writeFileSync(filePath, response.data);

    const localPath = `/public/images/uploads/${taskId}/${fileName}`;
    return { success: true, localPath };

  } catch (error) {
    console.error(`✗ 下载图片失败 ${url}:`, error.message);
    return { 
      success: false, 
      error: error.message || '下载失败' 
    };
  }
}

/**
 * 批量下载图片
 * @param {array} imageUrls - 图片URL数组
 * @param {string} taskId - 任务ID
 * @returns {Promise<array>} 下载结果数组
 */
async function downloadImages(imageUrls, taskId) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }

  const results = [];
  
  // 并发下载，但限制并发数为 5
  const batchSize = 5;
  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(url => downloadImage(url, taskId))
    );
    results.push(...batchResults);
    
    // 打印进度
    const progress = Math.min(i + batchSize, imageUrls.length);
    console.log(`[图片下载] 进度: ${progress}/${imageUrls.length}`);
  }

  return results;
}

/**
 * 删除任务的所有图片
 * @param {string} taskId - 任务ID
 */
function deleteTaskImages(taskId) {
  try {
    const taskImageDir = path.join(IMAGES_UPLOAD_DIR, taskId);
    if (fs.existsSync(taskImageDir)) {
      fs.rmSync(taskImageDir, { recursive: true, force: true });
      console.log(`✓ 已删除任务图片: ${taskId}`);
    }
  } catch (error) {
    console.error(`✗ 删除任务图片失败: ${error.message}`);
  }
}

/**
 * 获取本地图片绝对路径
 * @param {string} localPath - 相对路径（如 /public/images/uploads/taskId/filename.jpg）
 */
function getImageFilePath(localPath) {
  if (!localPath) return null;
  // 移除前缀 /public，返回相对于项目根目录的路径
  const relativePath = localPath.replace(/^\/public/, '');
  return path.join(process.cwd(), '..', 'public', relativePath);
}

/**
 * 检查本地图片是否存在
 * @param {string} localPath - 相对路径
 */
function imageExists(localPath) {
  const filePath = getImageFilePath(localPath);
  return filePath && fs.existsSync(filePath);
}

module.exports = {
  initializeImageDirs,
  downloadImage,
  downloadImages,
  deleteTaskImages,
  getImageFilePath,
  imageExists,
  IMAGES_BASE_DIR,
  IMAGES_UPLOAD_DIR,
};
