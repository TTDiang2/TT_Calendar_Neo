/**
 * todoEditor 命名空间：待办编辑弹窗与详情面板
 * （TodoEditor.tsx 旧版简表单 + TodoDetailPanel.tsx 详情右栏/手机抽屉 + DueDateQuickPicker）。
 *
 * 词表说明：
 *  - 状态五档复用 B3 的 todo.status.*（zh 逐字一致：未开始/进行中/已完成/等待他人/已推迟），
 *    复杂度三档复用 todo.complexity.*（简单/中等/复杂），不在本命名空间另造一套；
 *  - `importance` 是并存的第三套重要性词表（高·普通·低）：与列表行 todo.imp.*
 *    （重要·普通·次要）、卡片级 todo.card.importance.*（高·中·低）zh 均不同，
 *    为保 zh 渲染与原版逐字一致单独成组（见 TODO-REVIEW）；
 *  - `repeat` 的 key 与老端 todo.repeat 枚举对齐（'' = 不重复，其余同 domain
 *    REPEAT_MODES：daily/weekdays/weekly）；老端新档位先行时未知枚举原样显示；
 *  - 待办标题、标签值是用户数据，永不翻译，仅作具名插值参数原样插入。
 *
 * TODO-REVIEW: importance 三套 zh 词表并存（本表 高·普通·低 / todo.imp 重要·普通·次要 /
 *   todo.card.importance 高·中·低），后续应做措辞裁决后合并为一张表。
 * TODO-REVIEW: hint.autosavePrefix/autosaveSuffix 为保留「Ctrl+Enter」内嵌高亮 span
 *   拆成前后两段（键位名各语言原样、位置固定居中）；若某语言需要挪动键位在句中的
 *   位置，需回改 TodoDetailPanel 的 JSX 结构。
 * TODO-REVIEW: TodoEditor.tsx（旧版简表单弹窗）当前仓库内无任何引用（疑似遗留组件），
 *   仍按抽词规范保留功能并完成抽词，未删除。
 * TODO-REVIEW: tagSep 是用户标签列表的 join 分隔符（zh 用顿号「、」，en 用半角逗号），
 *   只作连接符使用，不是句子文案。
 */
