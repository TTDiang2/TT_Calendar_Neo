import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 桌面端（Tauri 2）前端。
// 端口刻意与 web 预览错开：这里是 5174 / 8767，web 是 5173 / 8766，
// 两者可以同时开着互不影响。
// 开发时 Tauri 的 devUrl 指向本 vite；打包后由 tauri 加载 dist 静态产物。
export default defineConfig({
  cacheDir: 'node_modules/.vite-neo',
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8767',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Tauri 打包时读取这个目录
    outDir: 'dist',
    emptyOutDir: true,
  },
})
