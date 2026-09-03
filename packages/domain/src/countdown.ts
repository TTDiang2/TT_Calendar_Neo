/**
 * 倒数日推算（移植自 backend/aggregator.py _next_occurrence / build_countdown_list）。
 *
 * 三种重复形态：
 *  - repeat_yearly + solar：每年同月日（生日/节日），2/29 在平年退到 2/28
 *  - repeat_yearly + lunar：按农历月日重复（春节=正月初一，公历日期年年不同）
 *  - milestone_rule：从 base_date 起算的里程碑（'100,365,520'）
 *  - 两者都配：周年 + 里程碑都算，取距离今天最近的那个（同距离时周年优先）
 */

import type { CountdownItem, DateStr, RepeatType } from '@tt-calendar/contracts'
import { addDays, diffDays, todayStr } from './date'
import { nextLunarOccurrence } from './lunar'

export interface CountdownLike {
  id: number
  name: string
  category: string
  base_date: DateStr
  repeat_yearly: boolean
  repeat_type: RepeatType
  milestone_rule: string | null
  never_expire: boolean
  notes: string | null
  color: string | null
}

export interface NextOccurrence {
  next_date: DateStr
  next_label: string
  passed: boolean
}

/**
 * 计算下一个发生日期。
 *
 * @returns (next_date, label, passed)
 *  - passed=true 表示这是一次性事件且已过期（next_date 就是 base_date）
 */
export function nextOccurrence(
  cd: Pick<
    CountdownLike,
    'base_date' | 'repeat_yearly' | 'repeat_type' | 'milestone_rule'
  >,
  today: DateStr = todayStr(),
): NextOccurrence {
  const base = cd.base_date
  const candidates: { date: DateStr; label: string }[] = []

  if (cd.repeat_yearly) {
    if (cd.repeat_type === 'lunar') {
      const yearly = nextLunarOccurrence(base, today)
      if (yearly) {
        const sameYear = yearly.slice(0, 4) === today.slice(0, 4)
        candidates.push({ date: yearly, label: sameYear ? '今年' : '农历周年' })
      }
    } else {
      // 逐年后推，直到 >= today（最多试 40 年，防止死循环）
      for (let offset = 0; offset < 40; offset++) {
        const y = Number(today.slice(0, 4)) + offset
        const candidate = replaceYear(base, y)
        // 2/29 → 平年 2/28（Python 的 ValueError 兜底）
        const yearly = candidate ?? fallbackFeb29(base, y)
        if (yearly >= today) {
          const n = y - Number(base.slice(0, 4))
          candidates.push({ date: yearly, label: n ? `${n} 周年` : '今年' })
          break
        }
      }
    }
  }

  if (cd.milestone_rule) {
    for (const raw of cd.milestone_rule.split(',')) {
      const token = raw.trim()
      if (!/^\d+$/.test(token)) continue
      const days = Number(token)
      const target = addDays(base, days)
      if (target >= today) candidates.push({ date: target, label: `${days} 天` })
    }
  }

  if (candidates.length === 0) {
    return { next_date: base, next_label: '', passed: base < today }
  }

  // 距离今天最近的那个；Python 的 min 在同距离时取先出现的（周年优先于里程碑）
  let best = candidates[0]
  let bestGap = diffDays(today, best.date)
  for (const c of candidates.slice(1)) {
    const gap = diffDays(today, c.date)
    if (gap < bestGap) {
      best = c
      bestGap = gap
    }
  }
  return { next_date: best.date, next_label: best.label, passed: false }
}

function replaceYear(date: DateStr, year: number): DateStr | null {
  const [, m, d] = date.split('-')
  const mm = Number(m)
  const dd = Number(d)
  if (mm === 2 && dd === 29 && !isLeapYear(year)) return null
  return `${year}-${m}-${d}`
}

function fallbackFeb29(date: DateStr, year: number): DateStr {
  const [, m] = date.split('-')
  return `${year}-${m}-28`
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/**
 * 全部倒数日的展示模型。
 *
 * 标签规则（Python 原逻辑）：只有「纪念日」类或配了里程碑的才在标题后缀
 * 「1 周年 / 400 天」；生日/节日/重要事件只显示名称。
 * 排序：未过期的在前，组内按 |days_left| 升序。
 */
export function buildCountdownList(
  rows: readonly CountdownLike[],
  today: DateStr = todayStr(),
): CountdownItem[] {
  const out: CountdownItem[] = rows.map((cd) => {
    const { next_date, next_label, passed } = nextOccurrence(cd, today)
    const daysLeft = diffDays(today, next_date)
    const showLabel =
      !!next_label && (cd.category === '纪念日' || !!cd.milestone_rule)
    return {
      id: cd.id,
      name: cd.name,
      category: cd.category,
      base_date: cd.base_date,
      repeat_yearly: cd.repeat_yearly,
      repeat_type: cd.repeat_type,
      milestone_rule: cd.milestone_rule,
      never_expire: cd.never_expire,
      notes: cd.notes,
      color: cd.color,
      next_date,
      next_label: showLabel ? next_label : '',
      display: showLabel ? `${cd.name} ${next_label}`.trim() : cd.name,
      days_left: daysLeft,
      is_today: daysLeft === 0,
      passed,
    }
  })

  out.sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1
    return Math.abs(a.days_left) - Math.abs(b.days_left)
  })
  return out
}

/** 顶部栏的一句话倒数（移植自 aggregator.build_countdown） */
export function buildCountdownText(items: readonly CountdownItem[]): string {
  const upcoming = items.filter((i) => !i.passed)
  if (upcoming.length > 0) {
    const nearest = upcoming[0]
    if (nearest.is_today) return `🎉 今天是「${nearest.display}」`
    return `距离「${nearest.display}」还有 ${nearest.days_left} 天`
  }
  if (items.length > 0) {
    const latest = items[items.length - 1]
    return `「${latest.display}」已过 ${-latest.days_left} 天`
  }
  return '暂无倒数日'
}
