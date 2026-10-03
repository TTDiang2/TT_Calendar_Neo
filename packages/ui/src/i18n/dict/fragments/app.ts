/**
 * app 命名空间：App 外壳（App.tsx）与适配层（adapt/http.ts）的用户可见文案。
 * 覆盖：移动端日历内联头部、统一新建底部抽屉、Tauri 关闭前同步对话框、
 * 悬浮 dock 左右按钮、统一新建 FAB，以及 HTTP 适配层的同步失败错误消息。
 * 日期类标题（年/月/日）按规范 §3 一律走 i18n/format.ts 的 Intl 封装，不进字典。
 * 规范见 docs/i18n-extraction-spec.md。
 */

/* TODO-REVIEW: 下方导出的 SYNC_IN_PROGRESS_MARK 不是翻译文案，而是旧版 Python
 * sidecar「已有同步正在进行中」报错的消息子串——App.tsx 关闭前同步用它做协议
 * 匹配（命中 = 已有同步在跑 → 静默退出）。现役 Node 后端不再抛该中文消息，但为
 * 不改变行为而保留匹配。放在 i18n/ 目录是因为它是 UI 包内唯一豁免中文串棘轮
 * 扫描的场所。建议后续在 contracts 定义结构化结果码（如 'sync_in_progress'）
 * 后删除该常量与字符串匹配。 */

/** 协议常量（非文案）：旧 sidecar 并发同步报错的消息子串，见文件头 TODO-REVIEW */
export const SYNC_IN_PROGRESS_MARK = '正在进行'

export const app = {
  zh: {
    /** 移动端日历头部模式胶囊里「倒数日」的短标（月/日/年复用 topbar.mode.*，此处只补短标差异） */
    modeShort: { countdown: '倒数' },
    /** 移动端日历头部上/下翻页圆形按钮的 aria-label（无可见文本） */
    prevPage: '上一页',
    nextPage: '下一页',
    /** 统一新建底部抽屉的标题行：{date} 为 Intl 产出的本地化日期（如「9月18日」） */
    addToDate: '添加到 {date}',
    /** 统一新建抽屉「点点」入口按钮：主标 + 副标（副标列举点点可记录的内容） */
    addDot: '加点点',
    addDotHint: '事件 · 日程 · 备忘',
    /** 统一新建抽屉「涂色」入口按钮：主标 + 副标（副标列举涂色可记录的内容） */
    addColor: '涂色',
    addColorHint: '打卡 · 完成度 · 重要日期',
    /** Tauri 关闭前同步对话框：同步进行中的提示正文 */
    syncExiting: '正在同步，同步完成后会自动退出……',
    /** 关闭前同步失败对话框的标题 */
    syncOnCloseFailed: '关闭前同步失败',
    /** 关闭前同步失败对话框的三个操作按钮 */
    retrySync: '重试同步',
    forceQuit: '强制退出',
    cancelClose: '取消关闭',
    /** 同步失败错误消息（http 适配层 syncNow 兜底；{status} 为 HTTP 状态码，冒泡到 UI 错误提示） */
    syncFailed: '同步失败（{status}）',
    /** 移动端悬浮 dock 左右按钮的 aria-label/title（不可见文本，括号内提示边栏方位） */
    dock: {
      layers: '图层（左侧边栏）',
      todoLists: '待办清单（左侧边栏）',
      statsScope: '统计范围（左侧边栏）',
      dayDetail: '当日详情（右侧边栏）',
      todoStats: '待办统计（右侧边栏）',
      milestones: '里程碑（右侧边栏）',
    },
    /** 移动端统一新建 FAB（粉色加号）的 aria-label */
    fabNew: '新建',
  },
  en: {
    modeShort: { countdown: 'Countdown' },
    prevPage: 'Previous page',
    nextPage: 'Next page',
    addToDate: 'Add to {date}',
    addDot: 'Add dots',
    addDotHint: 'Events · Schedule · Memos',
    addColor: 'Color',
    addColorHint: 'Check-ins · Progress · Important dates',
    syncExiting: 'Syncing — the app will quit automatically when finished…',
    syncOnCloseFailed: 'Sync before quit failed',
    retrySync: 'Retry sync',
    forceQuit: 'Force quit',
    cancelClose: 'Cancel quit',
    syncFailed: 'Sync failed ({status})',
    dock: {
      layers: 'Layers (left sidebar)',
      todoLists: 'To-do lists (left sidebar)',
      statsScope: 'Analysis scope (left sidebar)',
      dayDetail: 'Day details (right sidebar)',
      todoStats: 'To-do stats (right sidebar)',
      milestones: 'Milestones (right sidebar)',
    },
    fabNew: 'New',
  },
} as const
