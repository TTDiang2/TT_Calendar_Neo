/**
 * dialogs 命名空间：弹窗与详情面板（批次 B6）——
 * dialogs.tsx（事件/日程编辑器、充实度选择器、综合搜索、右键菜单、点点/涂色快速录入）、
 * DetailPanel.tsx、NotesEditorModal.tsx、ReminderBanner.tsx、ErrorBoundary.tsx。
 *
 * 通用词复用 common.*（取消/保存/删除/编辑/添加/关闭/搜索/今天/重试）与 terms.todo；
 * 图层名一律走 layerLabel（layers.*），节日名走 holidayName（holidayNames.*），
 * 农历行由 lunarText 承担，不在本命名空间重复。
 *
 * TODO-REVIEW: 四个弹窗标题的 {date}（schedule/coloring/dot/colorEntry.titleWithDate）
 * 与搜索结果的 {date} 切片，沿用原实现的 ISO 日期串（如 '2026-09-18' / '09-18'），
 * 为守住「zh-CN 逐屏一致」红线未改走 fmtDate（zh 形态会从 '2026-09-18' 变
 * '2026/9/18'）。若后续允许 zh 变更，应改用 Intl 产出各语言形态。
 *
 * TODO-REVIEW: detail.yearWeekday 让 zh-CN 详情面板日期头部改用 Intl 形态
 * （规范 §3 硬性）：大字行 '10月3日'、小字行 '2026年 · 周六'，与旧手拼
 * '10 月 3 日' / '2026 年 · 周六' 相比去掉了数字前后的空格——本批次唯一
 * 有意的 zh 展示差异。
 *
 * TODO-REVIEW: reminder.plannedLeft 按 §2.1 整句抽取后，原 JSX 里加粗数字的内层
 * <span class="font-medium"> 一并消失（文案逐字不变，仅数字不再加粗）；若要保留
 * 强调需富文本插值能力，本批次未引入。
 *
 * TODO-REVIEW: detail.coloring（'涂色'）刻意不用 terms.coloring（'染色'）——
 * zh-CN 逐屏一致红线优先于术语表；待术语表复议后合并。
 */
