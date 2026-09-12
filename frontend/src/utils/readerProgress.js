// 阅读器进度本地持久化：按小说 id 存页码与阅读设置（字号/行距/主题）。
// 纯前端能力，localStorage 不可用时（隐私模式/SSR）静默降级为不记忆。
export const READER_PROGRESS_PREFIX = 'reader-progress';

export const getProgressKey = (novelId) => `${READER_PROGRESS_PREFIX}:${novelId}`;

// 读取并校验单本小说的进度；数据损坏/字段非法时返回 null
export function loadProgress(novelId) {
  if (!novelId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getProgressKey(novelId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const page = Number(data.page);
    if (!Number.isFinite(page) || page < 1) return null;
    return {
      page: Math.floor(page),
      fontSize: [12, 14, 16, 18, 20, 24, 28].includes(Number(data.fontSize))
        ? Number(data.fontSize)
        : null,
      lineHeight: [1.4, 1.6, 2].includes(Number(data.lineHeight))
        ? Number(data.lineHeight)
        : null,
      theme: data.theme === 'dark' || data.theme === 'light' ? data.theme : null,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : null,
    };
  } catch {
    return null;
  }
}

// 写入进度（与设置合并，调用方只传变更字段）
export function saveProgress(novelId, patch) {
  if (!novelId || typeof localStorage === 'undefined') return;
  try {
    const prev = loadProgress(novelId) || {};
    const next = {
      page: patch.page ?? prev.page ?? 1,
      fontSize: patch.fontSize ?? prev.fontSize ?? 16,
      lineHeight: patch.lineHeight ?? prev.lineHeight ?? 1.6,
      theme: patch.theme ?? prev.theme ?? 'light',
      updatedAt: Date.now(),
    };
    localStorage.setItem(getProgressKey(novelId), JSON.stringify(next));
  } catch {
    // 配额满/隐私模式：静默放弃持久化，不影响阅读
  }
}

export function clearProgress(novelId) {
  if (!novelId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getProgressKey(novelId));
  } catch {
    // ignore
  }
}
