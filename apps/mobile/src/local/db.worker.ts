/**
 * 本地数据 Worker：在 WebView 的独立线程里装配「sql.js(WASM) + drizzle +
 * SqliteBackend」，用 RPC 消息向主线程提供与 HttpBackendAdapter 等价的数据面。
 *
 * 为什么放 Worker：
 *   - sql.js 是纯内存同步库，视图聚合/待办忙度重算这类重查询不应阻塞 UI 渲染
 *   - IndexedDB 快照写入也在本线程完成，主线程零感知
 *
 * 协议：
 *   主 → Worker { type:'init' }                                  → { type:'ready' }
 *   主 → Worker { type:'call', id, method, args }                → { type:'result', id, ok, result? / error? }
 *   主 → Worker { type:'flush' }                                 → （自动落盘，无回复）
 * Worker 启动即自行从 IndexedDB 加载上次快照；写操作后自动防抖落盘。
 */

import { openLocalDb, type LocalDbHandle } from '@tt-calendar/db/local/backend'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

interface CallMsg {
  type: 'call'
  id: number
  method: string
  args: unknown[]
}
type InMsg = { type: 'init' } | { type: 'flush' } | CallMsg

// Worker 环境的 self 不带 DOM Window 类型，收窄出需要的三件事
const ctx = self as unknown as {
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  postMessage(msg: unknown): void
}

let handle: LocalDbHandle | null = null

async function onMsg(msg: InMsg): Promise<void> {
  try {
    if (msg.type === 'init') {
      handle = await openLocalDb({ wasmUrl })
      ctx.postMessage({ type: 'ready' })
      return
    }
    if (msg.type === 'flush') {
      await handle?.flush()
      return
    }
    if (msg.type === 'call') {
      if (!handle) throw new Error('本地数据库尚未初始化')
      const table = handle.backend as unknown as Record<string, ((...a: unknown[]) => unknown) | undefined>
      const fn = table[msg.method]
      if (typeof fn !== 'function') throw new Error(`本地后端没有方法 ${msg.method}`)
      const result = fn.apply(handle.backend, msg.args)
      // SqliteBackend 全同步：直接得到结果（避免把 Promise 传回主线程）
      ctx.postMessage({ type: 'result', id: msg.id, ok: true, result })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if ((msg as CallMsg).type === 'call') {
      ctx.postMessage({ type: 'result', id: (msg as CallMsg).id, ok: false, error: message })
    } else {
      ctx.postMessage({ type: 'init-error', message })
    }
  }
}

ctx.addEventListener('message', (e: MessageEvent) => {
  void onMsg(e.data as InMsg)
})
