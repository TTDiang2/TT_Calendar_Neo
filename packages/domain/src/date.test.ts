import { describe, expect, it } from 'vitest'

import {
  addDays,
  compareDate,
  dateRange,
  diffDays,
  isWeekend,
  monthGrid,
  monthRange,
  parseMonthKey,
  shiftMonth,
  shiftMonthKey,
  shiftYearKey,
  toDateStr,
  toDayNumber,
  weekDays,
  weekdayIndex,
  windowRange,
  yearDays,
} from './date'
import type { DateStr } from '@tt-calendar/contracts'

describe('date 基础', () => {
  it('diffDays = b - a', () => {
    expect(diffDays('2026-01-01' as DateStr, '2026-01-31' as DateStr)).toBe(30)
    expect(diffDays('2026-01-31' as DateStr, '2026-01-01' as DateStr)).toBe(-30)
    // 跨月/跨年
    expect(diffDays('2025-12-31' as DateStr, '2026-01-01' as DateStr)).toBe(1)
    // 闰年 2 月
    expect(diffDays('2024-02-28' as DateStr, '2024-03-01' as DateStr)).toBe(2)
  })

  it('addDays 正负往返', () => {
    expect(addDays('2026-01-01' as DateStr, -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28' as DateStr, 1)).toBe('2024-02-29')
    expect(addDays('2025-02-28' as DateStr, 1)).toBe('2025-03-01')
    const s = '2026-06-15' as DateStr
    expect(addDays(addDays(s, 7), -7)).toBe(s)
  })

  it('toDayNumber / compareDate / weekdayIndex / isWeekend', () => {
    expect(toDayNumber('2026-01-01' as DateStr)).toBeLessThan(
      toDayNumber('2026-01-02' as DateStr),
    )
    expect(compareDate('2026-01-01' as DateStr, '2026-01-02' as DateStr)).toBe(-1)
    expect(compareDate('2026-01-01' as DateStr, '2026-01-01' as DateStr)).toBe(0)
    // 2026-09-02 是周三
    expect(weekdayIndex('2026-09-02' as DateStr)).toBe(2)
    expect(isWeekend('2026-09-05' as DateStr)).toBe(true) // 周六
    expect(isWeekend('2026-09-02' as DateStr)).toBe(false)
    // 2026-09-07 周一
    expect(weekdayIndex('2026-09-07' as DateStr)).toBe(0)
  })

  it('toDateStr 输出 YYYY-MM-DD 补零', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('monthGrid（周一为一周起点，固定 6 行）', () => {
  it('2026 年 9 月：1 日是周二，网格从 8 月 31 日（周一）开始', () => {
    const grid = monthGrid(2026, 9)
    expect(grid).toHaveLength(6)
    expect(grid[0]).toHaveLength(7)
    expect(grid[0]![0]).toBe('2026-08-31')
    // 9 月 1 日在第一行第二格
    expect(grid[0]![1]).toBe('2026-09-01')
    // 42 天连续递增
    const flat = grid.flat()
    expect(flat).toHaveLength(42)
    for (let i = 1; i < flat.length; i++) {
      expect(diffDays(flat[i - 1]!, flat[i]!)).toBe(1)
    }
  })

  it('包含目标月全部日子', () => {
    const flat = monthGrid(2026, 2).flat()
    for (let d = 1; d <= 28; d++) {
      expect(flat).toContain(`2026-02-${String(d).padStart(2, '0')}`)
    }
  })
})

describe('monthRange / windowRange / shiftMonth', () => {
  it('monthRange 大小月与闰年', () => {
    expect(monthRange(2026, 9)).toEqual(['2026-09-01', '2026-09-30'])
    expect(monthRange(2026, 1)).toEqual(['2026-01-01', '2026-01-31'])
    expect(monthRange(2024, 2)).toEqual(['2024-02-01', '2024-02-29'])
    expect(monthRange(2026, 2)).toEqual(['2026-02-01', '2026-02-28'])
  })

  it('shiftMonth 跨年', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12])
    expect(shiftMonth(2025, 12, 1)).toEqual([2026, 1])
    expect(shiftMonth(2026, 6, -14)).toEqual([2025, 4])
  })

  it('windowRange 有前后缓冲', () => {
    const [start, end] = windowRange(2026, 9, 31)
    expect(start).toBe('2026-08-01')
    expect(end).toBe('2026-10-31')
  })
})

describe('weekDays / dateRange / key 工具', () => {
  it('weekDays 从周一到周日', () => {
    const days = weekDays('2026-09-02' as DateStr)
    expect(days).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ])
  })

  it('dateRange 闭区间', () => {
    expect(dateRange('2026-01-30' as DateStr, '2026-02-02' as DateStr)).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('parseMonthKey / shiftMonthKey / shiftYearKey', () => {
    expect(parseMonthKey('2026-9')).toEqual([2026, 9])
    expect(shiftMonthKey('2026-1', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-12', 2)).toBe('2027-2')
    expect(shiftYearKey('2026-9', -1)).toBe('2025')
  })

  it('yearViews: 一年 12 个月各 42 天', () => {
    const months = yearDays(2026)
    expect(months).toHaveLength(12)
    expect(months.every((m) => m.days.length === 42)).toBe(true)
  })
})
