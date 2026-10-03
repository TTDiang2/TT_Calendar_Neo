/**
 * mobile 命名空间（抽词批次 B10）：移动端壳 apps/mobile 的用户可见文案。
 * 覆盖：iOS 本地提醒通知（reminders.ts，锁屏可见）、启动诊断黑框（boot-log.ts）、
 * 本地数据库装配错误（local/*，白屏诊断页可见）、启动占位与错误横幅（main.tsx）。
 * widget-bridge.ts 只含 console 日志（已改英文），小组件快照 payload 是结构化
 * 用户数据，不走字典。
 *
 * 非 React 场景使用：makeI18n(activeLang()).t(...) / tPlural(...)。
 * 规范见 docs/i18n-extraction-spec.md。
 */

/* TODO-REVIEW: mobile.sync.* 四条文案（needsDecision / needsDecisionUnknown /
 * initialUploadDone / autoSyncFailed）会经 setMeta('sync.pending_notice', …)
 * **持久化进数据库**，稍后在设置页「数据同步」节展示。两处结构性局限留待后续：
 *   1. db-core.ts 常驻 Worker，Worker realm 没有 localStorage/navigator，
 *      activeLang() 只能回落 zh-CN（主线程回退路径可拿到真实语言）——持久化的
 *      notice 因此可能以 zh 文案落库，显示语言与当前选择不一致；
 *   2. 正解是 meta 里存结构化码 + 参数、展示时按当前语言组装，但那是持久化
 *      数据结构变更，按规范 §7 本批次不动。
 * 另：reminders.ts 现无「距…还有 N 天 / 已逾期 N 天」类天数文案（逾期货架按
 * 条数计数，已用复数条目）；若未来加天数文案须用 tPlural + en one/other。 */

