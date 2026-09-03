import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query'
import '@tt-calendar/ui/index.css'
import { App, setBackend, createHttpBackend } from '@tt-calendar/ui'
import { ErrorBoundary } from '@tt-calendar/ui/components/ErrorBoundary'

// 移动端：数据由 Node 数据服务提供。
//   开发模式：页面由 vite(5175) 提供，走相对路径经 vite 代理转发到本机 8769。
//   生产模式（真机/模拟器 App）：127.0.0.1 在手机上指向手机自己，必须指向
//   电脑的可达地址。默认走内网穿透域名（与 web 8766 同一 SQLite 库）；
//   穿透域名变了或想换地址时，用环境变量 VITE_API_BASE 覆盖：
//     cross-env VITE_API_BASE=http://新域名/api pnpm --filter @tt-calendar/mobile build
const API_BASE = import.meta.env.DEV
  ? '/api'
  : ((import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://av12945vy5215.vicp.fun/api')

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
