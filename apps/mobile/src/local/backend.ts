/**
 * 手机本地后端（主线程侧）。
 *
 * createLocalBackend() 把 BackendAdapter 的全部本地数据方法转发给 LocalDbCore
 * （SqliteBackend + SyncFacade，见 db-core.ts），优先跑在 Worker（db.worker.ts，
 * 主线程取脚本文本建 blob，不经 tauri:// 加载脚本），Worker 不可用时整体回退
 * 到主线程。网络类能力（GitHub 同步、订阅刷新、集思录导入）在 LocalDbCore 里
 * 真实实现，只有依赖电脑端数据服务的路由给出「去电脑端操作」占位语义。
 *
 * 离线可用性：数据从 IndexedDB 快照加载，所有读写本地完成，不需要电脑在线。
 * 数据落盘 = 写操作防抖快照 + 页面隐藏时强制 flush。
 *
 * 为什么 worker 脚本要 fetch 成 blob、wasm 要主线程取二进制再传入：WKWebView
 * 的 tauri:// 自定义协议对「构造 Worker / Worker 内发请求」不可靠（2026-09-13
 * 真机实测启动即败），而主线程 fetch 资源是可靠的。Worker 彻底起不来时回退
 * 主线程，牺牲一点流畅度换可用性。
 */

import type { BackendAdapter } from '@tt-calendar/ui'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { bootLog } from '../boot-log'
import workerUrl from './db.worker?worker&url'
import { LocalDbCore } from './db-core'

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
  /** 后台自动同步完成（auto_on_start）后回调，用于刷新 UI 缓存 */
  onSynced?: (report: unknown) => void
}

export class LocalBackendInitError extends Error {
  constructor(message: string) {
    super(`本地数据库初始化失败：${message}`)
    this.name = 'LocalBackendInitError'
  }
}

/** 主线程 fetch 是 tauri:// 环境里唯一可靠的网络路径，wasm 在这里取成二进制 */
async function fetchWasmBinary(): Promise<ArrayBuffer> {
  const resp = await fetch(wasmUrl)
  if (!resp.ok) throw new Error(`加载 sql-wasm 失败：HTTP ${resp.status}（${wasmUrl}）`)
  return resp.arrayBuffer()
}

/** 统一的后端代理：method 转发 + 手机端别名（/countdown 的 HTTP 形态是 { text }） */
function makeBackend(call: (method: string, args: unknown[]) => Promise<unknown>): BackendAdapter {
  const overrides: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    getCountdown: () => call('getCountdownText', []),
  }
  return new Proxy(
    {},
    {
      get(_target, prop) {
        // Symbol.*（toStringTag 等）与 then/catch/finally 绝不能伪装成可调用
        // 方法：await proxy 会读 proxy.then 并把 resolve/reject 当参数发起
        // RPC，原生函数过不了 structured clone（DataCloneError），await 从此
        // 永远挂起（2026-09-13 真机/Chromium 双双卡死「正在打开本地数据库」的根因）。
        if (typeof prop !== 'string') return undefined
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined
        // hasOwnProperty.call（不是 Object.hasOwn：那要 Safari 15.4+）：
        // constructor/toString/valueOf 这类原型链名字不能兜住并返回原生函数
        // （与 worker 侧 methodTable 的 null 原型同一防线）
        if (Object.prototype.hasOwnProperty.call(overrides, prop)) return overrides[prop]
        return (...args: unknown[]) => call(prop, args)
      },
    },
  ) as unknown as BackendAdapter
}

