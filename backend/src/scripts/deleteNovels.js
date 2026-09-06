const mongoose = require('mongoose');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/forum_crawler';

async function deleteNovels() {
    try {
        console.log('正在连接到 MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('MongoDB 连接成功');

        const db = mongoose.connection.db;
        const postsCollection = db.collection('posts');

        // 统计要删除的数量
        const filter = { postType: { $in: ['novel', 'text'] } };
        const count = await postsCollection.countDocuments(filter);

        console.log(`\n发现 ${count} 条小说/文本数据。`);

        if (count > 0) {
            console.log('正在删除...');
            const result = await postsCollection.deleteMany(filter);
            console.log(`\n✅ 成功删除了 ${result.deletedCount} 条数据。`);
        } else {
            console.log('\n没有任何数据需要删除。');
        }

    } catch (error) {
        console.error('删除操作失败:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nMongoDB 连接已关闭');
    }
}

deleteNovels();
