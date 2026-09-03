import { z } from 'zod'
import { DateStr, DateTimeStr } from './common'

/**
 * marks 表：涂色标记（打卡 / 自定义完成度）。
 *
 * 按 (layer_id, date) 唯一 —— 同一打卡图层同一天只能有一条（docs/ARCHITECTURE.md 红线 5）。
 * 打卡 solid：level = NULL，仅记录「今天打卡了」
 * 完成度 graded：level = 0..4，对应图层 palette 的档位
 */
export const MarkRow = z.object({
  id: z.number().int(),
  layer_id: z.string(),
  date: DateStr,
  level: z.number().int().min(0).max(4).nullable(),
  note: z.string().nullable().optional(),
  created_at: DateTimeStr.nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
  sync_uid: z.string().nullable().optional(),
})
export type MarkRow = z.infer<typeof MarkRow>

export const Mark = MarkRow.partial({ id: true, note: true, created_at: true, updated_at: true, sync_uid: true })
export type Mark = z.infer<typeof Mark>

/** 写入一条涂色标记 */
export const UpsertMarkInput = z.object({
  layer_id: z.string(),
  date: DateStr,
  level: z.number().int().min(0).max(4).nullable(),
  note: z.string().nullable().optional(),
})
export type UpsertMarkInput = z.infer<typeof UpsertMarkInput>

/**
 * coloring 表：内置的「充实度染色」5 档绿（独立表，早于 marks 存在）。
 * 注意与 marks 的区别：coloring 是内置单图层，marks 是用户自定义图层的通用机制。
 */
export const ColoringRow = z.object({
  date: DateStr,
  level: z.number().int().min(0).max(4),
  updated_at: DateTimeStr.nullable().optional(),
})
export type ColoringRow = z.infer<typeof ColoringRow>

/** day_busy 表：待办忙度的双层快照（视图层不实时计算） */
export const DayBusyRow = z.object({
  date: DateStr,
  /** 未来日期显示：未完成 todo 加权档位 */
  predict_level: z.number().int().min(0).max(4).nullable(),
  /** 过去日期显示：completed_at 命中当天的 todo 加权档位 */
  done_level: z.number().int().min(0).max(4).nullable(),
})
export type DayBusyRow = z.infer<typeof DayBusyRow>
