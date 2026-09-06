import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 后端代理目标可通过环境变量覆盖（Docker 网络内为 http://backend:5000）
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 允许容器外访问（Docker 必需）
    port: 3000,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
    watch: {
      usePolling: !!process.env.VITE_USE_POLLING, // Docker/挂载卷下热更新需要轮询
    },
  },
  preview: {
    host: true,
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
