/**
 * 回填脚本：为历史帖子补算 contentLength
 *
 * 背景：contentLength 是爬虫去重（长度快判）字段，早期帖子入库时没有该字段。
 * 重爬这些旧帖时只能走内容哈希/保守跳过路径，日志频繁出现
 * 「现有记录无长度信息（旧数据）」。
 *
 * 长度口径与爬虫完全一致：crawl.py 写入的是 Python len(content)（Unicode
 * 码点数），MongoDB 的 $strLenCP 同为码点计数，故直接在服务端聚合计算，
 * 不传输、不修改正文。
 *
 * 安全：
 * - 幂等：只处理 contentLength 缺失或为 null 的文档，可重复执行
 * - 并发安全：每条 UpdateOne 带「仍缺长度」守卫条件，与正在运行的爬虫
 *   并发时不会覆盖爬虫刚写入的长度
 * - 只 $set contentLength，不触碰 content/contentHash 等任何其他字段
 *
 * 用法:
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/backfillContentLength.js --dry-run
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/backfillContentLength.js --apply
 */

const mongoose = require('mongoose');

const BATCH_SIZE = 500;
const MISSING_LENGTH = {
  $or: [{ contentLength: { $exists: false } }, { contentLength: null }],
};

async function backfill(apply) {
  const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/forum-crawler';
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 600000, // 全表扫描约 2.75GB，给足服务端执行时间
  });

  console.log(`📚 已连接到 MongoDB（${apply ? 'APPLY 写入模式' : 'DRY-RUN 演练模式'}）`);
  const posts = mongoose.connection.db.collection('posts');

  const estimated = await posts.estimatedDocumentCount();
  console.log(`📊 帖子总数（估算）: ${estimated}`);

  // 一次全表扫描：筛出缺长度且正文为字符串的文档，服务端用 $strLenCP 算长度
  // 游标只回传 {_id, len}，避免拉取 2.75GB 正文
  console.log('🔍 扫描缺失 contentLength 的帖子（大库约需 1-3 分钟）...');
  const startedAt = Date.now();
  const cursor = posts.aggregate(
    [
      { $match: { $and: [MISSING_LENGTH, { content: { $type: 'string' } }] } },
      { $project: { _id: 1, len: { $strLenCP: '$content' } } },
    ],
    { allowDiskUse: true, batchSize: 1000 }
  );

  let scanned = 0;
  let totalLength = 0;
  let batch = [];
  let modified = 0;
  let guarded = 0; // 扫描时缺失、写入时已被爬虫补上（守卫拦下）

  async function flush() {
    if (batch.length === 0) return;
    const ops = batch.map(({ _id, len }) => ({
      updateOne: {
        filter: { _id, ...MISSING_LENGTH },
        update: { $set: { contentLength: len } },
      },
    }));
    const result = await posts.bulkWrite(ops, { ordered: false });
    modified += result.modifiedCount;
    guarded += ops.length - result.modifiedCount;
    console.log(
      `   已${apply ? '写入' : '演练'} ${scanned} 条` +
        (apply ? `（本批 ${result.modifiedCount}/${ops.length} 更新）` : '')
    );
    batch = [];
  }

  for await (const doc of cursor) {
    scanned += 1;
    totalLength += doc.len;
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      if (apply) await flush();
      else batch = [];
    }
  }
  if (apply) await flush();

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n🎉 回填完成（扫描耗时 ${elapsedSec}s）`);
  console.log(`📊 缺长度且正文可计算: ${scanned} 条`);
  console.log(`📊 正文总长度: ${totalLength} 字符`);
  if (apply) {
    console.log(`📊 实际更新: ${modified} 条`);
    console.log(`📊 并发守卫跳过（爬虫已补写）: ${guarded} 条`);
  } else {
    console.log('📊 DRY-RUN 未写入任何数据，确认无误后加 --apply 执行');
  }

  await mongoose.connection.close();
}

const apply = process.argv.includes('--apply');

backfill(apply)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 回填失败:', error);
    process.exit(1);
  });
