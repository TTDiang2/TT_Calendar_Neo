/**
 * 同步引擎 —— GitHub 数据仓协议的本地侧。
 *
 * 协议：把可同步表（contracts SYNC_TABLE_NAMES）整表导出为快照 + 墓碑，
 * 与远端快照做三方合并（domain/merge，golden 对拍冻结），把结果写回本地库。
 * 远端快照的获取/落盘（git、HTTP 等 IO）由调用方注入 —— 本文件只做纯数据面。
 *
 * ⚠️ 协议语义（golden 已冻结）：pull_overwrite 模式下，本地在远端找不到身份的行
 * 会被删除，连远端整表不存在的表也照删 —— 调用方在「首绑/换设备」场景务必先
 * 让用户确认方向。
 */

import type { Snapshot, SyncTableName, Tombstones } from '@tt-calendar/contracts'
import { AUTO_INT_TABLES, SYNC_TABLE_NAMES } from '@tt-calendar/contracts'
import { firstBindMerge, merge, tombKey, tombstonesByTable } from '@tt-calendar/domain'

import type { Db } from './client'
import * as s from './schema'
import { eq, inArray, isNull, sql } from 'drizzle-orm'

type Row = Record<string, unknown>

/** 各同步表的主键列（与 contracts/sync.ts 一致，此处直接查快照行用） */
const KEY_COLS: Record<string, string> = {
  todo_list: 'id',
  todo: 'id',
  layer_config: 'layer_id',
  meta: 'key',
  schedule: 'date',
  coloring: 'date',
  events: 'sync_uid',
  schedule_items: 'sync_uid',
  countdown: 'sync_uid',
  marks: 'sync_uid',
  subscriptions: 'id',
}

/** meta 表里永不上传的本机私有键前缀（Python sync/schema.py 约定） */
const LOCAL_ONLY_META_PREFIX = 'sync.'

/** 自增整型主键表的 drizzle 表引用（导出前回填 sync_uid 用） */
const AUTO_TABLE_REFS = {
  events: s.events,
  schedule_items: s.scheduleItems,
  countdown: s.countdown,
  marks: s.marks,
} as const

/**
 * drizzle 行（camelCase 属性）→ 快照行（snake_case 列名，Python 协议的线上格式）。
 * ⚠️ 必须转换：upsertRow / rowKeyOf / tombstoneGuard / domain/merge 都按
 * snake_case 列读行（sync_uid、display_name、extra_json…）；不转换会让行
 * 身份塌陷到 id:<pk> 回落、三方合并全面失明（此前 export→import 回路无测试
 * 才没暴露）。
 */
export function rowToWire(table: SyncTableName, row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v
  }
  return out
}

export class SyncService {
  constructor(private readonly db: Db) {}

  /**
   * 存量行回填：sync_uid 为 NULL 的自增表行没有同步身份（byKey 会直接丢弃）。
   * createScheduleItem/createCountdown 一直有生成，但 createEvent 此前漏了，
   * 更老的 Python 数据也可能缺 —— 导出前统一补上随机身份。
   */
  private backfillSyncUids(): void {
    for (const name of AUTO_INT_TABLES) {
      const t = AUTO_TABLE_REFS[name]
      this.db
        .update(t)
        .set({ syncUid: sql`(lower(hex(randomblob(16))))` })
        .where(isNull(t.syncUid))
        .run()
    }
  }

  /** 导出本地快照（meta 的 sync.% 私有键剔除；行键统一 snake_case） */
  exportSnapshot(): Snapshot {
    this.backfillSyncUids()
    const snap: Snapshot = {}
    for (const table of SYNC_TABLE_NAMES) {
      snap[table] = this.exportTable(table)
    }
    return snap
  }

  private exportTable(table: SyncTableName): Row[] {
    const rows = this.exportTableRaw(table)
    return rows.map((r) => rowToWire(table, r))
  }

