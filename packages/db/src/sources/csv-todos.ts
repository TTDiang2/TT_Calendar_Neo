/**
 * 待办 CSV 导入（纯解析 + 落库编排，零网络依赖）。
 *
 * 入口先做数据源识别（裁决 11：UI 零双入口，识别放数据面）：
 * 命中滴答清单备份（taskId+parentId 表头）即路由 sources/ticktick.ts 专用解析器，
 * 否则走本文件的 generic 路径（行为与 2026-10 之前完全一致）。
 *
 * CSV 格式约定（首行表头，UTF-8，BOM 容忍）：
 *   title（必填）, list（清单名，缺省「导入」）, importance(high/normal/low),
 *   status, due_date, planned_date, start_date（YYYY-MM-DD）,
 *   tags（| 或 ; 分隔）, body
 * 引号字段支持逗号/换行；列名大小写不敏感，中英文别名均可。
 *
 * 行为：
 *   - 清单按名字去重，缺失时自动创建（计入 lists_created）
 *   - 标题缺失/日期非法的行跳过并记入 errors（含行号）
 *   - id 由后端生成（crypto.randomUUID），导入数据天然可同步
 */

import type { SqliteBackend } from '../backend'
import type { CsvImportResult } from './shared'
import { parseCsv } from './shared'
import { detectTickTickCsv, importTickTickCsvOnBackend } from './ticktick'

// parseCsv / CsvImportResult 的本体在 shared.ts（滴答与 generic 两条路径共用），这里保持既有导出面
export { parseCsv } from './shared'
export type { CsvImportResult } from './shared'

const COLUMN_ALIASES: Record<string, string[]> = {
  list: ['list', 'list_name', '清单', '列表'],
  title: ['title', '标题', '任务'],
  importance: ['importance', '重要级', '优先级'],
  status: ['status', '状态'],
  due_date: ['due_date', 'due', '截止'],
  planned_date: ['planned_date', 'planned', '计划日期'],
  start_date: ['start_date', 'start', '开始日期'],
  tags: ['tags', '标签'],
  body: ['body', '备注', '描述'],
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDateCell(cell: string, lineNo: number, col: string, errors: string[]): string | null {
  const v = cell.trim()
  if (!v) return null
  if (DATE_RE.test(v)) return v
  errors.push(`第${lineNo}行：${col}「${v}」不是 YYYY-MM-DD，已忽略该日期`)
  return null
}

/** 解析并导入 CSV 待办（清单自动创建，坏行跳过并报行号；滴答清单备份自动路由专用解析器） */
export function importTodosCsvOnBackend(backend: SqliteBackend, text: string): CsvImportResult {
  const rows = parseCsv(text)
  // 数据面单一入口：先识别滴答清单备份，命中即整体路由（generic 路径不碰这份文件）
  if (detectTickTickCsv(rows)) {
    return importTickTickCsvOnBackend(backend, text)
  }
  if (rows.length === 0) {
    return { inserted: 0, lists_created: 0, errors: ['文件为空'], warnings: [], source: 'generic' }
  }

  const header = rows[0]!.map((c) => c.trim().toLowerCase())
  const colIndex: Record<string, number> = {}
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = header.findIndex((h) => aliases.includes(h))
    if (idx >= 0) colIndex[key] = idx
  }
  if (colIndex['title'] === undefined) {
    return { inserted: 0, lists_created: 0, errors: ['缺少 title（标题）列'], warnings: [], source: 'generic' }
  }

  const errors: string[] = []
  const listIds = new Map<string, string>()
  for (const l of backend.getTodoLists()) listIds.set(l.display_name, l.id)
  let listsCreated = 0

  const listIdOf = (name: string): string => {
    const hit = listIds.get(name)
    if (hit) return hit
    const created = backend.createTodoList(name)
    listIds.set(name, created.id)
    listsCreated += 1
    return created.id
  }

  let inserted = 0
  for (let i = 1; i < rows.length; i++) {
    const lineNo = i + 1
    const cells = rows[i]!
    const get = (key: string): string => (colIndex[key] !== undefined ? (cells[colIndex[key]!] ?? '') : '')
    const title = get('title').trim()
    if (!title) {
      errors.push(`第${lineNo}行：缺少标题，已跳过`)
      continue
    }
    const dates: Array<[string, 'due_date' | 'planned_date' | 'start_date']> = [
      ['due_date', 'due_date'],
      ['planned_date', 'planned_date'],
      ['start_date', 'start_date'],
    ]
    const parsed: Record<string, string | null> = {}
    let badDate = false
    for (const [key, col] of dates) {
      const raw = get(col)
      if (colIndex[col] === undefined || !raw.trim()) continue
      const v = parseDateCell(raw, lineNo, col, errors)
      if (v === null) {
        badDate = true
        break
      }
      parsed[key] = v
    }
    if (badDate) continue

    const listName = get('list').trim() || '导入'
    const tagsRaw = get('tags').trim()
    const tags = tagsRaw
      ? tagsRaw.split(/[|;；]/).map((t) => t.trim()).filter(Boolean)
      : null

    // importance 归一化小写并校验（Excel 常见 HIGH/High 写法）
    const impRaw = get('importance').trim().toLowerCase()
    const importance = (['high', 'normal', 'low'] as const).includes(impRaw as 'high')
      ? impRaw
      : 'normal'

    backend.createTodo({
      list_id: listIdOf(listName),
      title,
      body: get('body').trim() || null,
      importance,
      due_date: parsed['due_date'] ?? null,
      planned_date: parsed['planned_date'] ?? null,
      start_date: parsed['start_date'] ?? null,
      tags,
    })
    inserted += 1
  }

  return { inserted, lists_created: listsCreated, errors, warnings: [], source: 'generic' }
}
