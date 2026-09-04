/**
 * 本地数据 Worker：在 WebView 的独立线程里装配「sql.js(WASM) + drizzle +
 * SqliteBackend + SyncFacade」，用 RPC 消息向主线程提供与 HttpBackendAdapter
 * 等价的数据面（含 GitHub 数据仓同步）。
 *
 * 为什么放 Worker：
 *   - sql.js 是纯内存同步库，视图聚合/待办忙度重算这类重查询不应阻塞 UI 渲染
 *   - IndexedDB 快照写入 + GitHub REST 同步（async）都在本线程完成，主线程零感知
 *
 * 协议：
 *   主 → Worker { type:'init' }                            → { type:'ready' }
 *   主 → Worker { type:'call', id, method, args }          → { type:'result', id, ok, result? / error? }
 *   主 → Worker { type:'flush' }                           → （自动落盘，无回复）
 * Worker 启动即自行从 IndexedDB 加载上次快照；写操作后自动防抖落盘。
 */

import { openLocalDb, type LocalDbHandle } from '@tt-calendar/db/local/backend'
import { GitHubDataRepo } from '@tt-calendar/db/sync/github'
import { SyncFacade } from '@tt-calendar/db/sync/facade'
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
let facade: SyncFacade | null = null

/** 方法面 = SqliteBackend 全部方法 + 同步编排层的六个入口 */
function methodTable(): Record<string, ((...a: unknown[]) => unknown) | undefined> {
  const be = handle!.backend
  const f = facade!
  return {
    ...be,
    getSyncStatus: () => f.getStatus(),
    getSyncConfig: () => f.getConfig(),
    saveSyncConfig: (cfg: unknown) => f.saveConfig(cfg as Parameters<SyncFacade['saveConfig']>[0]),
    testSync: () => f.test(),
    syncNow: () => f.sync('merge'),
    resolveSync: (mode: unknown) =>
      f.resolveFirstBind(mode as 'pull_overwrite' | 'merge_push'),
  }
}

async function onMsg(msg: InMsg): Promise<void> {
  try {
    if (msg.type === 'init') {
      handle = await openLocalDb({ wasmUrl })
      facade = new SyncFacade({
        backend: handle.backend,
        svc: handle.svc,
        makeRemote: (cfg) => new GitHubDataRepo(cfg),
      })
      ctx.postMessage({ type: 'ready' })
      return
    }
    if (msg.type === 'flush') {
      await handle?.flush()
      return
    }
    if (msg.type === 'call') {
      if (!handle || !facade) throw new Error('本地数据库尚未初始化')
      const table = methodTable()
      const fn = table[msg.method]
      if (typeof fn !== 'function') throw new Error(`本地后端没有方法 ${msg.method}`)
      const result = await fn.apply(handle.backend, msg.args)
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
