#!/usr/bin/env node

/**
 * 非交互式创建 Admin 账号脚本
 * 直接从命令行参数创建，无需交互
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// 尝试加载.env文件，如果不存在也没关系
try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
} catch (e) {
  // 忽略错误
}

// 导入 User 模型
const User = require('../src/models/User');

async function createAdminNonInteractive() {
  try {
    // 从命令行参数获取
    const email = process.argv[2];
    const username = process.argv[3];
    const password = process.argv[4];

    if (!email || !username || !password) {
      console.error('❌ 使用方法: node create-admin-non-interactive.js <email> <username> <password>');
      process.exit(1);
    }

    console.log('\n创建 Admin 账号...');

    // 连接到 MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://mongodb:27017/forum-crawler';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ 数据库连接成功');

    // 检查邮箱是否已存在
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ 该邮箱已被使用');
      process.exit(1);
    }

    // 检查用户名是否已存在
    existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log('❌ 该用户名已被使用');
      process.exit(1);
    }

    // 对密码进行哈希处理
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const adminUser = new User({
      email,
      username,
      password: hashedPassword,
      role: 'admin',
      isEmailVerified: true,
      active: true,
    });

    await adminUser.save();

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  ✅ Admin 账号创建成功！                     ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    console.log('账号信息:');
    console.log(`  📧 邮箱:     ${email}`);
    console.log(`  👤 用户名:   ${username}`);
    console.log(`  🔑 角色:     admin`);
    console.log(`  ✓  状态:     已激活\n`);

  } catch (error) {
    console.error('\n❌ 创建 Admin 账号失败:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// 运行脚本
createAdminNonInteractive();