export const dialogs = {
  zh: {
    /** ── 多弹窗/详情面板共用 ─────────────────────────────── */
    /** 起止时间输入框之间的连接词（日程编辑器行内 / 点点录入） */
    toTime: '至',
    /** 图层下拉里未启用图层名后的括号后缀 */
    hiddenSuffix: '（隐藏）',
    /** 单条日程行的「编辑日程」动作（右键菜单项 + 详情面板小铅笔 title 共用） */
    editSchedule: '编辑日程',
    /** 删除单条日程按钮的 title（日程编辑器行内 + 详情面板共用） */
    deleteScheduleItem: '删除这条日程',

    /** ── 事件编辑器（EventEditor，新建/编辑两态） ────────── */
    event: {
      /** 弹窗标题：编辑既有事件 */
      titleEdit: '编辑事件',
      /** 弹窗标题：新建事件 */
      titleNew: '新建事件',
      /** 表单标签：事件标题输入框 */
      fieldTitle: '标题',
      /** 表单标签：日期选择器 */
      fieldDate: '日期',
      /** 表单标签：图层下拉（未固定图层时出现） */
      fieldLayer: '图层',
      /** 表单标签：描述多行框，括号提示可不填 */
      fieldDesc: '描述（可选）',
      /** 表单标签：自定义颜色输入框，括号内为格式提示 */
      fieldColor: '颜色（可选，#RRGGBB）',
    },

    /** ── 日程编辑器（ScheduleEditor，多时段行编辑） ──────── */
    schedule: {
      /** 弹窗标题，{date} 为 ISO 日期串（见文件头 TODO-REVIEW） */
      titleWithDate: '日程 {date}',
      /** 空态提示：当天没有任何日程行 */
      empty: '当天没有日程，点「添加日程」开始',
      /** 底部「添加日程」按钮（新增一行） */
      add: '添加日程',
      /** 每行标题输入框占位符 */
      what: '做什么',
      /** 每行分类下拉的 5 个选项（与 layers.schedule* 同词源；分组内禁用 other 键名，用 misc） */
      cat: {
        work: '工作',
        course: '课程',
        sport: '运动',
        play: '玩耍',
        misc: '其他',
      },
    },

    /** ── 充实度选择器（ColoringPicker，5 档 + 清除） ─────── */
    coloring: {
      /** 弹窗标题，{date} 为 ISO 日期串（见文件头 TODO-REVIEW） */
      titleWithDate: '充实度 {date}',
      /** 顶部当前状态行，{level} 为档位名或「未设」 */
      current: '当前：{level}',
      /** 当前状态行的未设置兜底值 */
      notSet: '未设',
      /** 左下角「清除」按钮（清掉当天充实度） */
      clear: '清除',
    },

    /** 充实度 5 档显示名（contracts COLORING_LEVELS 的英文 key 小写映射） */
    coloringLevel: {
      relaxed: '放松',
      mild: '轻松',
      moderate: '适中',
      busy: '充实',
      productive: '高产',
    },

    /** ── 综合搜索（SearchDialog，事件 + 待办） ───────────── */
    search: {
      /** 搜索输入框占位符 */
      placeholder: '搜事件、待办…',
      /** 空结果提示，{q} 为用户关键词 */
      nothing: '未找到与「{q}」相关的事件或待办',
      /** 事件分区小标题（事件指的是 events 表的手动/点点事件） */
      sectionEvents: '事件',
      /** 待办行右侧的逾期红字 */
      overdue: '已过期',
    },

    /** ── 右键菜单（ContextMenu，日历空白格长按/右键） ────── */
    menu: {
      /** 菜单项：新建事件 */
      newEvent: '新建事件',
      /** 菜单项：打开充实度选择器 */
      setColoring: '设置充实度',
    },

    /** ── 点点快速录入（DotEntryDialog，当日新增点点） ────── */
    dot: {
      /** 弹窗标题，{date} 为 ISO 日期串（见文件头 TODO-REVIEW） */
      titleWithDate: '新增点点 {date}',
      /** 表单标签：目标图层下拉 */
      pickLayer: '选择图层',
      /** 图层下拉的分组名：日程类点点图层 */
      groupSchedule: '日程',
      /** 图层下拉的分组名：内置重要日期（事件类） */
      groupEvents: '事件',
      /** 图层下拉的分组名：其余 dot 图层 */
      groupOther: '其他',
      /** 时间行末色点图标的 title（展示目标图层颜色） */
      layerColorTitle: '图层颜色',
      /** 表单标签：内容多行框 */
      content: '内容',
      /** 内容输入框占位符（可多行） */
      placeholder: '做什么（可多行）',
      /** 内容为空时提交的校验错误（Error 消息） */
      contentRequired: '请填写内容',
    },

    /** ── 涂色快速录入（ColorEntryDialog，当日新增涂色） ──── */
    colorEntry: {
      /** 弹窗标题，{date} 为 ISO 日期串（见文件头 TODO-REVIEW） */
      titleWithDate: '新增涂色 {date}',
      /** 表单标签：目标涂色图层下拉 */
      pickLayer: '选择涂色图层',
      /** 图层下拉按涂色模式分的 3 个分组名 */
      group: {
        /** solid 模式（单色打卡） */
        habit: '习惯打卡',
        /** graded 模式（五档完成度，含内置充实度） */
        progress: '工作完成度',
        /** tag 模式（待办标签关联） */
        linked: '关联涂色',
      },
      /** 内置充实度的档位选择标签（5 色格） */
      levelFullness: '充实度档位',
      /** 自定义 graded 图层的档位选择标签（纯色格） */
      level: '档位',
      /** solid 图层的固定颜色标签 */
      fixedColor: '图层颜色（固定）',
      /** 固定颜色说明前半句 */
      fixedColorHint: '标记将使用图层预设颜色，不可在此修改。',
      /** 固定颜色说明后半句（引导去设置页） */
      fixedColorHintMore: '如需改色请到设置页编辑图层。',
      /** 右下角提交按钮（写入标记） */
      mark: '标记',
    },

    /** ── 详情面板（DetailPanel，桌面右栏 / 手机抽屉） ────── */
    detail: {
      /** 日期头部上方的小灰字 */
      selectedDate: '已选日期',
      /** 日期头部小字行：{year}/{weekday} 均为 Intl 产出（见文件头 TODO-REVIEW） */
      yearWeekday: '{year} · {weekday}',
      /** 手机抽屉未选日期时的空态 */
      drawerEmpty: '点月历上的日期，这里会显示当天详情。',
      /** 桌面右栏未选日期时的空态 */
      panelEmpty: '点击日期查看详情',
      /** 抽屉入口按钮：加点点 */
      addDot: '加点点',
      /** 桌面/抽屉入口按钮：涂色（刻意不用 terms.coloring，见文件头） */
      coloring: '涂色',
      /** 桌面入口按钮：事件 */
      event: '事件',
      /** 桌面入口按钮 + 日程分区标题：日程 */
      schedule: '日程',
      /** 桌面入口按钮：点点 */
      dot: '点点',
      /** 充实度进度条行首的小标签 */
      fullness: '充实度',
      /** 待办忙度预测（未完成）进度条行首标签 */
      todoPredict: '待办·未完成',
      /** 待办忙度（已完成）进度条行首标签 */
      todoDone: '待办·已完成',
      /** graded 标记未打档位时的占位说明 */
      noLevel: '未标记档位',
      /** solid 单色标记行「已标记」状态词 */
      marked: '已标记',
      /** 删除标记按钮的 title（graded/solid 两处共用） */
      deleteMark: '删除标记',
      /** 日程分区右上「编辑全部日程」按钮的 title + 文本前缀 */
      editAllSchedule: '编辑全部日程',
      /** 无起止时间的日程条时间列兜底词 */
      allDay: '全天',
      /** 事件分区标题计数，{n} 为事件数 */
      eventsCount: '事件（{n}）',
      /** 事件分区空态 */
      noEvents: '无事件',
      /** 待办分区标题计数，{n} 为待办数 */
      todosCount: '待办（{n}）',
      /** 高重要度待办的角标（含闪电符号） */
      highImportance: '⚡高',
      /** 当天到期待办的红字角标 */
      dueTag: '截止',
    },

    /** ── 笔记编辑器（NotesEditorModal，各处默认标题/占位） ─ */
    notes: {
      /** 弹窗默认标题（调用方未传 title 时） */
      title: '备注',
      /** 编辑区默认占位符（调用方未传 placeholder 时） */
      placeholder: '备注（可选）',
      /** 编辑区下方的操作提示小字 */
      hint: 'ESC 或点击空白处关闭（自动保存）',
    },

    /** ── 待办提醒横幅（ReminderBanner，顶部琥珀色条） ───── */
    reminder: {
      /** 提醒正文（数字计数，含加粗数字）；{n} 自动注入 */
      plannedLeft: { other: '今日还有 {n} 条计划任务未完成' },
      /** 「查看」按钮（跳转待办页） */
      view: '查看',
      /** 右侧关闭按钮的 aria-label */
      dismissAria: '关闭今日提醒',
    },

    /** ── 错误兜底（ErrorBoundary，渲染异常整屏兜底） ────── */
    errorBoundary: {
      /** 兜底页大字标题 */
      title: '应用出错了',
    },
  },
  en: {
    toTime: 'to',
    hiddenSuffix: ' (hidden)',
    editSchedule: 'Edit schedule',
    deleteScheduleItem: 'Delete this schedule item',

    event: {
      titleEdit: 'Edit event',
      titleNew: 'New event',
      fieldTitle: 'Title',
      fieldDate: 'Date',
      fieldLayer: 'Layer',
      fieldDesc: 'Description (optional)',
      fieldColor: 'Color (optional, #RRGGBB)',
    },

    schedule: {
      titleWithDate: 'Schedule {date}',
      empty: 'No schedule for this day yet — tap "Add schedule" to start',
      add: 'Add schedule',
      what: 'What to do',
      cat: {
        work: 'Work',
        course: 'Courses',
        sport: 'Sports',
        play: 'Leisure',
        misc: 'Other',
      },
    },

    coloring: {
      titleWithDate: 'Fullness {date}',
      current: 'Current: {level}',
      notSet: 'Not set',
      clear: 'Clear',
    },

    coloringLevel: {
      relaxed: 'Relaxed',
      mild: 'Mild',
      moderate: 'Moderate',
      busy: 'Busy',
      productive: 'Productive',
    },

    search: {
      placeholder: 'Search events, to-dos…',
      nothing: 'No events or to-dos matching "{q}"',
      sectionEvents: 'Events',
      overdue: 'Overdue',
    },

    menu: {
      newEvent: 'New event',
      setColoring: 'Set fullness',
    },

    dot: {
      titleWithDate: 'Add dot {date}',
      pickLayer: 'Choose layer',
      groupSchedule: 'Schedule',
      groupEvents: 'Events',
      groupOther: 'Other',
      layerColorTitle: 'Layer color',
      content: 'Content',
      placeholder: 'What to do (multi-line)',
      contentRequired: 'Please enter content',
    },

    colorEntry: {
      titleWithDate: 'Add coloring {date}',
      pickLayer: 'Choose coloring layer',
      group: {
        habit: 'Habit tracking',
        progress: 'Work progress',
        linked: 'Linked coloring',
      },
      levelFullness: 'Fullness level',
      level: 'Level',
      fixedColor: 'Layer color (fixed)',
      fixedColorHint: 'The mark uses the layer preset color and cannot be changed here.',
      fixedColorHintMore: 'To change the color, edit the layer in Settings.',
      mark: 'Mark',
    },

    detail: {
      selectedDate: 'Selected date',
      yearWeekday: '{year} · {weekday}',
      drawerEmpty: 'Tap a date in the calendar to see that day here.',
      panelEmpty: 'Click a date to see details',
      addDot: 'Add dot',
      coloring: 'Coloring',
      event: 'Event',
      schedule: 'Schedule',
      dot: 'Dot',
      fullness: 'Fullness',
      todoPredict: 'To-dos · open',
      todoDone: 'To-dos · done',
      noLevel: 'No level marked',
      marked: 'Marked',
      deleteMark: 'Delete mark',
      editAllSchedule: 'Edit all schedule',
      allDay: 'All day',
      eventsCount: 'Events ({n})',
      noEvents: 'No events',
      todosCount: 'To-dos ({n})',
      highImportance: '⚡High',
      dueTag: 'Due',
    },

    notes: {
      title: 'Note',
      placeholder: 'Note (optional)',
      hint: 'ESC or click outside to close (auto-saves)',
    },

    reminder: {
      plannedLeft: {
        one: '{n} planned task left to finish today',
        other: '{n} planned tasks left to finish today',
      },
      view: 'View',
      dismissAria: "Dismiss today's reminder",
    },

    errorBoundary: {
      title: 'Something went wrong',
    },
  },
} as const
