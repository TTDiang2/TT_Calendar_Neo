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
