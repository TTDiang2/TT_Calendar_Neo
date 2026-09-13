import { fileURLToPath } from 'node:url'
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
  resolve: {
    alias: {
      // packages/db 经 drizzle-orm/better-sqlite3 静态引用 better-sqlite3
      // （Node 原生模块），不挡住就会被打进浏览器包并在模块求值阶段抛错 ——
      // 主包白屏（2026-09-13 真机事故）。实际数据库走 sql.js shim
      // （SqlJsSqlite），drizzle 只把它当泛型客户端，永远不构造原生 Client，
      // 一个构造即抛错的空壳足以让打包图变干净。仅影响 mobile 构建，Node
      // 侧（desktop 数据服务/测试）不受 alias 影响照用真模块。
      'better-sqlite3': fileURLToPath(new URL('./src/local/better-sqlite3-stub.ts', import.meta.url)),
    },
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