function registerFlush(flush: () => void): void {
  // 页面隐藏/关闭时强制落盘（自动防抖之外的兜底，防 iOS 直接杀进程）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}

/** Worker 正常路径：主线程取脚本建 blob worker + RPC（装配在 db.worker.ts/db-core.ts） */
async function createWorkerBackend(
  wasmBinary: ArrayBuffer,
  opts: LocalBackendOptions,
): Promise<BackendAdapter> {
  // 不用 Vite 的 ?worker&inline：它的模板在创建后立即 revoke blob URL，在
  // WebKit 上有已知兼容问题（vitejs/vite#20460，7.1 才修）；也不直接用
  // tauri:// URL 构造 Worker（真机实测失败）。生产：主线程 fetch 脚本文本
  // （可靠路径）自己建 blob，且不 revoke——几百 KB 的常驻换取确定性。
  // dev：vite 的 ?worker&url 产出带 import 的 ES module，喂给 classic blob
  // worker 必然语法错误（永远测不到 worker 路径）；dev 走 http 无 tauri://
  // 限制，直接 module worker 即可（智者 P1-10）。
  let worker: Worker
  if (import.meta.env.DEV) {
    worker = new Worker(workerUrl, { type: 'module' })
    bootLog('dev module worker created')
  } else {
    bootLog('fetch worker script')
    const resp = await fetch(workerUrl)
    if (!resp.ok) throw new LocalBackendInitError(`加载 worker 脚本失败：HTTP ${resp.status}`)
    const source = await resp.text()
    bootLog('worker script', source.length, 'bytes; create blob worker')
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    worker = new Worker(blobUrl)
    bootLog('worker created')
  }

  const pending = new Map<number, Pending>()
  let seq = 0
  let initError: Error | null = null
  let rejectHandshake: ((e: Error) => void) | null = null

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
    // worker 脚本级失败要立刻打断握手，否则用户要干等 15 秒超时
    rejectHandshake?.(initError)
    rejectHandshake = null
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
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new LocalBackendInitError('15 秒内未就绪')), 15_000)
      const onReady = (e: MessageEvent): void => {
        const msg = e.data as WorkerMsg
        if (msg.type === 'ready') {
          bootLog('worker ready')
          cleanup()
          resolve()
        } else if (msg.type === 'init-error') {
          cleanup()
          reject(new LocalBackendInitError(String(msg.message ?? '未知错误')))
        }
      }
      const cleanup = (): void => {
        clearTimeout(timer)
        rejectHandshake = null
        worker.removeEventListener('message', onReady)
      }
      rejectHandshake = reject
      worker.addEventListener('message', onReady)
      bootLog('send init to worker')
      worker.postMessage({ type: 'init', wasmBinary })
    })
  } catch (err) {
    bootLog('handshake failed:', String(err))
    worker.terminate()
    throw err
  }

  bootLog('handshake ok; registerFlush + makeBackend')
  const call = (method: string, args: unknown[]): Promise<unknown> => {
    if (initError) return Promise.reject(initError)
    return rawCall<unknown>({ type: 'call', method, args })
  }

  registerFlush(() => worker.postMessage({ type: 'flush' }))
  const backend = makeBackend(call)
  bootLog('createWorkerBackend done')
  return backend
}

/** 主线程回退：同一份 LocalDbCore 直接跑在主线程，行为与 Worker 路径一致 */
async function createMainThreadBackend(
  wasmBinary: ArrayBuffer,
  opts: LocalBackendOptions,
): Promise<BackendAdapter> {
  bootLog('main-thread fallback init start')
  const core = new LocalDbCore((report) => opts.onSynced?.(report))
  try {
    await core.init({ wasmBinary })
  } catch (err) {
    throw new LocalBackendInitError(err instanceof Error ? err.message : String(err))
  }
  bootLog('main-thread core init done')
  core.autoSyncOnStart()
  registerFlush(() => void core.flush())
  return makeBackend((method, args) => core.call(method, args))
}

/** 创建本地数据后端；数据库装配完成（快照读入内存）后才 resolve */
export async function createLocalBackend(opts: LocalBackendOptions = {}): Promise<BackendAdapter> {
  let wasmBinary: ArrayBuffer
  try {
    wasmBinary = await fetchWasmBinary()
  } catch (err) {
    throw new LocalBackendInitError(err instanceof Error ? err.message : String(err))
  }

  try {
    return await createWorkerBackend(wasmBinary, opts)
  } catch (err) {
    console.warn('[local] Worker 不可用，回退主线程运行本地库：', err)
    return await createMainThreadBackend(wasmBinary, opts)
  }
}
