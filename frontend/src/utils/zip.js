// 零依赖 ZIP 打包器（STORE 模式，不做 deflate 压缩）。
// 用途：图片组一键下载——JPEG/PNG/WebP 本身已是压缩格式，再压缩几乎无收益，
// STORE 既省去 jszip 依赖，又避免压缩 CPU 开销。
// 格式参考 PKWARE APPNOTE：Local File Header + 文件数据 + Central Directory + EOCD。

// CRC32 查表（IEEE 多项式 0xEDB88320）
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP 历史遗留使用 DOS 时间/日期，固定取一个常量（2026-01-01 00:00:00）即可
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const utf8Bytes = (str) => new TextEncoder().encode(str);

function writeU16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * 文件名清洗：去路径分隔符与控制字符；空名/重名自动补序号与扩展名兜底。
 * @param {{name?: string, url?: string}} file
 * @param {Set<string>} usedNames 已占用名（用于去重）
 */
export function sanitizeFileName(name, usedNames, index = 0) {
  const raw = (name || '').split(/[/\\]/).pop() || `file_${index + 1}`;
  // 仅去除跨平台文件名字符与控制字符（空格、中文、括号等保留，ZIP 文件名支持 UTF-8）
  let base = raw.replace(/[<>:"|?*\x00-\x1f]+/g, '_').trim();
  if (!base) base = `file_${index + 1}`;

  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    const dot = base.lastIndexOf('.');
    if (dot > 0) {
      candidate = `${base.slice(0, dot)}_${suffix}${base.slice(dot)}`;
    } else {
      candidate = `${base}_${suffix}`;
    }
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * 将多个文件打包为 ZIP Blob。
 * @param {Array<{name: string, data: Uint8Array|ArrayBuffer}>} files
 * @returns {Promise<Blob>}
 */
export async function createZipBlob(files) {
  const usedNames = new Set();
  const entries = files.map((file, index) => {
    const data = file.data instanceof ArrayBuffer ? new Uint8Array(file.data) : file.data;
    const name = sanitizeFileName(file.name, usedNames, index);
    return { name, nameBytes: utf8Bytes(name), data: new Uint8Array(data), crc: crc32(data) };
  });

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const { nameBytes, data } = entry;
    // ---- Local file header（30 字节定长 + 文件名）----
    const local = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(local);
    writeU32(lv, 0, 0x04034b50); // 签名
    writeU16(lv, 4, 20); // 解压所需版本 2.0
    writeU16(lv, 6, 0x0800); // 标志位：bit 11 = 文件名/注释为 UTF-8
    writeU16(lv, 8, 0); // 压缩方式 0 = STORE
    writeU16(lv, 10, DOS_TIME);
    writeU16(lv, 12, DOS_DATE);
    writeU32(lv, 14, entry.crc);
    writeU32(lv, 18, data.length); // 压缩后大小
    writeU32(lv, 22, data.length); // 原始大小
    writeU16(lv, 26, nameBytes.length);
    writeU16(lv, 28, 0); // extra 长度
    new Uint8Array(local).set(nameBytes, 30);
    localParts.push(new Uint8Array(local), data);

    // ---- Central directory header（46 字节定长 + 文件名）----
    const central = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(central);
    writeU32(cv, 0, 0x02014b50);
    writeU16(cv, 4, 20); // 制作版本
    writeU16(cv, 6, 20); // 解压所需版本
    writeU16(cv, 8, 0x0800);
    writeU16(cv, 10, 0);
    writeU16(cv, 12, DOS_TIME);
    writeU16(cv, 14, DOS_DATE);
    writeU32(cv, 16, entry.crc);
    writeU32(cv, 20, data.length);
    writeU32(cv, 24, data.length);
    writeU16(cv, 28, nameBytes.length);
    writeU16(cv, 30, 0); // extra
    writeU16(cv, 32, 0); // comment
    writeU16(cv, 34, 0); // 磁盘号
    writeU16(cv, 36, 0); // 内部属性
    writeU32(cv, 38, 0); // 外部属性
    writeU32(cv, 42, offset); // 本文件 local header 起始偏移
    new Uint8Array(central).set(nameBytes, 46);
    centralParts.push(new Uint8Array(central));

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);

  // ---- End of central directory record（22 字节）----
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  writeU32(ev, 0, 0x06054b50);
  writeU16(ev, 4, 0);
  writeU16(ev, 6, 0);
  writeU16(ev, 8, entries.length);
  writeU16(ev, 10, entries.length);
  writeU32(ev, 12, centralSize);
  writeU32(ev, 16, offset);
  writeU16(ev, 20, 0);

  return new Blob([...localParts, ...centralParts, new Uint8Array(eocd)], {
    type: 'application/zip',
  });
}
