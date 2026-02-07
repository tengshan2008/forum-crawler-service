#!/usr/bin/env node

/**
 * 创建管理员账户脚本
 * 用法: node scripts/createAdmin.js [--email email@example.com] [--username username] [--password password]
 * 或交互式: node scripts/createAdmin.js
 */

const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
const readline = require('readline');

// 导入 User 模型
const User = require('../src/models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function hashPassword(password) {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

async function createAdmin() {
  try {
    // 获取命令行参数
    const args = process.argv.slice(2);
    let email = null;
    let username = null;
    let password = null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--email' && args[i + 1]) {
        email = args[i + 1];
        i++;
      } else if (args[i] === '--username' && args[i + 1]) {
        username = args[i + 1];
        i++;
      } else if (args[i] === '--password' && args[i + 1]) {
        password = args[i + 1];
        i++;
      }
    }

    // 连接 MongoDB
    console.log('正在连接到 MongoDB...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017/forum-crawler';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ MongoDB 连接成功');

    // 获取邮箱
    if (!email) {
      email = await question('请输入管理员邮箱: ');
    }

    if (!email || !email.includes('@')) {
      console.error('✗ 邮箱格式不正确');
      process.exit(1);
    }

    // 检查邮箱是否已存在
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      console.error('✗ 用户已存在');
      if (existingUser.email === email) {
        console.error(`  邮箱 ${email} 已被使用`);
      }
      if (existingUser.username === username) {
        console.error(`  用户名 ${username} 已被使用`);
      }
      process.exit(1);
    }

    // 获取用户名
    if (!username) {
      const defaultUsername = email.split('@')[0];
      username = await question(`请输入用户名 [${defaultUsername}]: `);
      if (!username) {
        username = defaultUsername;
      }
    }

    // 再次检查用户名
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      console.error(`✗ 用户名 ${username} 已被使用`);
      process.exit(1);
    }

    // 获取密码
    if (!password) {
      while (true) {
        password = await question('请输入管理员密码: ');
        if (!password) {
          console.error('✗ 密码不能为空');
          continue;
        }
        if (password.length < 6) {
          console.error('✗ 密码长度至少 6 个字符');
          continue;
        }
        const passwordConfirm = await question('请再次输入密码: ');
        if (password !== passwordConfirm) {
          console.error('✗ 两次输入的密码不一致');
          continue;
        }
        break;
      }
    }

    // 哈希密码
    console.log('正在哈希密码...');
    const hashedPassword = await hashPassword(password);

    // 创建管理员用户
    const admin = new User({
      username,
      email,
      password: hashedPassword,
      role: 'admin',
      status: 'active',
      preferences: {
        emailNotifications: true,
        taskNotifications: true,
      },
    });

    await admin.save();

    console.log('\n✓ 管理员账户创建成功！');
    console.log(`  用户ID: ${admin._id}`);
    console.log(`  用户名: ${username}`);
    console.log(`  邮箱: ${email}`);
    console.log(`  角色: admin`);
    console.log(`  状态: active\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('✗ 创建管理员账户失败:', error.message);
    if (error.code === 11000) {
      console.error('  错误: 邮箱或用户名已存在');
    }
    await mongoose.disconnect();
    process.exit(1);
  }
}

// 处理 Ctrl+C
rl.on('close', () => {
  console.log('\n操作已取消');
  process.exit(1);
});

createAdmin();
