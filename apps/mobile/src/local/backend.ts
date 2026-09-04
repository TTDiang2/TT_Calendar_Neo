/**
 * 手机本地后端（主线程侧）。
 *
 * createLocalBackend() 起一个 db.worker.ts，把 BackendAdapter 的全部本地数据
 * 方法转发进 Worker 里的 SqliteBackend；网络类能力（GitHub 同步、订阅刷新、
 * 集思录导入）手机端暂时没有可靠通路，给出明确的「去电脑端操作」占位语义，
 * 与 Node 数据服务对这些路由的 501 占位保持一致。
 *
 * 离线可用性：Worker 从 IndexedDB 加载 SQLite 快照，所有读写在手机本地完成，
 * 不需要电脑在线。数据落盘 = 写操作防抖快照 + 页面隐藏时强制 flush。
 */

import type { BackendAdapter } from '@tt-calendar/ui'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

interface WorkerMsg {
  type: 'ready' | 'init-error' | 'result' | 'synced'
  id?: number
  ok?: boolean
  result?: unknown
  error?: unknown
  message?: string
  report?: unknown
}

export interface LocalBackendOptions {
  /** 后台自动同步完成（Worker 的 auto_on_start）后回调，用于刷新 UI 缓存 */
  onSynced?: (report: unknown) => void
}

export class LocalBackendInitError extends Error {
  constructor(message: string) {
    super(`本地数据库初始化失败：${message}`)
    this.name = 'LocalBackendInitError'
  }
}

/** 创建本地数据后端；worker 加载完成（快照读入内存）后才 resolve */
export async function createLocalBackend(opts: LocalBackendOptions = {}): Promise<BackendAdapter> {
  const worker = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' })

  const pending = new Map<number, Pending>()
  let seq = 0
  let initError: Error | null = null

  worker.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as WorkerMsg
    if (msg.type === 'synced') {
      opts.onSynced?.(msg.report)
      return
    }
    if (msg.type === 'result' && typeof msg.id === 'number') {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.result)
      else p.reject(new Error(String(msg.error ?? '本地数据操作失败')))
    }
  })

  worker.addEventListener('error', (e: ErrorEvent) => {
    initError = new LocalBackendInitError(e.message || 'worker 崩溃')
    for (const p of pending.values()) p.reject(initError)
    pending.clear()
  })

  const rawCall = <T>(msg: Record<string, unknown>): Promise<T> =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      worker.postMessage({ ...msg, id })
    })

  // 等 init 握手（快照可能几 MB，给足时间）
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LocalBackendInitError('15 秒内未就绪')), 15_000)
    const onReady = (e: MessageEvent): void => {
      const msg = e.data as WorkerMsg
      if (msg.type === 'ready') {
        cleanup()
        resolve()
      } else if (msg.type === 'init-error') {
        cleanup()
        reject(new LocalBackendInitError(String(msg.message ?? '未知错误')))
      }
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      worker.removeEventListener('message', onReady)
    }
    worker.addEventListener('message', onReady)
    worker.postMessage({ type: 'init' })
  })

  const call = <T>(method: string, args: unknown[]): Promise<T> => {
    if (initError) return Promise.reject(initError)
    return rawCall<T>({ type: 'call', method, args })
  }

  // ----- 网络类能力的手机端占位（与数据服务 501 语义一致） -----
  const notSupported =
    (what: string) =>
    async (): Promise<never> => {
      throw new Error(`${what}需要在电脑端操作（手机本地版暂不支持）`)
    }

  const overrides: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    // /countdown 的 HTTP 形态是 { text }，对应 SqliteBackend.getCountdownText
    getCountdown: () => call('getCountdownText', []),
    // 多端同步（getSyncStatus/getSyncConfig/saveSyncConfig/testSync/syncNow/
    // resolveSync）、集思录导入、订阅刷新、待办 CSV 导入均已由 Worker 真实
    // 实现，直接透传
  }

  const backend = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined
        const o = overrides[prop]
        if (o) return o
        return (...args: unknown[]) => call<unknown>(prop, args)
      },
    },
  ) as unknown as BackendAdapter

  // 页面隐藏/关闭时强制落盘（自动防抖之外的兜底，防 iOS 直接杀进程）
  const flush = (): void => {
    worker.postMessage({ type: 'flush' })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)

  return backend
}
