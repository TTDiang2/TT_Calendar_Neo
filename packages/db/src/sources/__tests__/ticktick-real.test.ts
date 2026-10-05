/**
 * 真实 dida365 导出件回归（2026-10-05 用户账号实测导出，脱敏后入库）：
 * fixtures/dida365-real-export.csv。实证结论（与社区文档的差异）：
 *  - preamble 3 行（Date/Version/Status，Status 值为多行引号字段）
 *  - 表头英文，多 Kind/projectKind 两列；List Name 可含 emoji（👋欢迎）
 *  - Repeat 无 RRULE: 前缀（FREQ=DAILY;INTERVAL=1）
 *  - Reminder 是 ISO 8601 duration 负偏移（-P0DT15H0M0S）——v1 丢弃计 errors
 *  - Status 枚举含 -1 Abandoned；Order 为负大数
 * 本文件钉死这些真实形态不被未来重构破坏。
 */
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { detectTickTickCsv, importTickTickCsvOnBackend } from '../ticktick'
import { parseCsv } from '../csv-todos'
import { openDb, SqliteBackend } from '../../index'

const REAL = readFileSync(
  new URL('./fixtures/dida365-real-export.csv', import.meta.url),
  'utf8',
)

describe('真实 dida365 导出回归', () => {
  const { db, sqlite } = openDb({ path: ':memory:' })
  const backend = new SqliteBackend(db)
  afterAll(() => sqlite.close())

  const rows = parseCsv(REAL)
  it('detect 识别（表头在第 4 行，preamble 3 行）', () => {
    expect(detectTickTickCsv(rows)).toBe(true)
  })

  const result = importTickTickCsvOnBackend(backend, REAL)

  it('计数：15 条任务 / 3 清单 / errors 空 / 状态2 警告 ×2', () => {
    expect(result.source).toBe('ticktick')
    expect(result.inserted).toBe(15)
    expect(result.lists_created).toBe(3)
    expect(result.errors).toEqual([])
    expect(result.warnings.filter((w) => w.includes('已归档')).length).toBe(2)
  })

  it('清单：个人/工作/👋欢迎（emoji 清单名）', () => {
    const names = backend.getTodoLists().map((l) => l.display_name).sort()
    expect(names).toEqual(['个人', '工作', '👋欢迎'])
  })

  it('站会：RRULE 无前缀降维 daily + All Day 时区换算 10-04→10-05', () => {
    const t = backend
      .getTodos({ status: 'all' })
      .find((x) => x.title === '站会')
    expect(t).toBeTruthy()
    expect(t!.repeat).toBe('daily')
    expect(t!.due_date).toBe('2026-10-05') // UTC 10-04T16:00 +08 → 本地 10-05
    expect(t!.status).toBe('notStarted')
  })

  it('整理季度报表：已完成 + completed_at 本地化落库 + Reminder duration 丢弃不崩', () => {
    const t = backend
      .getTodos({ status: 'all' })
      .find((x) => x.title === '整理季度报表')
    expect(t).toBeTruthy()
    expect(t!.status).toBe('completed')
    expect(t!.completed_at).toContain('2026-10-05')
    expect(t!.completed_at).toContain('+08:00')
    expect(t!.due_date).toBe('2026-10-06') // UTC 10-05T16:00 +08 → 本地 10-06（明天）
  })

  it('emoji 清单任务正文多行 Markdown 原样保留', () => {
    const t = backend
      .getTodos({ status: 'all' })
      .find((x) => x.title === '📋 用清单来管理任务')
    expect(t?.body).toContain('收集箱')
    expect(t?.body).toContain('智能清单')
  })
})
