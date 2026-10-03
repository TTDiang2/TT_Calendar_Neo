/**
 * terms 命名空间：跨模块共用的产品名词（冻结术语表，见 docs/i18n-extraction-spec.md §4）。
 * 各模块直接用 terms.*，不要重复定义；新术语加到这里。
 */
export const terms = {
  zh: {
    calendar: '日历',
    todo: '待办',
    event: '日程',
    schedule: '日程安排',
    countdown: '倒数日',
    layer: '图层',
    stats: '分析',
    widgets: '小组件',
    quadrant: '四象限',
    lunar: '农历',
    solarTerm: '节气',
    holiday: '节假日',
    coloring: '染色',
    anniversary: '纪念日',
    note: '笔记',
    reminder: '提醒',
    subscription: '订阅',
  },
  en: {
    calendar: 'Calendar',
    todo: 'To-dos',
    event: 'Event',
    schedule: 'Schedule',
    countdown: 'Countdowns',
    layer: 'Layers',
    stats: 'Analysis',
    widgets: 'Widgets',
    quadrant: 'Quadrants',
    lunar: 'Lunar calendar',
    solarTerm: 'Solar terms',
    holiday: 'Holidays',
    coloring: 'Coloring',
    anniversary: 'Anniversary',
    note: 'Notes',
    reminder: 'Reminders',
    subscription: 'Subscriptions',
  },
} as const
