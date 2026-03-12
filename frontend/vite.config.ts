import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    // 构建分析工具 (仅生产环境启用)
    process.env.ANALYZE ? visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }) : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  optimizeDeps: {
    include: ['monaco-editor'],
  },
  build: {
    // 代码分割配置
    rollupOptions: {
      output: {
        manualChunks: {
          // Monaco Editor 单独打包 (大文件)
          'monaco': ['monaco-editor'],
          // Vue 核心库
          'vue-vendor': ['vue', 'pinia'],
          // Tauri API
          'tauri': ['@tauri-apps/api/core'],
        },
      },
    },
    // 生产环境配置
    minify: 'terser',
    terserOptions: {
      // @ts-ignore - terser compress options
      compress: {
        // 移除 console.log (生产环境)
        drop_console: true,
        drop_debugger: true,
      },
    },
    // 分块大小限制
    chunkSizeWarningLimit: 500,
  },
  // 开发环境优化
  server: {
    // 启用 HMR
    hmr: true,
  },
  // 预加载配置
  worker: {
    format: 'es',
  },
})
