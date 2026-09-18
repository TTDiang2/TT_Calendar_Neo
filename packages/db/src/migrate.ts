/**
 * 基线迁移：CREATE TABLE IF NOT EXISTS 全量建表。
 *
 * - ':memory:' / 新库：直接得到完整 schema
 * - 旧 Python 库：表已存在则全部跳过，零改动兼容
 *
 * 后续 schema 演进用 drizzle-kit generate 生成增量迁移（packages/db/drizzle/），
 * 不要往这份基线里追加 ALTER。
 */

import type Database from 'better-sqlite3'

const BASELINE = `
CREATE TABLE IF NOT EXISTS coloring(
  date TEXT PRIMARY KEY,
  level INTEGER NOT NULL,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS countdown(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  base_date TEXT NOT NULL,
  repeat_yearly INTEGER DEFAULT 0,
  milestone_rule TEXT,
  never_expire INTEGER DEFAULT 0,
  notes TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  sync_uid TEXT,
  repeat_type TEXT DEFAULT 'solar'
);
CREATE TABLE IF NOT EXISTS day_busy(
  date TEXT PRIMARY KEY,
  predict_level INTEGER,
  done_level INTEGER
);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer_id TEXT NOT NULL,
  source TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  color TEXT,
  extra_json TEXT,
  source_ref TEXT,
  sort_key INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  sync_uid TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_layer ON events(layer_id);
CREATE TABLE IF NOT EXISTS layer_config(
  layer_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  config_json TEXT,
  kind TEXT DEFAULT 'color',
  group_name TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS marks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer_id TEXT NOT NULL,
  date TEXT NOT NULL,
  level INTEGER,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  sync_uid TEXT
);
CREATE INDEX IF NOT EXISTS idx_marks_date ON marks(date);
CREATE INDEX IF NOT EXISTS idx_marks_layer_date ON marks(layer_id, date);
CREATE TABLE IF NOT EXISTS meta(
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS schedule(
  date TEXT PRIMARY KEY,
  am TEXT,
  pm TEXT,
  ev TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS schedule_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  category TEXT DEFAULT 'work',
  sync_uid TEXT
);
CREATE INDEX IF NOT EXISTS idx_schedule_items_date ON schedule_items(date);
CREATE TABLE IF NOT EXISTS subscriptions(
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source_key TEXT NOT NULL,
  url TEXT,
  rules_text TEXT,
  enabled INTEGER DEFAULT 1,
  auto_update INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  last_synced_at TEXT,
  config_json TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS todo(
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT DEFAULT 'notStarted',
  importance TEXT DEFAULT 'normal',
  due_date TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  completed_at TEXT,
  sort_order INTEGER DEFAULT 0,
  start_date TEXT,
  complexity TEXT DEFAULT 'medium',
  tags TEXT,
  planned_date TEXT,
  updated_at TEXT,
  alarm_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todo_list ON todo(list_id);
CREATE INDEX IF NOT EXISTS idx_todo_due ON todo(due_date);
CREATE TABLE IF NOT EXISTS todo_list(
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sync_tombstones(
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(table_name, row_key)
);
`

/**
 * 增量列（已存在的老库补列）：基线 CREATE IF NOT EXISTS 对已存在的表不生效，
 * 新列只能走 ALTER。SQL 侧没有 PRAGMA 依赖（sql.js shim 兼容），重复列报错
 * 直接吞掉即幂等。新列加进 schema.ts 的同时必须在这里登记。
 * 兜底依赖：若 ALTER 因真故障（表锁/权限）被吞，后续首条含新列的写入会
 * 「响亮失败」而非静默丢数据——故障不会被这个 catch 掩埋到用户无感。
 */
const ENSURE_COLUMNS: { table: string; ddl: string }[] = [
  { table: 'todo', ddl: 'ALTER TABLE todo ADD COLUMN alarm_at TEXT' },
]

export function ensureSchema(sqlite: Database.Database): void {
  sqlite.exec(BASELINE)
  for (const c of ENSURE_COLUMNS) {
    try {
      sqlite.exec(c.ddl)
    } catch {
      /* 列已存在：幂等跳过 */
    }
  }
}
