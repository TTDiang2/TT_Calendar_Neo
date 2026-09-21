/**
 * 中国法定节假日 + 调休（替代 Python 的 chinese_calendar 库）。
 *
 * domain 层只定义接口与纯匹配逻辑，具体数据由外部注入（静态 JSON），
 * 这样：
 *  - domain 保持零 IO，node / 浏览器 / 移动端 webview 都能跑
 *  - 数据每年重跑一次导出脚本即可更新，不需要升级依赖库
 *  - 移动端不会为了一个查询功能背上一个 Python-only 的依赖
 */

import type { DateStr } from '@tt-calendar/contracts'
import { isWeekend } from './date'

export interface HolidayInfo {
  /** 节假日名称；null 表示这天不是法定节假日 */
  name: string | null
  /** 是否为调休补班日（周末上班） */
  is_workday_made_up: boolean
}

export interface HolidayProvider {
  /** 查询某天；既非节假日也非调休返回 null */
  holidayOf(date: DateStr): HolidayInfo | null
  /** 数据覆盖的年份范围（用于 UI 提示「数据待更新」） */
  readonly coverage?: { from: number; to: number }
}

/** 静态数据格式：日期 → { 名称 | 调休标记 } */
export type HolidayData = Record<
  string,
  { name?: string | null; workday_made_up?: boolean }
>

/** 由静态 JSON 驱动的节假日实现 */
export class StaticHolidayProvider implements HolidayProvider {
  readonly coverage: { from: number; to: number }

  constructor(private readonly data: HolidayData = {}) {
    const years = Object.keys(data)
      .map((k) => Number(k.slice(0, 4)))
      .filter((y) => Number.isFinite(y))
    this.coverage = years.length
      ? { from: Math.min(...years), to: Math.max(...years) }
      : { from: 0, to: 0 }
  }

  holidayOf(date: DateStr): HolidayInfo | null {
    const entry = this.data[date]
    if (!entry) return null
    const name = entry.name ?? null
    const madeUp = !!entry.workday_made_up
    if (!name && !madeUp) return null
    return { name, is_workday_made_up: madeUp }
  }
}

let provider: HolidayProvider = new StaticHolidayProvider()

export function setHolidayProvider(p: HolidayProvider): void {
  provider = p
}

export function getHolidayProvider(): HolidayProvider {
  return provider
}

/** 查询节假日（与 Python aggregator._holiday_of 同语义） */
export function holidayOf(date: DateStr): HolidayInfo | null {
  return provider.holidayOf(date)
}

/** 是否调休补班日 */
export function isWorkdayMadeUp(date: DateStr): boolean {
  return provider.holidayOf(date)?.is_workday_made_up ?? false
}

/**
 * 数据是否已覆盖某年（未覆盖时 UI 应提示「节假日数据待更新」而不是装作没有节假日）。
 */
export function coversYear(year: number): boolean {
  const c = provider.coverage
  return !!c && year >= c.from && year <= c.to
}

/**
 * 是否工作日：法定节假日排除、调休补班周末算工作日；
 * 日历数据没覆盖该日期时回退「周一~周五」（HANDOFF-repeat-to-neo §4.2）。
 */
export function isWorkday(date: DateStr): boolean {
  const info = provider.holidayOf(date)
  if (info) return info.is_workday_made_up
  return !isWeekend(date)
}
