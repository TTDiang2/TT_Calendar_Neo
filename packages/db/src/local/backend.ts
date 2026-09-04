/**
 * 本地（浏览器/WebView）SQLite 后端装配。
 *
 * 在 Web Worker 里调用 openLocalDb() 即可得到与 Node 侧 openDb + SqliteBackend
 * 完全同构的数据门面：同一份 SqliteBackend 业务代码，底层由 sql.js(WASM) 提供
 * SQLite 能力。持久化 = 内存库二进制快照 → IndexedDB：
 *   - 每次写操作后防抖自动保存（默认 300ms）
 *   - flush() 供页面隐藏/关闭时强制落盘
 *
 * 浏览器安全：本文件及其依赖（backend/migrate/schema/domain/contracts）不含
 * better-sqlite3 等任何 Node 原生模块 —— better-sqlite3 只出现在 type import
 * 与 drizzle 驱动的类型声明里，打包时被擦除。
 */

import { drizzle } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'

import { SqliteBackend } from '../backend'
import { ensureSchema } from '../migrate'
import * as schema from '../schema'
import { SyncService } from '../sync-service'

import { idbGetBytes, idbPutBytes } from './persist'
import { SqlJsSqlite } from './sqlite-shim'

/** 快照存储抽象：浏览器默认 IndexedDB；Node 测试注入内存实现 */
export interface SnapshotStorage {
  get(): Promise<Uint8Array | null>
  put(bytes: Uint8Array): Promise<void>
}

/** 浏览器默认存储（Worker 里同样可用 IndexedDB） */
export const indexedDbStorage: SnapshotStorage = { get: idbGetBytes, put: idbPutBytes }

export interface OpenLocalDbOptions {
  /** sql.js 的 wasm 资源地址（浏览器 Worker 必传；Node 测试可不传或传 wasmBinary） */
  wasmUrl?: string
  /** 直接注入 wasm 二进制（Node 测试用） */
  wasmBinary?: ArrayBuffer | Uint8Array
  /** 写操作后自动保存的防抖毫秒数；0 = 关闭自动保存 */
  autosaveMs?: number
  /** 快照存储；不传则纯内存、flush 为空操作（Node 测试） */
  storage?: SnapshotStorage
  /** 测试用：跳过存储读取（内存库从零开始） */
  skipLoad?: boolean
}

export interface LocalDbHandle {
  backend: SqliteBackend
  /** 与 backend 同库的同步引擎（纯数据面三方合并），供 SyncFacade 使用 */
  svc: SyncService
  sqlite: SqlJsSqlite
  /** 立即导出快照并写 IndexedDB */
  flush(): Promise<void>
  /** 落盘并关闭（Worker 终止前调用；不调也只丢最后的自动保存窗口） */
  dispose(): Promise<void>
}

export async function openLocalDb(opts: OpenLocalDbOptions = {}): Promise<LocalDbHandle> {
  const storage = opts.storage
  const bytes = opts.skipLoad || !storage ? null : await storage.get()
  const sqlite = await SqlJsSqlite.open({ bytes, wasmUrl: opts.wasmUrl, wasmBinary: opts.wasmBinary })
  sqlite.pragma('foreign_keys = ON')
  ensureSchema(sqlite as unknown as Database.Database)

  const db = drizzle(sqlite as unknown as Database.Database, { schema })
  const backend = new SqliteBackend(db)

  // ---- 快照持久化调度 ----
  const autosaveMs = opts.autosaveMs ?? 300
  let dirty = false
  let saving = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const save = async (): Promise<void> => {
    if (saving) return
    saving = true
    try {
      // 写前清脏标记：保存期间的新写入会在下一轮补上
      dirty = false
      if (storage) await storage.put(sqlite.export())
    } finally {
      saving = false
    }
    if (dirty && autosaveMs > 0) schedule()
  }

  const schedule = (): void => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      void save().catch(() => {
        // 快照失败不打断业务；下次写操作会再次尝试
      })
    }, autosaveMs)
  }

  if (autosaveMs > 0) sqlite.onchange = schedule

  return {
    backend,
    svc: new SyncService(db),
    sqlite,
    flush: () => {
      dirty = false
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      return save()
    },
    dispose: async () => {
      try {
        await save()
      } finally {
        sqlite.close()
      }
    },
  }
}
