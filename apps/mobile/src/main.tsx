import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query'
import '@tt-calendar/ui/index.css'
import { App, setBackend, createHttpBackend } from '@tt-calendar/ui'
import { ErrorBoundary } from '@tt-calendar/ui/components/ErrorBoundary'

// 移动端：数据由 Node sidecar 提供，端口 8769（避开 web 的 8766、桌面的 8767）。
//   开发模式：页面由 vite(5175) 提供，走相对路径经 vite 代理转发。
//   打包模式：页面从 tauri:// 加载，且真机上数据走原生 SQLite 桥（见下方说明）。
//   注意：生产移动端本应改用 tauri-plugin-sql / drizzle-sqlite-proxy 直接读手机本地库，
//   而非 HTTP sidecar（那是桌面/开发期的权宜方案）。此处先复用 HTTP 保证 dev 预览可跑，
//   原生存储桥留作下一阶段。
const API_BASE = import.meta.env.DEV ? '/api' : 'http://127.0.0.1:8769/api'

setBackend(createHttpBackend(API_BASE))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount) => failureCount < 3,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    },
  },
})

// sidecar 是随应用一起拉起的，启动要几秒。先等它就绪再渲染，否则一开就是满屏红字。
async function waitForDataServer(): Promise<boolean> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${API_BASE}/layers`)
      if (r.ok) return true
    } catch {
      // 还没起来，继续等
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

const root = document.getElementById('root')!
root.innerHTML =
  '<div class="flex h-screen items-center justify-center text-sm text-gray-500">正在启动数据服务…</div>'

waitForDataServer().then((ready) => {
  root.innerHTML = ''
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <QueryErrorResetBoundary>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </QueryErrorResetBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  )
  if (!ready) {
    console.warn('[mobile] 数据服务 30 秒内没就绪，界面可能没数据')
  }
})
