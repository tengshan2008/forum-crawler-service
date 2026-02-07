#!/usr/bin/env node

/**
 * 创建 Admin 账号脚本
 * 
 * 使用方法:
 *   node create-admin.js
 * 
 * 或使用参数:
 *   node create-admin.js --email admin@example.com --password password123 --username admin
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 导入 User 模型
const User = require('../src/models/User');

// 创建读取输入的接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 询问问题的辅助函数
const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
};

// 验证邮箱格式
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// 验证用户名格式
const isValidUsername = (username) => {
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  return username.length >= 3 && username.length <= 30 && usernameRegex.test(username);
};

// 验证密码强度
const isValidPassword = (password) => {
  return password.length >= 6;
};

// 主函数
async function createAdmin() {
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         创建 Admin 账号                             ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // 连接到 MongoDB
    console.log('正在连接到数据库...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://mongodb:27017/forum-crawler';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ 数据库连接成功\n');

    // 获取邮箱
    let email = '';
    while (!email) {
      email = await question('请输入邮箱地址: ');
      
      if (!isValidEmail(email)) {
        console.log('❌ 邮箱格式不正确，请重新输入');
        email = '';
        continue;
      }

      // 检查邮箱是否已存在
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        console.log('❌ 该邮箱已被使用，请使用其他邮箱');
        email = '';
        continue;
      }
    }

    // 获取用户名
    let username = '';
    while (!username) {
      username = await question('请输入用户名 (3-30个字符，只能包含字母、数字、下划线、连字符): ');
      
      if (!isValidUsername(username)) {
        console.log('❌ 用户名格式不正确，请重新输入');
        username = '';
        continue;
      }

      // 检查用户名是否已存在
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        console.log('❌ 该用户名已被使用，请使用其他用户名');
        username = '';
        continue;
      }
    }

    // 获取密码
    let password = '';
    while (!password) {
      password = await question('请输入密码 (至少6个字符): ');
      
      if (!isValidPassword(password)) {
        console.log('❌ 密码太短，请输入至少6个字符的密码');
        password = '';
        continue;
      }

      // 确认密码
      const confirmPassword = await question('请确认密码: ');
      if (password !== confirmPassword) {
        console.log('❌ 两次输入的密码不一致，请重新输入');
        password = '';
        continue;
      }
    }

    console.log('\n正在创建 Admin 账号...');

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

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         ✅ Admin 账号创建成功！                    ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    console.log('账号信息:');
    console.log(`  📧 邮箱:     ${email}`);
    console.log(`  👤 用户名:   ${username}`);
    console.log(`  🔑 角色:     admin`);
    console.log(`  ✓  状态:     已激活\n`);
    console.log('现在可以使用此账号登录管理后台了！\n');

  } catch (error) {
    console.error('\n❌ 创建 Admin 账号失败:');
    console.error(error.message);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.connection.close();
  }
}

// 运行脚本
createAdmin();
