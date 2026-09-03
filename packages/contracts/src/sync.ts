import { z } from 'zod'
import { DateTimeStr } from './common'

/**
 * 多端同步契约（协议详见 docs/SYNC_PROTOCOL.md）。
 *
 * 双轨分离：
 *  - 数据同步：用户数据 ↔ GitHub 私有数据仓，行级三方合并
 *  - 代码同步：git（应用永不自动 commit/push，那是 agent / 用户的领地）
 */

/** 表名 → [主键列, 行身份列, 是否自增整型主键] */
export type SyncTableSpec = readonly [pk: string, rowKey: string, autoIntPk: boolean]

/**
 * 同步的 11 张用户表。
 *
 * ⚠️ 对象字面量的键顺序 = 导入顺序，有外键依赖时父表必须在前：
 *    todo.list_id → todo_list.id，foreign_keys=ON 下 todo_list 必须先导入。
 */
export const SYNC_TABLES = {
  todo_list: ['id', 'id', false],
  todo: ['id', 'id', false],
  layer_config: ['layer_id', 'layer_id', false],
  meta: ['key', 'key', false],
  schedule: ['date', 'date', false],
  coloring: ['date', 'date', false],
  events: ['id', 'sync_uid', true],
  schedule_items: ['id', 'sync_uid', true],
  countdown: ['id', 'sync_uid', true],
  marks: ['id', 'sync_uid', true],
  subscriptions: ['id', 'id', false],
} as const satisfies Record<string, SyncTableSpec>

export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES) as SyncTableName[]
export type SyncTableName = keyof typeof SYNC_TABLES

/** 自增整型主键的表（这些表的行身份是 sync_uid，不是 id） */
export const AUTO_INT_TABLES = ['events', 'schedule_items', 'countdown', 'marks'] as const

/** meta 表中同步凭据等本机私有键：永不导出、永不产生墓碑 */
export const LOCAL_ONLY_META_PREFIX = 'sync.'

/**
 * 墓碑的守卫规则（Python sync/schema.py _triggers）：
 *  - meta：key LIKE 'sync.%' 不产生墓碑
 *  - events：source != 'manual' 不产生墓碑（countdown/jisilu 是派生缓存，
 *    启动时删旧插新，同步它们会导致每次启动都灌一堆假删除）
 */
export function tombstoneGuard(table: string, row: Record<string, unknown>): boolean {
  if (table === 'meta') {
    const key = String(row['key'] ?? '')
    return !key.startsWith(LOCAL_ONLY_META_PREFIX)
  }
  if (table === 'events') {
    return row['source'] === 'manual'
  }
  return true
}

/** 一行的同步身份（墓碑 row_key）。自增表用 sync_uid，缺失时回落 'id:<pk>' 保证唯一 */
export function rowKeyOf(table: string, row: Record<string, unknown>): string {
  const spec = (SYNC_TABLES as Record<string, SyncTableSpec | undefined>)[table]
  if (!spec) return ''
  const [, key, auto] = spec
  const v = row[key]
  if (auto) return v != null ? String(v) : `id:${String(row['id'] ?? '')}`
  return String(v ?? '')
}

/** 快照：表名 → 行数组 */
export type Snapshot = Partial<Record<SyncTableName, Record<string, unknown>[]>>

/** 墓碑集合："<table>|<rowKey>" → deleted_at */
export type Tombstones = Record<string, string>

export function tombKey(table: string, rowKey: string): string {
  return `${table}|${rowKey}`
}

export const SyncReport = z.object({
  pulled: z.number().int(),
  pushed: z.number().int(),
  conflicts: z.number().int(),
  deleted: z.number().int(),
  revived: z.number().int(),
})
export type SyncReport = z.infer<typeof SyncReport>

export const SyncConfig = z.object({
  repo: z.string(),
  branch: z.string(),
  auto_on_start: z.boolean(),
  sync_on_close: z.boolean(),
  has_token: z.boolean(),
})
export type SyncConfig = z.infer<typeof SyncConfig>

export const SyncStatus = z.object({
  configured: z.boolean(),
  at: DateTimeStr.optional(),
  ok: z.boolean().optional(),
  report: SyncReport.partial().optional(),
  commit: z.string().nullable().optional(),
})
export type SyncStatus = z.infer<typeof SyncStatus>

export const SyncResult = z.object({
  result: z.string(),
  pulled: z.number().int().optional(),
  pushed: z.number().int().optional(),
  conflicts: z.number().int().optional(),
  deleted: z.number().int().optional(),
  revived: z.number().int().optional(),
  warning: z.string().optional(),
  commit_url: z.string().nullable().optional(),
  remote_rows: z.number().int().optional(),
})
export type SyncResult = z.infer<typeof SyncResult>

/** 首次绑定的两种决策模式 */
export const FirstBindMode = z.enum(['pull_overwrite', 'merge_push'])
export type FirstBindMode = z.infer<typeof FirstBindMode>
