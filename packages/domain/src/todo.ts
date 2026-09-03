/**
 * 待办的纯领域逻辑（移植自 frontend/src/utils/todoLogic.ts + tt_calendar/db.py 的排序语义）。
 *
 * 零 IO：所有函数都是 (数据, today) → 结果，可在任意环境单测。
 */

import type { DateStr, Todo, TodoSort, Complexity } from '@tt-calendar/contracts'
import { addDays, diffDays, todayStr } from './date'

export type UrgencyLevel = 'urgent' | 'soon' | 'later'

/**
 * 紧急度：due 优先 + planned 兜底（TODO_VIEWS_DESIGN.md §2.1）。
 *  - 有 due：剩余 ≤3 天 urgent，≤7 天 soon，否则 later
 *  - 无 due 有 planned：planned ≤ 今天 urgent，否则 later
 *  - 都没有：later
 */
export function urgencyOf(t: Todo, today: DateStr = todayStr()): UrgencyLevel {
  if (t.due_date) {
    const slack = diffDays(today, t.due_date)
    if (slack <= 3) return 'urgent'
    if (slack <= 7) return 'soon'
    return 'later'
  }
  if (t.planned_date) {
    return diffDays(today, t.planned_date) <= 0 ? 'urgent' : 'later'
  }
  return 'later'
}

/** 距到期天数：正=还剩 N 天，0=今天到期，负=已逾期 N 天；无 due 返回 null。
 * （注意：TT_Calendar 旧版注释写反了，实现语义是 due - today，此处保持实现一致） */
export function dueInDays(t: Todo, today: DateStr = todayStr()): number | null {
  if (!t.due_date) return null
  return diffDays(today, t.due_date)
}

/** 重要性轴（TODO_VIEWS_DESIGN.md §2.2） */
export function isImportant(t: Todo): boolean {
  return t.importance === 'high'
}

/** 四象限：(紧急?, 重要?) → 矩阵视图的象限键 */
export type QuadrantKey = 'doNow' | 'planIt' | 'delegate' | 'drop'
export function quadrantOf(t: Todo, today: DateStr = todayStr()): QuadrantKey {
  const urgent = urgencyOf(t, today) !== 'later'
  const important = isImportant(t)
  if (urgent && important) return 'doNow'
  if (!urgent && important) return 'planIt'
  if (urgent && !important) return 'delegate'
  return 'drop'
}

export const QUADRANT_LABELS: Record<QuadrantKey, string> = {
  doNow: '重要且紧急',
  planIt: '重要不紧急',
  delegate: '紧急不重要',
  drop: '不紧急不重要',
}

export interface GanttRange {
  start: DateStr
  end: DateStr
  overdue: boolean
  completed: boolean
}

/**
 * 甘特区间（TODO_VIEWS_DESIGN.md §2.3）：
 * start = created_at（兜底 planned → due → today）
 * end   = 已完成取 completed_at；未完成取 due → planned，若缺失或已过期则截断到今天并标 overdue
 */
export function ganttRange(t: Todo, today: DateStr = todayStr()): GanttRange {
  const completed = t.status === 'completed'
  const dateOf = (dt: string | null): DateStr | null =>
    dt ? (dt.slice(0, 10) as DateStr) : null

  const start = dateOf(t.created_at) ?? t.planned_date ?? t.due_date ?? today
  let end = completed ? dateOf(t.completed_at) : (t.due_date ?? t.planned_date ?? null)
  let overdue = false

  if (!completed) {
    const naturalEnd = end
    if (!naturalEnd || naturalEnd < today) {
      end = today
      overdue = !!naturalEnd
    }
  }
  return { start, end: end ?? start, overdue, completed }
}

// ---------------------------------------------------------------------------
// 排序（移植 tt_calendar/db.py _TODO_SORT_SQL）
// ---------------------------------------------------------------------------

