import { z } from 'zod'
import { ColorHex, DateStr, DateTimeStr, JsonRecord } from './common'

/**
 * events 表：只存「点点图层中的事件类」。
 * 涂色标记（打卡/完成度）**绝不**存这里，走 marks 表（docs/ARCHITECTURE.md 红线 1）。
 */

/** 事件来源 */
export const EventSource = z.enum(['manual', 'jisilu', 'chinese_calendar', 'migrated'])
export type EventSource = z.infer<typeof EventSource>

export const EventRow = z.object({
  id: z.number().int(),
  layer_id: z.string(),
  source: z.string(),
  date: DateStr,
  title: z.string(),
  description: z.string().nullable().optional(),
  color: ColorHex.nullable().optional(),
  extra_json: z.string().nullable().optional(),
  source_ref: z.string().nullable().optional(),
  sort_key: z.number().int().nullable().optional(),
  created_at: DateTimeStr.nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
  sync_uid: z.string().nullable().optional(),
})
export type EventRow = z.infer<typeof EventRow>

/** 领域/前端用的事件（extra 已反序列化） */
export const CalEvent = z.object({
  id: z.number().int().nullable(),
  layer_id: z.string(),
  source: z.string(),
  date: DateStr,
  title: z.string(),
  description: z.string().nullable(),
  color: ColorHex.nullable(),
  extra: JsonRecord,
  source_ref: z.string().nullable(),
  sort_key: z.number().int(),
})
export type CalEvent = z.infer<typeof CalEvent>

/** 新建事件的输入（id 由 DB 生成） */
export const NewCalEvent = CalEvent.omit({ id: true }).partial({
  source: true,
  description: true,
  color: true,
  extra: true,
  source_ref: true,
  sort_key: true,
})
export type NewCalEvent = z.infer<typeof NewCalEvent>

/** 日历渲染去重 key：layer + source_ref(或 title) */
export function eventKey(ev: Pick<CalEvent, 'layer_id' | 'source_ref' | 'title'>): string {
  return `${ev.layer_id}::${ev.source_ref || ev.title}`
}
