/**
 * 滴答清单（TickTick / 国内版 dida365）CSV 备份导入（纯解析 + 落库编排，零网络依赖）。
 *
 * 官方导出形态（调研结论，2026-10）：仅网页版、仅 CSV 单文件、仅任务数据。
 * 文件 = 前几行元数据（行数不固定）+ 表头行 + 数据行。表头识别不硬编码行数：
 * 扫描前 ~10 行，首个同时含 taskId 与 parentId（大小写不敏感）的行即表头。
 *
 * 表头（英文；国内版未实证 → 中英双别名，按列名匹配、忽略未知列——新版可能追加列）：
 *   Folder Name, List Name, Title, Tags, Content, Is Check list, Start Date, Due Date,
 *   Reminder, Repeat, Priority, Status, Created Time, Completed Time, Order, Timezone,
 *   Is All Day, Is Floating, Column Name, Column Order, View Mode, taskId, parentId
 *
 * 取值语义（社区文档级，非官方规范，待真实导出件复核）：
 *   Priority 数字 0/1/3/5=无/低/中/高；Status 0=进行中 1=已完成 2=已归档；
 *   Repeat=iCal RRULE 串；时间戳 `2025-01-15T10:30:00+0000`（UTC 形态）；
 *   Is All Day / Is Floating 布尔字面量（大小写不敏感 true/false/1/0）；
 *   Tags 逗号分隔；Content 多行引号字段、勾选项以 ▫/▪ 前缀并入；
 *   子任务=独立行 parentId 指向父 taskId；收件箱任务 List Name 可能为空。
 *
 * 智者裁决的保守边界（v1，不扩枚举不建框架）：
 *   - Folder Name 只聚合成一条 warning；Reminder / Is Check list / 看板列（Column* /
 *     View Mode）忽略；新版追加列按「未知列」自然忽略
 *   - RRULE 只降维到 daily/weekdays/weekly（todo.repeat 既有枚举），其余原样并入备注+warning
 *   - 编码含 U+FFFD 替换符（GBK 当 UTF-8 解码的典型产物）→ 整体拒绝，不许静默乱码
 *   - v1 不做：API 路线、附件、习惯番茄、去重、Folder 分组、子任务层级拆分、快照回滚
 */

import type { SqliteBackend } from '../backend'
import {
  matchColumns,
  parseCsvDetailed,
  tsToLocalDate,
  tsToLocalStamp,
  type ColumnAliases,
  type CsvImportResult,
} from './shared'

/** 表头列别名（key → 归一化写法；匹配前统一小写去空白，见 shared.matchColumns） */
const TICKTICK_ALIASES: ColumnAliases = {
  folder: ['foldername', '文件夹', '文件夹名称'],
  list: ['listname', '清单', '清单名称', '列表名称'],
  title: ['title', '标题', '任务标题'],
  tags: ['tags', '标签'],
  content: ['content', '内容', '备注'],
  start_date: ['startdate', '开始日期', '开始时间'],
  due_date: ['duedate', '截止日期', '日期', '截止时间', '到期时间'],
  reminder: ['reminder', '提醒', '提醒时间'],
  repeat: ['repeat', '重复'],
  priority: ['priority', '优先级'],
  status: ['status', '状态'],
  created: ['createdtime', '创建时间'],
  completed: ['completedtime', '完成时间'],
  order: ['order', '排序', '顺序'],
  timezone: ['timezone', '时区'],
  all_day: ['isallday', '全天'],
  floating: ['isfloating', '浮动'],
  task_id: ['taskid', '任务id'],
  parent_id: ['parentid', '父任务id', '父任务'],
}

/** 收件箱任务的兜底清单名（TickTick 导出里收件箱任务 List Name 为空；清单名是用户数据，不走 i18n） */
const INBOX_LIST_NAME = '收件箱'

/**
 * 表头行识别：前 ~10 行内首个同时含 taskId 与 parentId 的行下标；没有则 -1。
 * 元数据行不会同时含这两个列名，表头行数变化（新版加元数据行）也不受影响。
 */
function findHeaderRow(rows: string[][]): number {
  const scan = rows.slice(0, 10)
  for (let i = 0; i < scan.length; i++) {
    const cols = matchColumns(scan[i]!, TICKTICK_ALIASES)
    if (cols['task_id'] !== undefined && cols['parent_id'] !== undefined) return i
  }
  return -1
}

/** 是否识别为滴答清单备份 CSV（入口路由用，见 csv-todos.importTodosCsvOnBackend） */
export function detectTickTickCsv(rows: string[][]): boolean {
  return findHeaderRow(rows) >= 0
}

/** 布尔字面量（大小写不敏感 true/false/1/0；其余一律按 false） */
function boolCell(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s === 'true' || s === '1'
}

export interface RepeatDemotion {
  /** todo.repeat 既有枚举内的值；null = 不重复或未迁移 */
  repeat: 'daily' | 'weekdays' | 'weekly' | null
  /** true = 未迁移，需把 RRULE 原文写入备注并计 warning */
  unmapped: boolean
}

