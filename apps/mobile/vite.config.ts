import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 移动端（Tauri 2 · Android/iOS）前端。
// 端口刻意错开：这里 5175 / 8769，web 是 5173 / 8766，desktop 是 5174 / 8767，
// 三者可以同时开着互不影响。开发时 Tauri devUrl 指向本 vite。
export default defineConfig({
  cacheDir: 'node_modules/.vite-neo',
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // 内联 worker（db.worker?worker&inline）配 iife：blob URL + module worker 在
  // WKWebView 上不可靠，iife 构建的 blob worker 兼容性最好
  worker: {
    format: 'iife',
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8769',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
