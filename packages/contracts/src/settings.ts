import { z } from 'zod'
import { ColorHex, DateStr, TimeStr } from './common'

/**
 * 待办忙度算法配置（Python 版 backend/aggregator.py compute_todo_busy_level 的权重表）。
 *
 * score = Σ( due_date 命中 ? w.due_date : 0 )
 *       + Σ( planned_date 命中 ? w.planned_date : 0 )
 *       + Σ( importance[t.importance] * complexity[t.complexity] )
 * 档位 = 最大的 i 使 score >= thresholds[i]；score < thresholds[0] → null（不染色）
 */
export const TodoBusyConfig = z.object({
  weights: z.object({
    due_date: z.number(),
    planned_date: z.number(),
    importance: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
    /**
     * 复杂度权重。历史配置用 high/medium/low 三个键（与 importance 同名，
     * 与 todo.complexity 的实际取值 simple/medium/hard 并不匹配，见下方说明）；
     * 也允许配置成 hard/medium/simple。解析时两套键都接受。
     */
    complexity: z.record(z.string(), z.number()),
  }),
  /** 长度必须 5，升序，对应档位 0..4 的下限 */
  thresholds: z.array(z.number()).length(5),
  /** predict = 未来（琥珀）；done = 过去（GitHub 贡献图绿系，20260917 任务书 1.2-5） */
  predict_colors: z.array(ColorHex).length(5),
  done_colors: z.array(ColorHex).length(5),
})
export type TodoBusyConfig = z.infer<typeof TodoBusyConfig>

/**
 * 逐字对齐 Python 版 tt_calendar/db.py DEFAULT_TODO_BUSY_CONFIG。
 *
 * ⚠️ 已知历史缺陷（刻意保留以维持旧数据染色结果不变）：
 *   complexity 权重键是 high/medium/low，但 todo.complexity 的实际取值是
 *   simple/medium/hard。Python 原实现 `comp.get(t.complexity, comp.get('medium'))`
 *   对 'hard' 和 'simple' 都取不到键 → 双双回落 medium=1.5，即三档复杂度实际无差别。
 *   domain 层的 resolveComplexityWeight 做了向前兼容：若配置里存在 hard/medium/simple
 *   键则按新键解析，否则严格复现旧行为。改配置即可修复，无需改代码。
 */
export const DEFAULT_TODO_BUSY_CONFIG: TodoBusyConfig = {
  weights: {
    due_date: 5,
    planned_date: 3,
    importance: { high: 3, medium: 2, low: 1 },
    complexity: { high: 2, medium: 1.5, low: 1 },
  },
  thresholds: [0, 3, 8, 15, 25],
  predict_colors: ['#FEF3C7', '#FDE68A', '#FBBF24', '#F59E0B', '#B45309'],
  done_colors: ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'],
}

/** meta 表里的键名（同步时会一起走数据仓） */
export const TODO_BUSY_CONFIG_KEY = 'todo_busy_config_v1'
export const TODO_REMINDER_CONFIG_KEY = 'todo_reminder_config_v1'

/** 每日提醒配置 */
export const TodoReminderConfig = z.object({
  enabled: z.boolean(),
  time: TimeStr,
})
export type TodoReminderConfig = z.infer<typeof TodoReminderConfig>

export const DEFAULT_TODO_REMINDER: TodoReminderConfig = {
  enabled: false,
  time: '16:00',
}

/** 充实度染色 5 档绿（tt_calendar/config.py COLORING_LEVELS） */
export const COLORING_LEVELS = [
  { key: 'Relaxed', label: '放松', color: '#F1F8F4' },
  { key: 'Mild', label: '轻松', color: '#C8E6C9' },
  { key: 'Moderate', label: '适中', color: '#81C784' },
  { key: 'Busy', label: '充实', color: '#388E3C' },
  { key: 'Productive', label: '高产', color: '#1B5E20' },
] as const

/** 新建图层的 24 色预设 */
export const COLOR_PRESETS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#FCD34D',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
  '#0EA5E9', '#3B82F6', '#3D6BFB', '#6366F1', '#8B5CF6',
  '#A855F7', '#8E24AA', '#EC4899', '#F472B6', '#BE185D',
  '#A16207', '#92400E', '#64748B', '#475569',
] as const

/** 分级图层可选的 5 档调色板，key 是中文色名 */
export const GRADED_PALETTES: Record<string, readonly [string, string, string, string, string]> = {
  绿: ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'],
  蓝: ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'],
  橙: ['#fff7ed', '#fed7aa', '#fb923c', '#ea580c', '#7c2d12'],
  紫: ['#faf5ff', '#e9d5ff', '#c084fc', '#9333ea', '#581c87'],
  红: ['#fef2f2', '#fecaca', '#f87171', '#dc2626', '#7f1d1d'],
  青: ['#ecfeff', '#a5f3fc', '#22d3ee', '#0891b2', '#164e63'],
  靛: ['#eef2ff', '#c7d2fe', '#818cf8', '#4f46e5', '#312e81'],
  灰: ['#f8fafc', '#e2e8f0', '#94a3b8', '#475569', '#1e293b'],
}

/** 纪念日自动生成偏移（tt_calendar/config.py ANNIVERSARY_OFFSETS） */
export const ANNIVERSARY_OFFSETS: readonly (readonly [number, string])[] = [
  [99, '99 天'], [100, '100 天'], [200, '200 天'], [300, '300 天'],
  [365, '一周年'], [400, '400 天'], [500, '500 天'], [520, '520 天'],
  [600, '600 天'], [730, '二周年'], [800, '800 天'], [1000, '1000 天'],
  [1095, '三周年'], [1314, '1314 天'],
]

/** 集思录 qtype 全量映射 */
export const JISILU_QTYPES: Record<
  string,
  { label: string; enabled: boolean; color: string }
> = {
  newstock_onlist: { label: '新股上市', enabled: true, color: '#FF7043' },
  newstock_apply: { label: '新股申购', enabled: true, color: '#FF8A65' },
  CNV: { label: '可转债', enabled: true, color: '#FFB300' },
  CBDIV: { label: '正股分红', enabled: true, color: '#9CCC65' },
  cnreits: { label: 'REITs', enabled: true, color: '#26A69A' },
  FUND: { label: '基金', enabled: false, color: '#5C6BC0' },
  BOND: { label: '债券', enabled: false, color: '#78909C' },
  STOCK: { label: '股票', enabled: false, color: '#42A5F5' },
  OTHER: { label: '其它', enabled: false, color: '#B0BEC5' },
  newbond_apply: { label: '新债申购', enabled: true, color: '#FFA726' },
  newbond_onlist: { label: '新债上市', enabled: true, color: '#FB8C00' },
  diva: { label: 'A股分红', enabled: true, color: '#66BB6A' },
  divhk: { label: 'H股分红', enabled: true, color: '#26C6DA' },
  idxfut: { label: '股指期货', enabled: true, color: '#EF5350' },
  idxopt: { label: '股指期权', enabled: true, color: '#EC407A' },
}

/** 移动某一天的全部数据到另一天（拖拽改期）结果 */
export const MoveDayResult = z.object({
  moved_events: z.number().int(),
  moved_schedule: z.boolean(),
})
export type MoveDayResult = z.infer<typeof MoveDayResult>

/** 集思录导入结果 */
export const ImportResult = z.object({
  source: z.string(),
  layer_id: z.string(),
  fetched: z.number().int(),
  inserted: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  error: z.string().nullable(),
  finished_at: DateStr,
})
export type ImportResult = z.infer<typeof ImportResult>
