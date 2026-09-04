import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query'
import '@tt-calendar/ui/index.css'
import { App, setBackend, createHttpBackend } from '@tt-calendar/ui'
import { ErrorBoundary } from '@tt-calendar/ui/components/ErrorBoundary'
import { createLocalBackend } from './local/backend'

/**
 * 数据后端选择（数据全本地的落地）：
 *   1. VITE_API_BASE 显式指定 → HTTP 连电脑数据服务（穿透/局域网，旧模式）
 *   2. 开发模式（vite 5175）→ 默认走相对路径 /api 经代理连本机 8769，便于
 *      用电脑上的真实数据调试界面
 *   3. 生产 App（真机/模拟器）→ 默认手机本地库：Worker 里的 sql.js(WASM)
 *      SQLite + IndexedDB 快照，离线可用、不依赖电脑在线
 */
const HTTP_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.DEV ? '/api' : undefined)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount) => failureCount < 3,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    },
  },
})

/** sidecar 模式下数据服务要几秒才就绪；先等再渲染，避免一开就是满屏红字 */
async function waitForDataServer(base: string): Promise<boolean> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/layers`)
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

async function boot(): Promise<void> {
  let ready = true
  if (HTTP_BASE) {
    setBackend(createHttpBackend(HTTP_BASE))
    ready = await waitForDataServer(HTTP_BASE)
  } else {
    root.innerHTML =
      '<div class="flex h-screen items-center justify-center text-sm text-gray-500">正在打开本地数据库…</div>'
    setBackend(
      await createLocalBackend({
        // 启动自动同步（auto_on_start）完成后，让 react-query 重新拉取最新数据
        onSynced: () => void queryClient.invalidateQueries(),
      }),
    )
  }
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
}

void boot()
