/**
 * settings 命名空间（抽词批次 B8）：SettingsDialog.tsx —— 设置弹窗全部文案。
 * 语言设置行（LanguageSection）归 language.*，不在本命名空间；
 * 自定义图层行的图层名为用户数据（custom_* 无内置映射），原样渲染不走 layerLabel。
 * 「加载中…」「保存」等通用词复用 common.loading / common.save，不在本命名空间重复。
 *
 * TODO-REVIEW: sync.lastSyncOk / sync.lastSyncWarn 的 {time} 沿用原实现的 ISO
 * 时间切片（status.at.slice(11, 19) → 'HH:MM:SS'），为守住「zh-CN 逐屏一致」红线
 * 未改走 Intl（i18n/format.ts 暂无时间格式化封装）。若后续提供 fmtTime，应替换。
 *
 * TODO-REVIEW: privacy.introSync 按 §2.1 整句抽取后，原 JSX 里「你自己的 GitHub
 * 私有仓库」的内层 <b> 加粗一并消失（文案逐字不变，仅不再加粗）；同 dialogs 批次
 * reminder.plannedLeft 先例，插值器不支持富文本。条款一~五按句界拆成
 * ruleNTitle（加粗句）/ ruleNBody 两个 key，<b> 加粗保留。
 */
export const settings = {
  zh: {
    /** 保存进行中的按钮文案（待办忙度「保存并重算」/ 数据同步「保存」两处共用） */
    saving: '保存中…',

    /** ── 自定义图层分区 ─────────────────────────────────── */
    layers: {
      /** 分区标题 */
      sectionTitle: '自定义图层',
      /** 空态：还没有任何自定义图层时的提示 */
      empty: '暂无自定义图层。可在日历左侧边栏点「新建图层」创建。',
      /** 行尾垃圾桶图标的 title（两步删除第一步，hover 提示） */
      deleteTitle: '删除图层（标记数据不会保留）',
      /** 两步删除第二步的红色确认按钮 */
      confirmDelete: '确认删除',
    },

    /** ── 待办忙度分区 ───────────────────────────────────── */
    busy: {
      /** 分区标题 */
      sectionTitle: '待办忙度',
      /** 分区顶部说明：预测层/实际层两条口径 */
      desc: '预测层：未完成待办按「截止×5 + 计划×3 + 重要度 + 复杂度」加权，用于未来日期；实际层：勾选当天计分，用于过去日期。',
      /** 表单标签：截止日期权重输入框 */
      fieldDue: '截止权重',
      /** 表单标签：计划日期权重输入框 */
      fieldPlanned: '计划权重',
      /** 表单标签：重要度三档权重（高/中/低三个输入框） */
      fieldImportance: '重要度 高/中/低',
      /** 表单标签：复杂度三档权重（高/中/低三个输入框） */
      fieldComplexity: '复杂度 高/中/低',
      /** 表单标签：忙度五档分界值输入行 */
      fieldThresholds: '分档阈值（5 个）',
      /** 预测层色板行首的小灰字标签 */
      predictLayer: '预测层',
      /** 实际层色板行首的小灰字标签 */
      actualLayer: '实际层',
      /** 色块输入框的 title，{n} 为档位序号（1 起） */
      levelTitle: '档位 {n}',
      /** 保存按钮（保存配置并重算忙度快照） */
      save: '保存并重算',
      /** 保存成功提示，{n} 为重算覆盖的天数（计数含名词，用复数条目：en day/days） */
      savedDays: { other: '已保存并重算 {n} 天的忙度快照' },
    },

    /** ── 每日提醒分区 ───────────────────────────────────── */
    reminder: {
      /** 分区标题（配置未加载/已加载两种渲染共用） */
      sectionTitle: '每日提醒',
      /** 分区顶部说明：横幅行为 + 默认关 */
      desc: '到了设定时间，若今日仍有计划未完成的待办，应用顶部会出现一条安静横幅。默认关。',
      /** 启用开关的行内标签 */
      enable: '启用每日提醒',
      /** 表单标签：提醒时间（time 输入框） */
      fieldTime: '提醒时间',
    },

    /** ── 数据同步分区 ───────────────────────────────────── */
    sync: {
      /** 分区标题 */
      sectionTitle: '数据同步',
      /** 分区顶部说明：同步范围 + 明文存储 + PAT 安全 + 指引文档路径 */
      desc: '通过你的 GitHub 私有仓库在多台设备间同步全部数据（图层、事件、日程、待办、倒数日、涂色）。数据明文存于你的私有仓库；PAT 仅保存在本机数据库（同步私有键，不进入同步快照），永不上传。配置步骤见 docs/SYNC_SETUP.md。',
      /** 首次绑定决策框正文，{n} 为远端已有行数（计数含名词，用复数条目：en row/rows） */
      decisionPrompt: { other: '远端仓库已有 {n} 行数据，本地是首次绑定。如何处理？' },
      /** 决策按钮：合并两边并上传（推荐，粉色主按钮） */
      resolveMerge: '合并两边并上传（推荐）',
      /** 决策按钮：用远端覆盖本地（红色描边按钮） */
      resolveOverwrite: '用远端覆盖本地',
      /** 状态行：上次同步成功，{time} 为 ISO 时间切片 HH:MM:SS（见文件头 TODO-REVIEW） */
      lastSyncOk: '✓ 上次同步 {time}',
      /** 状态行：上次同步失败/异常，{time} 同上 */
      lastSyncWarn: '⚠ 上次同步 {time}',
      /** 状态行：已配置但从未同步过 */
      lastSyncNever: '尚未同步过',
      /** 状态行：未配置同步仓库 */
      notConfigured: '未配置',
      /** 表单标签：GitHub 仓库（owner/repo）输入框 */
      fieldRepo: '仓库（owner/repo）',
      /** 表单标签：分支名输入框 */
      fieldBranch: '分支',
      /** 表单标签：PAT 输入框，{state} 为 patStored / patMissing 二选一 */
      patLabel: 'PAT（{state}）',
      /** PAT 标签态：本机已存过 token */
      patStored: '已存储，留空则不修改',
      /** PAT 标签态：未存过 token */
      patMissing: 'fine-grained，见操作指引',
      /** 复选框：启动时自动同步一次 */
      autoOnStart: '启动时自动同步一次',
      /** 复选框：关闭窗口前自动同步 */
      syncOnClose: '关闭前自动同步（点窗口 ✕ 时先同步再退出）',
      /** 测试连接按钮 */
      test: '测试连接',
      /** 测试进行中的按钮文案 */
      testing: '测试中…',
      /** 立即同步按钮（粉色主按钮） */
      syncNow: '立即同步',
      /** 同步进行中的按钮文案 */
      syncing: '同步中…',
      /** 配置已保存的绿色提示 */
      savedMsg: '已保存',
      /** 首次初始化完成提示，{n} 为上传行数（计数含名词，用复数条目：en row/rows） */
      initDone: { other: '首次初始化完成：已上传 {n} 行' },
      /** 同步结果报告行：四项计数（纯数字无名词，不做复数） */
      report: '拉取 {pulled} · 推送 {pushed} · 冲突 {conflicts} · 删除 {deleted}',
      /** 同步结果报告的警告后缀，{warning} 为后端警告文本 */
      reportWarning: '（{warning}）',
      /** 冲突决策执行完成提示，{report} 为 sync.report 渲染结果 */
      resolvedDone: '绑定完成：{report}',
    },

    /** ── 隐私政策分区 ───────────────────────────────────── */
    privacy: {
      /** 分区标题 */
      sectionTitle: '隐私政策',
      /** 摘要第一句（数据归属承诺） */
      intro: '你的数据完全属于你：全部数据保存在本设备本地，本应用不含广告与任何第三方追踪组件，不收集、不上传、不出售任何个人数据。',
      /** 摘要第二句（同步是唯一可选传输；原「你自己的 GitHub 私有仓库」加粗已去除，见文件头 TODO-REVIEW） */
      introSync: '唯一可选的数据传输是「数据同步」——若你开启，数据仅在你自己的 GitHub 私有仓库与设备之间流动，开发者无法访问。',
      /** 折叠面板的展开入口（粉色文字） */
      showFull: '查看完整政策',
      /** 完整政策链接行前缀（后接外部链接，链接文字为 URL 原样） */
      fullPolicyLine: '完整政策（含变更与联系方式）：',
      /** 条款一加粗句 */
      rule1Title: '一、我们不收集任何数据。',
      /** 条款一正文 */
      rule1Body: '不含广告 SDK、不嵌入第三方统计/追踪组件；不请求位置、通讯录、照片、健康数据；不注册账号，不建立用户档案。',
      /** 条款二加粗句 */
      rule2Title: '二、数据存储位置。',
      /** 条款二正文 */
      rule2Body: '全部数据（事件、日程、待办、倒数日、涂色、配置）保存在设备本地（SQLite + 应用沙盒），离线可完整使用。小组件快照保存在设备本地的 App Group 共享容器，仅本设备的小组件扩展可读取。',
      /** 条款三加粗句 */
      rule3Title: '三、唯一可选传输。',
      /** 条款三正文 */
      rule3Body: '开启数据同步后，数据仅与你自己的 GitHub 私有仓库同步；认证 Token 仅存本机、永不上传；可随时停用或删除。不开启同步则不产生任何网络传输。',
      /** 条款四加粗句 */
      rule4Title: '四、权限说明。',
      /** 条款四正文 */
      rule4Body: '通知：仅在设置闹钟/每日提醒后弹本地通知；本地网络：仅连接局域网内电脑数据服务时使用。',
      /** 条款五加粗句 */
      rule5Title: '五、数据删除。',
      /** 条款五正文 */
      rule5Body: '卸载应用即删除设备数据；删除同步仓库即删除云端副本。我们没有任何服务器。',
    },
  },
  en: {
    saving: 'Saving…',

    layers: {
      sectionTitle: 'Custom layers',
      empty: 'No custom layers yet. Create one with "New layer" in the calendar\'s left sidebar.',
      deleteTitle: 'Delete layer (its marks will not be kept)',
      confirmDelete: 'Confirm delete',
    },

    busy: {
      sectionTitle: 'To-do busyness',
      desc: 'Predicted layer: open to-dos are weighted by "due ×5 + planned ×3 + importance + complexity", used for future dates; actual layer: a to-do scores on the day you check it off, used for past dates.',
      fieldDue: 'Due weight',
      fieldPlanned: 'Planned weight',
      fieldImportance: 'Importance high/mid/low',
      fieldComplexity: 'Complexity high/mid/low',
      fieldThresholds: 'Level thresholds (5)',
      predictLayer: 'Predicted',
      actualLayer: 'Actual',
      levelTitle: 'Level {n}',
      save: 'Save & recompute',
      savedDays: {
        one: 'Saved and recomputed the busyness snapshot for {n} day',
        other: 'Saved and recomputed the busyness snapshot for {n} days',
      },
    },

    reminder: {
      sectionTitle: 'Daily reminder',
      desc: 'At the set time, if any planned to-dos for today are still unfinished, a quiet banner appears at the top of the app. Off by default.',
      enable: 'Enable daily reminder',
      fieldTime: 'Reminder time',
    },

    sync: {
      sectionTitle: 'Data sync',
      desc: 'Sync all data (layers, events, schedule, to-dos, countdowns, coloring) across devices through your own private GitHub repository. Data is stored in plaintext in your private repository; the PAT is kept only in the local database (a private sync key, never enters the sync snapshot) and is never uploaded. See docs/SYNC_SETUP.md for setup steps.',
      decisionPrompt: {
        one: 'The remote repository already has {n} row of data, while this device is being bound for the first time. How should we proceed?',
        other: 'The remote repository already has {n} rows of data, while this device is being bound for the first time. How should we proceed?',
      },
      resolveMerge: 'Merge both sides and upload (recommended)',
      resolveOverwrite: 'Overwrite local with remote',
      lastSyncOk: '✓ Last synced at {time}',
      lastSyncWarn: '⚠ Last synced at {time}',
      lastSyncNever: 'Never synced',
      notConfigured: 'Not configured',
      fieldRepo: 'Repository (owner/repo)',
      fieldBranch: 'Branch',
      patLabel: 'PAT ({state})',
      patStored: 'stored; leave blank to keep',
      patMissing: 'fine-grained, see the setup guide',
      autoOnStart: 'Sync once automatically at startup',
      syncOnClose: 'Sync automatically before closing (clicking the window ✕ syncs first, then exits)',
      test: 'Test connection',
      testing: 'Testing…',
      syncNow: 'Sync now',
      syncing: 'Syncing…',
      savedMsg: 'Saved',
      initDone: {
        one: 'First-time initialization complete: uploaded {n} row',
        other: 'First-time initialization complete: uploaded {n} rows',
      },
      report: 'Pulled {pulled} · Pushed {pushed} · Conflicts {conflicts} · Deleted {deleted}',
      reportWarning: ' ({warning})',
      resolvedDone: 'Binding complete: {report}',
    },

    privacy: {
      sectionTitle: 'Privacy policy',
      intro: 'Your data belongs entirely to you: all data is stored locally on this device. The app contains no ads or any third-party tracking components, and does not collect, upload, or sell any personal data.',
      introSync: 'The only optional data transfer is "Data sync" — if you turn it on, data flows only between your own private GitHub repository and your devices; the developer cannot access it.',
      showFull: 'View the full policy',
      fullPolicyLine: 'Full policy (including changes and contact information):',
      rule1Title: '1. We do not collect any data.',
      rule1Body: 'No ad SDKs, no embedded third-party analytics or tracking components; no requests for location, contacts, photos, or health data; no account sign-up, no user profiles.',
      rule2Title: '2. Where your data is stored.',
      rule2Body: 'All data (events, schedule, to-dos, countdowns, coloring, settings) is stored locally on the device (SQLite + app sandbox) and fully usable offline. Widget snapshots are stored in the App Group shared container on this device and can be read only by this device\'s widget extension.',
      rule3Title: '3. The only optional transfer.',
      rule3Body: 'With data sync enabled, data syncs only with your own private GitHub repository; the auth token stays on this device and is never uploaded, and can be disabled or deleted at any time. With sync off, no network transfer happens at all.',
      rule4Title: '4. Permissions.',
      rule4Body: 'Notifications: local notifications only after you set an alarm or the daily reminder; local network: used only when connecting to a data service on a computer within your LAN.',
      rule5Title: '5. Data deletion.',
      rule5Body: 'Uninstalling the app deletes the data on this device; deleting the sync repository deletes the cloud copy. We run no servers.',
    },
  },
} as const
