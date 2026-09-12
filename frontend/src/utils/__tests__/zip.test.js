import { describe, it, expect } from 'vitest';
import { crc32, createZipBlob, sanitizeFileName } from '../zip';

// jsdom 的 Blob 不带 arrayBuffer()，用 FileReader 读
function blobToBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

// STORE zip 解析器（测试专用）：按偏移读回 EOCD/中央目录/local header，
// 校验我们写出的包结构与内容自洽
async function parseZip(blob) {
  const bytes = await blobToBuffer(blob);
  const dv = new DataView(bytes.buffer);
  const u16 = (o) => dv.getUint16(o, true);
  const u32 = (o) => dv.getUint32(o, true);

  // EOCD 签名从尾部 22 字节内查找
  let eocdOffset = bytes.length - 22;
  expect(u32(eocdOffset)).toBe(0x06054b50);
  const count = u16(eocdOffset + 10);
  const centralOffset = u32(eocdOffset + 16);

  const files = [];
  let p = centralOffset;
  for (let i = 0; i < count; i += 1) {
    expect(u32(p)).toBe(0x02014b50);
    const compSize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const localOffset = u32(p + 42);
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // 读 local header 定位数据
    expect(u32(localOffset)).toBe(0x04034b50);
    const localNameLen = u16(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLen;
    const content = bytes.slice(dataStart, dataStart + compSize);
    files.push({ name, content });
  }
  return files;
}

describe('zip 工具', () => {
  it('crc32 对标准向量 "123456789" 输出 0xCBF43926', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  it('空文件名/重名自动兜底与去重', () => {
    const used = new Set();
    expect(sanitizeFileName('', used, 0)).toBe('file_1');
    expect(sanitizeFileName('a.jpg', used)).toBe('a.jpg');
    expect(sanitizeFileName('a.jpg', used)).toBe('a_1.jpg');
    expect(sanitizeFileName('path/to/x.png', used)).toBe('x.png');
  });

  it('STORE zip 可被解析且内容原样往返（含中文文件名）', async () => {
    const hello = new TextEncoder().encode('hello zip');
    const pngLike = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0xff]);
    const blob = await createZipBlob([
      { name: 'a.txt', data: hello },
      { name: '截图 01.png', data: pngLike },
    ]);

    expect(blob.type).toBe('application/zip');
    const files = await parseZip(blob);
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe('a.txt');
    expect(new TextDecoder().decode(files[0].content)).toBe('hello zip');
    expect(files[1].name).toBe('截图 01.png');
    expect(Array.from(files[1].content)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0xff]);
  });
});
