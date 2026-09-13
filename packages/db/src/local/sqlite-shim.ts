/**
 * better-sqlite3 兼容 shim（浏览器侧，基于 sql.js WASM）。
 *
 * 目的：让 packages/db 的 SqliteBackend（同步 drizzle 代码）原封不动地跑在
 * WebView / Web Worker 里 —— 只需给它一个行为等价于 better-sqlite3 的
 * Database 对象。这里只实现 drizzle-orm/better-sqlite3 会话与 migrate.ts
 * 实际用到的最小面：
 *   - Database: prepare / exec / pragma / transaction / export / close
 *   - Statement: run / all / get / raw().all / raw().get
 *
 * 与 better-sqlite3 的差异（对上层不可见）：
 *   - 数据在内存中，WAL/synchronous 无意义；持久化由调用方定期 export() 落盘
 *     （见 persist.ts 的 IndexedDB 快照方案）
 *   - undefined 参数一律归一化为 null（sql.js 不接受 undefined）
 */

import initSqlJs from 'sql.js'
import type { Database as SqlJsDatabase, SqlValue } from 'sql.js'
import { bootLog } from './boot-log'

/** sql.js 绑定值归一化：undefined → null（其余类型 sql.js 自带映射） */
function norm(v: unknown): SqlValue {
  if (v === undefined) return null
  return v as SqlValue
}

/** 与 better-sqlite3 Statement 对齐的最小面（drizzle 会话所需） */
export interface ShimStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  all(...params: unknown[]): Record<string, unknown>[]
  get(...params: unknown[]): Record<string, unknown> | undefined
  raw(): {
    all(...params: unknown[]): unknown[][]
    get(...params: unknown[]): unknown[] | undefined
  }
}

export class SqlJsSqlite {
  readonly handle: SqlJsDatabase

  /** 任一写操作（run/exec）之后回调一次；用于持久化调度，可为 null */
  onchange: (() => void) | null = null

  private constructor(handle: SqlJsDatabase) {
    this.handle = handle
  }

  /** 打开内存库；bytes 为既有快照（export() 的产物），缺省为全新空库 */
  static async open(
    opts: { bytes?: Uint8Array | null; wasmUrl?: string; wasmBinary?: ArrayBuffer | Uint8Array } = {},
  ): Promise<SqlJsSqlite> {
    bootLog('sqlite-shim: initSqlJs start')
    const config: Record<string, unknown> = {}
    if (opts.wasmUrl) config.locateFile = () => opts.wasmUrl
    if (opts.wasmBinary) config.wasmBinary = opts.wasmBinary
    const SQL = await initSqlJs(config as Parameters<typeof initSqlJs>[0])
    bootLog('sqlite-shim: initSqlJs done')
    return new SqlJsSqlite(new SQL.Database(opts.bytes ?? undefined))
  }

  /** 导出整个库的二进制快照（持久化用） */
  export(): Uint8Array {
    return this.handle.export()
  }

  close(): void {
    try {
      this.handle.close()
    } catch {
      // 有未 free 的 statement 时 close 会抛 —— 进程/Worker 即将销毁，忽略
    }
  }

  /** 多语句执行（migrate.ts 的基线建表走这里） */
  exec(sql: string): void {
    this.handle.exec(sql)
    this.onchange?.()
  }

  /** PRAGMA（只保留 foreign_keys 这类会话级设置；WAL 等落盘 PRAGMA 无意义） */
  pragma(source: string): void {
    this.handle.exec(`PRAGMA ${source}`)
  }

  prepare(sql: string): ShimStatement {
    const stmt = this.handle.prepare(sql)
    const db = this.handle
    const notify = () => this.onchange?.()
    // 写语句才触发 onchange（快照调度）：drizzle 的 INSERT..RETURNING 走
    // raw().get()/.all() 而不是 run()，漏掉这条路径就会「写成功但永不
    // 自动落盘」（2026-09-13 真机丢数据事故根因）
    const isWrite = /^\s*(insert|update|delete|replace)\b/i.test(sql)

    // sql.js 的 bind 自带 reset 语义；这里统一先 reset（清绑定+回到第一行）再绑
    const begin = (params: unknown[]): void => {
      stmt.reset()
      if (params.length > 0) {
        stmt.bind(params.map(norm))
      }
    }

    return {
      // better-sqlite3: 完整执行写语句，返回 { changes, lastInsertRowid }
      run(...params: unknown[]) {
        begin(params)
        while (stmt.step()) {
          // 写语句没有结果行；循环到结束确保语句执行完毕
        }
        // sql.js 要求 COMMIT 时没有处于进行中的语句，必须复位
        stmt.reset()
        const changes = db.getRowsModified()
        const rid = db.exec('SELECT last_insert_rowid() AS id')
        const lastInsertRowid = (rid[0]?.values[0]?.[0] ?? 0) as number | bigint
        notify()
        return { changes, lastInsertRowid }
      },

      // 返回对象数组（列名 → 值），等价 better-sqlite3 .all()
      all(...params: unknown[]) {
        begin(params)
        const rows: Record<string, unknown>[] = []
        while (stmt.step()) rows.push(stmt.getAsObject())
        stmt.reset()
        if (isWrite) notify()
        return rows
      },

      // 返回首行或 undefined，等价 better-sqlite3 .get()
      get(...params: unknown[]) {
        begin(params)
        const row = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : undefined
        stmt.reset()
        if (isWrite) notify()
        return row
      },

      // 原始值数组形态（drizzle 的 values()/带字段映射的 get() 走这里）
      raw() {
        return {
          all(...params: unknown[]) {
            begin(params)
            const rows: unknown[][] = []
            while (stmt.step()) rows.push(Array.from(stmt.get()))
            stmt.reset()
            if (isWrite) notify()
            return rows
          },
          get(...params: unknown[]) {
            begin(params)
            const row = stmt.step() ? Array.from(stmt.get()) : undefined
            stmt.reset()
            if (isWrite) notify()
            return row
          },
        }
      },
    }
  }

  /**
   * 等价 better-sqlite3 db.transaction(fn)：返回一个包装函数，
   * 调用时 BEGIN → fn(...) → COMMIT，异常 ROLLBACK。
   * drizzle 会话取返回值后按 behavior 调 .deferred()/.immediate()/.exclusive()，
   * 内存库三者语义一致（sql.js 单连接同步执行）。
   */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) & {
    deferred: (...args: A) => R
    immediate: (...args: A) => R
    exclusive: (...args: A) => R
  } {
    const run = (...args: A): R => {
      this.exec('BEGIN')
      try {
        const r = fn(...args)
        this.exec('COMMIT')
        return r
      } catch (e) {
        try {
          this.exec('ROLLBACK')
        } catch {
          // 已经不在事务中，忽略
        }
        throw e
      }
    }
    return Object.assign(run, { deferred: run, immediate: run, exclusive: run })
  }
}
