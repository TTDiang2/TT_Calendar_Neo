/**
 * 日期工具（移植自 tt_calendar/utils/date_utils.py）。
 *
 * 全项目日期一律用 'YYYY-MM-DD' 字符串表示。任何 Date 对象都构造在本地午夜、
 * 只用于算差值，**绝不**走 toISOString（那是 UTC，会整整差一天）。
 */

import type { DateStr } from '@tt-calendar/contracts'

const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' → 本地午夜的 Date */
export function toDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Date → 'YYYY-MM-DD'（按本地时区） */
export function toDateStr(d: Date): DateStr {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 今天的日期串 */
export function todayStr(now: Date = new Date()): DateStr {
  return toDateStr(now)
}

/** 解析 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:MM:SS'，失败返回 null */
export function tryParseDate(s: string | null | undefined): DateStr | null {
  if (!s) return null
  const datePart = s.trim().split(' ')[0]?.split('T')[0]
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null
  return datePart
}

/** 日期 → 天序号（用于比较和相减，避开 DST 影响） */
export function toDayNumber(s: DateStr): number {
  const d = toDate(s)
  return Math.round(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS,
  )
}

/** 两个日期相差天数（b - a） */
export function diffDays(a: DateStr, b: DateStr): number {
  return toDayNumber(b) - toDayNumber(a)
}

/** 加 N 天（N 可为负） */
export function addDays(s: DateStr, n: number): DateStr {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** 比较：a < b 返回 -1，相等 0，a > b 返回 1 */
export function compareDate(a: DateStr, b: DateStr): -1 | 0 | 1 {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** 是否周末（0=周日..6=周六 → 周六周日为 true） */
export function isWeekend(s: DateStr): boolean {
  const wd = toDate(s).getDay()
  return wd === 0 || wd === 6
}

/** 周几，0=周一 .. 6=周日（ISO 序，与 Python date.weekday() 一致） */
export function weekdayIndex(s: DateStr): number {
  const wd = toDate(s).getDay()
  return wd === 0 ? 6 : wd - 1
}

/**
 * 6×7 的月份网格（周一为一周起点）。
 *
 * 永远返回 6 行 —— 月视图的网格高度必须稳定，否则切换月份时布局跳动。
 * 不足 6 行时从最后一天往后顺延补齐。
 */
export function monthGrid(year: number, month: number): DateStr[][] {
  const first = new Date(year, month - 1, 1)
  const firstWeekday = weekdayIndex(toDateStr(first))
  const gridStart = new Date(year, month - 1, 1 - firstWeekday)

  const weeks: DateStr[][] = []
  let cursor = gridStart
  for (let w = 0; w < 6; w++) {
    const week: DateStr[] = []
    for (let d = 0; d < 7; d++) {
      week.push(toDateStr(cursor))
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** 6×7=42 天的一维列表（周一为首日） */
export function monthDays(year: number, month: number): DateStr[] {
  return monthGrid(year, month).flat()
}

/** 该月的第一日和最后一日 */
export function monthRange(year: number, month: number): [DateStr, DateStr] {
  const first: DateStr = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 1).getDate() === 0 ? 31 : new Date(year, month, 0).getDate()
  const last: DateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return [first, last]
}

/** 带前后缓冲的窗口（渐变、节假日预加载用） */
export function windowRange(
  year: number,
  month: number,
  paddingDays = 31,
): [DateStr, DateStr] {
  const [first, last] = monthRange(year, month)
  return [addDays(first, -paddingDays), addDays(last, paddingDays)]
}

/** 月份加减，返回新的 [year, month] */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta
  return [Math.floor(total / 12), (total % 12) + 1]
}

/** anchor 所在周的周一..周日 7 天 */
export function weekDays(anchor: DateStr): DateStr[] {
  const start = addDays(anchor, -weekdayIndex(anchor))
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** [start, end] 闭区间的所有日期 */
export function dateRange(start: DateStr, end: DateStr): DateStr[] {
  const out: DateStr[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** 'YYYY-M' → [year, month]；容错各种写法 */
export function parseMonthKey(key: string): [number, number] {
  const [y, m] = key.split('-').map(Number)
  return [y ?? 1970, m ?? 1]
}

/** 月份 key 加减 */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = parseMonthKey(key)
  const [ny, nm] = shiftMonth(y, m, delta)
  return `${ny}-${nm}`
}

/** 年份 key 加减 */
export function shiftYearKey(key: string, delta: number): string {
  const [y] = parseMonthKey(key)
  return `${y + delta}`
}

/** 一年的 12 个月，每月 42 天（年视图） */
export function yearDays(year: number): { month: number; days: DateStr[] }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    days: monthDays(year, i + 1),
  }))
}
