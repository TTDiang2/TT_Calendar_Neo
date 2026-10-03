/**
 * stats 命名空间：分析页（StatsView：里程碑英雄卡/贡献热力图/忙度预测/每日完成
 * 柱状图/未完成分类环形/近期完成/四象限散点 + 统计范围/成就墙两个抽屉）。
 *
 * 词表说明：
 *  - 「连续 N 天」「待处理 N」等数字做主语的计数控用复数条目（zh 只写 other，
 *    en 补 one/other）；双数字并存的复合句（heroLine）无法用复数，用普通条目；
 *  - 日期/星期一律 fmtDate/fmtWeekday 产出，字典里不放日期格式串；tooltip 与
 *    尾巴里的 YYYY-MM-DD / MM-DD 数字串是后端数据原样插入（不含语言词，不译）；
 *  - 清单名不走本字典：渲染走 layerLabel()（内置图层显示译文，用户改名原样）；
 *  - quadrant.doNow 等四条与 B3 的 todo.quadrant.*（「重要 × 紧急」式短标签）
 *    措辞不同：本页散点图原版是「紧急·重要」式中点角标，按验收标准 §8.4
 *    「zh-CN 渲染与原版逐屏一致」逐字保真，独立成组，合并前需做措辞裁决。
 *
 * TODO-REVIEW: milestone.heroDone 的完成数是滚动数字节点（animCountUp 会整节点
 * 覆写 textContent），无法作为插值参数直排进句子；组件用哨兵占位取回译文后按
 * 哨兵拆成前后两段、把数字节点嵌回 {n} 原位——整句仍是一个 key，各语言词序可译
 * （实现见 StatsView.tsx 的 COUNT_UP_SENTINEL）。
 * TODO-REVIEW: insight.dailyAvg 原版用 toFixed(1)（恒一位小数，3.0 显示 "3.0"）；
 * 按批次要点改走 fmtNumber（fr 小数逗号/千位分组正确），zh 下整数均值显示从
 * "3.0" 变为 "3"，其余数值渲染一致。
 */
