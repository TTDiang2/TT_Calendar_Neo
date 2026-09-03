import { z } from 'zod'
import { ColorHex, DateStr, DateTimeStr, TimeStr } from './common'
import { ScheduleCategory } from './layer'

/**
 * 日程有新旧两套结构：
 *  - schedule 表（AM/PM/EV 三段，已弃用但历史数据仍在，需继续展示）
 *  - schedule_items 表（新结构：一天多条、带起止时间、带 category）
 */

/** 旧版 AM/PM/EV 三段日程 */
export const ScheduleRow = z.object({
  date: DateStr,
  am: z.string().nullable().optional(),
  pm: z.string().nullable().optional(),
  ev: z.string().nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
})
export type ScheduleRow = z.infer<typeof ScheduleRow>

export const Schedule = ScheduleRow.omit({ updated_at: true })
export type Schedule = z.infer<typeof Schedule>

/** 新版日程条目 */
export const ScheduleItemRow = z.object({
  id: z.number().int(),
  date: DateStr,
  start_time: TimeStr.nullable().optional(),
  end_time: TimeStr.nullable().optional(),
  title: z.string(),
  color: ColorHex.nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
  created_at: DateTimeStr.nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
  category: ScheduleCategory.nullable().optional(),
  sync_uid: z.string().nullable().optional(),
})
export type ScheduleItemRow = z.infer<typeof ScheduleItemRow>

export const ScheduleItem = z.object({
  id: z.number().int().nullable(),
  date: DateStr,
  start_time: TimeStr.nullable(),
  end_time: TimeStr.nullable(),
  title: z.string(),
  color: ColorHex.nullable(),
  category: ScheduleCategory,
  sort_order: z.number().int(),
})
export type ScheduleItem = z.infer<typeof ScheduleItem>

export const NewScheduleItem = ScheduleItem.omit({ id: true }).partial({
  start_time: true,
  end_time: true,
  color: true,
  category: true,
  sort_order: true,
})
export type NewScheduleItem = z.infer<typeof NewScheduleItem>
