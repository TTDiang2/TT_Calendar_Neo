/**
 * 本地数据库装配核心：sql.js(WASM) + drizzle + SqliteBackend + SyncFacade
 * 的装配与方法表。拆出来是因为它有两个使用者：
 *   - db.worker.ts（独立线程，正常路径）
 *   - backend.ts 的主线程回退（WKWebView 里 Worker 起不来时兜底）
 * 两条路径必须行为一致，所以方法表 / 自动同步 / flush 都只在这里实现。
 *
 * 注意：SqliteBackend 的方法都在原型上，不能 {...backend} 展开（得到空对象），
 * 必须沿原型链收集函数属性。
 */

import { openLocalDb, indexedDbStorage, type LocalDbHandle, type SnapshotStorage } from '@tt-calendar/db/local/backend'
import { GitHubDataRepo } from '@tt-calendar/db/sync/github'
import { SyncFacade } from '@tt-calendar/db/sync/facade'
import { runJisiluImport, refreshSubscriptionOnBackend, refreshDueOnBackend } from '@tt-calendar/db/sources/jisilu'
import { importTodosCsvOnBackend } from '@tt-calendar/db/sources/csv-todos'
import './polyfills'

export interface CoreInitOptions {
  /** wasm 二进制（主线程取好后传进来，避免 Worker 里再对 tauri:// 发请求） */
  wasmBinary?: ArrayBuffer
  /** wasm 资源地址（由 initSqlJs 自己 fetch；主线程 / 测试场景用） */
  wasmUrl?: string
  /** 快照存储；缺省 IndexedDB（浏览器）。测试可注入内存实现 */
  storage?: SnapshotStorage
}

type MethodFn = (...args: unknown[]) => unknown

export class LocalDbCore {
  private handle: LocalDbHandle | null = null
  private facade: SyncFacade | null = null
  private table: Record<string, MethodFn> | null = null
  private readonly onSynced?: (report: unknown) => void

  constructor(onSynced?: (report: unknown) => void) {
    this.onSynced = onSynced
  }

  async init(opts: CoreInitOptions): Promise<void> {
    // storage 必须显式接上：不传 = 纯内存库，所有数据随进程消失。
    // 这里是浏览器层（Worker / 主线程回退共用），默认 IndexedDB 快照持久化。
    this.handle = await openLocalDb({
      wasmBinary: opts.wasmBinary,
      wasmUrl: opts.wasmUrl,
      storage: opts.storage ?? indexedDbStorage,
    })
    this.facade = new SyncFacade({
      backend: this.handle.backend,
      svc: this.handle.svc,
      makeRemote: (cfg) => new GitHubDataRepo(cfg),
    })
  }

  /** 启动自动同步（配置了 auto_on_start 时），静默失败不打扰用户 */
  autoSyncOnStart(): void {
    void this.backgroundSyncIf('auto_on_start')
  }

  /** 落盘；配置了 sync_on_close 时顺手同步一次（尽力而为，不等待） */
  async flush(): Promise<void> {
    await this.handle?.flush()
    void this.backgroundSyncIf('sync_on_close')
  }

  private async backgroundSyncIf(flag: 'auto_on_start' | 'sync_on_close'): Promise<void> {
    const facade = this.facade
    if (!facade) return
    const cfg = facade.getConfig()
    if (!cfg.repo || !cfg.has_token || !cfg[flag]) return
    try {
      const result = await facade.sync('merge')
      // 首绑决策必须由用户在设置面板里做，后台自动同步只处理常规合并
      if (result.result === 'ok') this.onSynced?.(result)
    } catch {
      // 后台同步失败（离线/凭据过期等）不打断使用；手动同步时会看到具体错误
    }
  }

  async call(method: string, args: unknown[]): Promise<unknown> {
    const handle = this.handle
    if (!handle || !this.facade) throw new Error('本地数据库尚未初始化')
    const fn = this.methodTable()[method]
    if (typeof fn !== 'function') throw new Error(`本地后端没有方法 ${method}`)
    return await fn.apply(handle.backend, args)
  }

  /** 方法面 = SqliteBackend 原型链全部方法 + 同步编排层 / 导入 / 刷新入口（缓存） */
  private methodTable(): Record<string, MethodFn> {
    if (this.table) return this.table
    const handle = this.handle!
    const facade = this.facade!
    const be = handle.backend as unknown as Record<string, unknown>
    // null 原型：防止 'constructor'/'toString'/'valueOf' 这类名字被
    // Object.prototype 兜住，越权返回后端本体或原生函数
    const table: Record<string, MethodFn> = Object.create(null)
    for (
      let proto = handle.backend;
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue
        const v = be[name]
        if (typeof v === 'function') table[name] = v as MethodFn
      }
    }
    Object.assign(table, {
      getSyncStatus: () => facade.getStatus(),
      getSyncConfig: () => facade.getConfig(),
      saveSyncConfig: (cfg: unknown) =>
        facade.saveConfig(cfg as Parameters<SyncFacade['saveConfig']>[0]),
      testSync: () => facade.test(),
      syncNow: () => facade.sync('merge'),
      resolveSync: (mode: unknown) =>
        facade.resolveFirstBind(mode as 'pull_overwrite' | 'merge_push'),
      // 集思录导入：直接抓公开接口（无需登录），与 PC 同一份代码
      importJisilu: (...a: unknown[]) =>
        runJisiluImport(handle.backend, {
          start: String(a[0] ?? ''),
          end: String(a[1] ?? ''),
          qtypes: a[2] as string[] | undefined,
        }),
      // 订阅刷新：按 source_key 分发（jisilu 已实装，其余 pending_adaptation）
      refreshSubscription: (id: unknown) => {
        const sub = handle.backend.getSubscriptions().find((s) => s.id === String(id))
        if (!sub) throw new Error('订阅不存在')
        return refreshSubscriptionOnBackend(handle.backend, sub)
      },
      refreshDueSubscriptions: () => refreshDueOnBackend(handle.backend),
      // 待办 CSV 导入：File/Blob 可结构化克隆穿越 postMessage，读文本在核心侧
      importTodosCsv: async (file: unknown) => {
        if (!(file instanceof Blob)) throw new Error('缺少 CSV 文件')
        return importTodosCsvOnBackend(handle.backend, await file.text())
      },
    })
    this.table = table
    return table
  }
}
