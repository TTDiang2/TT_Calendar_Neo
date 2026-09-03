import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Web 仅作开发预览：数据走本机 data-server（dev:server 起在 8766），
// 这里把 /api 代理到它，避免跨域。desktop/mobile 将来套壳复用之。
export default defineConfig({
  cacheDir: 'node_modules/.vite-neo',
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // 监听所有网卡，确保本机穿透客户端（回环或局域网地址）都能连上
    port: 5173,
    // 放行内网穿透域名：Vite 6 默认只认 localhost，外部域名会被 403 拒掉。
    // '.vicp.fun' 通配所有 vicp.fun 子域，域名换了新的也不用再改。
    allowedHosts: ['av12945vy5215.vicp.fun', '.vicp.fun'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8766',
        changeOrigin: true,
      },
    },
  },
})
