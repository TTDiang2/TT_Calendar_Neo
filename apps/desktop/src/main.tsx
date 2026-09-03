import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query'
import '@tt-calendar/ui/index.css'
import { App, setBackend, createHttpBackend } from '@tt-calendar/ui'
import { ErrorBoundary } from '@tt-calendar/ui/components/ErrorBoundary'

// 桌面端：数据由 Node sidecar 提供，端口 8767（刻意避开 web 预览的 8766）。
//   开发模式：页面由 vite(5174) 提供，走相对路径经 vite 代理转发。
//   打包模式：页面从 tauri:// 加载，必须写绝对地址。
const API_BASE = import.meta.env.DEV ? '/api' : 'http://127.0.0.1:8767/api'

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

// sidecar 是随应用一起拉起的，启动要几秒。
// 先等它就绪再渲染，否则一开窗口就是满屏红字。
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
    console.warn('[desktop] 数据服务 30 秒内没就绪，界面可能没数据')
  }
})
