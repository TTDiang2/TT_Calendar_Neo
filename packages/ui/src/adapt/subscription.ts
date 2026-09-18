import type { Layer } from './types'

/**
 * 订阅来源图层的统一判别式。
 *
 * 历史：20260917 智者 P0-1 曾取「jisilu_ 前缀 ∥ 组名=订阅名 ∥ sort_order≥10」
 * 三者的并集。其中 sort_order≥10 一条在 20260918 被实测证伪并移除——它当时是
 * 为一个并不存在的第三方源（注释里的「英为财情」）预设的档位，且「用户自建
 * 图层恒为 0」的假设只对 Neo 成立：老端（Python）create_layer 给自建图层
 * 硬编码 sort_order=10（backend/routes.py:271），实测早起/早睡/约饭全是 10，
 * 被误判成订阅图层，手机端图层树里彻底消失（设置页不过滤，所以「设置里看
 * 得到、抽屉里看不到」）。
 *
 * 现行判别式（两条都依赖真实存在的约定，不再用魔法数字）：
 *  - layer_id 以 `jisilu_` 开头（集思录固定前缀）；
 *  - 图层组名 = 某个订阅的 display_name（订阅建图的既有约定）。
 * 任何新增内容面（视图/搜索/下拉/图层树）必须使用本函数，禁止再各写各的判别式。
 * 将来若真接入新订阅源，给它定 layer_id 前缀或组名约定后在这里扩展，不要用 sort_order。
 */
export function subscriptionLayerFilter(
  subNames: ReadonlySet<string>,
): (l: Layer) => boolean {
  return (l) =>
    l.layer_id.startsWith('jisilu_')
    || (!!l.group && subNames.has(l.group))
}

/** 便捷封装：直接给出一组「订阅图层的 layer_id 集合」（供按事件 → 图层反向过滤的场景用） */
export function subscriptionLayerIds(
  layers: readonly Layer[],
  subNames: ReadonlySet<string>,
): Set<string> {
  const isSub = subscriptionLayerFilter(subNames)
  return new Set(layers.filter(isSub).map((l) => l.layer_id))
}
