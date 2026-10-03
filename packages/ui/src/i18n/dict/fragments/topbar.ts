/**
 * topbar 命名空间：顶栏（TopBar）的视图模式、一级 tab、导航提示、搜索入口。
 * 日历/待办/分析/小组件等名词复用 terms.*，不在本命名空间重复。
 */
export const topbar = {
  zh: {
    /** 视图模式切换（月/周/日/年/倒数日胶囊按钮） */
    mode: { month: '月', week: '周', day: '日', year: '年', countdown: '倒数日' },
    /** 待办子视图切换（列表/矩阵/看板/甘特/便签） */
    todoMode: { list: '列表', matrix: '矩阵', kanban: '看板', gantt: '甘特', stickies: '便签' },
    /** 上/下 period 导航按钮的 hover 提示（title 属性） */
    nav: {
      prevYear: '上一年',
      prevMonth: '上一月',
      prevWeek: '上一周',
      prevDay: '上一天',
      nextYear: '下一年',
      nextMonth: '下一月',
      nextWeek: '下一周',
      nextDay: '下一天',
    },
    /** 搜索入口（按钮文本 + title/aria） */
    searchPlaceholder: '搜索事件…',
    searchTitle: '搜索事件',
  },
  en: {
    mode: { month: 'Month', week: 'Week', day: 'Day', year: 'Year', countdown: 'Countdowns' },
    todoMode: { list: 'List', matrix: 'Matrix', kanban: 'Kanban', gantt: 'Gantt', stickies: 'Stickies' },
    nav: {
      prevYear: 'Previous year',
      prevMonth: 'Previous month',
      prevWeek: 'Previous week',
      prevDay: 'Previous day',
      nextYear: 'Next year',
      nextMonth: 'Next month',
      nextWeek: 'Next week',
      nextDay: 'Next day',
    },
    searchPlaceholder: 'Search events…',
    searchTitle: 'Search events',
  },
} as const
