import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query'
import '@tt-calendar/ui/index.css'
import { App, setBackend, createHttpBackend } from '@tt-calendar/ui'
import { ErrorBoundary } from '@tt-calendar/ui/components/ErrorBoundary'
import { createLocalBackend } from './local/backend'
import { bootLog, bootLogSettle } from './boot-log'

// 启动期兜底诊断：任何未捕获 rejection / 脚本错误都必须留痕上屏，
// 否则真机上就是一张没有线索的白屏（2026-09-13 卡点排查教训）
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { stack?: string; message?: string } | null
  bootLog('未捕获 rejection:', (r && (r.stack || r.message)) || String(e.reason))
})
window.addEventListener('error', (e) => {
  bootLog('脚本错误:', e.message, `@${e.filename}:${e.lineno}:${e.colno}`)
})

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

/** 异形错误（DOMException 等 WebKit 常抛的对象可能不是 Error 实例）也要保住 name/message/stack */
function renderErr(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) {
    return { message: `${err.name}: ${err.message}`, stack: err.stack ?? '' }
  }
  const e = err as { name?: string; message?: string; stack?: string } | null
  if (e && typeof e === 'object') {
    return { message: `${e.name ?? typeof err}: ${e.message ?? String(err)}`, stack: e.stack ?? '' }
  }
  return { message: String(err), stack: '' }
}

/** IndexedDB 实际可写性探针（部分 WebView「能 open 不能写」，只看 typeof 不够） */
function idbWriteProbe(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean): void => {
      if (!settled) {
        settled = true
        void indexedDB.deleteDatabase('__probe__')
        resolve(v)
      }
    }
    setTimeout(() => done(false), 3000)
    try {
      const req = indexedDB.open('__probe__', 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('kv')
      }
      req.onerror = () => done(false)
      req.onsuccess = () => {
        const db = req.result
        let tx: IDBTransaction
        try {
          tx = db.transaction('kv', 'readwrite')
        } catch {
          db.close()
          done(false)
          return
        }
        try {
          tx.objectStore('kv').put('1', 'probe')
        } catch {
          db.close()
          done(false)
          return
        }
        tx.oncomplete = () => {
          db.close()
          done(true)
        }
        tx.onerror = () => {
          db.close()
          done(false)
        }
        tx.onabort = () => {
          db.close()
          done(false)
        }
      }
    } catch {
      done(false)
    }
  })
}

/** 环境探针：真机报错截图一次带齐所有未知运行时项（tauri:// 的安全上下文/IDB 状态） */
async function probeEnvironment(): Promise<string> {
  const checks: [string, string][] = [
    ['href', location.href],
    ['isSecureContext', String(globalThis.isSecureContext)],
    ['crypto.randomUUID', typeof globalThis.crypto?.randomUUID],
    ['Worker', typeof Worker],
    ['indexedDB', typeof indexedDB],
  ]
  checks.push(['idb write', (await idbWriteProbe()) ? 'ok' : 'FAIL'])
  return checks.map(([k, v]) => `${k}: ${v}`).join('\n')
}

async function boot(): Promise<void> {
  try {
    await bootInner()
  } catch (err) {
    // 本地库起不来（worker / wasm / IndexedDB 失败）时必须把错误画出来，
    // 否则真机上就是一张永远停在启动文案的"白屏"，无从排查。
    // 动态内容一律 textContent，避免把错误文本当 HTML 注进去。
    console.error('[mobile] 启动失败', err)
    const { message, stack } = renderErr(err)
    let env = ''
    try {
      env = await probeEnvironment()
    } catch {
      env = 'probe: failed'
    }
    const box = document.createElement('div')
    box.className = 'flex h-screen flex-col items-center justify-center gap-3 p-6 text-center'
    const title = document.createElement('div')
    title.className = 'text-sm font-medium text-red-600'
    title.textContent = '启动失败，请截图反馈'
    const messageEl = document.createElement('div')
    messageEl.className = 'max-w-full text-xs text-red-500'
    messageEl.textContent = message
    const pre = document.createElement('pre')
    pre.className = 'max-w-full overflow-auto whitespace-pre-wrap text-left text-xs leading-5 text-gray-500'
    pre.textContent = stack
    const envEl = document.createElement('pre')
    envEl.className = 'max-w-full overflow-auto whitespace-pre-wrap text-left text-xs leading-5 text-gray-400'
    envEl.textContent = env
    box.append(title, messageEl, pre, envEl)
    root.innerHTML = ''
    root.append(box)
  }
}

async function bootInner(): Promise<void> {
  let ready = true
  if (HTTP_BASE) {
    setBackend(createHttpBackend(HTTP_BASE))
    ready = await waitForDataServer(HTTP_BASE)
  } else {
    root.innerHTML =
      '<div class="flex h-screen items-center justify-center text-sm text-gray-500">正在打开本地数据库…</div>'
    bootLog('awaiting createLocalBackend')
    try {
      setBackend(
        await createLocalBackend({
          // 启动自动同步（auto_on_start）完成后，让 react-query 重新拉取最新数据
          onSynced: () => void queryClient.invalidateQueries(),
        }),
      )
    } catch (err) {
      bootLog(' createLocalBackend THREW:', err instanceof Error ? err.stack : String(err))
      throw err
    }
    bootLog('createLocalBackend resolved')
  }
  root.innerHTML = ''
  bootLog('root cleared; React render start')
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
  bootLog('React render scheduled')
  // 启动已走完关键路径：撤销 bootlog 看门狗（卡死自动显形不再触发）
  bootLogSettle()
  if (!ready) {
    console.warn('[mobile] 数据服务 30 秒内没就绪，界面可能没数据')
  }
}

void boot()
