import { z } from 'zod'
import { ColorHex, DateStr, JsonRecord } from './common'
import { LayerKind } from './layer'
import { CalEvent } from './event'
import { Schedule, ScheduleItem } from './schedule'
import { Todo } from './todo'

/**
 * 视图聚合模型（对应 Python backend/aggregator.py 的响应结构）。
 * 这些类型是「后端算好 → 前端直接渲染」的契约，前端不做二次业务计算。
 */

export const ViewMode = z.enum(['month', 'week', 'day', 'year', 'countdown'])
export type ViewMode = z.infer<typeof ViewMode>

export const TopTab = z.enum(['calendar', 'todo', 'stats', 'widgets'])
export type TopTab = z.infer<typeof TopTab>

/** 侧栏涂色条展示用的一条涂色标记 */
export const DayMark = z.object({
  layer_id: z.string(),
  display_name: z.string(),
  level: z.number().int().min(0).max(4).nullable(),
  color: ColorHex.nullable(),
  mode: z.string(),
})
export type DayMark = z.infer<typeof DayMark>

export const HolidayInfo = z.object({
  name: z.string().nullable(),
  is_workday_made_up: z.boolean(),
})
export type HolidayInfo = z.infer<typeof HolidayInfo>

export const CustomBg = z.object({
  color: ColorHex,
  label: z.string(),
})
export type CustomBg = z.infer<typeof CustomBg>

export const Day = z.object({
  date: DateStr,
  is_today: z.boolean(),
  is_weekend: z.boolean(),
  is_other_month: z.boolean(),
  /** layer_id → 事件列表。只含点点图层中的「事件类」，不含涂色 */
  events_by_layer: z.record(z.string(), z.array(CalEvent)),
  /** 旧版 AM/PM/EV 三段日程 */
  schedule: Schedule.nullable(),
  /** 新版带起止时间的日程条目 */
  schedule_items: z.array(ScheduleItem).optional(),
  coloring_level: z.number().int().min(0).max(4).nullable(),
  holiday: HolidayInfo.nullable(),
  /** 农历显示串，如「七月初四」 */
  lunar: z.string(),
  /** 重要日期 / 倒数日当天的染色 */
  gradient_bg: ColorHex.nullable(),
  custom_bg: CustomBg.nullable().optional(),
  todos: z.array(Todo),
  predict_level: z.number().int().min(0).max(4).nullable(),
  done_level: z.number().int().min(0).max(4).nullable(),
  marks: z.array(DayMark),
})
export type Day = z.infer<typeof Day>

/** 图层的 JSON 形态（后端返回时用 domain 层 Layer 的 snake_case 版本） */
export const ViewLayer = z.object({
  layer_id: z.string(),
  display_name: z.string(),
  enabled: z.boolean(),
  color: ColorHex.nullable(),
  sort_order: z.number().int(),
  kind: LayerKind,
  group: z.string().nullable(),
  config: JsonRecord,
})
export type ViewLayer = z.infer<typeof ViewLayer>

export const MonthData = z.object({
  year: z.number().int(),
  month: z.number().int(),
  layers: z.array(ViewLayer),
  days: z.array(Day),
})
export type MonthData = z.infer<typeof MonthData>

export const YearData = z.object({
  year: z.number().int(),
  layers: z.array(ViewLayer),
  months: z.array(z.object({ month: z.number().int(), days: z.array(Day) })),
})
export type YearData = z.infer<typeof YearData>

export const StatsSummary = z.object({
  quadrant: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      list_id: z.string(),
      importance: z.string(),
      due_date: DateStr.nullable(),
      days_to_due: z.number().int().nullable(),
    }),
  ),
  daily_done: z.array(z.object({ date: DateStr, count: z.number().int() })),
  /** 逐日充实度档位（近 ~180 天；统计页贡献图/信息条数据源，20260916 任务书） */
  coloring_daily: z.array(z.object({ date: DateStr, level: z.number().int() })).default([]),
  /** 未来 14 天忙度预测（day_busy.predict_level 直出，琥珀档位） */
  busy_predict: z.array(z.object({ date: DateStr, level: z.number().int().nullable() })).default([]),
  /** 全量「有完成记录的日期」集（连续打卡 streak 不受热力图窗口封顶，20260916 审核项 D） */
  completion_dates: z.array(DateStr).default([]),
  stats: z.object({
    total: z.number().int(),
    incomplete: z.number().int(),
    completed: z.number().int(),
  }),
  list_names: z.record(z.string(), z.string()),
})
export type StatsSummary = z.infer<typeof StatsSummary>
