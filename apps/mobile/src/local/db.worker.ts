/**
 * 本地数据 Worker：独立线程里跑 LocalDbCore（sql.js + SyncFacade），用 RPC
 * 消息向主线程提供数据面。装配逻辑在 db-core.ts（主线程回退共用一份）。
 *
 * 为什么 wasm 由主线程传二进制：tauri:// 自定义协议在 WKWebView 的 Worker 里
 * 不可靠（Worker 脚本/资源请求可能被拒或挂起），主线程 fetch 资源是可靠的，
 * 取好 ArrayBuffer 随 init 消息传进来，Worker 内零网络请求。
 *
 * 协议：
 *   主 → Worker { type:'init', wasmBinary? }      → { type:'ready' } / { type:'init-error', message }
 *   主 → Worker { type:'call', id, method, args } → { type:'result', id, ok, result? / error? }
 *   主 → Worker { type:'flush' }                  → （落盘 + sync_on_close，无回复）
 *   Worker → 主 { type:'synced', report }         → （启动/收尾自动同步成功后）
 */

import { LocalDbCore } from './db-core'

interface CallMsg {
  type: 'call'
  id: number
  method: string
  args: unknown[]
}
type InMsg = { type: 'init'; wasmBinary?: ArrayBuffer } | { type: 'flush' } | CallMsg

// Worker 环境的 self 不带 DOM Window 类型，收窄出需要的两件事
const ctx = self as unknown as {
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  postMessage(msg: unknown): void
}

let core: LocalDbCore | null = null

async function onMsg(msg: InMsg): Promise<void> {
  try {
    if (msg.type === 'init') {
      core = new LocalDbCore((report) => ctx.postMessage({ type: 'synced', report }))
      await core.init({ wasmBinary: msg.wasmBinary })
      ctx.postMessage({ type: 'ready' })
      // auto_on_start：启动后台自动同步（不阻塞渲染）
      core.autoSyncOnStart()
      return
    }
    if (msg.type === 'flush') {
      await core?.flush()
      return
    }
    if (msg.type === 'call') {
      if (!core) throw new Error('本地数据库尚未初始化')
      const result = await core.call(msg.method, msg.args)
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
