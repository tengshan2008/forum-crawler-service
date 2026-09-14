/**
 * 回填脚本：为存量 crazyhome 帖子补算 series / chapterNo，并修正站点标签
 *
 * 背景：方案 B 在 Post schema 新增 series（系列名）与 chapterNo（章节号）字段，
 * 爬虫对新帖已正确写入，但此前入库的 crazyhome 帖子缺少这两个字段，浏览层
 * 无法按系列聚合，一本小说仍散落在几十条列表中。
 *
 * 回填口径与爬虫 parse_crazyhome_post 完全一致：
 *   标题形如 "超萌机娘大奸淫 16" 或 "师尊的禁脔 38-51"
 *   - chapterNo = 末尾首个数字（"38-51" 取 38）
 *   - series = 末尾 space+digits 之前的部分；无匹配时 series = 原标题
 * 站点识别：sourceUrl 含 "crazyhome2000.com"（旧帖 tags 仍为 t66y，不可靠）
 *
 * 同时修正站点标签：旧帖 tags 含 "t66y"，应替换为 "crazyhome"。
 *
 * 安全与健壮性：
 * - 幂等：只处理 series 缺失或为 null 的文档，可重复执行
 * - 并发安全：每条 updateOne 带「series 仍缺」守卫，不覆盖重爬已写的值
 * - 两阶段：先扫描收集到内存，再分批 bulkWrite，避免游标超时
 * - 失败重试：单批指数退避；失败批次 _id 落盘，重跑补齐
 *
 * 用法:
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/backfillCrazyhomeSeries.js --dry-run
 *   cd backend && MONGODB_URI='mongodb://...' node scripts/backfillCrazyhomeSeries.js --apply
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 6;

// 标题末尾章节号：匹配 " 16" 或 " 38-51"，取首个数字
const CHAPTER_RE = /\s+(\d{1,4})(?:-\d{1,4})?\s*$/;
const CRAZYHOME_URL = 'crazyhome2000.com';

const MISSING_SERIES = {
  $or: [{ series: { $exists: false } }, { series: null }],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 与 crawl.py parse_crazyhome_post 一致的标题解析
 */
function parseTitle(title) {
  const m = title.match(CHAPTER_RE);
  if (m) {
    return {
      series: title.slice(0, m.index).trim(),
      chapterNo: parseInt(m[1], 10),
    };
  }
  return { series: title, chapterNo: null };
}

async function scanCrazyhome(posts) {
  console.log(`🔍 扫描来源含 "${CRAZYHOME_URL}" 且 series 缺失的帖子...`);
  const startedAt = Date.now();

  const cursor = posts
    .find({
      sourceUrl: { $regex: CRAZYHOME_URL.replace(/\./g, '\\.') },
      ...MISSING_SERIES,
    })
    .project({ _id: 1, title: 1, tags: 1 })
    .batchSize(1000);

  const docs = [];
  for await (const doc of cursor) {
    const { series, chapterNo } = parseTitle(doc.title || '');
    docs.push({ _id: doc._id, title: doc.title, series, chapterNo, tags: doc.tags });
  }

  // 统计解析分布
  const withChapter = docs.filter((d) => d.chapterNo !== null).length;
  console.log(
    `✓ 扫描完成：${docs.length} 条待回填（其中 ${withChapter} 条解析出章节号，${docs.length - withChapter} 条无章节号）` +
    `（耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s）`
  );
  return docs;
}

async function writeBatchWithRetry(posts, chunk, batchNo, totalBatches) {
  const ops = chunk.map(({ _id, series, chapterNo, tags }) => {
    // 修正站点标签：移除 t66y，加入 crazyhome（保留其他标签）
    const newTags = Array.isArray(tags)
      ? [...tags.filter((t) => t !== 't66y'), 'crazyhome']
      : ['crazyhome'];

    const update = { $set: { series, tags: newTags } };
    if (chapterNo !== null) {
      update.$set.chapterNo = chapterNo;
    } else {
      // 无章节号的帖子：确保不残留旧 chapterNo（理论上旧帖没有，保险起见）
      update.$unset = { chapterNo: '' };
    }

    return {
      updateOne: {
        filter: { _id, ...MISSING_SERIES },
        update,
      },
    };
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await posts.bulkWrite(ops, { ordered: false });
      return { modified: result.modifiedCount, guarded: ops.length - result.modifiedCount };
    } catch (error) {
      const waitMs = Math.min(5000 * 2 ** (attempt - 1), 60000);
      if (attempt < MAX_ATTEMPTS) {
        console.log(
          `   ⚠ 批 ${batchNo}/${totalBatches} 第 ${attempt} 次失败：${error.message}；${waitMs / 1000}s 后重试`
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
    socketTimeoutMS: 600000,
    maxPoolSize: 5,
  });

  console.log(`📚 已连接到 MongoDB（${apply ? 'APPLY 写入模式' : 'DRY-RUN 演练模式'}）`);
  const posts = mongoose.connection.db.collection('posts');
  console.log(`📊 帖子总数（估算）: ${await posts.estimatedDocumentCount()}`);

  const docs = await scanCrazyhome(posts);

  if (docs.length === 0) {
    console.log('🎉 无需回填，所有 crazyhome 帖子已含 series 字段');
    await mongoose.connection.close();
    return { total: 0, modified: 0, failedIds: [] };
  }

  // 打印前 5 条解析样例供人工核对
  console.log('\n📋 解析样例（前 5 条）:');
  docs.slice(0, 5).forEach((d) => {
    console.log(
      `   title="${d.title}" → series="${d.series}", chapterNo=${d.chapterNo}`
    );
  });

  if (!apply) {
    console.log(`\n📊 DRY-RUN：将回填 ${docs.length} 条，未写入数据。确认后加 --apply 执行`);
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
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    try {
      const r = await writeBatchWithRetry(posts, chunk, batchNo, totalBatches);
      modified += r.modified;
      guarded += r.guarded;
      const done = Math.min(i + BATCH_SIZE, docs.length);
      console.log(
        `   批 ${batchNo}/${totalBatches} 完成（累计 ${done}/${docs.length}，本批更新 ${r.modified}，守卫 ${r.guarded}，耗时 ${((Date.now() - startedAt) / 1000).toFixed(0)}s）`
      );
    } catch {
      chunk.forEach((d) => failedIds.push(String(d._id)));
    }
  }

  let failedFile = null;
  if (failedIds.length > 0) {
    failedFile = path.join(__dirname, `backfillCrazyhomeSeries.failed.${Date.now()}.txt`);
    fs.writeFileSync(failedFile, failedIds.join('\n') + '\n');
  }

  console.log(`\n🎉 回填结束（总耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s）`);
  console.log(`📊 待回填: ${docs.length} 条`);
  console.log(`📊 实际更新: ${modified} 条`);
  console.log(`📊 并发守卫跳过（重爬已补写）: ${guarded} 条`);
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
