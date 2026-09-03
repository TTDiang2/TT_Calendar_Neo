import { z } from 'zod'
import { ColorHex, DateStr, DateTimeStr } from './common'

/**
 * 倒数日。
 *
 * 农历是一等公民（docs/PHILOSOPHY.md §6）：repeat_type='lunar' 时按农历月日重复
 * （春节 = 正月初一，公历日期年年不同），不能按 365 天周期算。
 */

export const RepeatType = z.enum(['solar', 'lunar'])
export type RepeatType = z.infer<typeof RepeatType>

export const CountdownCategory = z.enum(['生日', '纪念日', '节日', '重要事件', '其他'])
export type CountdownCategory = z.infer<typeof CountdownCategory>

export const CountdownRow = z.object({
  id: z.number().int(),
  name: z.string(),
  category: z.string(),
  base_date: DateStr,
  repeat_yearly: z.number().int().nullable().optional(),
  repeat_type: RepeatType.nullable().optional(),
  milestone_rule: z.string().nullable().optional(),
  never_expire: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  color: ColorHex.nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
  created_at: DateTimeStr.nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
  sync_uid: z.string().nullable().optional(),
})
export type CountdownRow = z.infer<typeof CountdownRow>

/** 计算后的倒数日（next_date / days_left 由 domain 层推算） */
export const CountdownItem = z.object({
  id: z.number().int(),
  name: z.string(),
  category: z.string(),
  base_date: DateStr,
  repeat_yearly: z.boolean(),
  repeat_type: RepeatType,
  milestone_rule: z.string().nullable(),
  never_expire: z.boolean(),
  notes: z.string().nullable(),
  color: ColorHex.nullable(),
  next_date: DateStr,
  next_label: z.string(),
  display: z.string(),
  days_left: z.number().int(),
  is_today: z.boolean(),
  passed: z.boolean(),
})
export type CountdownItem = z.infer<typeof CountdownItem>

export const CountdownInput = z.object({
  name: z.string().min(1),
  category: z.string().default('其他'),
  base_date: DateStr,
  repeat_yearly: z.boolean().default(false),
  repeat_type: RepeatType.default('solar'),
  milestone_rule: z.string().nullable().optional(),
  never_expire: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  color: ColorHex.nullable().optional(),
  sort_order: z.number().int().optional(),
})
export type CountdownInput = z.infer<typeof CountdownInput>
