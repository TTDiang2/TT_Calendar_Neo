/**
 * todo 命名空间：待办页（TodoView：列表/工具行/清单管理/快速新增/统计抽屉/行组件）
 * 与五个待办子视图（矩阵/看板/甘特/量筒/便签）+ 迷你卡。
 *
 * 词表说明：
 *  - `status.*` / `imp.*` / `complexity.*` 是列表行徽标与快速新增的旧词表
 *    （等待他人 / 重要·普通·次要 / 简单·中等·复杂）；
 *  - `card.status.*` / `card.importance.*` / `card.complexity.*` 是看板列头、
 *    迷你卡与甘特条 title 沿用的 adapt 旧词表（等他人 / 高·中·低 / 困难·中等·简单），
 *    两套 zh 逐字不同，为保 zh 渲染与原版一致分别成组，合并前需做措辞裁决；
 *  - 「N 天后/前」在本批都是复合句成分（如「{n} 天后截止」「逾期 {n} 天」），
 *    不是独立的相对天数短语，故用复数条目而非 fmtRelativeDays（zh 需逐字一致）；
 *  - 清单名（TodoList.display_name）是用户数据，永不翻译，不走本字典。
 *
 * TODO-REVIEW: lists.defaultName 是无清单时自动建的默认清单名，经 createTodoList
 * 持久化进数据库（与 B1 shell.defaultName.* 的裁决一致：入库沿用旧版语义，zh 行为
 * 与原版完全一致，不同语言创建的默认清单入库名不同）。
 */
