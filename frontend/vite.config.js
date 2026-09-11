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
        // SSE（/api/tasks/:id/events）为长连接：关闭代理层超时，
        // 依赖后端 15s 心跳保活；http-proxy 默认流式转发不缓冲，无需额外配置。
        // 普通 REST 请求不受影响（正常响应后连接即释放）
        timeout: 0,
        proxyTimeout: 0,
      },
      // 爬虫下载的图片由后端 express.static 挂在 /public 下提供（与 /api 同源），
      // 开发环境同样需要代理，否则浏览器直连 Vite 会 404 导致内容浏览页全部裂图
      '/public': {
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