export const todoEditor = {
  zh: {
    /** 弹窗/面板标题（TodoEditor 弹窗头 + 详情面板左上角小标） */
    title: {
      /** 编辑既有待办时的弹窗标题（TodoEditor） */
      edit: '编辑待办',
      /** 新建入口标题（TodoEditor 弹窗 + 详情面板幻影新建） */
      new: '新建待办',
      /** 详情面板查看既有待办的标题 */
      detail: '待办详情',
    },
    /** 表单字段标签（详情面板桌面表单为主；与旧编辑器措辞差异单列） */
    field: {
      /** 标题输入（面板占位符 + 旧编辑器字段标） */
      title: '标题',
      /** 备注字段标 / 笔记弹窗兜底标题 */
      body: '备注',
      /** 清单下拉字段标（桌面措辞，手机行标用 mobile.list「清单」） */
      list: '列表',
      /** 重要性下拉字段标（桌面 + 手机 + 旧编辑器） */
      importance: '重要性',
      /** 截止日期快捷选择字段标（详情面板桌面） */
      dueDate: '截止日期',
      /** 计划日期快捷选择字段标（详情面板桌面） */
      plannedDate: '计划日期',
      /** 开始日日期输入字段标（桌面 + 手机） */
      startDate: '开始日',
      /** 状态下拉字段标 */
      status: '状态',
      /** 复杂度下拉字段标 */
      complexity: '复杂度',
      /** 重复下拉字段标 */
      repeat: '重复',
      /** 闹钟整行字段标（桌面，含留空说明） */
      alarm: '闹钟（到点弹系统通知，留空不设）',
      /** 标签输入字段标（桌面，含格式说明） */
      tags: '标签（逗号分隔，自定义）',
      /** 旧编辑器（TodoEditor）的截止日措辞 */
      legacyDueDate: '到期日',
    },
    /** 手机抽屉（<lg）meta 行的短行标与引导文案 */
    mobile: {
      /** 清单行的行标（手机措辞与桌面「列表」不同） */
      list: '清单',
      /** 截止日期行的短行标 */
      due: '截止',
      /** 计划日期行的短行标 */
      planned: '计划',
      /** 闹钟行的行标（与桌面长句不同；测试按此短标定位） */
      alarm: '闹钟',
      /** 标签行的行标 */
      tags: '标签',
      /** 幻影新建时点标题行进入编辑的引导 */
      titlePlaceholder: '点这里输入标题…',
      /** 既有待办无标题时的占位 */
      noTitle: '无标题（点按编辑）',
      /** 备注预览空态引导 */
      bodyEmpty: '点开写点备注…',
    },
    /** 重要性档位（详情面板与旧编辑器的下拉选项；见文件头词表说明） */
    importance: { high: '高', normal: '普通', low: '低' },
    /** 重复档位（key 对齐老端 todo.repeat 枚举；'' = 不重复） */
    repeat: {
      /** 关闭重复（枚举值为空串） */
      none: '不重复',
      /** 每天重复（daily） */
      daily: '每天',
      /** 工作日重复（weekdays） */
      weekdays: '每工作日',
      /** 每周重复（weekly） */
      weekly: '每周',
    },
    /** 截止/计划日期快捷选择（DueDateQuickPicker：详情面板与快速新增抽屉共用） */
    due: {
      /** 快捷选项：今天 */
      today: '今天',
      /** 快捷选项：明天 */
      tomorrow: '明天',
      /** 快捷选项：下周一 */
      nextMonday: '下周一',
      /** 下拉选项的带日期变体（date 为 MM-DD 数据串） */
      todayWithDate: '今天（{date}）',
      tomorrowWithDate: '明天（{date}）',
      nextMondayWithDate: '下周一（{date}）',
      /** 自定义日期在下拉里的展示（value 为 YYYY-MM-DD 数据串） */
      customValue: '{value}（自定义）',
      /** 展开自选日期的入口选项 */
      pickDate: '选择日期…',
      /** 自选日期态的返回按钮 */
      back: '返回',
    },
    /** 操作按钮 */
    action: {
      /** 保存按钮（详情面板页脚 + 旧编辑器） */
      save: '保存',
      /** 保存进行中的禁用态 */
      saving: '保存中…',
      /** 旧编辑器的取消按钮 */
      cancel: '取消',
      /** 删除按钮（详情面板页脚 + 旧编辑器） */
      delete: '删除',
      /** 清除闹钟按钮（桌面 + 手机） */
      clear: '清除',
      /** 手机 meta 行编辑态的收起按钮 */
      done: '完成',
      /** 详情面板右上角关闭按钮（title 属性） */
      close: '关闭',
    },
    /** 空值占位（截止/计划/开始日/标签/日期选择无值时的「无」） */
    none: '无',
    /** 桌面空态（右栏未选中待办时的占位句） */
    emptyPanel: '点击待办查看详情',
    /** 输入占位与格式提示 */
    placeholder: {
      /** 旧编辑器标题输入占位 */
      legacyTitle: '任务标题',
      /** 旧编辑器备注输入占位 */
      optional: '可选',
      /** 详情面板备注输入占位 */
      bodyOptional: '备注（可选）',
      /** 详情面板标签输入占位（桌面，示例更长） */
      tags: '工作, 学习, 家庭…',
      /** 手机抽屉标签输入占位（与快速新增一致） */
      tagsShort: '工作, 学习…',
    },
    /** 提示文案 */
    hint: {
      /** 备注框 hover 提示（title 属性） */
      dblClickEdit: '双击放大编辑',
      /** 底部自动保存提示前段（后接高亮 Ctrl+Enter span，见文件头 TODO-REVIEW） */
      autosavePrefix: '切换页面自动保存 · ',
      /** 底部自动保存提示后段 */
      autosaveSuffix: ' 直接保存',
    },
    /** 删除待办的 confirm 弹窗（title 为用户数据原样插入） */
    deleteConfirm: '删除待办「{title}」？',
    /** 用户标签列表的连接符（仅作 join 分隔符，非句子文案） */
    tagSep: '、',
  },
  en: {
    title: {
      edit: 'Edit to-do',
      new: 'New to-do',
      detail: 'To-do details',
    },
    field: {
      title: 'Title',
      body: 'Notes',
      list: 'List',
      importance: 'Importance',
      dueDate: 'Due date',
      plannedDate: 'Planned date',
      startDate: 'Start date',
      status: 'Status',
      complexity: 'Complexity',
      repeat: 'Repeat',
      alarm: 'Alarm (system notification when due; leave empty for none)',
      tags: 'Tags (comma separated, custom)',
      legacyDueDate: 'Due date',
    },
    mobile: {
      list: 'List',
      due: 'Due',
      planned: 'Planned',
      alarm: 'Alarm',
      tags: 'Tags',
      titlePlaceholder: 'Tap here to enter a title…',
      noTitle: 'Untitled (tap to edit)',
      bodyEmpty: 'Tap to jot some notes…',
    },
    importance: { high: 'High', normal: 'Normal', low: 'Low' },
    repeat: {
      none: 'No repeat',
      daily: 'Every day',
      weekdays: 'Every weekday',
      weekly: 'Every week',
    },
    due: {
      today: 'Today',
      tomorrow: 'Tomorrow',
      nextMonday: 'Next Monday',
      todayWithDate: 'Today ({date})',
      tomorrowWithDate: 'Tomorrow ({date})',
      nextMondayWithDate: 'Next Monday ({date})',
      customValue: '{value} (custom)',
      pickDate: 'Pick a date…',
      back: 'Back',
    },
    action: {
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      delete: 'Delete',
      clear: 'Clear',
      done: 'Done',
      close: 'Close',
    },
    none: 'None',
    emptyPanel: 'Select a to-do to view details',
    placeholder: {
      legacyTitle: 'Task title',
      optional: 'Optional',
      bodyOptional: 'Notes (optional)',
      tags: 'work, study, family…',
      tagsShort: 'work, study…',
    },
    hint: {
      dblClickEdit: 'Double-click to expand for editing',
      autosavePrefix: 'Auto-saves when switching pages · ',
      autosaveSuffix: ' to save now',
    },
    deleteConfirm: 'Delete to-do "{title}"?',
    tagSep: ', ',
  },
} as const
