import type { CalEvent, Day, Layer } from '../adapt/types'

/**
 * 日期格子的「视觉要素」收集：可见事件与色点（点点）。
 * 从 DayCell 提出来共用——手机 iOS 风格月格（只有数字+圆片+点点）与
 * 桌面格子（数字+色点+事件标题）必须保持同一套过滤/配色逻辑：
 *  - important / schedule 图层始终显示（开关只控染色）；
 *  - 其余图层按 enabled 过滤；
 *  - 日程类点点图层按 config.category 匹配当日 schedule_items。
 */
export function collectDayVisuals(day: Day, layers: Layer[]): { visibleEvents: CalEvent[]; dots: string[] } {
  const enabledSet = new Set(layers.filter((l) => l.enabled).map((l) => l.layer_id))
  const visibleEvents = Object.entries(day.events_by_layer)
    .filter(([lid]) => lid === 'important' || lid === 'schedule' || enabledSet.has(lid))
    .flatMap(([, evs]) => evs)
    .sort((a, b) => a.sort_key - b.sort_key)

  const dots: string[] = []
  const seen = new Set<string>()
  for (const lid of Object.keys(day.events_by_layer)) {
    const layer = layers.find((l) => l.layer_id === lid)
    if (!layer?.enabled && lid !== 'important') continue
    const c = layer?.color ?? '#9ca3af'
    if (!seen.has(c) && visibleEvents.some((e) => e.layer_id === lid)) {
      seen.add(c)
      dots.push(c)
    }
  }
  // 日程类型点点图层：按图层 config.category 匹配当日 schedule_items 的 category
  const items = day.schedule_items ?? []
  if (items.length > 0) {
    const catSet = new Set<string>(items.map((i) => i.category ?? 'work'))
    for (const layer of layers) {
      if (layer.kind !== 'dot' || !layer.enabled) continue
      const cat = (layer.config as Record<string, unknown>)?.category as string | undefined
      if (cat && catSet.has(cat) && layer.color && !seen.has(layer.color)) {
        seen.add(layer.color)
        dots.push(layer.color)
      }
    }
  }
  return { visibleEvents, dots: dots.slice(0, 5) }
}
