/**
 * 索引迁移脚本：去重从「全局唯一」改为「按用户隔离」（v2.18.3）
 *
 * 背景：posts.sourceUrl 历史上是字段级全局唯一索引（sourceUrl_1），
 * contentHash 为单列普通索引（contentHash_1）。爬虫去重查询不区分用户，
 * 用户 B 重爬用户 A 已采过的 URL/内容会被 skip，无法产生自己的副本。
 * v2.18.3 起爬虫按 {sourceUrl,userId} / {contentHash,userId} 查询与 upsert，
 * 索引必须同步切换，否则跨用户同 URL 写入会触发旧唯一索引 duplicate key。
 *
 * 切换动作（幂等，可重复执行）：
 * 1. 预检是否存在重复 sourceUrl（旧全局去重下应为 0；非 0 则中止，
 *    无法直接建复合唯一索引）
 * 2. 先建新索引：{userId:1,contentHash:1}、{sourceUrl:1,userId:1} unique
 *    （先建后删，切换窗口内新旧代码的查询都有索引可用）
 * 3. 再删旧索引：sourceUrl_1（unique）、contentHash_1
 *
 * 用法:
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/migratePostDedupIndexes.js --dry-run
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/migratePostDedupIndexes.js --apply
 */

const mongoose = require('mongoose');

const NEW_URL_INDEX = {
  name: 'sourceUrl_1_userId_1',
  key: { sourceUrl: 1, userId: 1 },
  options: { unique: true, name: 'sourceUrl_1_userId_1' },
};
const NEW_HASH_INDEX = {
  name: 'userId_1_contentHash_1',
  key: { userId: 1, contentHash: 1 },
  options: { name: 'userId_1_contentHash_1' },
};
const LEGACY_URL_INDEX = 'sourceUrl_1';
const LEGACY_HASH_INDEX = 'contentHash_1';

const sameKey = (index, key) => JSON.stringify(index.key) === JSON.stringify(key);

async function findDuplicateSourceUrls(posts) {
  console.log('🔍 预检重复 sourceUrl（旧全局去重下预期为 0）...');
  const rows = await posts
    .aggregate([
      { $match: { sourceUrl: { $type: 'string' } } },
      { $group: { _id: '$sourceUrl', count: { $sum: 1 }, users: { $addToSet: '$userId' } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();
  return rows;
}

async function migrate(apply) {
  const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/forum-crawler';
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 600000,
    maxPoolSize: 5,
  });

  console.log(`📚 已连接到 MongoDB（${apply ? 'APPLY 写入模式' : 'DRY-RUN 演练模式'}）`);
  const posts = mongoose.connection.db.collection('posts');
  console.log(`📊 帖子总数（估算）: ${await posts.estimatedDocumentCount()}`);

  const before = await posts.indexes();
  console.log('\n========== 迁移前索引 ==========');
  console.log(before.map((i) => `${i.name} key=${JSON.stringify(i.key)} unique=${!!i.unique}`).join('\n'));

  const duplicates = await findDuplicateSourceUrls(posts);
  if (duplicates.length > 0) {
    console.error(`\n❌ 发现 ${duplicates.length} 组重复 sourceUrl（仅显示前 20），无法创建复合唯一索引：`);
    duplicates.forEach((r) => console.error(`   ${r._id} ×${r.count}，用户数 ${r.users.length}`));
    console.error('   请先人工确认保留方并清理重复文档，再重跑本脚本');
    await mongoose.connection.close();
    process.exit(1);
  }
  console.log('✓ 无重复 sourceUrl，可以创建复合唯一索引');

  const current = await posts.indexes();
  const actions = [];

  // 1) 建新索引（先建后删，保证切换窗口查询性能与正确性）
  for (const target of [NEW_HASH_INDEX, NEW_URL_INDEX]) {
    const found = current.find((i) => i.name === target.name || sameKey(i, target.key));
    if (found) {
      const needUnique = !!target.options.unique;
      if (!!found.unique !== needUnique) {
        throw new Error(
          `索引 ${target.name} 已存在但 unique=${!!found.unique} 与目标 unique=${needUnique} 不一致，` +
          '请人工 dropIndex 后重跑本脚本'
        );
      }
      console.log(`- 新索引 ${target.name} 已存在，跳过创建`);
    } else {
      actions.push({ type: 'create', ...target });
    }
  }

  // 2) 删旧索引（仅当键模式确实是旧的单列索引时）
  for (const legacyName of [LEGACY_URL_INDEX, LEGACY_HASH_INDEX]) {
    const found = current.find((i) => i.name === legacyName);
    if (!found) {
      console.log(`- 旧索引 ${legacyName} 不存在，跳过删除`);
      continue;
    }
    const isUrlLegacy = legacyName === LEGACY_URL_INDEX && sameKey(found, { sourceUrl: 1 });
    const isHashLegacy = legacyName === LEGACY_HASH_INDEX && sameKey(found, { contentHash: 1 });
    if (isUrlLegacy || isHashLegacy) {
      actions.push({ type: 'drop', name: legacyName });
    } else {
      console.log(`- 索引 ${legacyName} 键模式 ${JSON.stringify(found.key)} 与预期不符，保留不动`);
    }
  }

  if (actions.length === 0) {
    console.log('\n✓ 无需任何变更，索引已是目标状态');
  } else if (!apply) {
    console.log('\n========== DRY-RUN 计划动作（未执行） ==========');
    actions.forEach((a) => {
      if (a.type === 'create') {
        console.log(`CREATE ${a.name} key=${JSON.stringify(a.key)} unique=${!!a.options.unique}`);
      } else {
        console.log(`DROP   ${a.name}`);
      }
    });
    console.log('\n确认后加 --apply 执行');
  } else {
    console.log('\n========== 开始执行 ==========');
    // 先建后删：创建失败则不删旧索引
    for (const a of actions.filter((x) => x.type === 'create')) {
      await posts.createIndex(a.key, a.options);
      console.log(`✓ 已创建 ${a.name}`);
    }
    for (const a of actions.filter((x) => x.type === 'drop')) {
      await posts.dropIndex(a.name);
      console.log(`✓ 已删除 ${a.name}`);
    }
  }

  const after = await posts.indexes();
  console.log('\n========== 迁移后索引 ==========');
  console.log(after.map((i) => `${i.name} key=${JSON.stringify(i.key)} unique=${!!i.unique}`).join('\n'));

  await mongoose.connection.close();
}

const apply = process.argv.includes('--apply');

migrate(apply)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 索引迁移失败:', error);
    process.exit(1);
  });
