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
 * 安全与健壮性：
 * - 幂等：只处理 contentLength 缺失或为 null 的文档，可重复执行
 * - 并发安全：每条 UpdateOne 带「仍缺长度」守卫条件，与正在运行的爬虫
 *   并发时不会覆盖爬虫刚写入的长度（整批重放时已写条目自动 no-op）
 * - 两阶段执行：先聚合扫描把 {_id,len} 收集到内存（仅几十 KB），再队列式
 *   分批写入，避免边扫边写时长写入阻塞导致游标不活动超时
 * - 失败重试：单批写入指数退避重试；超限批次的 _id 落盘失败清单，不阻断
 *   后续批次，进程以非零码退出，可直接重跑本脚本补齐
 * - 只 $set contentLength，不触碰 content/contentHash 等任何其他字段
 *
 * 用法:
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/backfillContentLength.js --dry-run
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/backfillContentLength.js --apply
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 6; // 单批最大尝试次数（含首次）
const MISSING_LENGTH = {
  $or: [{ contentLength: { $exists: false } }, { contentLength: null }],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scanMissing(posts) {
  console.log('🔍 扫描缺失 contentLength 的帖子（大库约需 1-3 分钟）...');
  const startedAt = Date.now();
  const cursor = posts.aggregate(
    [
      { $match: { $and: [MISSING_LENGTH, { content: { $type: 'string' } }] } },
      { $project: { _id: 1, len: { $strLenCP: '$content' } } },
    ],
    { allowDiskUse: true, batchSize: 1000 }
  );

  const docs = [];
  let totalLength = 0;
  for await (const doc of cursor) {
    docs.push(doc);
    totalLength += doc.len;
  }
  console.log(
    `✓ 扫描完成：${docs.length} 条待回填，正文合计 ${totalLength} 字符（耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s）`
  );
  return docs;
}

async function writeBatchWithRetry(posts, chunk, batchNo, totalBatches) {
  const ops = chunk.map(({ _id, len }) => ({
    updateOne: {
      filter: { _id, ...MISSING_LENGTH },
      update: { $set: { contentLength: len } },
    },
  }));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await posts.bulkWrite(ops, { ordered: false });
      // 守卫拦下（爬虫已补写）的条目不计入更新，属正常
      return { modified: result.modifiedCount, guarded: ops.length - result.modifiedCount };
    } catch (error) {
      const waitMs = Math.min(5000 * 2 ** (attempt - 1), 60000);
      if (attempt < MAX_ATTEMPTS) {
        console.log(
          `   ⚠ 批 ${batchNo}/${totalBatches} 第 ${attempt} 次写入失败：${error.message}；${waitMs / 1000}s 后重试`
        );
        await sleep(waitMs);
      } else {
        console.log(`   ✗ 批 ${batchNo}/${totalBatches} 连续 ${MAX_ATTEMPTS} 次失败，放弃本批：${error.message}`);
        throw error;
      }
    }
  }
}

async function backfill(apply) {
  const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/forum-crawler';
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 600000, // 大库高负载下单批可能等待较久
    maxPoolSize: 5,
  });

  console.log(`📚 已连接到 MongoDB（${apply ? 'APPLY 写入模式' : 'DRY-RUN 演练模式'}）`);
  const posts = mongoose.connection.db.collection('posts');
  console.log(`📊 帖子总数（估算）: ${await posts.estimatedDocumentCount()}`);

  const docs = await scanMissing(posts);

  if (!apply) {
    console.log(`\n📊 DRY-RUN：将回填 ${docs.length} 条，未写入任何数据。确认后加 --apply 执行`);
    await mongoose.connection.close();
    return { total: docs.length, modified: 0, failedIds: [] };
  }

  const totalBatches = Math.ceil(docs.length / BATCH_SIZE);
  let modified = 0;
  let guarded = 0;
  const failedIds = [];
  const startedAt = Date.now();

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batchNo = i / BATCH_SIZE + 1;
    try {
      const r = await writeBatchWithRetry(posts, chunk, batchNo, totalBatches);
      modified += r.modified;
      guarded += r.guarded;
      const done = Math.min(i + BATCH_SIZE, docs.length);
      console.log(
        `   批 ${batchNo}/${totalBatches} 完成（累计 ${done}/${docs.length}，本批更新 ${r.modified}，并发守卫 ${r.guarded}，耗时 ${((Date.now() - startedAt) / 1000).toFixed(0)}s）`
      );
    } catch {
      chunk.forEach((d) => failedIds.push(String(d._id)));
    }
  }

  let failedFile = null;
  if (failedIds.length > 0) {
    failedFile = path.join(__dirname, `backfillContentLength.failed.${Date.now()}.txt`);
    fs.writeFileSync(failedFile, failedIds.join('\n') + '\n');
  }

  console.log(`\n🎉 回填结束（总耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s）`);
  console.log(`📊 待回填: ${docs.length} 条`);
  console.log(`📊 实际更新: ${modified} 条`);
  console.log(`📊 并发守卫跳过（爬虫已补写）: ${guarded} 条`);
  if (failedIds.length > 0) {
    console.log(`📊 失败: ${failedIds.length} 条，ID 清单: ${failedFile}`);
    console.log('   可直接重跑本脚本（幂等）补齐失败条目');
  }

  await mongoose.connection.close();
  return { total: docs.length, modified, guarded, failedIds };
}

const apply = process.argv.includes('--apply');

backfill(apply)
  .then((result) => process.exit(result.failedIds && result.failedIds.length > 0 ? 1 : 0))
  .catch((error) => {
    console.error('❌ 回填失败:', error);
    process.exit(1);
  });