  private exportTableRaw(table: SyncTableName): Row[] {
    switch (table) {
      case 'todo_list':
        return this.db.select().from(s.todoList).all()
      case 'todo':
        return this.db.select().from(s.todo).all()
      case 'layer_config':
        return this.db.select().from(s.layerConfig).all()
      case 'meta':
        return this.db
          .select()
          .from(s.meta)
          .where(sql`${s.meta.key} NOT LIKE ${LOCAL_ONLY_META_PREFIX + '%'}`)
          .all()
      case 'schedule':
        return this.db.select().from(s.schedule).all()
      case 'coloring':
        return this.db.select().from(s.coloring).all()
      case 'events':
        return this.db.select().from(s.events).all()
      case 'schedule_items':
        return this.db.select().from(s.scheduleItems).all()
      case 'countdown':
        return this.db.select().from(s.countdown).all()
      case 'marks':
        return this.db.select().from(s.marks).all()
      case 'subscriptions':
        return this.db.select().from(s.subscriptions).all()
      default: {
        const _exhaustive: never = table
        void _exhaustive
        return []
      }
    }
  }

  /** 导出本地墓碑（组合键 table|row_key → deleted_at） */
  exportTombstones(): Tombstones {
    const out: Tombstones = {}
    for (const r of this.db.select().from(s.syncTombstones).all()) {
      out[tombKey(r.tableName, r.rowKey)] = r.deletedAt
    }
    return out
  }

  /**
   * 三方合并并写回本地。
   *
   * @param base      上次同步快照（首次绑定传 null）
   * @param remote    远端快照
   * @param tombs     base/remote/local 三方墓碑
   * @param mode      'merge'（默认，LWW 三方合并）| 'pull_overwrite'（远端覆盖）| 'merge_push'（首绑推并集）
   * @returns 报告 + 落库后的合并快照（调用方把它推到远端数据仓）
   */
  syncWith(
    base: Snapshot | null,
    remote: Snapshot,
    tombs: { base: Tombstones; remote: Tombstones; local: Tombstones },
    mode: 'merge' | 'pull_overwrite' | 'merge_push' = 'merge',
  ): { report: Record<string, number>; merged: Snapshot; tombstones: Tombstones } {
    const local = this.exportSnapshot()
    const localTombs = this.exportTombstones()

    const result =
      mode === 'merge'
        ? merge(base, remote, local, tombs.base, tombs.remote, localTombs)
        : firstBindMerge(
            mode === 'pull_overwrite' ? 'pull_overwrite' : 'merge_push',
            remote,
            local,
            tombs.remote,
            localTombs,
          )

    this.applySnapshotInTx(result.upsert, result.deletes, result.tombstones)

    return { report: { ...result.report }, merged: result.data, tombstones: result.tombstones }
  }

  /**
   * 落库必须整体原子：applySnapshot 与 writeTombstones 分离提交的话，
   * 中途崩溃会把「合并后的行」配上「被清空的墓碑表」留下 —— 被删行复活、
   * 墓碑丢失。better-sqlite3 与 sql.js shim 都是单连接同步执行，
   * 同连接后续语句天然参与本事务。
   */
  private applySnapshotInTx(
    upsert: Snapshot,
    deletes: Partial<Record<SyncTableName, string[]>>,
    tombstones: Tombstones,
  ): void {
    this.db.transaction(() => {
      this.applySnapshot(upsert, deletes)
      this.writeTombstones(tombstones)
    })
  }

  /** 把 upsert/deletes 差集落到库里 */
  private applySnapshot(upsert: Snapshot, deletes: Partial<Record<SyncTableName, string[]>>): void {
    for (const table of SYNC_TABLE_NAMES) {
      const keyCol = KEY_COLS[table]
      if (!keyCol) continue

      for (const row of upsert[table] ?? []) {
        this.upsertRow(table, row)
      }
      const delKeys = deletes[table] ?? []
      if (delKeys.length) {
        this.deleteRows(table, delKeys)
      }
    }
  }

