/**
 * 农历能力（docs/PHILOSOPHY.md §6：农历是一等公民，不是装饰）。
 *
 * domain 层定义接口 + 默认实现，具体算法由 lunar-typescript 提供。
 * 之所以走依赖注入而不是硬编码 import：
 *  1. 保持 domain 可在无依赖的测试环境里被替换成桩实现
 *  2. 移动端 / web 端将来若换成别的农历库（或改用静态数据表），只改一处
 */

import type { DateStr } from '@tt-calendar/contracts'

export interface LunarInfo {
  /** 农历月（1..12） */
  month: number
  /** 农历日（1..30） */
  day: number
  /** 是否闰月 */
  leap: boolean
  /** 农历年（干支纪年后的数字年） */
  year: number
}

export interface LunarProvider {
  /** 公历日期 → 农历信息；超出支持范围返回 null */
  fromSolar(date: DateStr): LunarInfo | null
  /** 农历日期 → 公历日期；该农历月日在该年不存在时返回 null */
  toSolar(year: number, month: number, day: number, leap?: boolean): DateStr | null
}

const CN_MONTHS = '正二三四五六七八九十冬腊'
const CN_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
]

/** 农历日期 → 中文名（'七月初四'；初一显示成 '七月'，闰月带「闰」） */
export function lunarName(info: LunarInfo): string {
  const monthName = (info.leap ? '闰' : '') + (CN_MONTHS[info.month - 1] ?? '') + '月'
  if (info.day === 1) return monthName
  return monthName + (CN_DAYS[info.day - 1] ?? String(info.day))
}

let provider: LunarProvider | null = null

/** 注入农历实现（由 app 层在启动时调用；未注入时 lunar 相关功能降级为不可用） */
export function setLunarProvider(p: LunarProvider | null): void {
  provider = p
}

export function getLunarProvider(): LunarProvider | null {
  return provider
}

/**
 * 公历日期 → 农历显示串（移植自 tt_calendar/utils/lunar_utils.py lunar_display）。
 * 无 provider 或超范围时返回空串（降级：不显示农历，而不是显示错的农历）。
 */
export function lunarDisplay(date: DateStr): string {
  const info = provider?.fromSolar(date)
  return info ? lunarName(info) : ''
}

/**
 * 农历年重复的下一次公历日期（移植自 lunar_utils.py next_lunar_occurrence）。
 *
 * 以 baseDate 的农历月日为基准，找 >= today 的最近一次出现。
 * 候选农历年取 {今天所在农历年, today.year, today.year+1} —— 春节在公历 1-2 月，
 * 农历年与公历年不重合，必须都试一遍。
 * 闰月日（如闰六月初一）在目标年无该闰月时退回非闰月同日（农历节日惯例：节日不设在闰月）。
 */
export function nextLunarOccurrence(baseDate: DateStr, today: DateStr): DateStr | null {
  if (!provider) return null
  const base = provider.fromSolar(baseDate)
  if (!base) return null

  const todayLunar = provider.fromSolar(today)
  const candidates = new Set<number>([todayLunar?.year ?? 0, 0, 0])
  candidates.delete(0)
  candidates.add(todayLunar?.year ?? new Date().getFullYear())
  candidates.add(Number(today.slice(0, 4)))
  candidates.add(Number(today.slice(0, 4)) + 1)

  let best: DateStr | null = null
  for (const lunarYear of [...candidates].sort((a, b) => a - b)) {
    // 先试闰月（若基准日是闰月），再退回非闰月
    const solar =
      (base.leap ? provider.toSolar(lunarYear, base.month, base.day, true) : null) ??
      provider.toSolar(lunarYear, base.month, base.day, false)
    if (solar && solar >= today && (!best || solar < best)) best = solar
  }
  return best ?? baseDate
}
