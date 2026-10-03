/**
 * calendar 命名空间：日历视图（DayCell / DayView / WeekView / YearView / MonthGrid）。
 * 星期名 / 月名 / 年月日格式一律走 i18n/format.ts 的 Intl 封装（fmtWeekday /
 * fmtMonthName / fmtDate），本命名空间只放句子级文案与状态短词；节日名走
 * adapt/labels 的 holidayName（holidayNames.*），农历走 lunarText（lunar.*），
 * 图层名走 layerLabel（layers.*），「待办」分区标题复用 terms.todo。
 *
 * TODO-REVIEW: calendar.todoDue 的 {date} 是 ISO 日期的 MM-DD 切片（原实现直接
 * due_date.slice(5)）。为守住「zh-CN 逐屏一致」红线未改走 fmtDate（其 zh 形态
 * '9/19' 与原 '09-19' 不同）；若后续允许 zh 变更，应改用 Intl 产出各语言形态。
 *
 * TODO-REVIEW: calendar.sectionSchedule / sectionEvents 与冻结术语表有错位——
 * terms.event 的 zh 是「日程」但 en 是 'Event'，而本视图「日程」指 schedule_items、
 * 「事件」指 events_by_layer，直接复用 terms.* 会让 en 两分区混淆，暂留本命名
 * 空间，待术语表复议后合并。
 */
export const calendar = {
  zh: {
    /** 日视图当日无任何数据时的整屏空态 */
    noData: '无数据',
    /** 日视图标题主文本后的「 · 今天 / · 周末」小字后缀（含前导间隔符） */
    todaySuffix: ' · 今天',
    weekendSuffix: ' · 周末',
    /** 日视图/月视图信息栏的空态提示（该日没有安排） */
    emptyDay: '这天还没有安排',
    /** 空态下引导新建的「添加事件」按钮 */
    addEvent: '添加事件',
    /** 桌面日视图头部的「新建」按钮 */
    create: '新建',
    /** 日视图/信息栏分区标题：schedule_items（时段日程）分组 */
    sectionSchedule: '日程',
    /** 日视图/信息栏分区标题：events_by_layer（事件）分组 */
    sectionEvents: '事件',
    /** 待办行右侧状态：逾期红字 / 未逾期截止日期前缀（{date} 见文件头 TODO-REVIEW） */
    todoOverdue: '已过期',
    todoDue: '截止 {date}',
    /** 月格右上角的「班」角标（调休补班日标记） */
    makeUpWorkday: '班',
    /** 手机月格 aria-label：拼在日期串后的状态后缀（含前导逗号，标点由译文决定） */
    ariaTodaySuffix: '，今天',
    ariaSelectedSuffix: '，已选中',
    /** 月视图信息栏头部状态徽标（显示今天 / 已选中其它日期） */
    agendaToday: '今日',
    agendaSelected: '已选',
    /** 信息栏「今天」专属空态（比 emptyDay 多一句操作引导） */
    emptyAgendaToday: '今天还没有安排，点上方日期格子可快速添加',
    /** 信息栏待办小节的已完成计数（数字计数） */
    agendaDoneCount: { other: '已完成 {n}' },
    /** 信息栏待办超过 6 条时的溢出提示 */
    agendaMoreTodos: { other: '还有 {n} 条未完成待办' },
    /** 信息栏待办行勾选框的 aria-label（切换完成态） */
    markDone: '标记为已完成',
    markUndone: '标记为未完成',
    /** 月格日程溢出计数徽标（首条之外还有 N 条） */
    scheduleMore: { other: '+{n} 项日程' },
  },
  en: {
    noData: 'No data',
    todaySuffix: ' · Today',
    weekendSuffix: ' · Weekend',
    emptyDay: 'Nothing planned for this day',
    addEvent: 'Add event',
    create: 'New',
    sectionSchedule: 'Schedule',
    sectionEvents: 'Events',
    todoOverdue: 'Overdue',
    todoDue: 'Due {date}',
    makeUpWorkday: 'Work',
    ariaTodaySuffix: ', today',
    ariaSelectedSuffix: ', selected',
    agendaToday: 'Today',
    agendaSelected: 'Selected',
    emptyAgendaToday: 'Nothing planned today — tap a date cell above to add',
    agendaDoneCount: { one: '{n} completed', other: '{n} completed' },
    agendaMoreTodos: { one: '{n} open to-do left', other: '{n} open to-dos left' },
    markDone: 'Mark as done',
    markUndone: 'Mark as not done',
    scheduleMore: { one: '+{n} more schedule', other: '+{n} more schedules' },
  },
} as const