/**
 * RRULE 保守降维（裁决 4：映射错误一票否决，宁可不迁移也不映错）：
 *  - FREQ=DAILY 且 INTERVAL=1 且无其他子句 → daily
 *  - BYDAY 恰好 MO,TU,WE,TH,FR（周末 RRULE 绝不映成 weekdays）→ weekdays
 *  - FREQ=WEEKLY 无 BYDAY 或单值 BYDAY → weekly
 *  - 其余一切（MONTHLY/YEARLY/INTERVAL≠1/多天 BYDAY/BYSETPOS/COUNT/UNTIL…）→ null + 备注
 */
function demoteRepeat(raw: string): RepeatDemotion {
  const v = raw.trim()
  if (!v) return { repeat: null, unmapped: false }
  const kv: Record<string, string> = {}
  for (const part of v.replace(/^rrule:/i, '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) kv[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim()
  }
  const freq = (kv['FREQ'] ?? '').toUpperCase()
  const interval = kv['INTERVAL'] !== undefined ? Number(kv['INTERVAL']) : 1
  const byday = kv['BYDAY']
    ? kv['BYDAY'].split(',').map((d) => d.trim().toUpperCase()).filter(Boolean)
    : null
  // COUNT/UNTIL/BYSETPOS/BYMONTH 等任何限定子句存在即降维失败
  const hasExtra = Object.keys(kv).some((k) => !['FREQ', 'INTERVAL', 'BYDAY'].includes(k))
  const simple = interval === 1 && !hasExtra
  if (simple && freq === 'DAILY' && !byday) return { repeat: 'daily', unmapped: false }
  if (simple && byday && byday.length === 5 && (freq === 'WEEKLY' || freq === 'DAILY')) {
    const days: string[] = byday
    // 恰好五个工作日（多一天/少一天/含周末都不算）——周末 RRULE 映成 weekdays 即事故
    if (['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => days.includes(d))) {
      return { repeat: 'weekdays', unmapped: false }
    }
  }
  if (simple && freq === 'WEEKLY' && (!byday || byday.length === 1)) {
    return { repeat: 'weekly', unmapped: false }
  }
  return { repeat: null, unmapped: true }
}

/**
 * 解析并导入滴答清单 CSV 备份（清单自动创建；坏行跳过并报物理行号）。
 * 由 csv-todos.importTodosCsvOnBackend 在 detect 命中后路由进来，也可直接调用。
 */
export function importTickTickCsvOnBackend(backend: SqliteBackend, text: string): CsvImportResult {
  const errors: string[] = []
  const warnings: string[] = []
  // 编码硬闸（裁决 9）：文本里出现 U+FFFD 替换符 = 文件不是 UTF-8（GBK 直接喂进来的
  // 典型产物）——整体拒绝导入并要求重新导出，不许静默乱码
  if (text.includes('\uFFFD')) {
    return {
      inserted: 0,
      lists_created: 0,
      errors: ['文件编码需为 UTF-8，请重新导出'],
      warnings: [],
      source: 'ticktick',
    }
  }

  // lineOf = 每行起始的 CSV 物理行号（多行引号字段占多行，errors 定位必须用物理行）
  const { rows, lineOf } = parseCsvDetailed(text)
  const headerIdx = findHeaderRow(rows)
  if (headerIdx < 0) {
    return {
      inserted: 0,
      lists_created: 0,
      errors: ['未找到滴答清单表头（应含 taskId 与 parentId 列）'],
      warnings: [],
      source: 'ticktick',
    }
  }
  const colIndex = matchColumns(rows[headerIdx]!, TICKTICK_ALIASES)
  if (colIndex['title'] === undefined) {
    return {
      inserted: 0,
      lists_created: 0,
      errors: ['缺少 Title（标题）列'],
      warnings: [],
      source: 'ticktick',
    }
  }
  const get = (cells: string[], key: string): string =>
    colIndex[key] !== undefined ? (cells[colIndex[key]!] ?? '') : ''

  // ---- 清单复用/自动创建（与 generic 路径同一套语义） ----
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

  // ---- 逐行解析为批量插入行 ----
  type ImportRow = Parameters<SqliteBackend['importTodosBatch']>[0][number]
  const batchRows: ImportRow[] = []
  const folders = new Set<string>()
  const seenTaskIds = new Set<string>()

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i]!
    const lineNo = lineOf[i] ?? i + 1 // CSV 物理行号（含元数据、表头与多行字段的位移）
    const title = get(cells, 'title').trim()
    if (!title) {
      errors.push(`第${lineNo}行：缺少标题，已跳过`)
      continue
    }

    // 同 taskId 多行 = 导出异常，折叠保留首行（子任务行有自己的 taskId，一并去重）
    const taskId = get(cells, 'task_id').trim()
    if (taskId) {
      if (seenTaskIds.has(taskId)) {
        warnings.push(`第${lineNo}行：taskId「${taskId}」重复出现，保留首行、跳过本行`)
        continue
      }
      seenTaskIds.add(taskId)
    }

    const tz = get(cells, 'timezone').trim() || undefined
    const allDay = boolCell(get(cells, 'all_day'))
    const floating = boolCell(get(cells, 'floating'))

    // 日期换算收口走 shared.tsToLocalDate：全天/浮动只取日期部分，其余按 Timezone 换算
    const dates: Array<[string, 'due_date' | 'start_date']> = [
      ['due_date', 'due_date'],
      ['start_date', 'start_date'],
    ]
    const parsedDates: Partial<Record<'due_date' | 'start_date', string>> = {}
    for (const [col, key] of dates) {
      const raw = get(cells, col).trim()
      if (!raw) continue
      const v = tsToLocalDate(raw, tz, floating)
      if (v === null) {
        errors.push(`第${lineNo}行：${col === 'due_date' ? '截止日期' : '开始日期'}「${raw}」无法解析，已忽略该日期`)
        continue
      }
      parsedDates[key] = v
    }

    // Priority：0/1/3/5=无/低/中/高（0 映普通不映 low）；未知值按普通 + warning
    const pRaw = get(cells, 'priority').trim()
    let importance = 'normal'
    if (pRaw === '5') importance = 'high'
    else if (pRaw === '1') importance = 'low'
    else if (pRaw !== '' && pRaw !== '0' && pRaw !== '3') {
      warnings.push(`第${lineNo}行：未知优先级「${pRaw}」，按普通处理`)
    }

    // Status：1=已完成（Completed Time → completed_at）；2=已归档按已完成 + warning；
    // -1=已放弃按未开始导入 + warning（复活为待办需告知用户）；0/空=未开始；
    // 其他未知值一律按未开始 + warning（与未知优先级的警告对称，绝不静默）
    const sRaw = get(cells, 'status').trim()
    const completed = sRaw === '1' || sRaw === '2'
    if (sRaw === '2') warnings.push(`第${lineNo}行：状态「2」（已归档/可能已放弃）按已完成导入`)
    else if (sRaw === '-1') warnings.push(`第${lineNo}行：状态「-1」（已放弃）按未开始导入`)
    else if (sRaw !== '' && sRaw !== '0' && sRaw !== '1') warnings.push(`第${lineNo}行：未知状态「${sRaw}」按未开始导入`)
    const completedRaw = get(cells, 'completed').trim()
    let completedAt: string | undefined
    if (completed) {
      completedAt = completedRaw ? (tsToLocalStamp(completedRaw, tz) ?? undefined) : undefined
      if (completedRaw && !completedAt) {
        errors.push(`第${lineNo}行：完成时间「${completedRaw}」无法解析，完成时间未记录`)
      }
    }
    const createdRaw = get(cells, 'created').trim()
    const createdAt = createdRaw ? (tsToLocalStamp(createdRaw, tz) ?? undefined) : undefined
    if (createdRaw && !createdAt) {
      errors.push(`第${lineNo}行：创建时间「${createdRaw}」无法解析，创建时间未记录`)
    }

    // RRULE 降维：未迁移的原样并入备注一行
    const repeatRaw = get(cells, 'repeat')
    const rr = demoteRepeat(repeatRaw)
    const content = get(cells, 'content')
    const note = rr.unmapped ? `重复（未迁移）：${repeatRaw.trim()}` : ''
    const body = [content, note].filter((s) => s.length > 0).join('\n') || null
    if (rr.unmapped) warnings.push(`第${lineNo}行：重复规则未迁移，RRULE 原文已写入备注`)

    const tagsRaw = get(cells, 'tags').trim()
    const tags = tagsRaw
      ? tagsRaw.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      : null

    // 子任务（parentId 指向父 taskId）→ 独立 todo，标题加前缀、不加系统标签
    const parentId = get(cells, 'parent_id').trim()
    const finalTitle = parentId ? `↳ ${title}` : title

    const listName = get(cells, 'list').trim() || INBOX_LIST_NAME

    const folder = get(cells, 'folder').trim()
    if (folder) folders.add(folder)

    const orderRaw = get(cells, 'order').trim()
    const sortOrder = orderRaw !== '' && Number.isFinite(Number(orderRaw)) ? Number(orderRaw) : null

    batchRows.push({
      list_id: listIdOf(listName),
      title: finalTitle,
      body,
      importance,
      status: completed ? 'completed' : 'notStarted',
      due_date: parsedDates['due_date'] ?? null,
      start_date: parsedDates['start_date'] ?? null,
      tags,
      repeat: rr.repeat,
      created_at: createdAt,
      completed_at: completedAt,
      sort_order: sortOrder,
    })
  }

  // Folder Name 整体不迁移，聚合成一条 warning
  if (folders.size > 0) {
    warnings.push(`${folders.size} 个文件夹分组未迁移`)
  }

  const inserted = backend.importTodosBatch(batchRows)
  return { inserted, lists_created: listsCreated, errors, warnings, source: 'ticktick' }
}
