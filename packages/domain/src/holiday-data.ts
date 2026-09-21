/**
 * 内置的中文法定节假日/调休静态数据（chinese_calendar 导出，覆盖 2024-2035）。
 *
 * 只导出数据、不做注册 —— 注入点在组合层（packages/db 启动时
 * setHolidayProvider），保持 domain 的「外部注入」设计（holiday.ts 头注）。
 */

import raw from './data/holidays.json'
import type { HolidayData } from './holiday'

export const CHINA_HOLIDAY_DATA: HolidayData = raw.data
