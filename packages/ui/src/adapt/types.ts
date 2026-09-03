/**
 * 兼容适配层：旧 frontend/src/types.ts 的出口面。
 *
 * 类型实体全部来自 @tt-calendar/contracts（单一来源），
 * 只补充纯前端本地的 UI 状态类型。
 */

export type {
  CalEvent,
  Schedule,
  ScheduleItem,
  CustomBg,
  DayMark,
  Day,
  MonthData,
  YearData,
  ViewMode,
  TopTab,
  Layer,
  TodoList,
  Todo,
  CountdownItem,
  StatsSummary,
  TodoSort,
  TodoStatusFilter,
  TodoViewMode,
} from '@tt-calendar/contracts'
