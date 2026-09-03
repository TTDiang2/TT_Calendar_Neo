/**
 * lunar-typescript 适配器：实现 domain 的 LunarProvider 接口。
 *
 * lunar-typescript 的约定：农历月取负数表示闰月（-6 = 闰六月）。
 * 这里翻译成我们契约里的 { month, day, leap } 正数 + 布尔表示。
 */

import { Lunar, Solar } from 'lunar-typescript'
import type { DateStr } from '@tt-calendar/contracts'
import type { LunarInfo, LunarProvider } from './lunar'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toYmd(s: Solar): DateStr {
  return `${s.getYear()}-${pad2(s.getMonth())}-${pad2(s.getDay())}` as DateStr
}

export const lunarTypescriptProvider: LunarProvider = {
  fromSolar(date: DateStr): LunarInfo | null {
    const [y, m, d] = date.split('-').map(Number)
    if (!y || !m || !d) return null
    try {
      const lunar = Solar.fromYmd(y, m, d).getLunar()
      const rawMonth = lunar.getMonth()
      return {
        year: lunar.getYear(),
        month: Math.abs(rawMonth),
        day: lunar.getDay(),
        leap: rawMonth < 0,
      }
    } catch {
      return null
    }
  },

  toSolar(year: number, month: number, day: number, leap = false): DateStr | null {
    const rawMonth = leap ? -month : month
    try {
      // fromYmd 对不存在的农历日（如三十、闰月缺失）会抛错或产生偏移日，这里双重校验：
      // 转回公历再逆向转回农历，必须得到完全一致的年月日，否则视为不存在。
      const solar = Lunar.fromYmd(year, rawMonth, day).getSolar()
      const back = lunarTypescriptProvider.fromSolar(toYmd(solar))
      if (!back || back.year !== year || back.month !== month || back.day !== day || back.leap !== leap) {
        return null
      }
      return toYmd(solar)
    } catch {
      return null
    }
  },
}
