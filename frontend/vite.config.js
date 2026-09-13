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
  build: {
    // 分包后首屏主 chunk 远低于 500KB；antd 整库 chunk 单独缓存，阈值按其实际体积放宽
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 函数形式：对象形式无法命中 react-dom/client、@rc-component 等子路径，
        // 曾导致 react-dom 被打进 antd chunk
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // React 运行时（含 react-dom/client、scheduler）与路由
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('react-router')
          ) {
            return 'react-vendor';
          }
          // 图标库体量大且独立迭代，单独成包
          if (id.includes('@ant-design/icons')) return 'antd-icons';
          // antd 组件库本体、rc-* 底层组件、dayjs（保持单实例）
          if (
            id.includes('/antd/') ||
            id.includes('/@rc-component/') ||
            id.includes('/rc-') ||
            id.includes('/dayjs/')
          ) {
            return 'antd';
          }
          // 其余 node_modules（如 @antv 图表库）不主动归组：
          // 仅 AdminDashboard 懒加载页面引用，Rollup 会自然收入该路由 chunk
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
