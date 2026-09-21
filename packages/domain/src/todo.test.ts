import { describe, expect, it } from 'vitest'

import type { DateStr, Todo, TodoSort } from '@tt-calendar/contracts'
import {
  isImportant,
  overdueTodos,
  quadrantOf,
  resolveComplexityWeight,
  sortTodos,
  todayTodos,
  upcomingTodos,
  urgencyOf,
  dueInDays,
} from './todo'

const TODAY = '2026-09-02' as DateStr

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
    alarm_at: null,
    repeat: null,
    ...overrides,
  }
}

describe('urgencyOf（due 优先 + planned 兜底）', () => {
  it('due 剩余 ≤3 天 → urgent', () => {
    expect(urgencyOf(makeTodo({ due_date: '2026-09-05' as DateStr }), TODAY)).toBe('urgent')
    expect(urgencyOf(makeTodo({ due_date: TODAY }), TODAY)).toBe('urgent')
    expect(urgencyOf(makeTodo({ due_date: '2026-09-01' as DateStr }), TODAY)).toBe('urgent')
  })

  it('due 剩余 4..7 天 → soon', () => {
    expect(urgencyOf(makeTodo({ due_date: '2026-09-06' as DateStr }), TODAY)).toBe('soon')
    expect(urgencyOf(makeTodo({ due_date: '2026-09-09' as DateStr }), TODAY)).toBe('soon')
  })

  it('due 剩余 >7 天 → later', () => {
    expect(urgencyOf(makeTodo({ due_date: '2026-09-10' as DateStr }), TODAY)).toBe('later')
  })

  it('无 due：planned ≤ 今天 urgent，否则 later', () => {
    expect(urgencyOf(makeTodo({ planned_date: TODAY }), TODAY)).toBe('urgent')
    expect(urgencyOf(makeTodo({ planned_date: '2026-09-01' as DateStr }), TODAY)).toBe('urgent')
    expect(urgencyOf(makeTodo({ planned_date: '2026-09-03' as DateStr }), TODAY)).toBe('later')
  })

  it('都没有 → later', () => {
    expect(urgencyOf(makeTodo(), TODAY)).toBe('later')
  })
})

describe('quadrantOf 四象限', () => {
  it('紧急 × 重要组合', () => {
    const urgentImportant = makeTodo({ due_date: TODAY, importance: 'high' })
    const planIt = makeTodo({ due_date: '2026-10-01' as DateStr, importance: 'high' })
    const delegate = makeTodo({ due_date: TODAY, importance: 'low' })
    const drop = makeTodo({ importance: 'low' })
    expect(quadrantOf(urgentImportant, TODAY)).toBe('doNow')
    expect(quadrantOf(planIt, TODAY)).toBe('planIt')
    expect(quadrantOf(delegate, TODAY)).toBe('delegate')
    expect(quadrantOf(drop, TODAY)).toBe('drop')
  })
})

describe('dueInDays（实现语义 = due - today，正=还剩 N 天）', () => {
  it('正 / 零 / 负 / null', () => {
    expect(dueInDays(makeTodo({ due_date: '2026-09-04' as DateStr }), TODAY)).toBe(2)
    expect(dueInDays(makeTodo({ due_date: TODAY }), TODAY)).toBe(0)
    expect(dueInDays(makeTodo({ due_date: '2026-09-01' as DateStr }), TODAY)).toBe(-1)
    expect(dueInDays(makeTodo(), TODAY)).toBeNull()
  })
})

describe('sortTodos', () => {
  it('due_importance：due 近者优先，同 due 时 high 优先，再按 sort_order', () => {
    const a = makeTodo({ due_date: '2026-09-05' as DateStr, importance: 'normal', sort_order: 2 })
    const b = makeTodo({ due_date: '2026-09-03' as DateStr, importance: 'low', sort_order: 3 })
    const c = makeTodo({ due_date: '2026-09-05' as DateStr, importance: 'high', sort_order: 1 })
    const sorted = sortTodos([a, b, c], 'due_importance' as TodoSort, 'all')
    expect(sorted.map((t) => t.id)).toEqual([b.id, c.id, a.id].map((id) => id))
  })

  it('statusFilter=completed 按 completed_at 倒序', () => {
    const a = makeTodo({ status: 'completed', completed_at: '2026-09-01 10:00:00' as never })
    const b = makeTodo({ status: 'completed', completed_at: '2026-09-02 09:00:00' as never })
    const sorted = sortTodos([a, b], 'due_importance' as TodoSort, 'completed')
    expect(sorted.map((t) => t.id)).toEqual([b.id, a.id])
  })
})

describe('筛选器', () => {
  it('overdueTodos：due < today 且未完成', () => {
    const done = makeTodo({ due_date: '2026-09-01' as DateStr, status: 'completed' })
    const overdue = makeTodo({ due_date: '2026-09-01' as DateStr })
    const todayDue = makeTodo({ due_date: TODAY })
    expect(overdueTodos([done, overdue, todayDue], TODAY)).toEqual([overdue])
  })

  it('todayTodos：planned 或 due 命中今天', () => {
    const a = makeTodo({ planned_date: TODAY })
    const b = makeTodo({ due_date: TODAY })
    const c = makeTodo({ planned_date: '2026-09-03' as DateStr })
    expect(todayTodos([a, b, c], TODAY)).toEqual([a, b])
  })

  it('upcomingTodos：未来 7 天内（含今天）', () => {
    const edge = makeTodo({ due_date: '2026-09-09' as DateStr }) // 第 7 天
    const beyond = makeTodo({ due_date: '2026-09-10' as DateStr })
    const past = makeTodo({ due_date: '2026-09-01' as DateStr })
    expect(upcomingTodos([edge, beyond, past], 7, TODAY)).toEqual([edge])
  })
})

describe('resolveComplexityWeight（历史配置缺陷的向前兼容）', () => {
  it('键精确命中直接返回', () => {
    expect(resolveComplexityWeight({ simple: 1, medium: 2, hard: 3 }, 'hard')).toBe(3)
  })

  it('historical high/medium/low 键：hard/simple 回落 medium', () => {
    // 与 Python 版缺陷一致：complexity 实际取值 simple/medium/hard，
    // 但历史配置键是 high/medium/low → hard 和 simple 都掉进 medium fallback
    const legacy = { high: 3, medium: 2, low: 1 }
    expect(resolveComplexityWeight(legacy, 'medium')).toBe(2)
    expect(resolveComplexityWeight(legacy, 'hard')).toBe(2)
    expect(resolveComplexityWeight(legacy, 'simple')).toBe(2)
  })

  it('完全缺失时用 fallback', () => {
    expect(resolveComplexityWeight({}, 'hard', 5)).toBe(5)
  })

  it('isImportant', () => {
    expect(isImportant(makeTodo({ importance: 'high' }))).toBe(true)
    expect(isImportant(makeTodo({ importance: 'normal' }))).toBe(false)
  })
})
