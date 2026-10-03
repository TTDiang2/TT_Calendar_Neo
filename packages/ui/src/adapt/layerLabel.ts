/**
 * 内置图层名的显示时映射（本地化任务书：图层 display_name 是持久化数据）。
 *
 * 规则：
 *  - 内置 ID（zh 默认种子/jisilu）→ 显示当前语言译文；
 *  - 用户改过名（存储名 ≠ zh 默认名）→ 显示用户名（改名语义优先于翻译）；
 *  - 未知 ID / 无存储名 → 显示存储名或 ID。
 *
 * 所有渲染图层名的 UI 必须走 layerLabel()，不要直接渲染 display_name。
 */
import type { I18n } from '../i18n/core'
import type { TxKey } from '../i18n/keys'
import { BUILTIN_LAYER_DEFAULT_NAMES } from '@tt-calendar/contracts'

/** 内置图层 ID → layers 命名空间的 key；改名检测基准 = contracts 的 zh 默认名表 */
const BUILTIN: Record<string, { key: TxKey }> = {
  important: { key: 'layers.important' },
  coloring: { key: 'layers.coloring' },
  holiday: { key: 'layers.holiday' },
  todo: { key: 'layers.todo' },
  todo_done: { key: 'layers.todoDone' },
  schedule_work: { key: 'layers.scheduleWork' },
  schedule_course: { key: 'layers.scheduleCourse' },
  schedule_sport: { key: 'layers.scheduleSport' },
  schedule_play: { key: 'layers.schedulePlay' },
  schedule_other: { key: 'layers.scheduleOther' },
  jisilu_newstock_onlist: { key: 'layers.jisiluNewstockOnlist' },
  jisilu_newstock_apply: { key: 'layers.jisiluNewstockApply' },
  jisilu_CNV: { key: 'layers.jisiluCNV' },
  jisilu_CBDIV: { key: 'layers.jisiluCBDIV' },
  jisilu_cnreits: { key: 'layers.jisiluCnreits' },
  jisilu_FUND: { key: 'layers.jisiluFUND' },
  jisilu_BOND: { key: 'layers.jisiluBOND' },
  jisilu_STOCK: { key: 'layers.jisiluSTOCK' },
  jisilu_OTHER: { key: 'layers.jisiluOTHER' },
  jisilu_newbond_apply: { key: 'layers.jisiluNewbondApply' },
  jisilu_newbond_onlist: { key: 'layers.jisiluNewbondOnlist' },
  jisilu_diva: { key: 'layers.jisiluDiva' },
  jisilu_divhk: { key: 'layers.jisiluDivhk' },
  jisilu_idxfut: { key: 'layers.jisiluIdxfut' },
  jisilu_idxopt: { key: 'layers.jisiluIdxopt' },
}

/**
 * 图层显示名。t 由调用方传入（React 用 useT()，非 React 用 makeI18n(lang).t）。
 * displayName 传图层的 display_name 字段（可能为 null）。
 */
export function layerLabel(t: I18n['t'], layerId: string, displayName: string | null | undefined): string {
  const builtin = BUILTIN[layerId]
  if (!builtin) return displayName || layerId
  // 用户自定义名：与 zh 默认名不同就尊重用户（包括 zh 用户在中文下改的名）
  if (displayName && displayName !== BUILTIN_LAYER_DEFAULT_NAMES[layerId]) return displayName
  return t(builtin.key)
}

/** 是否内置图层（图层编辑器判断「这是预置图层」用）。 */
export function isBuiltinLayer(layerId: string): boolean {
  return layerId in BUILTIN
}
