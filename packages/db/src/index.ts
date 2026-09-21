import { CHINA_HOLIDAY_DATA, setHolidayProvider, StaticHolidayProvider } from '@tt-calendar/domain'

// 内置中文节假日/调休数据在此注入（桌面/移动 Worker/Web 三端都经由本包构造后端）。
// 不注册的话 holidayOf 恒为 null：法定节假日不显示，重复待办的 weekdays 档
// 也会把节假日当普通日子（HANDOFF-repeat-to-neo §4.2 工作日判定）。
setHolidayProvider(new StaticHolidayProvider(CHINA_HOLIDAY_DATA))

export * from './schema'
export * from './client'
export * from './backend'
export * from './sync-service'
export * from './sync/github'
export * from './sync/facade'
export * from './sources/jisilu'
export * from './sources/csv-todos'