/** 空值排最后（SQLite 的 CASE WHEN x IS NULL THEN 1 ELSE 0 END） */
function byNullableDate(
  pick: (t: Todo) => DateStr | null,
  dir: 'asc' | 'desc' = 'asc',
): (a: Todo, b: Todo) => number {
  return (a, b) => {
    const av = pick(a)
    const bv = pick(b)
    if (av === bv) return 0
    if (av === null) return 1
    if (bv === null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  }
}

/** importance 权重：high=0, normal=1, 其余=2，与 SQLite CASE 一致 */
function importanceRank(t: Todo): number {
  return t.importance === 'high' ? 0 : t.importance === 'normal' ? 1 : 2
}

/** due 与 planned 中较早的那个（对应 COALESCE(MIN(due,planned), due, planned)） */
function effectiveDate(t: Todo): DateStr | null {
  if (t.due_date && t.planned_date) return t.due_date < t.planned_date ? t.due_date : t.planned_date
  return t.due_date ?? t.planned_date
}

const SORTERS: Record<TodoSort, (a: Todo, b: Todo) => number> = {
  manual: (a, b) => a.sort_order - b.sort_order,
  due_importance: (a, b) =>
    byNullableDate((t) => t.due_date)(a, b) || importanceRank(a) - importanceRank(b),
  due_planned_importance: (a, b) =>
    byNullableDate(effectiveDate)(a, b) || importanceRank(a) - importanceRank(b),
  due: byNullableDate((t) => t.due_date),
  planned: byNullableDate((t) => t.planned_date),
  importance: (a, b) => importanceRank(a) - importanceRank(b),
  created: (a, b) => (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1,
}

/**
 * 排序待办。注意与原 SQL 一致的两条特例：
 *  - manual 不加次级排序键（sort_order 本身就是最终键）
 *  - status_filter='completed' 时一律按 completed_at 倒序（否则刚完成的任务会沉底）
 */
export function sortTodos<T extends Todo>(
  todos: T[],
  sort: TodoSort = 'due_importance',
  statusFilter: 'notStarted' | 'all' | 'completed' = 'notStarted',
): T[] {
  const out = [...todos]
  if (statusFilter === 'completed') {
    out.sort((a, b) => ((a.completed_at ?? '') > (b.completed_at ?? '') ? -1 : 1))
    return out
  }
  const cmp = SORTERS[sort] ?? SORTERS.due_importance
  out.sort((a, b) => (sort === 'manual' ? cmp(a, b) : cmp(a, b) || a.sort_order - b.sort_order))
  return out
}

/** 已过期的未完成待办（due < today） */
export function overdueTodos<T extends Todo>(todos: T[], today: DateStr = todayStr()): T[] {
  return todos.filter(
    (t) => t.status !== 'completed' && t.due_date != null && t.due_date < today,
  )
}

/** 今天该做的（planned 命中今天，或 due 就是今天） */
export function todayTodos<T extends Todo>(todos: T[], today: DateStr = todayStr()): T[] {
  return todos.filter(
    (t) => t.status !== 'completed' && (t.planned_date === today || t.due_date === today),
  )
}

/** 未来 7 天内到期（含今天） */
export function upcomingTodos<T extends Todo>(
  todos: T[],
  days = 7,
  today: DateStr = todayStr(),
): T[] {
  const until = addDays(today, days)
  return todos.filter(
    (t) =>
      t.status !== 'completed' &&
      t.due_date != null &&
      t.due_date >= today &&
      t.due_date <= until,
  )
}

/** 复杂度权重（domain 层用，见 contracts/settings.ts 的历史缺陷说明） */
export function resolveComplexityWeight(
  weights: Record<string, number>,
  complexity: Complexity | string,
  fallback = 1,
): number {
  if (complexity in weights) return weights[complexity] ?? fallback
  // 历史配置的键是 high/medium/low，与 simple/medium/hard 对不上 → 一律回落 medium
  return weights['medium'] ?? fallback
}
