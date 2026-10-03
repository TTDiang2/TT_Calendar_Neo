/**
 * common 命名空间：跨组件通用的基础文案。
 * fragment 结构（抽词规范）：每个命名空间一个文件，同时导出 zh 与 en 两份——
 * 抽词批次与翻译 en 一步到位，避免多批次并行改同一个 en 文件的冲突。
 * 每条 key 上方写翻译上下文注释（给翻译子智能体看），这是自研 TS 字典相对 JSON 的核心优势。
 * 后续语言（ja/ko/fr/es/ru/zh-Hant）由翻译阶段按命名空间逐文件补入（dict/<lang>.ts 引用 fragment 的 en 做 pivot）。
 */
export const common = {
  zh: {
    /** 应用品牌名（拉丁品牌名，不做翻译） */
    appName: 'TT Calendar',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    close: '关闭',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    done: '完成',
    ok: '好',
    yes: '是',
    no: '否',
    back: '返回',
    retry: '重试',
    loading: '加载中…',
    search: '搜索',
    settings: '设置',
    none: '无',
    all: '全部',
    today: '今天',
    tomorrow: '明天',
    yesterday: '昨天',
    /** 数据加载/操作失败的通用提示 */
    loadFailed: '加载失败',
    opFailed: '操作失败',
    /** 相对天数（zh 无复数变体；数值已由 Intl.RelativeTimeFormat 承担的不要用这里） */
    daysAfter: { other: '{n} 天后' },
    daysBefore: { other: '{n} 天前' },
  },
  en: {
    appName: 'TT Calendar',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    done: 'Done',
    ok: 'OK',
    yes: 'Yes',
    no: 'No',
    back: 'Back',
    retry: 'Retry',
    loading: 'Loading…',
    search: 'Search',
    settings: 'Settings',
    none: 'None',
    all: 'All',
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
    loadFailed: 'Failed to load',
    opFailed: 'Operation failed',
    daysAfter: { one: 'In {n} day', other: 'In {n} days' },
    daysBefore: { one: '{n} day ago', other: '{n} days ago' },
  },
} as const