export const stats = {
  zh: {
    /** 统计范围（桌面左栏标题 + 手机抽屉内分组标） */
    scope: {
      label: '统计范围',
      /** 英雄卡「里程碑 · {name}」里未选清单时的范围名 */
      allLists: '全部清单',
      /** list_names 缺失时的清单名兜底 */
      unnamedList: '未命名清单',
      /** 洞察大数字卡的分组标 */
      insights: '洞察',
    },
    /** 洞察六张大数字卡 */
    insight: {
      /** 卡行标（图标后小字） */
      doneTotal: '累计完成',
      streak: '连续 / 最长',
      /** 大数字后的小字尾巴（最长连续天数；前导 " / " 是版式，数字做主语 → 复数） */
      streakDays: { other: ' / {n} 天' },
      /** 近 30 天日均完成（数值走 fmtNumber） */
      dailyAvg: '日均（30天）',
      doneRate: '完成率',
      weekDone: '本周完成',
      bestDay: '最佳单日',
      /** 最佳单日大数字后的日期尾巴（date 为 MM-DD 数字串，数据原样） */
      bestDayDate: ' · {date}',
    },
    /** 里程碑体系（英雄卡 + 成就墙抽屉/桌面右栏） */
    milestone: {
      /** 抽屉与桌面右栏标题 */
      wallTitle: '里程碑',
      /** 成就墙当前位阶英雄条的小标 */
      currentRank: '当前位阶',
      /** 尚未达成任何里程碑时的称号 */
      rookie: '初出茅庐',
      /** 英雄卡小标（name=统计范围名） */
      heroScope: '里程碑 · {name}',
      /** 英雄卡副标题（{n} 位是滚动数字节点，见文件头 TODO-REVIEW） */
      heroDone: '累计完成 {n} 项待办',
      /** 位阶英雄条副标（两数字并存无法用复数） */
      heroLine: '累计 {n} 项 · 连续 {m} 天',
      /** 下一枚位阶提示（name=位阶名） */
      next: '下一枚：{name}',
      /** 全部位阶达成后的祝贺语 */
      maxReached: '已站上最高里程碑，传奇就是你自己 🏆',
      /** 成就墙行内「已达成」徽标 */
      reached: '已达成',
      /** 未达成行描述（desc=达成描述译文；还差数做主语 → 复数） */
      lockedDesc: { other: '{desc} · 还差 {n} 项' },
      /** 七档位阶的称号与达成描述（门槛数值在 StatsView 的 MILESTONES，属数据口径不入字典） */
      first: { title: '初试身手', desc: '完成头 10 项待办，体系开始转起来' },
      second: { title: '渐入佳境', desc: '50 项达成，计划-执行的习惯已经成形' },
      hundred: { title: '百炼成钢', desc: '百项俱乐部：你已经能稳定交付' },
      battleHardened: { title: '身经百战', desc: '250 项，执行力进入熟练区' },
      thousand: { title: '千锤百炼', desc: '千项里程碑，长期主义的复利看得见' },
      twoThousand: { title: '二千斩', desc: '两千斩达成，日历上全是你的足迹' },
      legend: { title: '待办传奇', desc: '五千项，传奇就是你本人' },
    },
    /** 英雄卡底部状态 chips */
    chip: {
      /** 连续打卡 chip（数字做主语 → 复数） */
      streak: { other: '连续 {n} 天' },
      /** 最长连续 chip */
      longest: { other: '最长 {n} 天' },
      /** 待处理数 chip */
      pending: { other: '待处理 {n}' },
    },
    /** 贡献热力图（GitHub 绿块风格） */
    heatmap: {
      title: '贡献热力图',
      subtitle: '近 26 周 · 每日完成',
      /** 色阶图例两端 */
      less: '少',
      more: '多',
    },
    /** 热力图格与柱状图柱共用的 hover title（date 为 YYYY-MM-DD 数据串；数字做主语 → 复数） */
    doneOnDate: { other: '{date}：完成 {n} 项' },
    /** 忙度预测（未来 14 天琥珀档位） */
    busy: {
      title: '忙度预测 · 未来 14 天',
      /** 日柱 hover（有预测，n=档位 1-4） */
      dayTitle: '{date}：忙度 {n} 档',
      /** 日柱 hover（无预测） */
      noTitle: '{date}：暂无预测',
    },
    /** 每日完成柱状图 */
    daily: {
      title: '每日任务完成',
      /** 窗口切换按钮（7/14/30 天） */
      window: '{n}天',
      /** 窗口翻页按钮 title（← 向历史 / → 向今天） */
      older: '更早',
      newer: '更近',
      /** 空态主句 + 提示 */
      empty: '该时间窗内没有完成记录',
      emptyHint: '换个更长的时间范围，或先去完成几个待办试试',
      /** 柱状图容器的 aria-label */
      chartAria: '每日完成任务数柱状图',
    },
    /** 未完成分类环形图（按清单分布） */
    breakdown: {
      title: '未完成任务分类',
      /** 副标计数（数字做主语 → 复数） */
      openCount: { other: '{n} 项未完成' },
      /** 无未完成时的空态 */
      empty: '太棒了，没有未完成的任务 🎉',
    },
    /** 近期完成列表 */
    recent: {
      title: '近期完成',
      /** 空态 */
      empty: '还没有已完成任务',
      /** 完成勾圈 role=img 的 aria-label */
      doneAria: '已完成',
      /** 行尾截止尾巴（date 为 MM-DD 数字串） */
      due: '截止 {date}',
      /** 底部跳待办页链接（数字做主语 → 复数） */
      goTodo: { other: '共 {n} 项未完成 · 去待办页处理 →' },
    },
    /** 待办四象限散点（桌面宽屏附加值） */
    quadrant: {
      title: '待办四象限',
      /** 轴说明一行 */
      axes: '横轴：到期紧迫度 → 纵轴：重要性 ↑（点 = 未完成待办）',
      /** 四象限角标（中点式短标，与 todo.quadrant.* 措辞不同，见文件头说明） */
      doNow: '紧急·重要',
      planIt: '不紧急·重要',
      delegate: '紧急·次要',
      drop: '不紧急·次要',
      /** 重要性图例（散点颜色） */
      imp: { high: '高', normal: '普通', low: '低' },
      /** 右下计数（数字做主语 → 复数） */
      openCount: { other: '{n} 个未完成' },
      point: {
        /** 散点 hover title（title=待办标题用户数据，due=到期子句） */
        title: '{title}{due}',
        /** 已逾期子句（全角括号随子句走，数字做主语 → 复数） */
        overdue: { other: '（已逾期{n}天）' },
        /** N 天后到期子句 */
        dueIn: { other: '（{n}天后到期）' },
        /** 无到期日子句 */
        noDue: '（无到期日）',
      },
    },
    /** 手机端统计抽屉标题（范围 chips + 洞察卡） */
    drawer: { title: '统计与洞察' },
  },
  en: {
    scope: {
      label: 'Scope',
      allLists: 'All lists',
      unnamedList: 'Unnamed list',
      insights: 'Insights',
    },
    insight: {
      doneTotal: 'Total completed',
      streak: 'Current / longest',
      streakDays: { one: ' / {n} day', other: ' / {n} days' },
      dailyAvg: 'Daily avg (30d)',
      doneRate: 'Completion rate',
      weekDone: 'This week',
      bestDay: 'Best day',
      bestDayDate: ' · {date}',
    },
    milestone: {
      wallTitle: 'Milestones',
      currentRank: 'Current rank',
      rookie: 'Rookie',
      heroScope: 'Milestones · {name}',
      heroDone: 'Completed {n} to-dos in total',
      heroLine: 'Total {n} done · {m}-day streak',
      next: 'Next: {name}',
      maxReached: 'You stand on the highest milestone — the legend is yourself 🏆',
      reached: 'Reached',
      lockedDesc: { one: '{desc} · 1 to go', other: '{desc} · {n} to go' },
      first: { title: 'First steps', desc: 'Complete your first 10 to-dos and get the system turning' },
      second: { title: 'Hitting stride', desc: '50 done — the plan-and-execute habit has taken shape' },
      hundred: { title: 'Steel forged', desc: 'Hundred club: you deliver steadily now' },
      battleHardened: { title: 'Battle-hardened', desc: '250 done — execution is in the skilled zone' },
      thousand: { title: 'Tempered thousandfold', desc: 'The thousand milestone — the compound interest of persistence shows' },
      twoThousand: { title: 'Double thousand', desc: 'Two thousand done — the calendar is covered in your footprints' },
      legend: { title: 'To-do legend', desc: 'Five thousand — the legend is you yourself' },
    },
    chip: {
      streak: { one: '{n}-day streak', other: '{n}-day streak' },
      longest: { one: 'Longest: 1 day', other: 'Longest: {n} days' },
      pending: { one: '1 open', other: '{n} open' },
    },
    heatmap: {
      title: 'Contribution heatmap',
      subtitle: 'Last 26 weeks · daily completions',
      less: 'Less',
      more: 'More',
    },
    doneOnDate: { one: '{date}: 1 done', other: '{date}: {n} done' },
    busy: {
      title: 'Busyness forecast · next 14 days',
      dayTitle: '{date}: busyness level {n}',
      noTitle: '{date}: no forecast',
    },
    daily: {
      title: 'Daily completions',
      window: '{n}d',
      older: 'Older',
      newer: 'Newer',
      empty: 'No completions in this range',
      emptyHint: 'Try a longer range, or go complete a few to-dos first',
      chartAria: 'Bar chart of tasks completed per day',
    },
    breakdown: {
      title: 'Open task breakdown',
      openCount: { one: '1 open', other: '{n} open' },
      empty: 'Awesome — nothing left open 🎉',
    },
    recent: {
      title: 'Recently completed',
      empty: 'No completed tasks yet',
      doneAria: 'Completed',
      due: 'Due {date}',
      goTodo: { one: '1 open in total · Go to To-dos →', other: '{n} open in total · Go to To-dos →' },
    },
    quadrant: {
      title: 'To-do quadrants',
      axes: 'X axis: due urgency → Y axis: importance ↑ (dots = open to-dos)',
      doNow: 'Urgent · Important',
      planIt: 'Not urgent · Important',
      delegate: 'Urgent · Minor',
      drop: 'Not urgent · Minor',
      imp: { high: 'High', normal: 'Normal', low: 'Low' },
      openCount: { one: '1 open', other: '{n} open' },
      point: {
        title: '{title}{due}',
        overdue: { one: ' (overdue by 1 day)', other: ' (overdue by {n} days)' },
        dueIn: { one: ' (due in 1 day)', other: ' (due in {n} days)' },
        noDue: ' (no due date)',
      },
    },
    drawer: { title: 'Stats & insights' },
  },
} as const