export const todo = {
  zh: {
    /** 排序下拉选项（桌面工具行 + 手机筛选行共用） */
    sort: {
      manual: '手动排序',
      dueImportance: '截止+重要性',
      duePlannedImportance: '截止+计划+重要性',
      due: '截止日',
      planned: '计划日',
      importance: '重要性',
      created: '创建时间',
    },
    /** 行徽标词表（列表行 + 快速新增的重要性按钮/状态/复杂度下拉） */
    imp: { high: '重要', normal: '普通', low: '次要' },
    complexity: { simple: '简单', medium: '中等', hard: '复杂' },
    status: {
      notStarted: '未开始',
      inProgress: '进行中',
      completed: '已完成',
      waitingOnOthers: '等待他人',
      deferred: '已推迟',
    },
    /** 卡片级词表（看板列头/迷你卡/甘特条 title，zh 与 adapt 旧词表逐字一致） */
    card: {
      status: {
        notStarted: '未开始',
        inProgress: '进行中',
        waitingOnOthers: '等他人',
        deferred: '已推迟',
        completed: '已完成',
      },
      importance: { high: '高', normal: '中', low: '低' },
      complexity: { hard: '困难', medium: '中等', simple: '简单' },
      /** 迷你卡逾期徽标（数字做主语 → 复数） */
      overdueBy: { other: '逾期 {n} 天' },
      /** 迷你卡元信息行的日期前缀（date 是 MM-DD 数据串，非翻译对象） */
      due: '截止 {date}',
      planned: '计划 {date}',
      start: '开始 {date}',
    },
    /** 截止态徽标（列表行 badge + 统计抽屉行标共用；badge 的 label 已是译文） */
    due: {
      overdue: '已过期',
      today: '今天截止',
      tomorrow: '明天截止',
      badge: '{label} · {date}',
    },
    /** 计划徽标（列表行 + 统计抽屉「今日计划」共用） */
    plan: { today: '今日计划', tomorrow: '明日计划' },
    /** 四象限标签（矩阵视图；分组 key 与 domain quadrantOf 返回值对齐） */
    quadrant: {
      doNow: { title: '重要 × 紧急', action: '立即做', desc: '今天必须推进的事' },
      planIt: { title: '重要 × 不紧急', action: '规划做', desc: '矩阵的核心价值区：别让它变成紧急' },
      delegate: { title: '不重要 × 紧急', action: '快速清', desc: '碎片打断：批量快速处理' },
      drop: { title: '不重要 × 不紧急', action: '有空做', desc: '不占用最佳精力，有空再说' },
    },
    /** 矩阵象限头的临近徽标（title 提示 + 计数，数字做主语 → 复数） */
    matrix: {
      soonTitle: '3-7 天内到期',
      nearing: { other: '{n} 临近' },
    },
    /** 矩阵卡片副标题的截止描述（复合句成分 → 复数条目而非 fmtRelativeDays） */
    sub: {
      overdueBy: { other: '截止已过 {n} 天' },
      dueIn: { other: '{n} 天后截止' },
      planned: '计划 {date}',
    },
    /** 看板视图 */
    kanban: {
      /** 维度切换胶囊（按状态/计划日期/重要性/复杂度/标签） */
      dim: { status: '按状态', planned: '按计划日期', importance: '按重要性', complexity: '按复杂度', tag: '按标签' },
      /** 可拖拽时的操作提示（桌面） */
      dragHint: '拖动卡片到其他列即可改变状态；勾选圆形按钮直接完成',
      /** 空列占位 */
      emptyCol: '空',
      /** 计划日期列的无日期列头 */
      unplanned: '未计划',
      /** 标签维度的无标签列头 */
      untagged: '无标签',
      /** 计划日期=今天的列头（date 是 MM-DD 数据串） */
      todayCol: '今天 · {date}',
      /** 已完成卡片的副标题（date 是 MM-DD 数据串） */
      doneAt: '完成于 {date}',
      /** 已完成列展开后的列头计数 */
      completedCol: '已完成 {n}',
      /** 折叠边条的 aria-label（共 N 条：数字做状语，不用复数） */
      expandCompleted: '展开已完成列（共 {n} 条）',
      /** 已完成列超过渲染上限时的尾注 */
      shownOf: '已显示最近 {shown} / 共 {total} 条',
    },
    /** 甘特视图 */
    gantt: {
      /** 手机表头的今日游标（n 是「几号」，各语言均为拉丁数字） */
      todayCursor: '今天 {n} 日',
      /** 手机行元信息的逾期标记 */
      overdueShort: '逾期',
      /** 逾期条内的文字 */
      overdueBar: '逾期中',
      /** 条的 hover title（range=起止串，overdue=逾期后缀或空，status=状态译文） */
      barTitle: '{range}{overdue} · {status}',
      /** barTitle 里逾期时插入的后缀（插在区间与 · 之间，保留原版位置） */
      overdueSuffix: '（已过期）',
    },
    /** 量筒视图（今日拾贝） */
    jar: {
      /** 左上小标题 */
      title: '今日拾贝',
      /** 顶部计数句（open=未完成数，done=今日完成数） */
      counter: '装了 {open} 件 · 沉底 {done} 件',
      /** 装不下提示徽标（数字做主语 → 复数） */
      overflow: { other: '罐子满了 · {n} 件放不下' },
      /** 沙层里的完成数说明 */
      settledToday: '沉底 · 今日完成 {n}',
      /** 图例行尾的沉底计数 */
      settled: '沉底 {n}',
      /** 图例：三档复杂度的石子（n 为数量） */
      legendHard: '磐石 · 难 {n}',
      legendMedium: '卵石 · 中 {n}',
      legendSimple: '沙粒 · 简 {n}',
      /** 右下角一句话 */
      tagline: '大石头先进，沙子填缝。',
      /** 玻璃罐的 role=img aria-label */
      jarAria: '今日任务玻璃罐',
      /** 空态主句 + 提示 */
      empty: '今天还没有安排',
      emptyHint: '先放一块大石头进去吧（截止/计划日设为今天）',
    },
    /** 便签墙视图 */
    stickies: {
      /** 空态主句 + 提示 */
      empty: '墙上一张便签都没有',
      emptyHint: '点「新建待办」贴上第一张',
      /** 便签卡 hover 提示（title 属性） */
      dblClickHint: '双击查看 / 编辑备注',
    },
    /** 无障碍标签 */
    aria: {
      /** 迷你卡勾选圈（切换完成态） */
      markDone: '标记为已完成',
      markUndone: '标记为未完成',
      /** 手机端头部清单按钮（唤出清单抽屉） */
      switchList: '切换待办清单',
    },
    /** 列表空态（中任务区） */
    empty: {
      /** 看板/甘特的无待办占位 */
      none: '暂无待办',
      /** 标签筛选无命中 */
      tagFiltered: '没有「{tag}」标签的待办',
      /** 手机端空态（引导点 FAB） */
      mobile: '暂无待办，点右下角 + 新建',
      /** 桌面端空态（引导点工具行按钮） */
      desktop: '暂无待办，点「新建待办」开始',
      /** 有已完成但无未完成时的行 */
      noneOpen: '没有未完成待办',
    },
    /** 清单管理（桌面左列 / 手机抽屉共用） */
    lists: {
      /** 手机清单抽屉标题 */
      title: '待办清单',
      /** 无清单时自动创建的默认清单名（会持久化，见文件头 TODO-REVIEW） */
      defaultName: '任务',
      /** 星标按钮 title */
      setDefault: '设为默认列表',
      unsetDefault: '取消默认',
      /** 铅笔按钮 title */
      rename: '重命名',
      /** 删除清单的 confirm 弹窗（name 为用户数据原样插入） */
      deleteConfirm: '删除列表「{name}」及其所有待办？',
      /** 新建清单输入框占位 */
      namePlaceholder: '列表名',
      /** 新建清单按钮 */
      create: '新建列表',
    },
    /** 手机筛选行的行标与「全部标签」选项 */
    filter: { sort: '排序', tag: '筛选', allTags: '全部标签' },
    /** 桌面工具行 */
    toolbar: { importCsv: 'CSV 导入' },
    /** 新建待办按钮 / 快速新增标题 */
    actions: { new: '新建待办' },
    /** 列表行尾的已完成折叠条 */
    row: { completedWithCount: '已完成（{n}）' },
    /** 快速新增抽屉（手机 FAB 唤出） */
    quickAdd: {
      /** 底部弹层标题 */
      title: '新建待办',
      /** 标题输入框占位 */
      placeholder: '要做什么？',
      /** 常驻四件套字段标 */
      list: '清单',
      dueDate: '截止日期',
      importance: '重要性',
      /** 「更多选项」折叠开关（filled=任一折叠字段已填时的后缀） */
      moreOptions: '更多选项',
      moreFilled: ' · 已填写',
      /** 折叠区字段标与占位 */
      body: '备注',
      optional: '可选',
      status: '状态',
      complexity: '复杂度',
      plannedDate: '计划日期',
      startDate: '开始日期',
      tagsHint: '标签（逗号分隔）',
      tagsPlaceholder: '工作, 学习…',
      alarmHint: '闹钟（到点弹系统通知）',
      /** 底部提交按钮 */
      submit: '添加待办',
    },
    /** CSV 导入结果条（inserted/lists 为服务端计数；两数字并存无法用复数） */
    csv: {
      done: '导入 {inserted} 条，新建 {lists} 个列表',
      /** 滴答清单备份识别命中时的结果条（数据面 detect 路由决定用哪条） */
      ticktickDone: '识别到滴答清单备份：导入 {inserted} 条，新建 {lists} 个列表',
      /** 尾随警告子句（含句读，数字做主语 → 复数；拼在 done/ticktickDone 之后） */
      warningRows: { other: '，{n} 条警告' },
      /** 尾随错误子句（含句读，数字做主语 → 复数；拼在 done 之后） */
      errorRows: { other: '，{n} 行错误' },
      /** 导入失败提示（msg 为后端错误消息原样插入） */
      failed: '导入失败: {msg}',
      /** 滴答备份尾随提示（v1 不做去重，拼在结果条最尾） */
      dupHint: '；重复导入会产生重复任务',
    },
    /** 手机端待办统计抽屉 */
    stats: {
      /** 抽屉标题 */
      title: '待办统计',
      /** 副标题（name=当前查看的清单名或「全部」） */
      scope: '范围：全部清单 · 当前查看「{name}」',
      /** 清单分布里找不到清单名时的兜底 */
      unnamedList: '未命名清单',
      /** 统计卡行标（overdue/today 复用 due.*，重要复用 imp.high，今日计划复用 plan.today） */
      open: '未完成',
      dueSoon: '7 天内到期',
      /** 今日完成的统计卡行标 */
      doneToday: '今日已完成',
      /** 「需要立刻关注」分组标 */
      attention: '需要立刻关注',
      /** 「各清单未完成」分组标 */
      byList: '各清单未完成',
    },
  },
  en: {
    sort: {
      manual: 'Manual',
      dueImportance: 'Due + importance',
      duePlannedImportance: 'Due + planned + importance',
      due: 'Due date',
      planned: 'Planned date',
      importance: 'Importance',
      created: 'Created',
    },
    imp: { high: 'Important', normal: 'Normal', low: 'Minor' },
    complexity: { simple: 'Simple', medium: 'Medium', hard: 'Complex' },
    status: {
      notStarted: 'Not started',
      inProgress: 'In progress',
      completed: 'Completed',
      waitingOnOthers: 'Waiting on others',
      deferred: 'Deferred',
    },
    card: {
      status: {
        notStarted: 'Not started',
        inProgress: 'In progress',
        waitingOnOthers: 'Waiting',
        deferred: 'Deferred',
        completed: 'Done',
      },
      importance: { high: 'High', normal: 'Med', low: 'Low' },
      complexity: { hard: 'Hard', medium: 'Medium', simple: 'Easy' },
      overdueBy: { one: 'Overdue by 1 day', other: 'Overdue by {n} days' },
      due: 'Due {date}',
      planned: 'Planned {date}',
      start: 'Start {date}',
    },
    due: {
      overdue: 'Overdue',
      today: 'Due today',
      tomorrow: 'Due tomorrow',
      badge: '{label} · {date}',
    },
    plan: { today: 'Planned today', tomorrow: 'Planned tomorrow' },
    quadrant: {
      doNow: { title: 'Important × Urgent', action: 'Do now', desc: 'Things that must move today' },
      planIt: { title: 'Important × Not urgent', action: 'Schedule', desc: 'The core of the matrix: don\'t let it become urgent' },
      delegate: { title: 'Not important × Urgent', action: 'Clear fast', desc: 'Fragmented interruptions: batch and clear quickly' },
      drop: { title: 'Not important × Not urgent', action: 'Spare time', desc: 'Not worth peak energy — do it when free' },
    },
    matrix: {
      soonTitle: 'Due in 3-7 days',
      nearing: { one: '1 nearing', other: '{n} nearing' },
    },
    sub: {
      overdueBy: { one: 'Due 1 day ago', other: 'Due {n} days ago' },
      dueIn: { one: 'Due in 1 day', other: 'Due in {n} days' },
      planned: 'Planned {date}',
    },
    kanban: {
      dim: { status: 'By status', planned: 'By planned date', importance: 'By importance', complexity: 'By complexity', tag: 'By tag' },
      dragHint: 'Drag cards between columns to change status; tick the circle to complete',
      emptyCol: 'Empty',
      unplanned: 'Unplanned',
      untagged: 'No tag',
      todayCol: 'Today · {date}',
      doneAt: 'Done {date}',
      completedCol: 'Completed {n}',
      expandCompleted: 'Expand completed column ({n} in total)',
      shownOf: 'Showing latest {shown} of {total}',
    },
    gantt: {
      todayCursor: 'Today {n}',
      overdueShort: 'Overdue',
      overdueBar: 'Overdue',
      barTitle: '{range}{overdue} · {status}',
      overdueSuffix: ' (overdue)',
    },
    jar: {
      title: 'TODAY\'S PICKS',
      counter: '{open} to carry · {done} settled',
      overflow: { one: 'Jar is full · 1 left out', other: 'Jar is full · {n} left out' },
      settledToday: 'Settled · {n} done today',
      settled: 'Settled {n}',
      legendHard: 'Rocks · Hard {n}',
      legendMedium: 'Pebbles · Medium {n}',
      legendSimple: 'Sand · Easy {n}',
      tagline: 'Big rocks first, sand fills the gaps.',
      jarAria: 'Today\'s task jar',
      empty: 'Nothing planned for today',
      emptyHint: 'Drop in a big rock first (set due/planned date to today)',
    },
    stickies: {
      empty: 'The wall has no stickies yet',
      emptyHint: 'Tap "New to-do" to pin the first one',
      dblClickHint: 'Double-click to view / edit notes',
    },
    aria: {
      markDone: 'Mark as done',
      markUndone: 'Mark as not done',
      switchList: 'Switch to-do list',
    },
    empty: {
      none: 'No to-dos',
      tagFiltered: 'No to-dos tagged "{tag}"',
      mobile: 'No to-dos yet — tap + in the corner to create',
      desktop: 'No to-dos yet — tap "New to-do" to start',
      noneOpen: 'No open to-dos',
    },
    lists: {
      title: 'To-do lists',
      defaultName: 'Tasks',
      setDefault: 'Set as default list',
      unsetDefault: 'Unset default',
      rename: 'Rename',
      deleteConfirm: 'Delete list "{name}" and all its to-dos?',
      namePlaceholder: 'List name',
      create: 'New list',
    },
    filter: { sort: 'Sort', tag: 'Filter', allTags: 'All tags' },
    toolbar: { importCsv: 'CSV import' },
    actions: { new: 'New to-do' },
    row: { completedWithCount: 'Completed ({n})' },
    quickAdd: {
      title: 'New to-do',
      placeholder: 'What needs doing?',
      list: 'List',
      dueDate: 'Due date',
      importance: 'Importance',
      moreOptions: 'More options',
      moreFilled: ' · filled',
      body: 'Notes',
      optional: 'Optional',
      status: 'Status',
      complexity: 'Complexity',
      plannedDate: 'Planned date',
      startDate: 'Start date',
      tagsHint: 'Tags (comma separated)',
      tagsPlaceholder: 'work, study…',
      alarmHint: 'Alarm (system notification at time)',
      submit: 'Add to-do',
    },
    csv: {
      done: 'Imported {inserted}, created {lists} lists',
      ticktickDone: 'TickTick backup detected: imported {inserted}, created {lists} lists',
      warningRows: { one: ', 1 warning', other: ', {n} warnings' },
      errorRows: { one: ', 1 row failed', other: ', {n} rows failed' },
      failed: 'Import failed: {msg}',
      dupHint: '; importing again will create duplicate tasks',
    },
    stats: {
      title: 'To-do stats',
      scope: 'Scope: all lists · viewing "{name}"',
      unnamedList: 'Unnamed list',
      open: 'Open',
      dueSoon: 'Due within 7 days',
      doneToday: 'Done today',
      attention: 'Needs attention now',
      byList: 'Open by list',
    },
  },
} as const
