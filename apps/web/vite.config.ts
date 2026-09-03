import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Web 仅作开发预览：数据走本机 data-server（dev:server 起在 8766），
// 这里把 /api 代理到它，避免跨域。desktop/mobile 将来套壳复用之。
export default defineConfig({
  cacheDir: 'node_modules/.vite-neo',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8766',
        changeOrigin: true,
      },
    },
  },
})
