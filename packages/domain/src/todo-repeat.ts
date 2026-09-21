/**
 * 待办重复的下一期推算（HANDOFF-repeat-to-neo §4.2，逐字实现，不得自创语义）。
 *
 * 语义要点：拖延补卡不产生过期待办（跳过错过的期），周重复保持星期几不变。
 * 零 IO；工作日判定依赖全局 HolidayProvider（见 holiday.ts，数据缺该年份时
 * 自动回退「周一~周五」）。
 */

import type { DateStr } from '@tt-calendar/contracts'
import { addDays } from './date'
import { isWorkday } from './holiday'

/**
 * 老端 todo.repeat 的已知枚举。只有这三种会在完成时生成下一期；
 * 其他值（含 NULL）一律不触发生成，原样透传（HANDOFF §5 禁改清单）。
 */
export const REPEAT_MODES = ['daily', 'weekdays', 'weekly'] as const
export type RepeatMode = (typeof REPEAT_MODES)[number]

export function isRepeatMode(v: string | null | undefined): v is RepeatMode {
  return !!v && (REPEAT_MODES as readonly string[]).includes(v)
}

/**
 * 已知模式下推算下一期计划日；未知模式返回 null。
 *
 * daily/weekly：从旧计划日按步长走，直到严格晚于完成日（补的是跳过的期，不是逾期）。
 * weekdays：在 daily 的基础上再跳过非工作日（完成日本身是否工作日不参与判定，
 * 循环条件只看候选日 d）。
 */
export function nextRepeatDate(
  mode: string,
  planned: DateStr,
  completedDay: DateStr,
): DateStr | null {
  switch (mode) {
    case 'weekly': {
      let d = addDays(planned, 7)
      while (d <= completedDay) d = addDays(d, 7)
      return d
    }
    case 'daily': {
      let d = addDays(planned, 1)
      while (d <= completedDay) d = addDays(d, 1)
      return d
    }
    case 'weekdays': {
      let d = addDays(planned, 1)
      while (d <= completedDay || !isWorkday(d)) d = addDays(d, 1)
      return d
    }
    default:
      return null
  }
}
