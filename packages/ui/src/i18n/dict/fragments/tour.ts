/**
 * tour 命名空间：新手教程（20261005 Wisdom 定稿方案）。
 * 步骤正文纪律（智者终审第 10 条）：每步正文 ≤ 40 汉字；术语与现有 UI 文案严格一致
 * （待办/图层/小组件/分析/倒数日——不得另造同义词）。
 * 步骤 key 与 tour/steps.ts 的 TourStep[] 一一对应（tour-steps.test.ts 校验存在性）。
 */
export const tour = {
  zh: {
    /** 欢迎屏（语言选择确认后、主界面前的独立一屏） */
    welcome: {
      title: '欢迎使用 TT Calendar',
      body: '一本认真打磨的日历：日程、待办、倒数日、农历与统计分析，全部数据只存在你的设备上。',
      startTour: '开始 30 秒导览',
      skip: '先随便看看',
    },
    /** 通用按钮 */
    btn: {
      next: '下一步',
      prev: '上一步',
      done: '完成',
      skip: '跳过教程',
      skipConfirm: '确定跳过？随时能在设置里重看',
    },
    /** 步骤（s1-s12 两端共享主干 + 桌面专属 d 后缀） */
    steps: {
      s1Title: '30 秒认一遍界面',
      s1Body: '跟着提示走一圈，认识四个主页面和两侧抽屉。中途随时可跳过。',
      s2mTitle: '四个主入口',
      s2mBody: '日历、待办、分析、小组件都住在这排底栏，点任意一格随时切换。',
      s2dTitle: '四个主入口',
      s2dBody: '顶部这排是日历/待办/分析/小组件；左侧栏常驻图层与设置，右侧是当日详情。',
      s3Title: '日历的多种视图',
      s3Body: '月、日、年、倒数日（电脑版另有周视图），点这里随时切换。',
      s3dTitle: '周视图',
      s3dBody: '电脑版独有的周视图：一屏看一周的日程与待办安排。',
      s4Title: '随便点一天试试',
      s4Body: '选中日期后，下方信息栏显示当天安排；点日程行可打开右侧详情。',
      s5mTitle: '右抽屉：当日详情',
      s5mBody: '点底栏右侧按钮呼出：日历页看当天详情，待办页看待办统计。',
      s5dTitle: '右侧详情栏',
      s5dBody: '常驻显示选中日期的详情：日程、待办、充实度与标记，一目了然。',
      s6mTitle: '左抽屉：图层与设置',
      s6mBody: '点底栏左侧按钮呼出：图层管理、综合搜索、设置入口都在这。',
      s6dTitle: '左侧栏',
      s6dBody: '图层开关、新建图层、综合搜索与设置入口常驻于此。',
      s7Title: '待办页',
      s7Body: '清单、四象限、甘特图、便利贴，待办也能这么玩。',
      s8Title: '待办的多种视图',
      s8Body: '列表、四象限、甘特、便利贴（电脑版另有看板），在这里切换。',
      s8dTitle: '看板视图',
      s8dBody: '电脑版独有的看板：拖动卡片在列间移动即可改变状态。',
      s9Title: '快速新建',
      s9Body: '点右下角加号：日程、待办、倒数日都从这里快速创建。',
      s10Title: '分析页：成就墙',
      s10Body: '完成的待办会积累里程碑成就，还有热力图与四象限统计。',
      s11Title: '远程同步（可选）',
      s11Body: '想多设备备份时再来：左抽屉 → 设置 → 数据同步（GitHub 私有仓）。',
      s12Title: '开始使用吧',
      s12Body: '教程随时可以在 设置 里重看。祝你用得顺手！',
    },
    /** 设置页的重看教程行 */
    settings: {
      rewatch: '重看新手教程',
    },
    /** 引擎状态（无目标时的降级横幅等） */
    engine: {
      loadingFallback: '正在定位指引位置…',
      skippedToast: '教程已跳过，可在设置中重看',
    },
  },
  en: {
    welcome: {
      title: 'Welcome to TT Calendar',
      body: 'A calendar crafted with care: events, to-dos, countdowns, lunar calendar and stats — all data stays on your device.',
      startTour: 'Take the 30-second tour',
      skip: 'Skip for now',
    },
    btn: {
      next: 'Next',
      prev: 'Back',
      done: 'Done',
      skip: 'Skip tour',
      skipConfirm: 'Skip? You can replay it anytime in Settings',
    },
    steps: {
      s1Title: 'A 30-second orientation',
      s1Body: 'Follow the hints to see the four main pages and both side panels. You can skip anytime.',
      s2mTitle: 'Four main sections',
      s2mBody: 'Calendar, To-dos, Analysis and Widgets live in this bottom bar — tap any to switch.',
      s2dTitle: 'Four main sections',
      s2dBody: 'The top bar switches Calendar/To-dos/Analysis/Widgets; layers and settings stay in the left panel, day details on the right.',
      s3Title: 'Calendar views',
      s3Body: 'Month, Day, Year and Countdowns (Week view on desktop) — switch anytime here.',
      s3dTitle: 'Week view',
      s3dBody: 'Desktop-only week view: a full week of events and to-dos at a glance.',
      s4Title: 'Tap any day',
      s4Body: 'Selecting a date shows that day below; tapping a row opens the side details.',
      s5mTitle: 'Right panel: day details',
      s5mBody: 'Tap the right dock button: day details on Calendar, to-do stats on To-dos.',
      s5dTitle: 'Details panel',
      s5dBody: 'Always shows the selected date: events, to-dos, fullness and marks at a glance.',
      s6mTitle: 'Left panel: layers & settings',
      s6mBody: 'Tap the left dock button: layer management, search and settings live here.',
      s6dTitle: 'Left panel',
      s6dBody: 'Layer toggles, new layer, global search and the settings entry stay here.',
      s7Title: 'To-dos page',
      s7Body: 'Lists, quadrants, Gantt and stickies — to-dos can work like this too.',
      s8Title: 'To-do views',
      s8Body: 'List, Matrix, Gantt, Stickies (Kanban on desktop) — switch here.',
      s8dTitle: 'Kanban view',
      s8dBody: 'Desktop-only Kanban: drag cards between columns to change their status.',
      s9Title: 'Quick create',
      s9Body: 'Tap the plus button: events, to-dos and countdowns all start here.',
      s10Title: 'Analysis: achievement wall',
      s10Body: 'Completed to-dos build milestone achievements, plus heatmap and quadrant stats.',
      s11Title: 'Remote sync (optional)',
      s11Body: 'For multi-device backup when you need it: left panel → Settings → Data Sync (GitHub).',
      s12Title: 'Enjoy!',
      s12Body: 'Replay this tour anytime in Settings. Happy planning!',
    },
    settings: {
      rewatch: 'Replay the tutorial',
    },
    engine: {
      loadingFallback: 'Locating…',
      skippedToast: 'Tour skipped — replay it in Settings',
    },
  },
} as const
