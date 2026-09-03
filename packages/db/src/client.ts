/**
 * 数据库连接：better-sqlite3 + drizzle。
 *
 * 桌面端（Tauri）与 node 脚本都从这里拿连接；移动端 webview 里
 * better-sqlite3 不可用，届时由 tauri-plugin-sql 的桥接实现替换本文件
 * （backend.ts 只依赖这里暴露的最小查询面）。
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'
import { ensureSchema } from './migrate'

export type Db = BetterSQLite3Database<typeof schema>

export interface OpenOptions {
  /** 数据库文件路径；':memory:' 用于测试 */
  path: string
}

/** 打开（或创建）日历库，套上本项目约定的 PRAGMA，并执行基线建表（已存在则跳过） */
export function openDb({ path }: OpenOptions): { db: Db; sqlite: Database.Database } {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  ensureSchema(sqlite)
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

/** drizzle-kit 配置读取用：仅元信息，不打开连接 */
export const SCHEMA_TABLES = Object.keys(schema)
