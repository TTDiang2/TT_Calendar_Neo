/**
 * widgetsView 命名空间：小组件页（WidgetsView）+ 各小组件卡片（widgets/cards.tsx）
 * + 倒数日视图（CountdownView，编辑抽屉/卡片文案）。
 * 倒数日的行标题后缀 / 顶部一句话 / 分类名走既有 countdown.*（勿在此重复定义）；
 * 固定分类枚举值（生日/纪念日/…）是持久化数据，源取 contracts CountdownCategory.options，
 * 显示一律经 adapt/labels 的 countdownCategoryLabel 按语言映射。
 *
 * TODO-REVIEW: coloringTitle zh 是「涂色」，冻结术语表 terms.coloring zh 是「染色」
 * ——两词并存（widget 标题沿用原版「涂色」守逐屏一致），待术语表复议后合并。
 *
 * TODO-REVIEW: 时钟/迷你月历的「M 月 D 日」「Y 年 M 月」改走 fmtDate 后 zh 形态
 * 变为「10月3日」「2026年10月」（原版带空格），与 MonthGrid 先例一致——
 * §3 禁止把日期格式串放字典，故接受此空格差异。
 */
export const widgetsView = {
  zh: {
    /** 小组件页页头标题旁的小字说明 */
    subtitle: 'App 内的信息卡片',
    /** 页内引导框标题（澄清：本页是 App 内卡片，不是系统主屏小组件） */
    guideTitle: '本页是 App 内的信息卡片',
    /** 引导框 iOS 分支：放到主屏幕的操作步骤 */
    guideIosSteps: '想放到 iPhone 主屏幕？长按主屏幕空白处 → 左上角「+」→ 搜索「TT 日历」→ 选尺寸添加（iOS 14+）。',
    /** 引导框 iOS 分支：数据同步时机补充句 */
    guideIosData: '小组件显示的数据由 App 打开时同步写入。',
    /** 引导框非 iOS 分支：系统主屏小组件的另入口说明 */
    guideOtherSteps: 'iPhone 版另配有系统「主屏小组件」（长按主屏幕 → 左上角「+」→ 搜「TT 日历」添加）。',
    /** 引导框非 iOS 分支：本页卡片跨端通用补充句 */
    guideOtherCards: '本页卡片在三端通用。',
    /** 网格空态（全部小组件被移除后） */
    emptyHint: '还没有小组件，点右上角「编辑」添加',
    /** 添加小组件底部弹层的标题 */
    pickerTitle: '添加小组件',
    /** 弹层空态（注册表全部已启用） */
    pickerEmpty: '全部小组件都已添加',
    /** 卡片编辑态右上角删除钮的 title */
    removeWidget: '移除小组件',
    // ── 注册表里各小组件的标题/说明（terms 里已有的标题复用 terms.*，不在本表重复）──
    /** 待办卡说明（标题复用 terms.todo） */
    todoDesc: '今天与逾期的待办，可直接勾选完成',
    /** 迷你日历卡说明（标题复用 terms.calendar） */
    miniCalendarDesc: '迷你月历，今天高亮、事件打点',
    /** 时钟卡标题 */
    clockTitle: '时钟',
    /** 时钟卡说明 */
    clockDesc: '实时时钟与农历',
    /** 倒数日卡说明（标题复用 terms.countdown） */
    countdownDesc: '最近的三个倒数日',
    /** 涂色卡标题（见文件头 TODO-REVIEW：与 terms.coloring「染色」并存） */
    coloringTitle: '涂色',
    /** 涂色卡说明 */
    coloringDesc: '本月充实度热力图，可翻月',
    /** 点点卡注册表标题（卡片内标题是 dotsTodayTitle） */
    dotsTitle: '点点',
    /** 点点卡说明 */
    dotsDesc: '今天的事件点点列表',
    /** 忙度卡标题 */
    busyTitle: '忙度预报',
    /** 忙度卡说明 */
    busyDesc: '未来 7 天忙度预测',
    /** 完成概览卡标题 */
    statsTitle: '完成概览',
    /** 完成概览卡说明 */
    statsDesc: '待办完成率一览',
    /** 待办卡空态 */
    todoEmpty: '今天没有待办，好好休息 ☕',
    /** 待办行右侧逾期红字角标 */
    todoOverdue: '逾期',
    /** 待办卡底部的溢出提示（数字计数控） */
    todoMore: { other: '今天还有 {n} 项…' },
    /** 涂色卡大数字旁的行标（{m} 是月份数字） */
    coloredDays: '{m} 月已涂天数',
    /** 点点卡标题（带「今天」后缀） */
    dotsTodayTitle: '点点 · 今天',
    /** 点点卡空态 */
    dotsEmpty: '今天没有事件点点',
    /** 倒数日卡空态 */
    countdownEmpty: '还没有倒数日',
    /** 忙度卡横轴上「今天」的单字标记（宽度极窄） */
    busyToday: '今',
    /** 忙度柱的 hover title（date 为 ISO 日期，level 为等级数字或 —） */
    busyLevelTitle: '{date}：忙度 {level}',
    /** 忙度卡空态 */
    busyEmpty: '暂无预报',
    /** 时钟卡农历行前缀（text 为 lunarText 产出的农历串） */
    clockLunar: '农历 {text}',
    /** 完成概览卡大数字下的行标 */
    statsCompleted: '已完成',
    /** 完成概览卡的待处理计数行（n 为数字或 —） */
    statsPending: '待处理 {n}',
    /** 倒数日视图标题带选中分类时（无分类时标题用 terms.countdown） */
    headerCategory: '倒数日 · {category}',
    /** 桌面中卡片区右上角的「新建」按钮 */
    new: '新建',
    /** 左分类栏底部新建入口 / 编辑弹层新建态标题 */
    newCountdown: '新建倒数日',
    /** 编辑弹层/右栏编辑态标题 */
    settingsTitle: '倒数日设置',
    /** 倒数日列表空态 */
    emptyCountdown: '暂无倒数日，点右下角 + 新建',
    /** 卡片状态行：当天 */
    cardToday: '🎉 就是今天',
    /** 卡片状态行：已过且开了永不过期 */
    cardPassedForever: '已过 · 永久纪念',
    /** 卡片状态行：已过 N 天（数字计数控） */
    cardPassedDays: { other: '已过 {n} 天' },
    /** 卡片状态行：还有 N 天（数字计数控） */
    cardDaysLeft: { other: '还有 {n} 天' },
    /** 卡片角标 title：公历每年重置 */
    titleRepeatYearly: '每年重置',
    /** 卡片角标 title：农历每年重置 */
    titleRepeatLunar: '按农历每年重置',
    /** 卡片「农历」红字徽标的 title */
    titleLunarRepeat: '农历重复',
    /** 卡片角标 title：里程碑规则 */
    titleMilestone: '自动计算里程碑',
    /** 卡片角标 title：永不过期 */
    titleNeverExpire: '永不过期',
    /** 桌面右栏无选中时的占位提示 */
    panelEmptyHint: '点击卡片查看 / 编辑',
    /** 表单：名称字段标签 */
    fieldName: '名称',
    /** 名称输入框 placeholder */
    namePlaceholder: '如：生日 / 结婚纪念日',
    /** 表单：分类字段标签 */
    fieldCategory: '分类',
    /** 自定义分类输入框 placeholder */
    customCategoryPlaceholder: '输入自定义分类名',
    /** 分类下拉里的自定义选项 */
    customCategoryOption: '+ 自定义…',
    /** 表单：日期字段标签（未开每年重置/里程碑时） */
    fieldDate: '日期',
    /** 表单：日期字段标签（开每年重置/里程碑后改叫基准日期） */
    fieldBaseDate: '基准日期',
    /** 表单：每年重置复选框标签 */
    repeatYearlyLabel: '每年重置（生日/节日）',
    /** 表单：重复规则小节标签 */
    repeatRule: '重复规则',
    /** 重复规则单选：公历 */
    repeatSolar: '按公历（每年同月日）',
    /** 重复规则单选：农历 */
    repeatLunar: '按农历（春节/七夕等）',
    /** 表单：里程碑规则字段标签 */
    milestoneLabel: '自动计算纪念日（逗号分隔天数）',
    /** 里程碑规则输入框下的解释小字 */
    milestoneHint: '从基准日期起自动生成百天/周年等特殊日子，显示最近的下一个。',
    /** 表单：永不过期复选框标签 */
    neverExpireLabel: '过期后不显示「已过」',
    /** 表单：备注字段标签 */
    fieldNotes: '备注',
    /** 备注输入框 placeholder */
    notesPlaceholder: '可选',
    /** 弹层里通栏的删除按钮 */
    deleteThis: '删除该倒数日',
    /** 删除前 confirm() 弹窗文案 */
    confirmDelete: '删除该倒数日？',
    /** 新建态保存按钮（编辑态复用 common.save） */
    create: '创建',
  },
  en: {
    subtitle: 'Info cards inside the app',
    guideTitle: 'These are in-app info cards',
    guideIosSteps: 'Want them on your iPhone Home Screen? Touch and hold an empty area → tap "+" at the top left → search "TT Calendar" → pick a size (iOS 14+).',
    guideIosData: 'Widget data is synced when the app opens.',
    guideOtherSteps: 'The iPhone app also ships system Home Screen widgets (touch and hold the Home Screen → "+" at the top left → search "TT Calendar").',
    guideOtherCards: 'The cards on this page work on all platforms.',
    emptyHint: 'No widgets yet — tap "Edit" at the top right to add some',
    pickerTitle: 'Add Widgets',
    pickerEmpty: 'All widgets have been added',
    removeWidget: 'Remove widget',
    todoDesc: 'Today\'s and overdue to-dos, check to complete',
    miniCalendarDesc: 'Mini month calendar with today highlighted and event dots',
    clockTitle: 'Clock',
    clockDesc: 'Live clock with lunar date',
    countdownDesc: 'The three nearest countdowns',
    coloringTitle: 'Coloring',
    coloringDesc: 'Monthly fullness heatmap, swipe months',
    dotsTitle: 'Dots',
    dotsDesc: 'Today\'s event dots list',
    busyTitle: 'Busyness forecast',
    busyDesc: 'Busyness prediction for the next 7 days',
    statsTitle: 'Completion overview',
    statsDesc: 'To-do completion rate at a glance',
    todoEmpty: 'No to-dos today — take a break ☕',
    todoOverdue: 'Overdue',
    todoMore: { one: '1 more item today…', other: '{n} more items today…' },
    coloredDays: 'days colored in month {m}',
    dotsTodayTitle: 'Dots · Today',
    dotsEmpty: 'No event dots today',
    countdownEmpty: 'No countdowns yet',
    busyToday: 'Today',
    busyLevelTitle: '{date}: busyness {level}',
    busyEmpty: 'No forecast',
    clockLunar: 'Lunar {text}',
    statsCompleted: 'Completed',
    statsPending: 'Pending {n}',
    headerCategory: 'Countdowns · {category}',
    new: 'New',
    newCountdown: 'New countdown',
    settingsTitle: 'Countdown settings',
    emptyCountdown: 'No countdowns yet — tap + at the bottom right to create one',
    cardToday: '🎉 It\'s today',
    cardPassedForever: 'Passed · forever remembered',
    cardPassedDays: { one: 'Passed 1 day ago', other: 'Passed {n} days ago' },
    cardDaysLeft: { one: '1 day left', other: '{n} days left' },
    titleRepeatYearly: 'Repeats yearly',
    titleRepeatLunar: 'Resets yearly by lunar calendar',
    titleLunarRepeat: 'Repeats by lunar calendar',
    titleMilestone: 'Auto milestones',
    titleNeverExpire: 'Never expires',
    panelEmptyHint: 'Select a card to view / edit',
    fieldName: 'Name',
    namePlaceholder: 'e.g. Birthday / Wedding anniversary',
    fieldCategory: 'Category',
    customCategoryPlaceholder: 'Enter a custom category',
    customCategoryOption: '+ Custom…',
    fieldDate: 'Date',
    fieldBaseDate: 'Base date',
    repeatYearlyLabel: 'Repeat yearly (birthdays/holidays)',
    repeatRule: 'Repeat rule',
    repeatSolar: 'Solar (same month/day every year)',
    repeatLunar: 'Lunar (Spring Festival, Qixi, etc.)',
    milestoneLabel: 'Auto anniversaries (comma-separated days)',
    milestoneHint: 'Automatically generates day-100/anniversary milestones from the base date and shows the nearest upcoming one.',
    neverExpireLabel: 'Hide "passed" after the date',
    fieldNotes: 'Notes',
    notesPlaceholder: 'Optional',
    deleteThis: 'Delete this countdown',
    confirmDelete: 'Delete this countdown?',
    create: 'Create',
  },
} as const
