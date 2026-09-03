/**
 * 图层相关领域逻辑（移植自 backend/aggregator.py 的图层部分）。
 *
 * ⚠️ 本文件承载 ARCHITECTURE.md 的六条红线，改动前先读那份文档。
 * 零 IO：所有函数接收已经取好的数据，返回计算结果。
 */

import type {
  CalEvent,
  DateStr,
  DayMark,
  JsonRecord,
  LayerMode,
  Mark,
  Todo,
} from '@tt-calendar/contracts'
import { AUTO_COLOR_LAYER_IDS, canManuallyColor, isScheduleLayer } from '@tt-calendar/contracts'
import { subActionOf } from './text'

/** 图层的最小可用形状（避免与 drizzle 的行类型耦合） */
export interface LayerLike {
  layer_id: string
  display_name: string
  enabled: boolean
  color?: string | null
  sort_order?: number
  kind?: string | null
  group?: string | null
  config?: JsonRecord
}

function modeOf(cfg: JsonRecord | undefined): LayerMode {
  const m = cfg?.mode
  return m === 'graded' || m === 'tag' ? m : 'solid'
}

function paletteOf(cfg: JsonRecord | undefined): string[] {
  const p = cfg?.palette
  return Array.isArray(p) ? (p as string[]) : []
}

/**
 * 订阅级开关：关闭某个订阅 → 其名下的整组图层退出聚合与导航。
 *
 * 约定（与 Sidebar 一致）：订阅的 display_name 等于其图层的 group 名。
 * 返回 [过滤后的图层列表, 被剔除的 layer_id 集合]。
 */
export function applySubscriptionSwitch(
  layers: readonly LayerLike[],
  subscriptions: readonly { display_name: string; enabled: boolean }[],
): [LayerLike[], Set<string>] {
  const disabledNames = new Set(
    subscriptions.filter((s) => !s.enabled).map((s) => s.display_name),
  )
  if (disabledNames.size === 0) return [[...layers], new Set()]

  const removedIds = new Set(
    layers.filter((l) => l.group && disabledNames.has(l.group)).map((l) => l.layer_id),
  )
  if (removedIds.size === 0) return [[...layers], removedIds]
  return [layers.filter((l) => !removedIds.has(l.layer_id)), removedIds]
}

/**
 * 判断事件是否通过图层的 sub_qtypes 过滤（集思录用）。
 *
 * 规则（与 Python 逐字一致）：
 *  - 图层 config 里没有 sub_qtypes 键 → 不过滤，全显示（向后兼容）
 *  - sub_qtypes 为空数组 → 不过滤
 *  - 事件没有 qtype（如手工事件）→ 不归集思录层控制，直接通过
 *  - rule.sub_action 为空 → 该 qtype 下所有子动作都通过
 *  - rule.sub_action 非空 → 只有精确匹配 (qtype, sub_action) 才通过
 */
export function eventPassesLayerFilter(
  ev: Pick<CalEvent, 'title' | 'extra'>,
  layerCfg: JsonRecord | undefined,
): boolean {
  if (!layerCfg || !('sub_qtypes' in layerCfg)) return true
  const sq = layerCfg.sub_qtypes as
    | { qtype: string; sub_action?: string | null }[]
    | null
    | undefined
  if (!sq || sq.length === 0) return true

  const evQ = ev.extra?.qtype
  if (!evQ) return true

  const evSa = subActionOf(ev.title)
  for (const rule of sq) {
    if (rule.qtype !== evQ) continue
    const ruleSa = rule.sub_action
    if (ruleSa == null || ruleSa === '') return true
    if (ruleSa === evSa) return true
  }
  return false
}

/** 按 layer 分组事件，并应用订阅剔除 + sub_qtypes 过滤 */
export function groupEventsByLayer(
  events: readonly CalEvent[],
  layers: readonly LayerLike[],
  removedLayerIds: ReadonlySet<string> = new Set(),
): Record<string, Record<string, CalEvent[]>> {
  const cfgById = new Map(layers.map((l) => [l.layer_id, l.config ?? {}]))
  const out: Record<string, Record<string, CalEvent[]>> = {}
  for (const ev of events) {
    if (removedLayerIds.has(ev.layer_id)) continue
    if (!eventPassesLayerFilter(ev, cfgById.get(ev.layer_id))) continue
    ;(out[ev.date] ??= {})[ev.layer_id] ??= []
    out[ev.date][ev.layer_id].push(ev)
  }
  return out
}

