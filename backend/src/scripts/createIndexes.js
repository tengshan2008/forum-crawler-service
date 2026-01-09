/**
 * 数据库索引创建脚本
 * 运行方式: node src/scripts/createIndexes.js
 * 
 * 此脚本用于确保所有必要的索引都已创建
 * 建议在部署后或数据量增大时运行
 */

const mongoose = require('mongoose');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/forum_crawler';

async function createIndexes() {
    try {
        console.log('正在连接到 MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('MongoDB 连接成功');

        const db = mongoose.connection.db;
        const postsCollection = db.collection('posts');

        console.log('\n========== 当前索引列表 ==========');
        const existingIndexes = await postsCollection.indexes();
        console.log(JSON.stringify(existingIndexes, null, 2));

        console.log('\n========== 创建新索引 ==========');

        // 创建复合索引
        const indexesToCreate = [
            { key: { postType: 1, createdAt: -1 }, name: 'postType_createdAt' },
            { key: { postType: 1, taskId: 1, createdAt: -1 }, name: 'postType_taskId_createdAt' },
            { key: { title: 1 }, name: 'title_1' },
            { key: { author: 1 }, name: 'author_1' },
        ];

        for (const index of indexesToCreate) {
            try {
                await postsCollection.createIndex(index.key, { name: index.name, background: true });
                console.log(`✓ 索引 "${index.name}" 创建成功`);
            } catch (err) {
                if (err.code === 85) {
                    console.log(`- 索引 "${index.name}" 已存在，跳过`);
                } else {
                    console.error(`✗ 索引 "${index.name}" 创建失败:`, err.message);
                }
            }
        }

        // 创建文本索引（特殊处理，因为每个集合只能有一个文本索引）
        try {
            // 先删除旧的文本索引（如果存在）
            const textIndexName = 'post_text_search_index';
            try {
                await postsCollection.dropIndex(textIndexName);
                console.log(`- 删除旧文本索引 "${textIndexName}"`);
            } catch (e) {
                // 索引不存在，忽略
            }

            // 创建新的文本索引
            await postsCollection.createIndex(
                { title: 'text', author: 'text' },
                {
                    weights: { title: 10, author: 5 },
                    name: textIndexName,
                    default_language: 'none', // 禁用词干分析，适合中文
                    background: true,
                }
            );
            console.log(`✓ 文本索引 "${textIndexName}" 创建成功`);
        } catch (err) {
            console.error('✗ 文本索引创建失败:', err.message);
        }

        console.log('\n========== 最终索引列表 ==========');
        const finalIndexes = await postsCollection.indexes();
        console.log(JSON.stringify(finalIndexes, null, 2));

        // 获取集合统计信息
        console.log('\n========== 集合统计信息 ==========');
        const stats = await postsCollection.stats();
        console.log(`文档数量: ${stats.count}`);
        console.log(`数据大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`索引大小: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);

    } catch (error) {
        console.error('脚本执行失败:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\nMongoDB 连接已关闭');
    }
}

createIndexes();
