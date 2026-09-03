import { describe, expect, it } from 'vitest'

import type { DateStr, Todo, TodoBusyConfig } from '@tt-calendar/contracts'
import { DEFAULT_TODO_BUSY_CONFIG } from '@tt-calendar/contracts'
import { computeTodoBusyLevel, getBusyColors } from './busy'

const DATE = '2026-09-02' as DateStr
const cfg = DEFAULT_TODO_BUSY_CONFIG

let seq = 0
function makeTodo(overrides: Partial<Todo> = {}): Todo {
  seq += 1
  return {
    id: `t${seq}`,
    list_id: 'inbox',
    title: `todo ${seq}`,
    body: null,
    status: 'notStarted',
    importance: 'normal',
    due_date: null,
    planned_date: null,
    start_date: null,
    complexity: 'simple',
    tags: null,
    created_at: null,
    completed_at: null,
    sort_order: seq,
    ...overrides,
  }
}

describe('computeTodoBusyLevel', () => {
  it('空列表 → null（不染色）', () => {
    expect(computeTodoBusyLevel(DATE, [])).toBeNull()
  })

  it('只有一般 todo：score = 2 * 1.5 = 3 → 档 1', () => {
    // importance medium=2 × complexity（legacy 键缺失→medium=1.5）
    const todos = [makeTodo()]
    expect(computeTodoBusyLevel(DATE, todos, cfg)).toBe(1)
  })

  it('due 命中当日 +5', () => {
    const todos = [makeTodo({ due_date: DATE })]
    // 5 + 3 = 8 → 档 2（threshold [0,3,8,15,25]）
    expect(computeTodoBusyLevel(DATE, todos, cfg)).toBe(2)
  })

  it('planned 命中当日 +3', () => {
    const todos = [makeTodo({ planned_date: DATE })]
    // 3 + 3 = 6 → 档 1
    expect(computeTodoBusyLevel(DATE, todos, cfg)).toBe(1)
  })

  it('due 和 planned 同挂一条：两个都加（设计意图）', () => {
    const todos = [makeTodo({ due_date: DATE, planned_date: DATE })]
    // 5 + 3 + 3 = 11 → 档 2
    expect(computeTodoBusyLevel(DATE, todos, cfg)).toBe(2)
  })

  it('重要 × 硬骨头会显著抬升', () => {
    // high=3 × (legacy 缺 hard 键 → medium 1.5) = 4.5；due 命中 +5 → 9.5 → 档 2
    const todos = [makeTodo({ importance: 'high', complexity: 'hard', due_date: DATE })]
    expect(computeTodoBusyLevel(DATE, todos, cfg)).toBe(2)
  })

  it('自定义新键配置：simple/medium/hard 有区分', () => {
    const modern: TodoBusyConfig = {
      ...cfg,
      weights: {
        ...cfg.weights,
        complexity: { simple: 1, medium: 2, hard: 4 },
      },
    }
    // simple=1: 2*1=2 → ≥ thresholds[0]=0 → 档 0（thresholds[0]=0 时恒染色）
    expect(computeTodoBusyLevel(DATE, [makeTodo({ complexity: 'simple' })], modern)).toBe(0)
    // hard=4: 2*4=8 → 档 2
    expect(computeTodoBusyLevel(DATE, [makeTodo({ complexity: 'hard' })], modern)).toBe(2)
    // medium=2: 2*2=4 → 档 1
    expect(computeTodoBusyLevel(DATE, [makeTodo({ complexity: 'medium' })], modern)).toBe(1)
  })

  it('日期不命中的 todo 仍贡献 importance×complexity', () => {
    const todos = [makeTodo({ due_date: '2026-10-01' as DateStr })]
    expect(computeTodoBusyLevel(DATE, todos, cfg)).toBe(1)
  })

  it('score 低于 thresholds[0]=0 不可能为负 → 恒有档；但空表 null', () => {
    // 一条 low×low: 1*1.5 = 1.5 ≥ 0 → 档 0
    expect(computeTodoBusyLevel(DATE, [makeTodo({ importance: 'low', complexity: 'simple' })], cfg)).toBe(0)
  })
})

describe('getBusyColors（过去=done 层，今天=双层，未来=predict 层）', () => {
  const day = (date: DateStr, predict_level: number | null, done_level: number | null = null) => ({
    date,
    predict_level,
    done_level,
  })

  it('过去：只显示 done 层', () => {
    const chips = getBusyColors(day('2026-09-01' as DateStr, 2, 1), '2026-09-02' as DateStr, cfg)
    expect(chips).toEqual([{ id: 'todo_done', color: cfg.done_colors[1] }])
  })

  it('今天：predict 在下 done 在上（数组里 predict 先出现）', () => {
    const chips = getBusyColors(day('2026-09-02' as DateStr, 3, 1), '2026-09-02' as DateStr, cfg)
    expect(chips).toEqual([
      { id: 'todo', color: cfg.predict_colors[3] },
      { id: 'todo_done', color: cfg.done_colors[1] },
    ])
  })

  it('未来：只显示 predict 层', () => {
    const chips = getBusyColors(day('2026-09-03' as DateStr, 4, null), '2026-09-02' as DateStr, cfg)
    expect(chips).toEqual([{ id: 'todo', color: cfg.predict_colors[4] }])
  })

  it('null 档位不产出色块', () => {
    expect(getBusyColors(day('2026-09-03' as DateStr, null), '2026-09-02' as DateStr, cfg)).toEqual([])
    expect(getBusyColors(day('2026-09-01' as DateStr, 2, null), '2026-09-02' as DateStr, cfg)).toEqual([])
  })
})
