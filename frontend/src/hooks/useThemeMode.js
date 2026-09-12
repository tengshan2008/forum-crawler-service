import { useState, useEffect, useCallback } from 'react';

// 全站亮/暗主题：localStorage 持久化用户选择；首次访问跟随系统 prefers-color-scheme。
// 切换时同步 <html data-theme="light|dark">，CSS 变量据此切换（见 index.css）。
const STORAGE_KEY = 'theme-mode';

const getSystemMode = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

const getInitialMode = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage 不可用时退回系统偏好
  }
  return getSystemMode();
};

export function useThemeMode() {
  const [mode, setMode] = useState(getInitialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // 忽略持久化失败（隐私模式等）
    }
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { mode, toggleMode };
}

export default useThemeMode;