export const mobile = {
  zh: {
    reminder: {
      /** 逾期待办补报通知的标题（本地系统通知，锁屏可见；{n} 为逾期未完成条数） */
      overdueCount: { other: '有 {n} 项待办已过期' },
      /** 逾期通知正文：最多 3 条待办标题（用户数据）依次拼接的分隔符与截断省略号 */
      titleJoiner: '、',
      titleEllipsis: ' …',
      /** 到期待办通知标题：截止日就是今天 */
      todoDueToday: '待办今天截止',
      /** 到期待办通知标题：{date} 为截止日期片段（MM-DD） */
      todoDueOn: '待办截止 · {date}',
      /** 用户给待办显式设的精确闹钟到点时的通知标题 */
      todoAlarm: '⏰ 待办闹钟',
      /** 重要日期（important 图层）前一天 09:00 的通知标题 */
      importantTitle: '重要日期提醒',
      /** 重要日期通知正文：{date} 为日期片段（MM-DD），{title} 为用户设的事件名 */
      importantTomorrow: '明天（{date}）：{title}',
    },
    bootlog: {
      /** 看门狗显形时写入白屏诊断黑框的头行（之后回灌最近日志） */
      watchdogHeader: '[watchdog] 启动已 15s 无进展，最近日志：',
      /** unhandledrejection 兜底日志的前缀（可能随看门狗显形上屏） */
      unhandledRejection: '未捕获 rejection:',
      /** window error 兜底日志的前缀（可能随看门狗显形上屏） */
      scriptError: '脚本错误:',
    },
    boot: {
      /** React 挂载前的全屏启动占位（HTTP 模式） */
      startingDataServer: '正在启动数据服务…',
      /** React 挂载前的全屏启动占位（本地库模式） */
      openingLocalDb: '正在打开本地数据库…',
      /** 本地库起不来时全屏错误横幅的标题（引导用户截图反馈） */
      bootFailedTitle: '启动失败，请截图反馈',
    },
    backend: {
      /** 本地数据库初始化失败的包装错误（白屏诊断页可见），{message} 为底层原因 */
      initFailed: '本地数据库初始化失败：{message}',
      /** sql-wasm 二进制下载失败（{status} HTTP 状态码，{url} 资源地址） */
      wasmLoadFailed: '加载 sql-wasm 失败：HTTP {status}（{url}）',
      /** worker 脚本下载失败（{status} HTTP 状态码） */
      workerLoadFailed: '加载 worker 脚本失败：HTTP {status}',
      /** worker 返回错误但未带 message 时的兜底文案 */
      opFailed: '本地数据操作失败',
      /** worker 脚本级崩溃（error 事件无 message 时） */
      workerCrashed: 'worker 崩溃',
      /** init 握手 15 秒超时 */
      initTimeout: '15 秒内未就绪',
      /** worker 报 init-error 但未带 message */
      unknownError: '未知错误',
    },
    dbcore: {
      /** 数据库未初始化完成时发起数据调用（Worker / 主线程回退共用） */
      notInitialized: '本地数据库尚未初始化',
      /** 刷新订阅时找不到对应 id */
      subscriptionNotFound: '订阅不存在',
      /** 待办 CSV 导入未拿到文件 */
      csvFileMissing: '缺少 CSV 文件',
    },
    sync: {
      /** 后台自动同步遇首绑决策，写入 meta 后在设置页「数据同步」节展示（{n} 远端行数） */
      needsDecision: {
        other: '后台同步等待你的决定：远端仓库已有 {n} 行数据，请到「设置 → 数据同步」选择合并方式',
      },
      /** needsDecision 的防御分支：远端行数缺失时以 ? 占位 */
      needsDecisionUnknown:
        '后台同步等待你的决定：远端仓库已有 ? 行数据，请到「设置 → 数据同步」选择合并方式',
      /** 后台首次上传完成，写入 meta 后在设置页展示（{n} 上传行数） */
      initialUploadDone: { other: '后台已完成首次上传（{n} 行）' },
      /** 后台自动同步失败（离线/凭据过期等），写入 meta 后在设置页展示 */
      autoSyncFailed: '后台自动同步失败：{message}',
    },
  },
  en: {
    reminder: {
      overdueCount: { one: '1 to-do is overdue', other: '{n} to-dos are overdue' },
      titleJoiner: ', ',
      titleEllipsis: ' …',
      todoDueToday: 'To-do due today',
      todoDueOn: 'To-do due · {date}',
      todoAlarm: '⏰ To-do alarm',
      importantTitle: 'Important date reminder',
      importantTomorrow: 'Tomorrow ({date}): {title}',
    },
    bootlog: {
      watchdogHeader: '[watchdog] No progress for 15s after startup; recent logs:',
      unhandledRejection: 'Unhandled rejection:',
      scriptError: 'Script error:',
    },
    boot: {
      startingDataServer: 'Starting data service…',
      openingLocalDb: 'Opening local database…',
      bootFailedTitle: 'Startup failed — please take a screenshot and report it',
    },
    backend: {
      initFailed: 'Failed to initialize the local database: {message}',
      wasmLoadFailed: 'Failed to load sql-wasm: HTTP {status} ({url})',
      workerLoadFailed: 'Failed to load worker script: HTTP {status}',
      opFailed: 'Local data operation failed',
      workerCrashed: 'Worker crashed',
      initTimeout: 'Not ready within 15 s',
      unknownError: 'Unknown error',
    },
    dbcore: {
      notInitialized: 'Local database is not initialized yet',
      subscriptionNotFound: 'Subscription not found',
      csvFileMissing: 'Missing CSV file',
    },
    sync: {
      needsDecision: {
        one: 'Background sync is waiting for your decision: the remote repository already has 1 row of data. Choose how to merge under Settings → Data sync',
        other: 'Background sync is waiting for your decision: the remote repository already has {n} rows of data. Choose how to merge under Settings → Data sync',
      },
      needsDecisionUnknown:
        'Background sync is waiting for your decision: the remote repository already has an unknown number of rows. Choose how to merge under Settings → Data sync',
      initialUploadDone: {
        one: 'Background initial upload finished (1 row)',
        other: 'Background initial upload finished ({n} rows)',
      },
      autoSyncFailed: 'Background auto-sync failed: {message}',
    },
  },
} as const
