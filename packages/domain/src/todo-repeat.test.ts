/**
 * 待办重复下一期推算 —— HANDOFF-repeat-to-neo §4.4 测试向量逐条对拍 + 工作日判定。
 * 与老端 tests/test_todo_repeat.py 同一组向量，两端对拍用。
 */

import { afterEach, describe, expect, it } from 'vitest'

import type { DateStr } from '@tt-calendar/contracts'
import { CHINA_HOLIDAY_DATA, StaticHolidayProvider, nextRepeatDate, setHolidayProvider } from './index'

afterEach(() => {
  // 向量本身不依赖节假日数据（9 月日期都没撞上节假日），但 isWorkday 读全局
  // provider —— 测完恢复空 provider，不污染同进程的其他用例
  setHolidayProvider(new StaticHolidayProvider())
})

describe('nextRepeatDate —— 4.4 测试向量（两端对拍）', () => {
  const cases: [string, DateStr, DateStr, DateStr][] = [
    // [mode, planned, completedDay, 期望 next]
    ['daily', '2026-09-25', '2026-09-25', '2026-09-26'],
    ['daily', '2026-09-18', '2026-09-21', '2026-09-22'],
    ['weekly', '2026-09-14', '2026-09-16', '2026-09-21'],
    ['weekly', '2026-09-07', '2026-09-21', '2026-09-28'],
    ['weekly', '2026-09-14', '2026-09-21', '2026-09-28'],
    ['weekdays', '2026-09-11', '2026-09-11', '2026-09-14'],
    ['weekdays', '2026-09-25', '2026-09-25', '2026-09-28'],
  ]
  for (const [mode, planned, completed, expected] of cases) {
    it(`${mode}: planned=${planned} completed=${completed} → ${expected}`, () => {
      expect(nextRepeatDate(mode, planned, completed)).toBe(expected)
    })
  }
})

describe('nextRepeatDate —— 工作日判定（中文日历）', () => {
  it('weekdays 跳过国庆长假（2026-10-01~07 法定节假日）', () => {
    setHolidayProvider(new StaticHolidayProvider(CHINA_HOLIDAY_DATA))
    // 9-30(三) 完成 → 10-01~07 全是节假日，10-08(四) 才是工作日
    expect(nextRepeatDate('weekdays', '2026-09-30', '2026-09-30')).toBe('2026-10-08')
  })

  it('weekdays 把调休补班的周末算工作日（2026-10-10 周六补班）', () => {
    setHolidayProvider(new StaticHolidayProvider(CHINA_HOLIDAY_DATA))
    expect(nextRepeatDate('weekdays', '2026-10-09', '2026-10-09')).toBe('2026-10-10')
  })

  it('数据缺该年份时回退周一~周五（不把节假日当非工作日）', () => {
    setHolidayProvider(new StaticHolidayProvider({ '2024-01-01': { name: '元旦' } }))
    // 2026-10-01~07 是国庆，但 provider 没覆盖 2026 → 按普通周计算
    expect(nextRepeatDate('weekdays', '2026-09-30', '2026-09-30')).toBe('2026-10-01')
  })
})

describe('nextRepeatDate —— 未知档位不生成（HANDOFF §5 透传）', () => {
  it('未知 repeat 值返回 null（调用方据此跳过生成）', () => {
    expect(nextRepeatDate('every-blue-moon', '2026-09-25', '2026-09-25')).toBeNull()
    expect(nextRepeatDate('', '2026-09-25', '2026-09-25')).toBeNull()
  })
})
