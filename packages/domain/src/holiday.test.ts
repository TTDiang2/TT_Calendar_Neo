import { describe, expect, it } from 'vitest'

import type { DateStr } from '@tt-calendar/contracts'
import {
  StaticHolidayProvider,
  coversYear,
  getHolidayProvider,
  holidayOf,
  isWorkdayMadeUp,
  setHolidayProvider,
} from './holiday'

const DATA = {
  '2026-01-01': { name: '元旦' },
  '2026-02-17': { name: '春节' },
  '2026-02-21': { workday_made_up: true }, // 春节调休补班（周六）
  '2026-10-01': { name: '国庆节' },
}

describe('StaticHolidayProvider', () => {
  const p = new StaticHolidayProvider(DATA)

  it('节假日命中', () => {
    expect(p.holidayOf('2026-01-01' as DateStr)).toEqual({
      name: '元旦',
      is_workday_made_up: false,
    })
    expect(p.holidayOf('2026-02-17' as DateStr)?.name).toBe('春节')
  })

  it('调休补班日', () => {
    expect(p.holidayOf('2026-02-21' as DateStr)).toEqual({
      name: null,
      is_workday_made_up: true,
    })
  })

  it('普通日返回 null', () => {
    expect(p.holidayOf('2026-06-15' as DateStr)).toBeNull()
  })

  it('coverage 取数据里的年范围', () => {
    expect(p.coverage).toEqual({ from: 2026, to: 2026 })
  })
})

describe('全局 provider 注入', () => {
  it('set/get 后 holidayOf 与 isWorkdayMadeUp 生效', () => {
    setHolidayProvider(new StaticHolidayProvider(DATA))
    expect(holidayOf('2026-10-01' as DateStr)?.name).toBe('国庆节')
    expect(isWorkdayMadeUp('2026-02-21' as DateStr)).toBe(true)
    expect(isWorkdayMadeUp('2026-10-01' as DateStr)).toBe(false)
    expect(getHolidayProvider()?.holidayOf('2026-01-01' as DateStr)).not.toBeNull()
  })

  it('coversYear 只对覆盖范围内的年份为真', () => {
    expect(coversYear(2026)).toBe(true)
    expect(coversYear(2030)).toBe(false)
  })

  it('重置为空数据 provider → 一律 null / false', () => {
    setHolidayProvider(new StaticHolidayProvider())
    expect(holidayOf('2026-10-01' as DateStr)).toBeNull()
    expect(isWorkdayMadeUp('2026-02-21' as DateStr)).toBe(false)
    expect(coversYear(2026)).toBe(false)
  })
})