  /**
   * 自增表本地行定位：行身份是 sync_uid，不是自增 id。
   *
   * ⚠️ 不能按 id upsert：快照行携带的 id 是「产生它的那台设备」的本地自增值，
   * 与本机 id 空间无关。按 id 冲突会把远端行串写成本地无关行（同 id 不同
   * sync_uid），或让同一 sync_uid 出现重复行（同 sync_uid 不同 id）。
   * 正确语义：sync_uid 命中 → 按本地 id 更新；未命中 → 新插入，id 交给本机
   * 自增（不采纳远端 id，避免占用/碰撞本机自增序列）。
   */
  private localIdBySyncUid(
    table: 'events' | 'schedule_items' | 'countdown' | 'marks',
    syncUid: string | null,
  ): number | undefined {
    if (!syncUid) return undefined
    const t = AUTO_TABLE_REFS[table]
    const r = this.db.select({ id: t.id }).from(t).where(eq(t.syncUid, syncUid)).get()
    return r?.id ?? undefined
  }

  private upsertRow(table: SyncTableName, row: Row): void {
    const str = (v: unknown): string | null => (v == null ? null : String(v))
    const num = (v: unknown): number | null => (v == null ? null : Number(v))
    switch (table) {
      case 'todo_list':
        this.db
          .insert(s.todoList)
          .values({
            id: String(row.id),
            displayName: String(row.display_name ?? ''),
            sortOrder: num(row.sort_order) ?? 0,
            createdAt: str(row.created_at),
            updatedAt: str(row.updated_at),
          })
          .onConflictDoUpdate({
            target: s.todoList.id,
            set: { displayName: String(row.display_name ?? ''), sortOrder: num(row.sort_order) ?? 0, updatedAt: str(row.updated_at) },
          })
          .run()
        break
      case 'todo': {
        const tags = row.tags == null ? null : typeof row.tags === 'string' ? row.tags : JSON.stringify(row.tags)
        this.db
          .insert(s.todo)
          .values({
            id: String(row.id),
            listId: String(row.list_id ?? ''),
            title: String(row.title ?? ''),
            body: str(row.body),
            status: str(row.status) ?? 'notStarted',
            importance: str(row.importance) ?? 'normal',
            dueDate: str(row.due_date),
            createdAt: str(row.created_at),
            completedAt: str(row.completed_at),
            sortOrder: num(row.sort_order) ?? 0,
            startDate: str(row.start_date),
            complexity: str(row.complexity) ?? 'medium',
            tags,
            plannedDate: str(row.planned_date),
            alarmAt: str(row.alarm_at),
            updatedAt: str(row.updated_at),
          })
          .onConflictDoUpdate({
            target: s.todo.id,
            set: {
              title: String(row.title ?? ''),
              body: str(row.body),
              status: str(row.status) ?? 'notStarted',
              importance: str(row.importance) ?? 'normal',
              dueDate: str(row.due_date),
              completedAt: str(row.completed_at),
              sortOrder: num(row.sort_order) ?? 0,
              startDate: str(row.start_date),
              complexity: str(row.complexity) ?? 'medium',
              tags,
              plannedDate: str(row.planned_date),
              alarmAt: str(row.alarm_at),
              updatedAt: str(row.updated_at),
            },
          })
          .run()
        break
      }
      case 'layer_config':
        this.db
          .insert(s.layerConfig)
          .values({
            layerId: String(row.layer_id),
            displayName: String(row.display_name ?? ''),
            enabled: num(row.enabled) ?? 1,
            color: str(row.color),
            sortOrder: num(row.sort_order) ?? 0,
            configJson: typeof row.config_json === 'string' ? row.config_json : JSON.stringify(row.config ?? {}),
            kind: str(row.kind) ?? 'color',
            groupName: str(row.group_name),
            updatedAt: str(row.updated_at),
          })
          .onConflictDoUpdate({
            target: s.layerConfig.layerId,
            set: {
              displayName: String(row.display_name ?? ''),
              enabled: num(row.enabled) ?? 1,
              color: str(row.color),
              sortOrder: num(row.sort_order) ?? 0,
              configJson: typeof row.config_json === 'string' ? row.config_json : JSON.stringify(row.config ?? {}),
              kind: str(row.kind) ?? 'color',
              groupName: str(row.group_name),
              updatedAt: str(row.updated_at),
            },
          })
          .run()
        break
      case 'meta':
        this.db
          .insert(s.meta)
          .values({ key: String(row.key), value: str(row.value), updatedAt: str(row.updated_at) })
          .onConflictDoUpdate({ target: s.meta.key, set: { value: str(row.value), updatedAt: str(row.updated_at) } })
          .run()
        break
      case 'schedule':
        this.db
          .insert(s.schedule)
          .values({ date: String(row.date), am: str(row.am), pm: str(row.pm), ev: str(row.ev), updatedAt: str(row.updated_at) })
          .onConflictDoUpdate({ target: s.schedule.date, set: { am: str(row.am), pm: str(row.pm), ev: str(row.ev), updatedAt: str(row.updated_at) } })
          .run()
        break
      case 'coloring':
        this.db
          .insert(s.coloring)
          .values({ date: String(row.date), level: num(row.level) ?? 0, updatedAt: str(row.updated_at) })
          .onConflictDoUpdate({ target: s.coloring.date, set: { level: num(row.level) ?? 0, updatedAt: str(row.updated_at) } })
          .run()
        break
      case 'events': {
        const values = {
          layerId: String(row.layer_id ?? ''),
          source: String(row.source ?? 'migrated'),
          date: String(row.date),
          title: String(row.title ?? ''),
          description: str(row.description),
          color: str(row.color),
          extraJson: typeof row.extra_json === 'string' ? row.extra_json : row.extra ? JSON.stringify(row.extra) : null,
          sourceRef: str(row.source_ref),
          sortKey: num(row.sort_key) ?? 0,
          createdAt: str(row.created_at),
          updatedAt: str(row.updated_at),
          syncUid: str(row.sync_uid),
        }
        const localId = this.localIdBySyncUid('events', values.syncUid)
        if (localId !== undefined) {
          this.db.update(s.events).set(values).where(eq(s.events.id, localId)).run()
        } else {
          this.db.insert(s.events).values(values).run()
        }
        break
      }
      case 'schedule_items': {
        const values = {
          date: String(row.date),
          startTime: str(row.start_time),
          endTime: str(row.end_time),
          title: String(row.title ?? ''),
          color: str(row.color),
          sortOrder: num(row.sort_order) ?? 0,
          createdAt: str(row.created_at),
          updatedAt: str(row.updated_at),
          category: str(row.category) ?? 'work',
          syncUid: str(row.sync_uid),
        }
        const localId = this.localIdBySyncUid('schedule_items', values.syncUid)
        if (localId !== undefined) {
          this.db.update(s.scheduleItems).set(values).where(eq(s.scheduleItems.id, localId)).run()
        } else {
          this.db.insert(s.scheduleItems).values(values).run()
        }
        break
      }
      case 'countdown': {
        const values = {
          name: String(row.name ?? ''),
          category: str(row.category) ?? '其他',
          baseDate: String(row.base_date ?? ''),
          repeatYearly: num(row.repeat_yearly) ?? 0,
          milestoneRule: str(row.milestone_rule),
          neverExpire: num(row.never_expire) ?? 0,
          notes: str(row.notes),
          color: str(row.color),
          sortOrder: num(row.sort_order) ?? 0,
          createdAt: str(row.created_at),
          updatedAt: str(row.updated_at),
          syncUid: str(row.sync_uid),
          repeatType: str(row.repeat_type) ?? 'solar',
        }
        const localId = this.localIdBySyncUid('countdown', values.syncUid)
        if (localId !== undefined) {
          this.db.update(s.countdown).set(values).where(eq(s.countdown.id, localId)).run()
        } else {
          this.db.insert(s.countdown).values(values).run()
        }
        break
      }
      case 'marks': {
        const values = {
          layerId: String(row.layer_id ?? ''),
          date: String(row.date ?? ''),
          level: num(row.level),
          note: str(row.note),
          createdAt: str(row.created_at),
          updatedAt: str(row.updated_at),
          syncUid: str(row.sync_uid),
        }
        const localId = this.localIdBySyncUid('marks', values.syncUid)
        if (localId !== undefined) {
          this.db.update(s.marks).set(values).where(eq(s.marks.id, localId)).run()
        } else {
          this.db.insert(s.marks).values(values).run()
        }
        break
      }
      case 'subscriptions':
        this.db
          .insert(s.subscriptions)
          .values({
            id: String(row.id),
            displayName: String(row.display_name ?? ''),
            sourceKey: String(row.source_key ?? ''),
            url: str(row.url),
            rulesText: str(row.rules_text),
            enabled: num(row.enabled) ?? 1,
            autoUpdate: num(row.auto_update) ?? 1,
            status: str(row.status) ?? 'pending',
            lastSyncedAt: str(row.last_synced_at),
            configJson: typeof row.config_json === 'string' ? row.config_json : null,
            createdAt: str(row.created_at),
            updatedAt: str(row.updated_at),
          })
          .onConflictDoUpdate({
            target: s.subscriptions.id,
            set: {
              displayName: String(row.display_name ?? ''),
              url: str(row.url),
              rulesText: str(row.rules_text),
              enabled: num(row.enabled) ?? 1,
              autoUpdate: num(row.auto_update) ?? 1,
              status: str(row.status) ?? 'pending',
              lastSyncedAt: str(row.last_synced_at),
              updatedAt: str(row.updated_at),
            },
          })
          .run()
        break
      default: {
        const _exhaustive: never = table
        void _exhaustive
      }
    }
  }

