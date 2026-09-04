/**
 * SqliteBackend —— UI 侧数据门面。
 *
 * 方法面与 Python 版 HTTP API（frontend/src/api/client.ts）一一同名对应，
 * 迁移组件时把 `api.client.getXxx` 换成 `backend.getXxx` 即可，业务语义不变。
 * 视图聚合委托 domain/buildView；忙度折算委托 domain/busy。
 *
 * 网络类操作（集思录导入、订阅抓取、GitHub 同步 IO）不在本门面：
 * 它们是 app 层适配器的事，见 sync-service.ts 与 scripts。
 */

import type {
  CalEvent,
  CountdownItem,
  DateStr,
  JsonRecord,
  Mark,
  MonthData,
  ScheduleItem,
  StatsSummary,
  Subscription,
  Todo,
  TodoList,
  TodoSort,
  TodoStatusFilter,
  ViewMode,
  YearData,
} from '@tt-calendar/contracts'
import {
  DEFAULT_TODO_BUSY_CONFIG,
  DEFAULT_TODO_REMINDER,
  TODO_BUSY_CONFIG_KEY,
  TODO_REMINDER_CONFIG_KEY,
} from '@tt-calendar/contracts'
import {
  addDays,
  diffDays,
  buildCountdownList,
  buildCountdownText,
  buildView,
  computeTodoBusyLevel,
  monthDays,
  todayStr,
  weekDays,
  windowRange,
  type CountdownLike,
  type LayerLike,
} from '@tt-calendar/domain'

import type { Db } from './client'
import * as s from './schema'
import { eq, like, or, sql } from 'drizzle-orm'
import { asc, desc } from 'drizzle-orm'

// ---------- 行 → 领域类型 映射 ----------

type EventRowT = typeof s.events.$inferSelect
type TodoT = typeof s.todo.$inferSelect
type LayerRowT = typeof s.layerConfig.$inferSelect
type MarkRowT = typeof s.marks.$inferSelect
type CountdownRowT = typeof s.countdown.$inferSelect
type ScheduleItemRowT = typeof s.scheduleItems.$inferSelect
type SubRowT = typeof s.subscriptions.$inferSelect

function parseJson(str: string | null): JsonRecord {
  if (!str) return {}
  try {
    const v = JSON.parse(str)
    return v && typeof v === 'object' ? (v as JsonRecord) : {}
  } catch {
    return {}
  }
}

function parseTags(str: string | null): string[] | null {
  if (!str) return null
  try {
    const v = JSON.parse(str)
    return Array.isArray(v) ? v.map(String) : null
  } catch {
    // 旧数据可能是逗号串
    return str.split(',').map((t) => t.trim()).filter(Boolean)
  }
}

function rowToEvent(r: EventRowT): CalEvent {
  return {
    id: r.id,
    layer_id: r.layerId,
    source: r.source,
    date: r.date as DateStr,
    title: r.title,
    description: r.description ?? null,
    color: r.color ?? null,
    extra: parseJson(r.extraJson),
    source_ref: r.sourceRef ?? null,
    sort_key: r.sortKey ?? 0,
  }
}

function rowToTodo(r: TodoT): Todo {
  return {
    id: r.id,
    list_id: r.listId,
    title: r.title,
    body: r.body ?? null,
    status: (r.status ?? 'notStarted') as Todo['status'],
    importance: (r.importance ?? 'normal') as Todo['importance'],
    due_date: (r.dueDate ?? null) as DateStr | null,
    planned_date: (r.plannedDate ?? null) as DateStr | null,
    start_date: (r.startDate ?? null) as DateStr | null,
    complexity: (r.complexity ?? 'medium') as Todo['complexity'],
    tags: parseTags(r.tags),
    created_at: r.createdAt ?? null,
    completed_at: r.completedAt ?? null,
    sort_order: r.sortOrder ?? 0,
  }
}

function rowToLayer(r: LayerRowT): LayerLike {
  return {
    layer_id: r.layerId,
    display_name: r.displayName,
    enabled: !!r.enabled,
    color: r.color ?? null,
    sort_order: r.sortOrder ?? 0,
    kind: r.kind ?? 'color',
    group: r.groupName ?? null,
    config: parseJson(r.configJson),
  }
}

function rowToMark(r: MarkRowT): Mark {
  return {
    id: r.id,
    layer_id: r.layerId,
    date: r.date as DateStr,
    level: r.level ?? null,
    note: r.note ?? null,
    created_at: r.createdAt ?? null,
    updated_at: r.updatedAt ?? null,
    sync_uid: r.syncUid ?? null,
  }
}

/** 存储形态：库行 → CountdownLike（next_date 等展示字段由 buildCountdownList 推算） */
function rowToCountdown(r: CountdownRowT): CountdownLike {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    base_date: r.baseDate as DateStr,
    repeat_yearly: !!r.repeatYearly,
    repeat_type: (r.repeatType ?? 'solar') as CountdownLike['repeat_type'],
    milestone_rule: r.milestoneRule ?? null,
    never_expire: !!r.neverExpire,
    notes: r.notes ?? null,
    color: r.color ?? null,
  }
}

