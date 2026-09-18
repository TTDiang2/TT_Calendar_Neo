/**
 * Drizzle SQLite schema —— 与既有 calendar.db **逐列对齐**。
 *
 * 目标：Neo 可以直接打开 Python 版创建的库文件（迁移 = 复制文件），
 * 列名/类型/默认值不得自行发挥。对齐基准：2026-09 导出的 sqlite_master。
 * 表的语义、同步身份键见 contracts/src/sync.ts。
 */

import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

const NOW = sql`datetime('now','localtime')`

/** 内置充实度染色（date 主键） */
export const coloring = sqliteTable('coloring', {
  date: text('date').primaryKey(),
  level: integer('level').notNull(),
  updatedAt: text('updated_at').default(NOW),
})

/** 倒数日 */
export const countdown = sqliteTable('countdown', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  category: text('category').notNull().default('其他'),
  baseDate: text('base_date').notNull(),
  repeatYearly: integer('repeat_yearly').notNull().default(0),
  milestoneRule: text('milestone_rule'),
  neverExpire: integer('never_expire').notNull().default(0),
  notes: text('notes'),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').default(NOW),
  updatedAt: text('updated_at').default(NOW),
  syncUid: text('sync_uid'),
  repeatType: text('repeat_type').notNull().default('solar'),
})

/** 待办忙度快照（domain/busy.ts 写入） */
export const dayBusy = sqliteTable('day_busy', {
  date: text('date').primaryKey(),
  predictLevel: integer('predict_level'),
  doneLevel: integer('done_level'),
})

/** 事件（聚合来源：手工 / 订阅导入 / 节假日） */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    layerId: text('layer_id').notNull(),
    source: text('source').notNull(),
    date: text('date').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    color: text('color'),
    extraJson: text('extra_json'),
    sourceRef: text('source_ref'),
    sortKey: integer('sort_key').notNull().default(0),
    createdAt: text('created_at').default(NOW),
    updatedAt: text('updated_at').default(NOW),
    syncUid: text('sync_uid'),
  },
  (t) => [
    index('idx_events_date').on(t.date),
    index('idx_events_layer').on(t.layerId),
  ],
)

/** 图层配置（含内置图层；config_json 存 mode/palette/category 等） */
export const layerConfig = sqliteTable('layer_config', {
  layerId: text('layer_id').primaryKey(),
  displayName: text('display_name').notNull(),
  enabled: integer('enabled').notNull().default(1),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  configJson: text('config_json'),
  kind: text('kind').notNull().default('color'),
  groupName: text('group_name'),
  updatedAt: text('updated_at'),
})

/** 涂色标记（打卡 / 自定义完成度；行身份 sync_uid） */
export const marks = sqliteTable(
  'marks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    layerId: text('layer_id').notNull(),
    date: text('date').notNull(),
    level: integer('level'),
    note: text('note'),
    createdAt: text('created_at').default(NOW),
    updatedAt: text('updated_at').default(NOW),
    syncUid: text('sync_uid'),
  },
  (t) => [index('idx_marks_date').on(t.date), index('idx_marks_layer_date').on(t.layerId, t.date)],
)

/** 键值元数据（忙度配置 / 同步凭据等；sync. 前缀键永不导出） */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at'),
})

/** 旧版上午/下午/晚间三段日程 */
export const schedule = sqliteTable('schedule', {
  date: text('date').primaryKey(),
  am: text('am'),
  pm: text('pm'),
  ev: text('ev'),
  updatedAt: text('updated_at').default(NOW),
})

/** 新版日程条目（多条、带起止时间） */
export const scheduleItems = sqliteTable(
  'schedule_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    startTime: text('start_time'),
    endTime: text('end_time'),
    title: text('title').notNull(),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').default(NOW),
    updatedAt: text('updated_at').default(NOW),
    category: text('category').notNull().default('work'),
    syncUid: text('sync_uid'),
  },
  (t) => [index('idx_schedule_items_date').on(t.date)],
)

/** 订阅源 */
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  sourceKey: text('source_key').notNull(),
  url: text('url'),
  rulesText: text('rules_text'),
  enabled: integer('enabled').notNull().default(1),
  autoUpdate: integer('auto_update').notNull().default(1),
  status: text('status').notNull().default('pending'),
  lastSyncedAt: text('last_synced_at'),
  configJson: text('config_json'),
  createdAt: text('created_at').default(NOW),
  updatedAt: text('updated_at').default(NOW),
})

/** 待办 */
export const todo = sqliteTable(
  'todo',
  {
    id: text('id').primaryKey(),
    listId: text('list_id').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    status: text('status').notNull().default('notStarted'),
    importance: text('importance').notNull().default('normal'),
    dueDate: text('due_date'),
    createdAt: text('created_at').default(NOW),
    completedAt: text('completed_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    startDate: text('start_date'),
    complexity: text('complexity').notNull().default('medium'),
    tags: text('tags'),
    plannedDate: text('planned_date'),
    /** 闹钟（20260918 1.3-5）：本地时刻 YYYY-MM-DDTHH:mm，null = 未设 */
    alarmAt: text('alarm_at'),
    updatedAt: text('updated_at'),
  },
  (t) => [index('idx_todo_list').on(t.listId), index('idx_todo_due').on(t.dueDate)],
)

/** 待办清单 */
export const todoList = sqliteTable('todo_list', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').default(NOW),
  updatedAt: text('updated_at'),
})

/**
 * 同步墓碑（table_name, row_key）→ deleted_at。
 * 守卫规则见 contracts/src/sync.ts（meta 的 sync.% 键不产生墓碑）。
 */
export const syncTombstones = sqliteTable(
  'sync_tombstones',
  {
    tableName: text('table_name').notNull(),
    rowKey: text('row_key').notNull(),
    deletedAt: text('deleted_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tableName, t.rowKey] })],
)
