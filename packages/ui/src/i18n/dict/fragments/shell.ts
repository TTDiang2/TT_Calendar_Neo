/**
 * shell 命名空间：应用外壳组件——BottomTabBar（移动端底部导航）、
 * Sidebar / MobileLayersDrawer（侧栏与手机图层抽屉）及其新建图层对话框。
 * 一级 tab 名（日历/待办/分析）复用 terms.*，「图层」「设置」「关闭」等
 * 通用词复用 terms.* / common.*，不在本命名空间重复。
 *
 * TODO-REVIEW: shell.defaultName.* 是新建图层的默认 display_name，会随图层持久化进
 * 数据库（layerLabel 只映射内置 ID，用户自建图层按「用户数据」原样显示）。抽成 t()
 * 后，不同语言创建的图层入库默认名不同（zh 行为与原版完全一致）。若后续要求入库名
 * 语言无关，需要像内置图层那样做显示时映射——涉及数据结构，本批次未动。
 */
export const shell = {
  zh: {
    /** BottomTabBar 整体导航容器的 aria-label（无障碍） */
    mainNav: '主导航',
    /** 手机图层抽屉顶部「综合搜索」入口按钮文本（事件+待办一把搜） */
    searchAllPlaceholder: '搜索事件、待办…',
    /** 侧栏/抽屉图层树顶部的小节标题 */
    navHeading: '导航',
    /** 图层树一级分组名（按 layer.kind 分：涂色 / 点点） */
    kind: { color: '涂色', dot: '点点' },
    /** 无分组（group 为空）图层的兜底分组名 */
    groupOther: '其他',
    /** 侧栏底部倒计时卡片的小标题 */
    countdownLabel: '倒计时',
    /** 「新建图层」：树底入口按钮 + 对话框标题，两处共用 */
    createLayer: '新建图层',
    /** 新建图层对话框各 Field 标签 */
    field: {
      layerKind: '图层类型',
      layerName: '图层名称',
      /** 分组输入框标签，括号内为「可选」提示 */
      group: '归类分组（可选）',
      template: '涂色模板',
      palette: '五档颜色预设',
      color: '颜色',
      tag: '关联待办标签',
    },
    /** 图层类型选择卡片（标题 + 一句描述） */
    kindLayer: {
      color: '涂色图层',
      colorDesc: '给日期格子涂色',
      dot: '点点图层',
      dotDesc: '显示色点+信息',
    },
    /** 图层名称输入框占位符（按图层类型/涂色模式给出示例） */
    namePlaceholder: {
      dot: '如：朋友A约饭',
      solid: '如：早起打卡',
      graded: '如：项目进度',
      tag: '如：重要客户跟进',
    },
    /** 分组输入框占位符（按图层类型给出示例，括号提示留空不分组） */
    groupPlaceholder: {
      dot: '如：约饭（留空则不分组）',
      color: '如：打卡（留空则不分组）',
    },
    /** 分组输入框下方的说明文字 */
    groupHint: '填相同的分组名会收纳到一起（如多个"约饭"图层都填"约饭"）。',
    /** 涂色模板选择卡片（标题 + 一句描述） */
    template: {
      solid: '习惯打卡',
      solidDesc: '单色涂满',
      graded: '工作完成度',
      gradedDesc: '五档颜色',
      tag: '关联涂色',
      tagDesc: '按待办标签',
    },
    /** 关联待办标签输入框占位符 */
    tagPlaceholder: '输入标签名（如：客户）',
    /** 关联标签 Field 下方说明：待办日期会自动染色 */
    tagHint: '所有带该标签的待办，其计划日期 / 截止日期会自动染上图层颜色。',
    /** 标签涂色模式提交时标签为空的校验错误（Error 消息） */
    tagRequired: '请输入标签名',
    /** 对话框底部警示：删图层只能去设置页 */
    deleteHint: '⚠️ 删除图层只能在「设置」页面进行，删除后该图层的标记数据不会保留。',
    /** 创建按钮 pending 态文案 */
    creating: '创建中…',
    /** 创建按钮常态文案 */
    create: '创建',
    /** 名称留空时入库的默认图层名（按类型/模式，见文件头 TODO-REVIEW） */
    defaultName: {
      solid: '自定义涂色',
      graded: '分级涂色',
      tag: '标签涂色',
      dot: '自定义图层',
    },
  },
  en: {
    mainNav: 'Main navigation',
    searchAllPlaceholder: 'Search events, to-dos…',
    navHeading: 'Navigation',
    kind: { color: 'Colors', dot: 'Dots' },
    groupOther: 'Other',
    countdownLabel: 'Countdown',
    createLayer: 'New layer',
    field: {
      layerKind: 'Layer type',
      layerName: 'Layer name',
      group: 'Group (optional)',
      template: 'Coloring template',
      palette: 'Five-level color presets',
      color: 'Color',
      tag: 'Linked to-do tag',
    },
    kindLayer: {
      color: 'Color layer',
      colorDesc: 'Fill date cells with color',
      dot: 'Dot layer',
      dotDesc: 'Show colored dots + info',
    },
    namePlaceholder: {
      dot: 'e.g. Lunch with a friend',
      solid: 'e.g. Morning check-in',
      graded: 'e.g. Project progress',
      tag: 'e.g. Key client follow-ups',
    },
    groupPlaceholder: {
      dot: 'e.g. Meals (leave empty for no group)',
      color: 'e.g. Check-ins (leave empty for no group)',
    },
    groupHint: 'Layers sharing a group name are collapsed together (e.g. several "Meals" layers all filled with "Meals").',
    template: {
      solid: 'Habit tracking',
      solidDesc: 'Single color fill',
      graded: 'Work progress',
      gradedDesc: 'Five color levels',
      tag: 'Linked coloring',
      tagDesc: 'By to-do tags',
    },
    tagPlaceholder: 'Enter a tag name (e.g. Client)',
    tagHint: 'All to-dos carrying this tag get their planned / due dates automatically tinted with the layer color.',
    tagRequired: 'Please enter a tag name',
    deleteHint: '⚠️ Layers can only be deleted from the Settings page. Marks made on a deleted layer will not be kept.',
    creating: 'Creating…',
    create: 'Create',
    defaultName: {
      solid: 'Custom coloring',
      graded: 'Graded coloring',
      tag: 'Tag coloring',
      dot: 'Custom layer',
    },
  },
} as const
