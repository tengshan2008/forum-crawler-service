/**
 * 迁移脚本：为现有任务添加userId字段
 * 
 * 这个脚本用于为所有没有userId的任务分配第一个admin用户的ID
 * 这是因为早期版本的应用没有强制要求任务关联用户
 * 
 * 用法: node migrateTasksUserIds.js
 */

const mongoose = require('mongoose');
const Task = require('../src/models/Task');

async function migrate() {
  try {
    // 连接到MongoDB
    const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/forum-crawler';
    await mongoose.connect(mongodbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('📚 已连接到MongoDB');

    // 获取第一个管理员用户
    const User = mongoose.model('User');
    const adminUser = await User.findOne({ role: 'admin' });
    
    if (!adminUser) {
      console.log('❌ 未找到管理员用户');
      process.exit(1);
    }

    console.log(`✓ 找到管理员用户: ${adminUser.email} (${adminUser._id})`);

    // 查找所有没有userId的任务
    const tasksWithoutUserId = await Task.find({ userId: { $exists: false } });
    console.log(`📋 找到 ${tasksWithoutUserId.length} 个没有userId的任务`);

    // 为所有没有userId的任务更新userId
    if (tasksWithoutUserId.length > 0) {
      const result = await Task.updateMany(
        { userId: { $exists: false } },
        { $set: { userId: adminUser._id } }
      );
      console.log(`✓ 已更新 ${result.modifiedCount} 个任务`);
    } else {
      console.log('✓ 所有任务都已有userId');
    }

    // 验证更新结果
    const totalTasks = await Task.countDocuments({});
    const tasksWithUserId = await Task.countDocuments({ userId: { $exists: true } });
    console.log(`\n📊 迁移结果:`);
    console.log(`   总任务数: ${totalTasks}`);
    console.log(`   有userId的任务: ${tasksWithUserId}`);
    console.log(`   缺少userId的任务: ${totalTasks - tasksWithUserId}`);

    if (tasksWithUserId === totalTasks) {
      console.log('\n✅ 迁移完成！所有任务现在都有关联的用户ID');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  }
}

migrate();
