import type { Layer } from './types'

/**
 * 订阅来源图层的统一判别式（20260917 智者 P0-1）。
 *
 * 此前仓库里存在三套互不一致的写法（jisilu_ 前缀 / sort_order≥10 / 组名=订阅名），
 * 英为财情等第三方适配的订阅图层恰好漏在 jisilu_ 前缀之外，导致手机端点点/涂色
 * 新增下拉与搜索结果里仍能看到订阅内容（任务书 1.2-2 点名问题）。
 *
 * 约定取三者的并集，任何新增内容面（视图/搜索/下拉/图层树）必须使用本函数，
 * 禁止再各写各的判别式：
 *  - layer_id 以 `jisilu_` 开头（集思录固定前缀）；
 *  - 图层组名 = 某个订阅的 display_name（Sidebar/LayerTree 的既有约定）；
 *  - sort_order ≥ 10（外部数据源补建图层的固定档位，用户自建图层恒为 0）。
 */
export function subscriptionLayerFilter(
  subNames: ReadonlySet<string>,
): (l: Layer) => boolean {
  return (l) =>
    l.layer_id.startsWith('jisilu_')
    || (!!l.group && subNames.has(l.group))
    || (l.sort_order ?? 0) >= 10
}

/** 便捷封装：直接给出一组「订阅图层的 layer_id 集合」（供按事件 → 图层反向过滤的场景用） */
export function subscriptionLayerIds(
  layers: readonly Layer[],
  subNames: ReadonlySet<string>,
): Set<string> {
  const isSub = subscriptionLayerFilter(subNames)
  return new Set(layers.filter(isSub).map((l) => l.layer_id))
}
