/**
 * 回填脚本：为存量帖子设置 isSeriesHead 标记
 *
 * 规则：
 *   - 无 series 的帖子：isSeriesHead = true
 *   - 有 series 的帖子：同系列仅章节号最小的一章 isSeriesHead = true，其余 false
 *
 * 用 _id 键集分页扫描（每批走索引，避免长游标网络超时），内存中确定 head 后分批 bulkWrite。
 *
 * 用法:
 *   cd backend && node scripts/backfillSeriesHead.js --dry-run
 *   cd backend && node scripts/backfillSeriesHead.js --apply
 */

const mongoose = require('mongoose');
require('dotenv').config();

const BATCH = 500;

async function backfill(apply) {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    console.error('❌ 请设置 MONGODB_URI 环境变量（或在 backend/.env 中配置）');
    process.exit(1);
  }
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 120000,
    maxPoolSize: 5,
  });

  console.log(`📚 已连接到 MongoDB（${apply ? 'APPLY 写入模式' : 'DRY-RUN 演练模式'}）`);
  const posts = mongoose.connection.db.collection('posts');

  // 第一遍：_id 键集分页扫描，确定每系列 head
  console.log('\n🔍 扫描帖子（_id 键集分页，每批 500）...');
  const scanStart = Date.now();
  const seriesHeads = new Map(); // series -> { chapterNo, _id }
  const allIds = [];
  let scanned = 0;
  let lastId = new mongoose.Types.ObjectId('000000000000000000000000');

  while (true) {
    const filter = { _id: { $gt: lastId } };
    const batch = await posts
      .find(filter, { projection: { _id: 1, series: 1, chapterNo: 1 } })
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray();
    if (batch.length === 0) break;
    for (const doc of batch) {
      scanned += 1;
      allIds.push(doc._id);
      if (doc.series) {
        const cn = doc.chapterNo != null ? doc.chapterNo : Number.MAX_SAFE_INTEGER;
        const cur = seriesHeads.get(doc.series);
        if (!cur || cn < cur.chapterNo) seriesHeads.set(doc.series, { chapterNo: cn, _id: doc._id });
      }
      lastId = doc._id;
    }
    process.stdout.write(`\r   已扫描 ${scanned}`);
  }
  console.log(`\n   ✓ 扫描完成: ${scanned} 条（耗时 ${((Date.now() - scanStart) / 1000).toFixed(1)}s）`);
  console.log(`   系列数: ${seriesHeads.size}`);

  // 构建写操作
  const ops = [];
  for (const _id of allIds) ops.push({ updateOne: { filter: { _id }, update: { $set: { isSeriesHead: true } } } });
  for (const [name, head] of seriesHeads) {
    ops.push({ updateMany: { filter: { series: name, _id: { $ne: head._id } }, update: { $set: { isSeriesHead: false } } } });
  }
  console.log(`   待执行写操作: ${ops.length} 条`);

  if (!apply) {
    console.log('\n📊 DRY-RUN：未写入数据。确认后加 --apply 执行');
    await mongoose.connection.close();
    return;
  }

  const writeStart = Date.now();
  let done = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    const chunk = ops.slice(i, i + BATCH);
    await posts.bulkWrite(chunk, { ordered: false });
    done += chunk.length;
    process.stdout.write(`\r   已写入 ${done}/${ops.length}`);
  }
  console.log(`\n   ✓ 写入完成（耗时 ${((Date.now() - writeStart) / 1000).toFixed(1)}s）`);

  console.log('\n🔍 校验：每系列 isSeriesHead=true 的数量');
  const dup = await posts
    .aggregate([
      { $match: { series: { $ne: null }, isSeriesHead: true } },
      { $group: { _id: '$series', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  console.log(dup.length === 0 ? '   ✓ 每个系列恰好一个 head' : `   ✗ 多 head 系列: ${dup.length}`);

  await mongoose.connection.close();
  console.log('\n🎉 回填完成');
}

const apply = process.argv.includes('--apply');
backfill(apply).catch((e) => {
  console.error('\n❌ 回填失败:', e.message);
  process.exit(1);
});
