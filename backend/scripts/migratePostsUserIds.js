/**
 * 迁移脚本：为现有帖子（posts）回填 userId 字段
 *
 * 背景：browse 域内容数据按用户隔离（本人或 visibility:public，admin 全量），
 * 查询依赖 Post.userId。早期 crawl.py 版本写帖可能缺失该字段（pymongo 直写，
 * 绕过 mongoose required 校验），缺失的帖子对所有普通用户不可见。
 *
 * 策略与 migrateTasksUserIds.js 一致：为没有 userId 的帖子分配第一个 admin 用户的 ID。
 * 幂等：可重复执行，已回填的帖子不会被改动。
 *
 * 用法: node backend/scripts/migratePostsUserIds.js
 */

const mongoose = require('mongoose');
// 自动加载 .env 中的 MONGODB_URI（含认证凭据），避免手动 source .env
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const User = require('../src/models/User');
const Post = require('../src/models/Post');

async function migrate() {
  try {
    // 连接到MongoDB
    const mongodbUri = process.env.MONGODB_URI || 'mongodb://192.168.50.50:27017/forum-crawler';
    await mongoose.connect(mongodbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('📚 已连接到MongoDB');

    // 获取第一个管理员用户
    const adminUser = await User.findOne({ role: 'admin' });

    if (!adminUser) {
      console.log('❌ 未找到管理员用户');
      process.exit(1);
    }

    console.log(`✓ 找到管理员用户: ${adminUser.email} (${adminUser._id})`);

    // 统计并回填没有 userId 的帖子
    const missingCount = await Post.countDocuments({ userId: { $exists: false } });
    console.log(`📋 找到 ${missingCount} 个没有 userId 的帖子`);

    if (missingCount > 0) {
      const result = await Post.updateMany(
        { userId: { $exists: false } },
        { $set: { userId: adminUser._id } }
      );
      console.log(`✓ 已更新 ${result.modifiedCount} 个帖子`);
    } else {
      console.log('✓ 所有帖子都已有 userId');
    }

    // 验证更新结果
    const totalPosts = await Post.countDocuments({});
    const postsWithUserId = await Post.countDocuments({ userId: { $exists: true } });
    console.log(`\n📊 迁移结果:`);
    console.log(`   总帖子数: ${totalPosts}`);
    console.log(`   有 userId 的帖子: ${postsWithUserId}`);
    console.log(`   缺少 userId 的帖子: ${totalPosts - postsWithUserId}`);

    if (postsWithUserId === totalPosts) {
      console.log('\n✅ 迁移完成！所有帖子现在都有关联的用户ID');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  }
}

migrate();
