/**
 * 视图聚合（移植自 backend/aggregator.py build_view / _build_day）。
 *
 * 这是「原始数据 → 渲染模型」的唯一通道：
 *  - 桌面端：db 取数 → buildView → React 渲染
 *  - 移动端 / Web：换成别的存储适配层，聚合逻辑一行不改
 *
 * 零 IO：所有数据通过 ViewInput 传入。
 */

import type {
  CalEvent,
  DateStr,
  Day,
  JsonRecord,
  Mark,
  ScheduleItem,
  Subscription,
  Todo,
  ViewLayer,
} from '@tt-calendar/contracts'
import { LAYER_IDS } from '@tt-calendar/contracts'
import { monthRange, todayStr } from './date'
import { holidayOf } from './holiday'
import { lunarDisplay } from './lunar'
import {
  applySubscriptionSwitch,
  buildDayMarks,
  colorLayersOf,
  customLayerColor,
  groupEventsByLayer,
  type LayerLike,
} from './layers'
import type { CountdownLike } from './countdown'
import { nextOccurrence } from './countdown'

export interface ViewInput {
  /** 要渲染的日期列表（月视图 42 天 / 周视图 7 天 / 日视图 1 天） */
  days: readonly DateStr[]
  viewYear: number
  viewMonth: number
  today?: DateStr

  events: readonly CalEvent[]
  /** 旧版 AM/PM/EV 三段日程，按日期索引 */
  schedule: Readonly<Record<DateStr, { am: string | null; pm: string | null; ev: string | null }>>
  scheduleItems: readonly ScheduleItem[]
  /** 内置充实度染色 level，按日期索引 */
  coloring: Readonly<Record<DateStr, number>>
  /** 当天命中的待办，按日期索引（一条 todo 可能同时挂在 due 和 planned 两天） */
  todosByDate: Readonly<Record<DateStr, readonly Todo[]>>
  marksByDate: Readonly<Record<DateStr, readonly Mark[]>>
  /** 待办忙度快照，按日期索引 */
  dayBusy: Readonly<Record<DateStr, { predict_level: number | null; done_level: number | null }>>

  layers: readonly LayerLike[]
  subscriptions: readonly Pick<Subscription, 'display_name' | 'enabled'>[]
  countdowns: readonly CountdownLike[]
}

export interface ViewResult {
  year: number
  month: number
  layers: ViewLayer[]
  days: Day[]
}

function toViewLayer(l: LayerLike): ViewLayer {
  return {
    layer_id: l.layer_id,
    display_name: l.display_name,
    enabled: l.enabled,
    color: l.color ?? null,
    sort_order: l.sort_order ?? 0,
    kind: (l.kind ?? 'color') as ViewLayer['kind'],
    group: l.group ?? null,
    config: (l.config ?? {}) as JsonRecord,
  }
}

/**
 * 组装单日数据。
 *
 * viewYear/viewMonth 用于标记 is_other_month（月视图淡化前后月）；
 * 周视图/日视图传当前所在月即可，跨周时前后几天自然被淡化。
 */
export function buildDay(
  input: ViewInput,
  d: DateStr,
  eventsByLayer: Record<DateStr, Record<string, CalEvent[]>>,
  scheduleItemsByDate: Record<DateStr, ScheduleItem[]>,
  gradient: Record<DateStr, string>,
  colorLayerCfgs: { layer_id: string; config: JsonRecord }[],
  customLayers: { layer_id: string; config: JsonRecord }[],
  layerNames: Record<string, string>,
): Day {
  const today = input.today ?? todayStr()
  const date = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  const isWeekendDay = date.getDay() === 0 || date.getDay() === 6

  const evByLayer = eventsByLayer[d] ?? {}
  const sched = input.schedule[d] ?? null
  const items = scheduleItemsByDate[d] ?? []
  const dayTodos = input.todosByDate[d] ?? []
  const busy = input.dayBusy[d]
  const dayMarks = input.marksByDate[d] ?? []

  const customBg = customLayerColor(d, evByLayer, dayTodos, customLayers, input.marksByDate)

  return {
    date: d,
    is_today: d === today,
    is_weekend: isWeekendDay,
    is_other_month:
      Number(d.slice(0, 4)) !== input.viewYear || Number(d.slice(5, 7)) !== input.viewMonth,
    events_by_layer: evByLayer,
    schedule: sched ? { date: d, am: sched.am, pm: sched.pm, ev: sched.ev } : null,
    schedule_items: items,
    coloring_level: input.coloring[d] ?? null,
    holiday: holidayOf(d),
    lunar: lunarDisplay(d),
    gradient_bg: gradient[d] ?? null,
    custom_bg: customBg && customBg.color ? customBg : null,
    todos: [...dayTodos],
    predict_level: busy?.predict_level ?? null,
    done_level: busy?.done_level ?? null,
    marks: buildDayMarks(d, dayMarks, colorLayerCfgs, layerNames),
  }
}

/** 通用聚合：按给定 days 组装视图响应 */
export function buildView(input: ViewInput): ViewResult {
  const today = input.today ?? todayStr()

  const [layers, removedIds] = applySubscriptionSwitch(input.layers, input.subscriptions)
  const layerNames: Record<string, string> = {}
  for (const l of layers) layerNames[l.layer_id] = l.display_name

  const colorLayerCfgs = colorLayersOf(layers)
  // 自定义涂色图层：只有 custom_* 参与「当天背景染色」的优先级竞争
  const customLayers = colorLayerCfgs.filter((l) => l.layer_id.startsWith('custom_'))

  const eventsByLayer = groupEventsByLayer(input.events, layers, removedIds)

  const scheduleItemsByDate: Record<DateStr, ScheduleItem[]> = {}
  for (const item of input.scheduleItems) {
    ;(scheduleItemsByDate[item.date] ??= []).push(item)
  }

  // 重要日期 + 倒数日的下一次发生日 → 当天染峰值色（不再做区间渐变）
  const importantDates: DateStr[] = input.events
    .filter((e) => e.layer_id === LAYER_IDS.IMPORTANT)
    .map((e) => e.date)
  for (const cd of input.countdowns) {
    const { next_date, passed } = nextOccurrence(cd, today)
    if (!passed) importantDates.push(next_date)
  }

  const [mStart, mEnd] = monthRange(input.viewYear, input.viewMonth)
  const gradient: Record<DateStr, string> = {}
  for (const d of importantDates) {
    if (d >= mStart && d <= mEnd) gradient[d] = '#FF4D4D'
  }

  const days = input.days.map((d) =>
    buildDay(
      input,
      d,
      eventsByLayer,
      scheduleItemsByDate,
      gradient,
      colorLayerCfgs,
      customLayers,
      layerNames,
    ),
  )

  return {
    year: input.viewYear,
    month: input.viewMonth,
    layers: layers.map(toViewLayer),
    days,
  }
}

/** 年视图：聚合全年 12 个月的迷你月历 */
export function buildYearView(
  input: Omit<ViewInput, 'days' | 'viewMonth'> & { year: number; months: { month: number; days: readonly DateStr[] }[] },
): { year: number; layers: ViewLayer[]; months: { month: number; days: Day[] }[] } {
  const [layers] = applySubscriptionSwitch(input.layers, input.subscriptions)
  const months = input.months.map((m) => ({
    month: m.month,
    days: buildView({ ...input, days: m.days, viewYear: input.year, viewMonth: m.month }).days,
  }))
  return { year: input.year, layers: layers.map(toViewLayer), months }
}