/**
 * 计算某一天的自定义涂色图层染色（打卡 / 完成度 / tag 关联）。
 *
 * 优先级：mark 标记 > 旧版 events 事件 > tag 关联。
 * 返回 [color, label] 或 null。
 */
export function customLayerColor(
  date: DateStr,
  eventsByLayer: Record<string, CalEvent[]>,
  todos: readonly Todo[],
  colorLayers: readonly { layer_id: string; config: JsonRecord }[],
  marksByDate?: Readonly<Record<string, readonly Mark[]>>,
): { color: string; label: string } | null {
  const dayMarks = marksByDate?.[date] ?? []
  const marksById = new Map(dayMarks.map((m) => [m.layer_id, m]))

  for (const { layer_id: lid, config } of colorLayers) {
    const mode = modeOf(config)

    const mark = marksById.get(lid)
    if (mark) {
      if (mode === 'graded' && mark.level != null) {
        const palette = paletteOf(config)
        const color = palette[mark.level]
        if (color) return { color: String(color), label: (config.label as string) ?? lid }
        continue
      }
      const color = config.color
      if (color) return { color: String(color), label: (config.label as string) ?? lid }
      continue
    }

    // 旧版兼容：涂色图层以前存 events，迁移前的数据仍要能显示
    const events = eventsByLayer[lid] ?? []
    if (events.length > 0) {
      if (mode === 'graded') {
        const level = events[0]?.extra?.level
        const palette = paletteOf(config)
        if (typeof level === 'number' && level >= 0 && level < palette.length) {
          return { color: String(palette[level]), label: (config.label as string) ?? lid }
        }
        continue
      }
      const color = config.color
      if (color) return { color: String(color), label: (config.label as string) ?? lid }
      continue
    }

    if (mode === 'tag') {
      const tag = config.tag
      if (tag && todos.some((t) => (t.tags ?? []).includes(String(tag)))) {
        const color = config.color
        if (color) return { color: String(color), label: (config.label as string) ?? lid }
      }
    }
  }
  return null
}

/**
 * 把当天的涂色标记展开成侧栏涂色条需要的结构。
 *
 * 只在 graded 且 level 有效时取 palette 档位色，其余用图层的单色。
 */
export function buildDayMarks(
  date: DateStr,
  marks: readonly Mark[],
  colorLayers: readonly { layer_id: string; config: JsonRecord }[],
  layerNames: Readonly<Record<string, string>> = {},
): DayMark[] {
  const cfgById = new Map(colorLayers.map((l) => [l.layer_id, l.config]))
  return marks.map((m) => {
    const cfg = cfgById.get(m.layer_id) ?? {}
    const mode = modeOf(cfg)
    let color: string | null = null
    if (mode === 'graded' && m.level != null) {
      const palette = paletteOf(cfg)
      color = palette[m.level] ?? null
    } else {
      color = (cfg.color as string) ?? null
    }
    return {
      layer_id: m.layer_id,
      display_name: layerNames[m.layer_id] ?? (cfg.label as string) ?? m.layer_id,
      level: m.level ?? null,
      color,
      mode,
    }
  })
}

/** 启用的涂色图层（含内置 coloring），mark 渲染需要它们的 color/palette */
export function colorLayersOf(layers: readonly LayerLike[]): {
  layer_id: string
  config: JsonRecord
}[] {
  return layers
    .filter((l) => l.enabled && (l.kind === 'color' || !l.kind))
    .map((l) => ({ layer_id: l.layer_id, config: l.config ?? {} }))
}

/** 可手动新增涂色的自定义图层（自动涂色图层不出现在「新增涂色」里） */
export function manuallyColorableLayers(layers: readonly LayerLike[]): LayerLike[] {
  return layers.filter(
    (l) => l.enabled && canManuallyColor(l.layer_id) && (l.kind === 'color' || !l.kind),
  )
}

/** 该图层是否为自动涂色图层（holiday / important / todo / todo_done） */
export function isAutoColorLayer(layerId: string): boolean {
  return (AUTO_COLOR_LAYER_IDS as readonly string[]).includes(layerId)
}

export { isScheduleLayer }
