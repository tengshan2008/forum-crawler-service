/**
 * 迁移脚本：为历史收藏夹归属用户
 *
 * 收藏夹引入按用户隔离（v2.12.0）后，Collection 查询一律按 userId 过滤；
 * 历史全局创建的收藏夹 userId 为 null（userId 字段预留期默认值），将变成
 * 「所有人都看不到」的孤儿数据。本脚本把 userId 为 null 的收藏夹一次性
 * 归属给第一个 admin 用户（与 migrateTasksUserIds.js 同一策略）。
 *
 * 幂等：重复执行只会处理 userId 为 null 的文档，已归属的不受影响。
 *
 * 用法: cd backend && node scripts/migrateCollectionOwners.js
 */

const mongoose = require('mongoose');
const Collection = require('../src/models/Collection');
// 必须显式注册 User 模型，mongoose.model('User') 才可用（模型不随 ref 自动注册）
require('../src/models/User');

async function migrate() {
  try {
    const mongodbUri =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/forum-crawler';
    await mongoose.connect(mongodbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('📚 已连接到MongoDB');

    const User = mongoose.model('User');
    const adminUser = await User.findOne({ role: 'admin' });

    if (!adminUser) {
      console.log('❌ 未找到管理员用户，无法归属历史收藏夹');
      process.exit(1);
    }

    console.log(`✓ 找到管理员用户: ${adminUser.email} (${adminUser._id})`);

    const orphanQuery = {
      $or: [{ userId: null }, { userId: { $exists: false } }],
    };
    const orphanCount = await Collection.countDocuments(orphanQuery);
    console.log(`📋 找到 ${orphanCount} 个未归属用户的收藏夹`);

    if (orphanCount > 0) {
      const result = await Collection.updateMany(orphanQuery, {
        $set: { userId: adminUser._id },
      });
      console.log(`✓ 已归属 ${result.modifiedCount} 个收藏夹给首个 admin`);
    } else {
      console.log('✓ 所有收藏夹都已有归属用户');
    }

    const total = await Collection.countDocuments({});
    const owned = await Collection.countDocuments({
      $and: [
        { userId: { $exists: true } },
        { userId: { $ne: null } },
      ],
    });
    console.log(`\n📊 迁移结果:`);
    console.log(`   收藏夹总数: ${total}`);
    console.log(`   已归属: ${owned}`);
    console.log(`   未归属: ${total - owned}`);

    if (owned === total) {
      console.log('\n✅ 迁移完成！所有收藏夹现在都有归属用户');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  }
}

migrate();
