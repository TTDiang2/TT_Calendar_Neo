/**
 * 待办忙度折算（移植自 backend/aggregator.py compute_todo_busy_level）。
 *
 * 忙度是「待办 → 日历染色」的自动图层：predict（琥珀，未来）+ done（钢蓝，过去）。
 * 结果写入 day_busy 表作为快照，视图层不实时计算。
 */

import type { DateStr, Todo, TodoBusyConfig } from '@tt-calendar/contracts'
import { DEFAULT_TODO_BUSY_CONFIG } from '@tt-calendar/contracts'
import { resolveComplexityWeight } from './todo'

/** 0..4 档；score 低于 thresholds[0] 返回 null（不染色） */
export type BusyLevel = 0 | 1 | 2 | 3 | 4 | null

/**
 * 按配置的权重把当日 todo 折算成 0..4 档。
 *
 * 累加规则（与 Python 逐字一致）：
 *  - due_date 命中当日 → +w.due_date
 *  - planned_date 命中当日 → +w.planned_date
 *  - 每条 todo 无论是否命中日期，都 + (importance 权重 × complexity 权重)
 *  - 同一条 todo 同时挂 due 和 planned 时**两个都加** —— 这是设计意图，
 *    用户特意标两个日期就是想强调那天（Python 版注释原文）
 *
 * @param mode 'predict' 传未完成的 todo；'done' 传 completed_at 命中当日的 todo
 */
export function computeTodoBusyLevel(
  date: DateStr,
  todos: readonly Todo[],
  cfg: TodoBusyConfig = DEFAULT_TODO_BUSY_CONFIG,
  _mode: 'predict' | 'done' = 'predict',
): BusyLevel {
  if (!todos.length) return null

  const w = cfg.weights
  const imp = w.importance
  const comp = w.complexity

  let score = 0
  for (const t of todos) {
    if (t.due_date === date) score += w.due_date
    if (t.planned_date === date) score += w.planned_date
    // importance 权重键只有 low/medium/high；Python .get() 语义下
    // 'normal' 查不到 → 回落 medium（1.0）。与 complexity 的键缺陷同类，保留。
    const impW = imp as Record<string, number | undefined>
    score +=
      (impW[t.importance] ?? impW['medium'] ?? 1) *
      resolveComplexityWeight(comp, t.complexity, 1)
  }

  const thresholds = cfg.thresholds
  let level = 0
  for (let i = 4; i >= 0; i--) {
    if (score >= thresholds[i]) {
      level = i
      break
    }
  }
  return score >= thresholds[0] ? (level as 0 | 1 | 2 | 3 | 4) : null
}

export interface BusyDay {
  date: DateStr
  predict_level: number | null
  done_level: number | null
}

export interface BusyColorChip {
  id: 'todo' | 'todo_done'
  color: string
}

/**
 * 给某天计算应该叠加哪些忙度色块（移植自 frontend/src/data.ts getBusyColors）。
 *
 *  - 过去：只显示 done 层（那天实际完成了多少）
 *  - 今天：两层叠加，done 在下、predict 在上（看得到「今天还剩多少没做」）
 *  - 未来：只显示 predict 层（那天预计会有多忙）
 */
export function getBusyColors(
  day: BusyDay,
  today: DateStr,
  cfg: TodoBusyConfig = DEFAULT_TODO_BUSY_CONFIG,
): BusyColorChip[] {
  const predictColors = cfg.predict_colors
  const doneColors = cfg.done_colors
  const inRange = (lv: number | null) => lv != null && lv >= 0 && lv < 5

  const out: BusyColorChip[] = []
  const pushDone = () => {
    if (inRange(day.done_level)) out.push({ id: 'todo_done', color: doneColors[day.done_level!] })
  }
  const pushPredict = () => {
    if (inRange(day.predict_level))
      out.push({ id: 'todo', color: predictColors[day.predict_level!] })
  }

  if (day.date < today) {
    pushDone()
    return out
  }
  if (day.date === today) {
    pushPredict()
    pushDone()
    return out
  }
  pushPredict()
  return out
}
