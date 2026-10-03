/**
 * @tt-calendar/ui — 三端共享的 React 组件库。
 *
 * 组件代码逐字移植自旧 frontend/src（TT_Calendar），行为与旧版一致；
 * 与数据层的耦合全部收敛到 src/adapt/（types/data/api/todoLogic），
 * app 装配时通过 setBackend() 注入 BackendAdapter。
 */

export { default as App } from './App'
export { setBackend, getBackend } from './adapt/api'
export type { BackendAdapter } from './adapt/api'
export { createHttpBackend } from './adapt/http'
export { useViewData, useLayers, useCountdown } from './hooks/useApi'

// ── i18n（20260930 本地化任务书）：语言选择/切换的公共 API ──────────────────────
export {
  I18nProvider,
  useT,
  useTPlural,
  useLang,
  useI18n,
  makeI18n,
  resolveLang,
  isCJK,
  LANGS,
  LANG_META,
  activeLang,
  chooseLang,
  getChosenLang,
  hasChosenLang,
  onLangChange,
  systemLang,
  fmtDate,
  fmtWeekday,
  fmtMonthName,
  fmtNumber,
  fmtRelativeDays,
} from './i18n'
export { layerLabel, isBuiltinLayer } from './adapt/layerLabel'
export { countdownDisplay, countdownBanner, countdownCategoryLabel, holidayName } from './adapt/labels'
export type { Lang, TxKey, PluralKey, I18n as I18nInstance } from './i18n'