  private deleteRows(table: SyncTableName, keys: string[]): void {
    switch (table) {
      case 'todo_list':
        this.db.delete(s.todoList).where(inArray(s.todoList.id, keys)).run()
        break
      case 'todo':
        this.db.delete(s.todo).where(inArray(s.todo.id, keys)).run()
        break
      case 'layer_config':
        this.db.delete(s.layerConfig).where(inArray(s.layerConfig.layerId, keys)).run()
        break
      case 'meta':
        this.db.delete(s.meta).where(inArray(s.meta.key, keys)).run()
        break
      case 'schedule':
        this.db.delete(s.schedule).where(inArray(s.schedule.date, keys)).run()
        break
      case 'coloring':
        this.db.delete(s.coloring).where(inArray(s.coloring.date, keys)).run()
        break
      case 'events':
        this.db.delete(s.events).where(inArray(s.events.syncUid, keys)).run()
        break
      case 'schedule_items':
        this.db.delete(s.scheduleItems).where(inArray(s.scheduleItems.syncUid, keys)).run()
        break
      case 'countdown':
        this.db.delete(s.countdown).where(inArray(s.countdown.syncUid, keys)).run()
        break
      case 'marks':
        this.db.delete(s.marks).where(inArray(s.marks.syncUid, keys)).run()
        break
      case 'subscriptions':
        this.db.delete(s.subscriptions).where(inArray(s.subscriptions.id, keys)).run()
        break
      default: {
        const _exhaustive: never = table
        void _exhaustive
      }
    }
  }

  /** 墓碑写回（并集结果整体替换本地墓碑表） */
  private writeTombstones(tombs: Tombstones): void {
    this.db.delete(s.syncTombstones).run()
    const rows = Object.entries(tombs).map(([composed, dt]) => {
      const sep = composed.indexOf('|')
      return { tableName: composed.slice(0, sep), rowKey: composed.slice(sep + 1), deletedAt: dt }
    })
    if (rows.length) this.db.insert(s.syncTombstones).values(rows).run()
  }

  /** tombstonesByTable 的转发（UI 展示用） */
  tombsByTable(tombs: Tombstones): Record<string, string[]> {
    return tombstonesByTable(tombs)
  }
}
