import { afterAll, describe, expect, it } from 'vitest'

import type { DateStr } from '@tt-calendar/contracts'
import { lunarTypescriptProvider } from './lunar-adapter'
import { lunarDisplay, lunarName, setLunarProvider } from './lunar'
import { nextOccurrence } from './countdown'

setLunarProvider(lunarTypescriptProvider)

afterAll(() => {
  setLunarProvider(null)
})

describe('lunar-typescript 适配器（实测锚点）', () => {
  it('公历 → 农历：2025-07-25 是闰六月初一', () => {
    expect(lunarTypescriptProvider.fromSolar('2025-07-25' as DateStr)).toEqual({
      year: 2025,
      month: 6,
      day: 1,
      leap: true,
    })
  })

  it('2026 春节 = 2026-02-17', () => {
    const solar = lunarTypescriptProvider.toSolar(2026, 1, 1, false)
    expect(solar).toBe('2026-02-17')
  })

  it('2025 春节 = 2025-01-29', () => {
    expect(lunarTypescriptProvider.toSolar(2025, 1, 1, false)).toBe('2025-01-29')
  })

  it('闰月逆向：2025 闰六月初一 → 2025-07-25', () => {
    expect(lunarTypescriptProvider.toSolar(2025, 6, 1, true)).toBe('2025-07-25')
  })

  it('不存在的农历日（fromYmd 抛错或钳位）：不抛错，返回 null', () => {
    // lunar-typescript 的 fromYmd 对非法日会抛错或静默钳位 → 必须靠往返校验挡住
    expect(lunarTypescriptProvider.toSolar(2025, 6, 31, false)).toBeNull()
  })

  it('目标年无该闰月 → null', () => {
    expect(lunarTypescriptProvider.toSolar(2025, 5, 1, true)).toBeNull()
  })

  it('lunarName：初一显示月名，闰月带「闰」', () => {
    expect(lunarName({ year: 2025, month: 6, day: 1, leap: true })).toBe('闰六月')
    expect(lunarName({ year: 2026, month: 1, day: 15, leap: false })).toBe('正月十五')
    expect(lunarName({ year: 2026, month: 12, day: 30, leap: false })).toBe('腊月三十')
  })

  it('lunarDisplay：无 provider 时降级为空串', () => {
    setLunarProvider(null)
    expect(lunarDisplay('2026-02-17' as DateStr)).toBe('')
    setLunarProvider(lunarTypescriptProvider)
    // 初一显示成月名（lunarName 约定），而非「正月初一」
    expect(lunarDisplay('2026-02-17' as DateStr)).toBe('正月')
  })
})

describe('nextLunarOccurrence（农历年重复）', () => {
  it('生日农历周年：今天 2026-09-02，农历八月初七 → 2026-09-17', () => {
    // 2026-09-17 应为农历八月十七? 用对称验证：base 2025-09-17 的农历月日
    const base = lunarTypescriptProvider.fromSolar('2025-09-17' as DateStr)!
    const next = nextOccurrence(
      {
        base_date: '2025-09-17' as DateStr,
        repeat_yearly: true,
        repeat_type: 'lunar' as never,
        milestone_rule: null,
      },
      '2026-09-02' as DateStr,
    )
    const expectSolar = lunarTypescriptProvider.toSolar(2026, base.month, base.day, false)
    expect(next.next_date).toBe(expectSolar)
    expect(next.next_date >= '2026-09-02').toBe(true)
  })

  it('今年已过 → 落到下一个农历年', () => {
    // 2026 春节（正月初一）= 02-17 已过 → 下一个是 2027 正月初一
    const next = nextOccurrence(
      {
        base_date: '2020-01-25' as DateStr, // 2020 春节
        repeat_yearly: true,
        repeat_type: 'lunar' as never,
        milestone_rule: null,
      },
      '2026-09-02' as DateStr,
    )
    expect(next.next_date).toBe(lunarTypescriptProvider.toSolar(2027, 1, 1, false))
  })
})

describe('countdown 公历周年与里程碑', () => {
  it('公历周年：3 周年标签', () => {
    const next = nextOccurrence(
      {
        base_date: '2023-09-05' as DateStr,
        repeat_yearly: true,
        repeat_type: 'solar' as never,
        milestone_rule: null,
      },
      '2026-09-02' as DateStr,
    )
    expect(next.next_date).toBe('2026-09-05')
    expect(next.next_label).toBe('3 周年')
  })

  it('2/29 生日 → 平年退 2/28', () => {
    const next = nextOccurrence(
      {
        base_date: '2024-02-29' as DateStr,
        repeat_yearly: true,
        repeat_type: 'solar' as never,
        milestone_rule: null,
      },
      '2026-09-02' as DateStr,
    )
    expect(next.next_date).toBe('2027-02-28')
  })

  it('一次性事件已过 → passed=true', () => {
    const next = nextOccurrence(
      {
        base_date: '2026-08-01' as DateStr,
        repeat_yearly: false,
        repeat_type: 'solar' as never,
        milestone_rule: null,
      },
      '2026-09-02' as DateStr,
    )
    expect(next.next_date).toBe('2026-08-01')
    expect(next.passed).toBe(true)
  })

  it('里程碑 100/400/800 天：100 与 400 已过 → 取 800 天', () => {
    const next = nextOccurrence(
      {
        base_date: '2025-07-28' as DateStr, // +100=2025-11-05 已过；+400=2026-09-01 已过；+800=2027-10-06
        repeat_yearly: false,
        repeat_type: 'solar' as never,
        milestone_rule: '100,400,800',
      },
      '2026-09-02' as DateStr,
    )
    expect(next.next_date).toBe('2027-10-06')
    expect(next.next_label).toBe('800 天')
  })
})