function rowToScheduleItem(r: ScheduleItemRowT): ScheduleItem {
  return {
    id: r.id,
    date: r.date as DateStr,
    start_time: (r.startTime ?? null) as ScheduleItem['start_time'],
    end_time: (r.endTime ?? null) as ScheduleItem['end_time'],
    title: r.title,
    color: r.color ?? null,
    sort_order: r.sortOrder ?? 0,
    category: (r.category ?? 'other') as ScheduleItem['category'],
  }
}

function rowToSubscription(r: SubRowT): Subscription {
  return {
    id: r.id,
    display_name: r.displayName,
    source_key: r.sourceKey,
    url: r.url ?? null,
    rules_text: r.rulesText ?? null,
    enabled: !!r.enabled,
    auto_update: !!r.autoUpdate,
    status: (r.status ?? 'pending') as Subscription['status'],
    last_synced_at: r.lastSyncedAt ?? null,
    created_at: r.createdAt ?? null,
  }
}

function now(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// ---------- Backend ----------

export class SqliteBackend {
  constructor(
    private readonly db: Db,
    private readonly opts: { trackTombstones?: boolean } = {},
  ) {}

  /**
   * 删除行时写墓碑（对齐 Python sync/schema.py 的触发器语义）：
   *  - meta 表 key LIKE 'sync.%' 的本机私有键不产生墓碑
   *  - 同键旧墓碑保留更晚的 deleted_at
   * sync-service 落库时的批量删除不走这里（墓碑整体写回）。
   */
  protected tombstone(table: string, key: string): void {
    if (this.opts.trackTombstones === false) return
    if (table === 'meta' && key.startsWith('sync.')) return
    this.db
      .insert(s.syncTombstones)
      .values({ tableName: table, rowKey: key, deletedAt: now() })
      .onConflictDoUpdate({
        target: [s.syncTombstones.tableName, s.syncTombstones.rowKey],
        set: {
          deletedAt: sql`MAX(${s.syncTombstones.deletedAt}, excluded.deleted_at)`,
        },
      })
      .run()
  }

  // ----- meta / 设置 -----

  getMeta(key: string): string | null {
    const row = this.db.select().from(s.meta).where(eq(s.meta.key, key)).get()
    return row?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.db
      .insert(s.meta)
      .values({ key, value, updatedAt: now() })
      .onConflictDoUpdate({ target: s.meta.key, set: { value, updatedAt: now() } })
      .run()
  }

  deleteMeta(key: string): void {
    this.db.delete(s.meta).where(eq(s.meta.key, key)).run()
    this.tombstone('meta', key)
  }

  getTodoBusyConfig() {
    const raw = this.getMeta(TODO_BUSY_CONFIG_KEY)
    if (!raw) return { ...DEFAULT_TODO_BUSY_CONFIG }
    try {
      return { ...DEFAULT_TODO_BUSY_CONFIG, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_TODO_BUSY_CONFIG }
    }
  }

  setTodoBusyConfig(cfg: unknown) {
    const merged = { ...this.getTodoBusyConfig(), ...(cfg as object) }
    this.setMeta(TODO_BUSY_CONFIG_KEY, JSON.stringify(merged))
    return merged
  }

  getTodoReminderConfig() {
    const raw = this.getMeta(TODO_REMINDER_CONFIG_KEY)
    if (!raw) return { ...DEFAULT_TODO_REMINDER }
    try {
      return { ...DEFAULT_TODO_REMINDER, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_TODO_REMINDER }
    }
  }

  setTodoReminderConfig(cfg: Partial<{ enabled: boolean; time: string }>) {
    const merged = { ...this.getTodoReminderConfig(), ...cfg }
    this.setMeta(TODO_REMINDER_CONFIG_KEY, JSON.stringify(merged))
    return merged
  }

  // ----- 图层 -----

  getLayers(): LayerLike[] {
    return this.db
      .select()
      .from(s.layerConfig)
      .orderBy(asc(s.layerConfig.sortOrder))
      .all()
      .map(rowToLayer)
  }

  toggleLayer(layerId: string, enabled: boolean): LayerLike | null {
    this.db
      .update(s.layerConfig)
      .set({ enabled: enabled ? 1 : 0, updatedAt: now() })
      .where(eq(s.layerConfig.layerId, layerId))
      .run()
    return this.getLayers().find((l) => l.layer_id === layerId) ?? null
  }

  updateLayerConfig(
    layerId: string,
    data: { enabled?: boolean; sub_qtypes?: { qtype: string; sub_action: string | null }[] },
  ): LayerLike | null {
    const cur = this.getLayers().find((l) => l.layer_id === layerId)
    if (!cur) return null
    const config = { ...cur.config }
    if (data.sub_qtypes !== undefined) config['sub_qtypes'] = data.sub_qtypes
    this.db
      .update(s.layerConfig)
      .set({
        enabled: data.enabled === undefined ? cur.enabled ? 1 : 0 : data.enabled ? 1 : 0,
        configJson: JSON.stringify(config),
        updatedAt: now(),
      })
      .where(eq(s.layerConfig.layerId, layerId))
      .run()
    return this.getLayers().find((l) => l.layer_id === layerId) ?? null
  }

  createLayer(data: {
    display_name: string
    color?: string | null
    kind?: string
    group?: string | null
    config?: Record<string, unknown>
  }): LayerLike {
    const layerId = `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    this.db
      .insert(s.layerConfig)
      .values({
        layerId,
        displayName: data.display_name,
        enabled: 1,
        color: data.color ?? null,
        sortOrder: 0,
        configJson: JSON.stringify(data.config ?? {}),
        kind: data.kind ?? 'color',
        groupName: data.group ?? null,
        updatedAt: now(),
      })
      .run()
    return this.getLayers().find((l) => l.layer_id === layerId)!
  }

  deleteLayer(layerId: string): { ok: boolean } {
    this.db.delete(s.layerConfig).where(eq(s.layerConfig.layerId, layerId)).run()
    this.db.delete(s.events).where(eq(s.events.layerId, layerId)).run()
    this.db.delete(s.marks).where(eq(s.marks.layerId, layerId)).run()
    this.tombstone('layer_config', layerId)
    return { ok: true }
  }

  getLayerSubActions(layerId: string): { qtype: string; sub_action: string }[] {
    const layer = this.getLayers().find((l) => l.layer_id === layerId)
    const sq = layer?.config?.['sub_qtypes'] as
      | { qtype: string; sub_action?: string | null }[]
      | undefined
    if (!Array.isArray(sq)) return []
    return sq
      .filter((r) => r && typeof r.qtype === 'string' && r.sub_action)
      .map((r) => ({ qtype: r.qtype, sub_action: r.sub_action as string }))
  }

  // ----- 事件 -----

  private eventById(id: number): EventRowT | undefined {
    return this.db.select().from(s.events).where(eq(s.events.id, id)).get()
  }

  createEvent(ev: Omit<CalEvent, 'id'> & { id?: number | null }): CalEvent {
    const r = this.db
      .insert(s.events)
      .values({
        layerId: ev.layer_id,
        source: ev.source,
        date: ev.date,
        title: ev.title,
        description: ev.description ?? null,
        color: ev.color ?? null,
        extraJson: JSON.stringify(ev.extra ?? {}),
        sourceRef: ev.source_ref ?? null,
        sortKey: ev.sort_key ?? 0,
        syncUid: crypto.randomUUID(),
        updatedAt: now(),
      })
      .returning()
      .get()
    return rowToEvent(r!)
  }

  updateEvent(id: number, ev: Partial<CalEvent>): CalEvent | null {
    const cur = this.eventById(id)
    if (!cur) return null
    this.db
      .update(s.events)
      .set({
        layerId: ev.layer_id ?? cur.layerId,
        source: ev.source ?? cur.source,
        date: ev.date ?? cur.date,
        title: ev.title ?? cur.title,
        description: ev.description ?? cur.description,
        color: ev.color ?? cur.color,
        extraJson: ev.extra ? JSON.stringify(ev.extra) : cur.extraJson,
        sourceRef: ev.source_ref ?? cur.sourceRef,
        sortKey: ev.sort_key ?? cur.sortKey,
        updatedAt: now(),
      })
      .where(eq(s.events.id, id))
      .run()
    const r = this.eventById(id)
    return r ? rowToEvent(r) : null
  }

  deleteEvent(id: number): { ok: boolean } {
    const ev = this.eventById(id)
    this.db.delete(s.events).where(eq(s.events.id, id)).run()
    if (ev?.syncUid) this.tombstone('events', ev.syncUid)
    return { ok: true }
  }

  searchEvents(q: string): CalEvent[] {
    if (!q.trim()) return []
    const pat = `%${q.trim()}%`
    const rows = this.db
      .select()
      .from(s.events)
      .where(or(like(s.events.title, pat), like(s.events.description, pat)))
      .orderBy(desc(s.events.date))
      .limit(200)
      .all()
    return rows.map(rowToEvent)
  }

  // ----- 日程 -----

  upsertSchedule(d: DateStr, am: string | null, pm: string | null, ev: string | null) {
    this.db
      .insert(s.schedule)
      .values({ date: d, am, pm, ev, updatedAt: now() })
      .onConflictDoUpdate({ target: s.schedule.date, set: { am, pm, ev, updatedAt: now() } })
      .run()
    return { ok: true }
  }

  getScheduleItems(d: DateStr): ScheduleItem[] {
    return this.db
      .select()
      .from(s.scheduleItems)
      .where(eq(s.scheduleItems.date, d))
      .orderBy(asc(s.scheduleItems.sortOrder))
      .all()
      .map(rowToScheduleItem)
  }

  createScheduleItem(item: Omit<ScheduleItem, 'id'> & { id?: number }): ScheduleItem {
    const r = this.db
      .insert(s.scheduleItems)
      .values({
        date: item.date,
        startTime: item.start_time ?? null,
        endTime: item.end_time ?? null,
        title: item.title,
        color: item.color ?? null,
        sortOrder: item.sort_order ?? 0,
        category: item.category ?? 'work',
        updatedAt: now(),
      })
      .returning()
      .get()
    return rowToScheduleItem(r!)
  }

  updateScheduleItem(id: number, item: Partial<ScheduleItem>): ScheduleItem | null {
    const cur = this.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, id)).get()
    if (!cur) return null
    this.db
      .update(s.scheduleItems)
      .set({
        date: item.date ?? cur.date,
        startTime: item.start_time ?? cur.startTime,
        endTime: item.end_time ?? cur.endTime,
        title: item.title ?? cur.title,
        color: item.color ?? cur.color,
        sortOrder: item.sort_order ?? cur.sortOrder,
        category: item.category ?? cur.category,
        updatedAt: now(),
      })
      .where(eq(s.scheduleItems.id, id))
      .run()
    const r = this.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, id)).get()
    return r ? rowToScheduleItem(r) : null
  }

  deleteScheduleItem(id: number): { ok: boolean } {
    const cur = this.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.id, id)).get()
    this.db.delete(s.scheduleItems).where(eq(s.scheduleItems.id, id)).run()
    if (cur?.syncUid) this.tombstone('schedule_items', cur.syncUid)
    return { ok: true }
  }

  // ----- 充实度 & 涂色 -----

  upsertColoring(d: DateStr, level: number) {
    this.db
      .insert(s.coloring)
      .values({ date: d, level, updatedAt: now() })
      .onConflictDoUpdate({ target: s.coloring.date, set: { level, updatedAt: now() } })
      .run()
    return { ok: true }
  }

  deleteColoring(d: DateStr) {
    this.db.delete(s.coloring).where(eq(s.coloring.date, d)).run()
    this.tombstone('coloring', d)
    return { ok: true }
  }

  upsertMark(layerId: string, d: DateStr, level: number | null, note: string | null = null) {
    const cur = this.db
      .select()
      .from(s.marks)
      .where(sql`${s.marks.layerId} = ${layerId} AND ${s.marks.date} = ${d}`)
      .get()
    if (cur) {
      this.db
        .update(s.marks)
        .set({ level, note, updatedAt: now() })
        .where(eq(s.marks.id, cur.id))
        .run()
      return { ok: true }
    }
    this.db
      .insert(s.marks)
      .values({
        layerId,
        date: d,
        level,
        note,
        syncUid: crypto.randomUUID(),
        updatedAt: now(),
      })
      .run()
    return { ok: true }
  }

  deleteMark(layerId: string, d: DateStr) {
    const mark = this.db
      .select()
      .from(s.marks)
      .where(sql`${s.marks.layerId} = ${layerId} AND ${s.marks.date} = ${d}`)
      .get()
    this.db
      .delete(s.marks)
      .where(sql`${s.marks.layerId} = ${layerId} AND ${s.marks.date} = ${d}`)
      .run()
    if (mark?.syncUid) this.tombstone('marks', mark.syncUid)
    return { ok: true }
  }

  /** 拖拽改期：把 src 的非订阅事件与手工日程搬到 dst */
  moveDay(src: DateStr, dst: DateStr): { moved_events: number; moved_schedule: boolean } {
    const movedEvents = this.db
      .update(s.events)
      .set({ date: dst, updatedAt: now() })
      .where(sql`${s.events.date} = ${src} AND ${s.events.source} = 'manual'`)
      .run().changes
    const schedItems = this.db.select().from(s.scheduleItems).where(eq(s.scheduleItems.date, src)).all()
    const movedSchedule = schedItems.length > 0
    if (movedSchedule) {
      this.db.update(s.scheduleItems).set({ date: dst, updatedAt: now() }).where(eq(s.scheduleItems.date, src)).run()
    }
    return { moved_events: movedEvents, moved_schedule: movedSchedule }
  }

  // ----- 倒数日 -----

  private allCountdownRows(): CountdownLike[] {
    return this.db
      .select()
      .from(s.countdown)
      .orderBy(asc(s.countdown.sortOrder), asc(s.countdown.id))
      .all()
      .map(rowToCountdown)
  }

  /** 展示形态：补算 next_date / days_left / passed（对齐 Python build_countdown_list） */
  private countdownItems(): CountdownItem[] {
    return buildCountdownList(this.allCountdownRows())
  }

  getCountdownList(): CountdownItem[] {
    return this.countdownItems()
  }

  getCountdownText(): { text: string } {
    return { text: buildCountdownText(this.countdownItems()) }
  }

  createCountdown(
    data: Partial<CountdownLike> & Pick<CountdownLike, 'name' | 'base_date'> & { id?: number; sort_order?: number },
  ): CountdownItem {
    const r = this.db
      .insert(s.countdown)
      .values({
        name: data.name,
        category: data.category ?? '其他',
        baseDate: data.base_date,
        repeatYearly: data.repeat_yearly ? 1 : 0,
        milestoneRule: data.milestone_rule ?? null,
        neverExpire: data.never_expire ? 1 : 0,
        notes: data.notes ?? null,
        color: data.color ?? null,
        sortOrder: data.sort_order ?? 0,
        repeatType: data.repeat_type ?? 'solar',
        syncUid: crypto.randomUUID(),
        updatedAt: now(),
      })
      .returning()
      .get()
    return this.countdownItems().find((c) => c.id === r!.id)!
  }

  updateCountdown(id: number, data: Partial<CountdownLike> & { sort_order?: number }): CountdownItem | null {
    const cur = this.db.select().from(s.countdown).where(eq(s.countdown.id, id)).get()
    if (!cur) return null
    this.db
      .update(s.countdown)
      .set({
        name: data.name ?? cur.name,
        category: data.category ?? cur.category,
        baseDate: data.base_date ?? cur.baseDate,
        repeatYearly: data.repeat_yearly === undefined ? cur.repeatYearly : data.repeat_yearly ? 1 : 0,
        milestoneRule: data.milestone_rule ?? cur.milestoneRule,
        neverExpire: data.never_expire === undefined ? cur.neverExpire : data.never_expire ? 1 : 0,
        notes: data.notes ?? cur.notes,
        color: data.color ?? cur.color,
        sortOrder: data.sort_order ?? cur.sortOrder,
        repeatType: data.repeat_type ?? cur.repeatType,
        updatedAt: now(),
      })
      .where(eq(s.countdown.id, id))
      .run()
    return this.countdownItems().find((c) => c.id === id) ?? null
  }

  deleteCountdown(id: number): { ok: boolean } {
    const cur = this.db.select().from(s.countdown).where(eq(s.countdown.id, id)).get()
    this.db.delete(s.countdown).where(eq(s.countdown.id, id)).run()
    if (cur?.syncUid) this.tombstone('countdown', cur.syncUid)
    return { ok: true }
  }

  // ----- 视图聚合 -----

  getView(mode: ViewMode, anchor: string): MonthData | YearData {
    if (mode === 'year') return this.getYearView(Number(anchor.split('-')[0]))
    if (mode === 'countdown') throw new Error('countdown 视图不走 getView')
    if (mode === 'month') {
      const [y, m] = anchor.split('-').map(Number)
      return this.getPeriodView(monthDays(y, m), y, m)
    }
    if (mode === 'week') return this.getPeriodView(weekDays(anchor as DateStr), Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)))
    return this.getPeriodView([anchor as DateStr], Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)))
  }

  private fetchWindow(from: DateStr, to: DateStr) {
    const events = this.db
      .select()
      .from(s.events)
      .where(sql`${s.events.date} BETWEEN ${from} AND ${to}`)
      .all()
      .map(rowToEvent)
    const schedRows = this.db.select().from(s.schedule).all()
    const schedule: Record<string, { am: string | null; pm: string | null; ev: string | null }> = {}
    for (const r of schedRows) schedule[r.date] = { am: r.am, pm: r.pm, ev: r.ev }
    const scheduleItems = this.db
      .select()
      .from(s.scheduleItems)
      .where(sql`${s.scheduleItems.date} BETWEEN ${from} AND ${to}`)
      .all()
      .map(rowToScheduleItem)
    const coloringRows = this.db.select().from(s.coloring).all()
    const coloring: Record<string, number> = {}
    for (const r of coloringRows) coloring[r.date] = r.level
    const marks = this.db
      .select()
      .from(s.marks)
      .where(sql`${s.marks.date} BETWEEN ${from} AND ${to}`)
      .all()
      .map(rowToMark)
    const busyRows = this.db.select().from(s.dayBusy).all()
    const dayBusy: Record<string, { predict_level: number | null; done_level: number | null }> = {}
    for (const r of busyRows) dayBusy[r.date] = { predict_level: r.predictLevel, done_level: r.doneLevel }
    return { events, schedule, scheduleItems, coloring, marks, dayBusy }
  }

  private getPeriodView(days: DateStr[], viewYear: number, viewMonth: number): MonthData {
    const [winFrom, winTo] = windowRange(viewYear, viewMonth, 31)
    const d = this.fetchWindow(winFrom, winTo)
    const todosByDate: Record<string, Todo[]> = {}
    const todos = this.db.select().from(s.todo).all().map(rowToTodo)
    const today = todayStr()
    for (const t of todos) {
      for (const key of [t.due_date, t.planned_date]) {
        if (key && key >= winFrom && key <= winTo) {
          ;(todosByDate[key] ??= []).push(t)
        }
      }
    }
    const layers = this.getLayers()
    const subs = this.db.select().from(s.subscriptions).all().map(rowToSubscription)
    const countdowns = this.allCountdownRows()

    const result = buildView({
      days,
      viewYear,
      viewMonth,
      today,
      events: d.events,
      schedule: d.schedule,
      scheduleItems: d.scheduleItems,
      coloring: d.coloring,
      todosByDate,
      marksByDate: groupMarksByDate(d.marks),
      dayBusy: d.dayBusy,
      layers,
      subscriptions: subs,
      countdowns,
    })
    return { year: result.year, month: result.month, layers: result.layers, days: result.days }
  }

  /** 年视图：12 个迷你月历，每月 days 复用月视图聚合（对齐 Python build_year_view） */
  private getYearView(year: number): YearData {
    const months: YearData['months'] = []
    let layers: YearData['layers'] = []
    for (let m = 1; m <= 12; m++) {
      const view = this.getPeriodView(monthDays(year, m), year, m)
      months.push({ month: m, days: view.days })
      layers = view.layers
    }
    return { year, layers, months }
  }

  // ----- 统计 -----

  /** 统计面板聚合（对齐 Python routes.py stats_summary）：
   *  四象限散点（未完成，due_importance 序）+ 近 90 天逐日完成 + 总数 + 清单名 */
  getStatsSummary(): StatsSummary {
    const today = todayStr()
    const todos = this.getTodos({ status: 'all', sort: 'due_importance' })
    const quadrant = todos
      .filter((t) => t.status !== 'completed')
      .map((t) => ({
        id: t.id,
        title: t.title,
        list_id: t.list_id,
        importance: t.importance,
        due_date: t.due_date,
        days_to_due: t.due_date ? diffDays(today, t.due_date) : null,
      }))
    // 近 90 天逐日完成数（Python db.daily_completed(conn, 90)）
    const from90 = addDays(today, -90)
    const dailyDoneRows = this.db
      .select({
        d: sql<string>`substr(${s.todo.completedAt}, 1, 10)`,
        c: sql<number>`COUNT(*)`,
      })
      .from(s.todo)
      .where(sql`${s.todo.completedAt} >= ${from90 + ' 00:00:00'}`)
      .groupBy(sql`substr(${s.todo.completedAt}, 1, 10)`)
      .all()
    const daily_done = dailyDoneRows
      .filter((r) => r.d)
      .map((r) => ({ date: r.d as DateStr, count: Number(r.c) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    const list_names: Record<string, string> = {}
    for (const l of this.getTodoLists()) list_names[l.id] = l.display_name
    return {
      quadrant,
      daily_done,
      stats: {
        total: todos.length,
        incomplete: todos.filter((t) => t.status !== 'completed').length,
        completed: todos.filter((t) => t.status === 'completed').length,
      },
      list_names,
    }
  }

  // ----- 忙度 -----

  recomputeTodoBusy(): { days_written: number } {
    const cfg = this.getTodoBusyConfig()
    const todos = this.db.select().from(s.todo).all().map(rowToTodo)
    const today = todayStr()
    // 覆盖窗口：过去 60 天到未来 120 天
    const from = addDays(today, -60)
    const to = addDays(today, 120)
    let written = 0
    const byDate = new Map<DateStr, Todo[]>()
    for (const t of todos) {
      for (const key of [t.due_date, t.planned_date]) {
        if (key) (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(t)
      }
    }
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const todosOfDay = byDate.get(d as DateStr) ?? []
      const isFuture = d >= today
      const relevant = isFuture
        ? todosOfDay.filter((t) => t.status !== 'completed')
        : todosOfDay.filter((t) => t.status === 'completed' && (t.completed_at ?? '').slice(0, 10) === d)
      const level = computeTodoBusyLevel(d as DateStr, relevant, cfg)
      this.db
        .insert(s.dayBusy)
        .values({
          date: d,
          predictLevel: isFuture ? level : null,
          doneLevel: isFuture ? null : level,
        })
        .onConflictDoUpdate({
          target: s.dayBusy.date,
          set: { predictLevel: isFuture ? level : null, doneLevel: isFuture ? null : level },
        })
        .run()
      written += 1
    }
    return { days_written: written }
  }

  // ----- 待办 -----

  getTodoLists(): TodoList[] {
    return this.db
      .select()
      .from(s.todoList)
      .orderBy(asc(s.todoList.sortOrder))
      .all()
      .map((r) => ({
        id: r.id,
        display_name: r.displayName,
        sort_order: r.sortOrder,
        created_at: r.createdAt ?? null,
      }))
  }

  createTodoList(display_name: string): TodoList {
    const id = crypto.randomUUID()
    const maxOrder = this.db
      .select({ m: sql<number>`COALESCE(MAX(${s.todoList.sortOrder}), 0)` })
      .from(s.todoList)
      .get()
    this.db
      .insert(s.todoList)
      .values({ id, displayName: display_name, sortOrder: (maxOrder?.m ?? 0) + 1, updatedAt: now() })
      .run()
    return { id, display_name, sort_order: (maxOrder?.m ?? 0) + 1, created_at: now() }
  }

  updateTodoList(id: string, display_name: string): TodoList | null {
    this.db.update(s.todoList).set({ displayName: display_name, updatedAt: now() }).where(eq(s.todoList.id, id)).run()
    return this.getTodoLists().find((l) => l.id === id) ?? null
  }

  deleteTodoList(id: string): { ok: boolean } {
    for (const t of this.db.select().from(s.todo).where(eq(s.todo.listId, id)).all()) {
      this.db.delete(s.todo).where(eq(s.todo.id, t.id)).run()
      this.tombstone('todo', t.id)
    }
    this.db.delete(s.todoList).where(eq(s.todoList.id, id)).run()
    this.tombstone('todo_list', id)
    return { ok: true }
  }

  reorderTodoLists(orderedIds: string[]): { ok: boolean } {
    orderedIds.forEach((id, i) =>
      this.db.update(s.todoList).set({ sortOrder: i, updatedAt: now() }).where(eq(s.todoList.id, id)).run(),
    )
    return { ok: true }
  }

  reorderTodos(orderedIds: string[]): { ok: boolean } {
    orderedIds.forEach((id, i) =>
      this.db.update(s.todo).set({ sortOrder: i, updatedAt: now() }).where(eq(s.todo.id, id)).run(),
    )
    return { ok: true }
  }

  getTodos(params: { list_id?: string; status?: TodoStatusFilter; sort?: TodoSort; limit?: number; completed_on?: string } = {}): Todo[] {
    const conds = []
    if (params.list_id) conds.push(eq(s.todo.listId, params.list_id))
    if (params.status === 'notStarted') conds.push(sql`${s.todo.status} <> 'completed'`)
    if (params.status === 'completed') conds.push(eq(s.todo.status, 'completed'))
    if (params.completed_on) conds.push(sql`substr(${s.todo.completedAt}, 1, 10) = ${params.completed_on}`)

    let q = this.db.select().from(s.todo)
    if (conds.length) q = q.where(sql.join(conds, sql` AND `)) as typeof q

    let rows = q.all()
    const sort = params.sort ?? 'due_importance'
    const importanceRank = { high: 0, normal: 1, low: 2 } as const
    const impRank = (v: string | null | undefined) =>
      importanceRank[(v ?? 'normal') as keyof typeof importanceRank] ?? 1
    /** 排序语义逐条对齐 Python db.py 的 _TODO_SORT_SQL */
    const cmpDate = (a: string | null, b: string | null) => {
      const ad = a ?? '9999-12-31'
      const bd = b ?? '9999-12-31'
      return ad === bd ? 0 : ad < bd ? -1 : 1
    }
    switch (sort) {
      case 'created':
        rows.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        break
      case 'manual':
        rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        break
      case 'importance':
        rows.sort((a, b) => impRank(a.importance) - impRank(b.importance))
        break
      case 'due':
        rows.sort((a, b) => cmpDate(a.dueDate, b.dueDate))
        break
      case 'planned':
        rows.sort((a, b) => cmpDate(a.plannedDate, b.plannedDate))
        break
      case 'due_planned_importance': {
        const eff = (r: TodoT) =>
          [r.dueDate, r.plannedDate].filter(Boolean).sort()[0] ?? null
        rows.sort(
          (a, b) => cmpDate(eff(a), eff(b)) || impRank(a.importance) - impRank(b.importance) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        )
        break
      }
      default: {
        // due_importance：有 due 且近者在前，同日 high 优先
        rows.sort(
          (a, b) => cmpDate(a.dueDate, b.dueDate) || impRank(a.importance) - impRank(b.importance) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        )
      }
    }
    if (params.limit) rows = rows.slice(0, params.limit)
    return rows.map(rowToTodo)
  }

  getTodoStats(listId?: string): { total: number; incomplete: number; completed: number } {
    const conds = listId ? [eq(s.todo.listId, listId)] : []
    let q = this.db.select().from(s.todo)
    if (conds.length) q = q.where(sql.join(conds, sql` AND `)) as typeof q
    const rows = q.all()
    return {
      total: rows.length,
      incomplete: rows.filter((r) => r.status !== 'completed').length,
      completed: rows.filter((r) => r.status === 'completed').length,
    }
  }

  createTodo(data: {
    list_id: string
    title: string
    body?: string | null
    importance?: string
    due_date?: string | null
    planned_date?: string | null
    start_date?: string | null
    complexity?: string
    tags?: string[] | null
    status?: string
  }): Todo {
    const id = crypto.randomUUID()
    this.db
      .insert(s.todo)
      .values({
        id,
        listId: data.list_id,
        title: data.title,
        body: data.body ?? null,
        status: data.status ?? 'notStarted',
        importance: data.importance ?? 'normal',
        dueDate: data.due_date ?? null,
        plannedDate: data.planned_date ?? null,
        startDate: data.start_date ?? null,
        complexity: data.complexity ?? 'medium',
        tags: data.tags ? JSON.stringify(data.tags) : null,
        updatedAt: now(),
      })
      .run()
    return rowToTodo(this.db.select().from(s.todo).where(eq(s.todo.id, id)).get()!)
  }

  updateTodo(id: string, data: Record<string, unknown>): Todo | null {
    const cur = this.db.select().from(s.todo).where(eq(s.todo.id, id)).get()
    if (!cur) return null
    const set: Partial<TodoT> = { updatedAt: now() }
    if ('title' in data) set.title = data.title as string
    if ('body' in data) set.body = (data.body as string | null) ?? null
    if ('status' in data) {
      set.status = (data.status as string) ?? cur.status
      if (data.status === 'completed' && cur.status !== 'completed') set.completedAt = now()
      if (data.status !== 'completed' && cur.status === 'completed') set.completedAt = null
    }
    if ('importance' in data) set.importance = (data.importance as string) ?? cur.importance
    if ('due_date' in data) set.dueDate = (data.due_date as string | null) ?? null
    if ('planned_date' in data) set.plannedDate = (data.planned_date as string | null) ?? null
    if ('start_date' in data) set.startDate = (data.start_date as string | null) ?? null
    if ('complexity' in data) set.complexity = (data.complexity as string) ?? cur.complexity
    if ('tags' in data) set.tags = data.tags ? JSON.stringify(data.tags) : null
    if ('sort_order' in data) set.sortOrder = (data.sort_order as number) ?? cur.sortOrder
    if ('list_id' in data) set.listId = (data.list_id as string) ?? cur.listId
    this.db.update(s.todo).set(set).where(eq(s.todo.id, id)).run()
    return rowToTodo(this.db.select().from(s.todo).where(eq(s.todo.id, id)).get()!)
  }

  deleteTodo(id: string): { ok: boolean } {
    this.db.delete(s.todo).where(eq(s.todo.id, id)).run()
    this.tombstone('todo', id)
    return { ok: true }
  }

  // ----- 订阅（本地 CRUD；网络抓取在 app 层） -----

  getSubscriptions(): Subscription[] {
    return this.db.select().from(s.subscriptions).orderBy(asc(s.subscriptions.displayName)).all().map(rowToSubscription)
  }

  createSubscription(data: { display_name: string; url?: string; rules_text?: string; auto_update?: boolean }): Subscription {
    const id = crypto.randomUUID()
    this.db
      .insert(s.subscriptions)
      .values({
        id,
        displayName: data.display_name,
        sourceKey: `custom_${id.slice(0, 8)}`,
        url: data.url ?? null,
        rulesText: data.rules_text ?? null,
        enabled: 1,
        autoUpdate: data.auto_update === false ? 0 : 1,
        status: 'pending',
        updatedAt: now(),
      })
      .run()
    return rowToSubscription(this.db.select().from(s.subscriptions).where(eq(s.subscriptions.id, id)).get()!)
  }

  patchSubscription(id: string, data: { display_name?: string; enabled?: boolean; auto_update?: boolean }): Subscription | null {
    const cur = this.db.select().from(s.subscriptions).where(eq(s.subscriptions.id, id)).get()
    if (!cur) return null
    this.db
      .update(s.subscriptions)
      .set({
        displayName: data.display_name ?? cur.displayName,
        enabled: data.enabled === undefined ? cur.enabled : data.enabled ? 1 : 0,
        autoUpdate: data.auto_update === undefined ? cur.autoUpdate : data.auto_update ? 1 : 0,
        updatedAt: now(),
      })
      .where(eq(s.subscriptions.id, id))
      .run()
    return rowToSubscription(this.db.select().from(s.subscriptions).where(eq(s.subscriptions.id, id)).get()!)
  }

  deleteSubscription(id: string): { ok: boolean } {
    this.db.delete(s.subscriptions).where(eq(s.subscriptions.id, id)).run()
    this.tombstone('subscriptions', id)
    return { ok: true }
  }
}

// ---------- 辅助 ----------

function groupMarksByDate(marks: Mark[]): Record<string, Mark[]> {
  const out: Record<string, Mark[]> = {}
  for (const m of marks) (out[m.date] ??= []).push(m)
  return out
}

