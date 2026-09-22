# App Store 审核回复材料（Guideline 2.1）

> 2026-09-21 首次提审被 2.1「Information Needed」挡回——新开发者账号的常规补充材料要求。
> **建议用英文回复**（审核团队按英文处理）。英文版已写入 ASC「App 审核信息 → 备注」字段
> （3,478 字符，ASC 备注上限 4,000）。第 1 项真机录屏需你录制后随回复附上。

## 一、Resolution Center 回复正文（英文，复制以下全文）

Guideline 2.1 - Information Needed. A physical-device screen recording (iPhone, latest iOS) is attached to this reply; it begins with launching the app from the Home Screen and shows the typical user flow. This information is also being added to the Notes field of App Review Information, as instructed.

2) Purpose and target audience: TT Calendar is a personal calendar + to-do + countdown app for individual users in mainland China (students, office workers). It unifies schedule, to-dos and anniversaries in one screen: the month view is color-coded by activity and completion, to-dos support daily / weekday / weekly repetition, countdowns track exams and anniversaries, and insights show a contribution-style heat map. It is local-first, with no account, no ads and no tracking.

3) Accessing the main features (no account, login or sample files required): On first launch the app opens the month view with built-in layers ready (Important Dates, Holidays, To-dos, Completed To-dos, plus five schedule categories). The top bar switches Month / Day / Year / Countdown. Tapping a date shows that day's schedule, events and to-dos. The pink "+" at the bottom right creates items (dot/coloring chooser on the calendar, quick-add on the To-do tab, a new countdown on the Countdown tab). The bottom dock "To-do" offers List / Matrix / Gantt / Sticky-note views; tapping the circle on the left completes an item, and completing a repeating to-do automatically generates its next occurrence. The bottom dock "Insights" shows a milestone card, contribution heat map, busy-load forecast and daily completions chart. Home Screen widgets: long-press the Home Screen, Add Widget, choose TT Calendar (today overview, countdown, monthly completion, 13-week heat map, stats, check-ins); on iOS 17+ the check-in widgets support tapping to complete directly on the Home Screen. Notification permission is requested only after the user sets a reminder and is used solely for local notifications.

4) External services: Required - NONE. Optional - GitHub (github.com), used only if the user explicitly configures Data Sync with their own private repository and personal access token (stored on device only); no developer server exists. No ads, analytics, third-party SDKs or AI services. The main app renders a local UI in WKWebView over an on-device SQLite database; widgets use WidgetKit and share data with the app through an App Group. The Local Network permission covers only an optional, off-by-default connection to the user's own desktop data service.

5) Regional differences: none - features are identical in all regions, with no region-specific content. The only network-dependent aspect is the optional GitHub sync, which requires reaching github.com and may be unavailable in some networks; with sync off the app is fully offline and unaffected. The app is a purely local application that does not provide internet information services; its UI language is Simplified Chinese.

6) Regulated industry / protected material: Not applicable - not a regulated industry and no protected third-party material is used (content rights declaration: DOES_NOT_USE_THIRD_PARTY_CONTENT).

Notes on common issues: there is no account system (so no account-deletion flow is needed), no public user-generated content (so no reporting/blocking mechanisms apply), no in-app purchases or paid content, and all App Store screenshots show the actual app in use rather than title art or a splash screen.

---

## 二、中文对照版（供你核对内容，不必提交）

【2.1 审核补充信息 / Additional Information】

2. 应用用途与目标用户
TT 日历是一款个人日历 + 待办 + 倒数日应用，目标用户是中国大陆的普通个人用户（学生、上班族）。它解决的问题：把「日程 / 待办 / 纪念日」集中到一屏——月历上一眼看到当月充实度与完成情况，待办支持每日/每工作日/每周重复并在完成时自动生成下一期，倒数日跟踪考试、纪念日等，统计页用贡献热力图回顾坚持情况。核心价值：本地优先、无账号、无广告、无追踪，数据完全属于用户。

3. 主要功能的设置与访问方式
· 无需注册或登录。首次启动即进入月视图；内置图层（重要日期、公共节假日、待办、待办·已完成与日程五类）自动就绪，无需任何配置。
· 视图切换：顶部「月 / 日 / 年 / 倒数」。
· 查看某天：点任一日期格子 → 当日日程 / 事件 / 待办列表。
· 新建：右下角粉色加号。日历页弹出「点点 / 涂色」；待办页进入快速新增；倒数页进入新建倒数日。
· 待办：底部「待办」→ 顶部可切换 列表 / 矩阵 / 甘特 / 便签 四种视图；点左侧圆圈即完成。重复待办在详情面板设置（每日 / 每工作日 / 每周）。
· 统计：底部「分析」→ 里程碑卡片、贡献热力图、忙度预测、每日完成柱状图。
· 倒数日：顶部「倒数」→ 右下角加号新建，分类（生日 / 纪念日 / 节日 / 重要事件）自动配色。
· 主屏小组件：长按桌面 → 添加小组件 → TT 日历（今日概览 / 倒数日 / 本月完成热力 / 完成热力近 13 周 / 完成统计 / 今日打卡 / 一键打卡）。iOS 17 及以上的打卡类小组件支持直接在桌面点勾完成。
· 可选功能：设置 → 数据同步，用户可填入自己的 GitHub 私有仓库与个人访问令牌做多设备同步（完全可选，默认关闭；开启后数据仅在用户自己的仓库与设备之间流动，开发者无法访问）。不配置同步时应用完全离线可用。
· 无需任何示例文件或演示账号——不登录也能使用全部核心功能。
· 通知权限：仅当用户主动设置待办闹钟或每日提醒后，用于本地通知。

4. 外部服务 / 工具 / 平台清单
· 必选外部服务：无。
· 可选：GitHub（github.com）——仅当用户主动配置「数据同步」时使用，目标仓库是用户自己的私有仓库，凭据（PAT）仅存于设备本地。开发者不运营任何服务器，不接入任何第三方 SDK、广告、统计或 AI 服务。
· 技术栈：主应用为 WKWebView 承载的本地界面 + 设备内 SQLite 存储；小组件为系统 WidgetKit。二者通过 App Group 共享数据。
· 「本地网络」权限说明：仅用于一个可选且默认关闭的场景——把手机连接到用户自己电脑上的桌面版数据服务；不使用该功能时应用不会访问局域网。

5. 地区差异
· 各区域功能完全一致，无地区专属内容或差异。
· 唯一与网络环境相关的一点：可选的 GitHub 同步依赖对 github.com 的访问，在部分网络环境下可能不可用；不开启同步时应用完全离线，功能不受影响。
· 语言为简体中文；应用为纯本地应用，不从事互联网信息服务。

6. 受监管行业 / 受保护材料
· 不适用：应用不属于受监管行业，未使用任何受保护的第三方材料（无第三方内容，已声明 DOES_NOT_USE_THIRD_PARTY_CONTENT）。

补充（对应常见问题自查）
· 无账号体系 → 无需账号删除流程；无用户生成内容的公开分享 → 无需举报/屏蔽机制；无内购与付费内容；截图均为真实应用界面（非标题图或启动页）。

---

## 三、真机录屏拍摄清单（第 1 项要求，需你录制）

要求：**真机**、最新系统、从启动 App 开始、展示典型使用流程。建议 2-4 分钟：

| 步骤 | 演示内容 |
|---|---|
| 1 | 从桌面点图标启动 App（**必须包含启动瞬间**） |
| 2 | 月视图：涂色层、点点层、今日信息栏 |
| 3 | 点某天 → 当日日程/事件/待办 |
| 4 | 加号 → 新建待办（标题、截止日） |
| 5 | 点圆圈完成 → 重复待办展示「下一期已生成」 |
| 6 | 顶部切「日」「年」 |
| 7 | 待办页 → 列表/矩阵/甘特/便签 四视图 |
| 8 | 分析页 → 热力图、忙度预测、每日完成 |
| 9 | 倒数页 → 新建倒数日 |
| 10 | 桌面长按 → 添加小组件 → TT 日历（iOS 17+ 可点一下打卡） |
| 11 | （可选）设置 → 数据同步，说明需用户自己的 GitHub 仓库 |

**不需要录制**：账号注册/登录/注销、UGC 举报屏蔽、付费购买（本应用均不存在）。

## 四、提交操作

1. ASC → 被拒版本页 → 「Reply to App Review」回复框 → 粘贴上面第一节全文
2. 用回复框的附件功能**附上录屏文件**
3. 提交 → 应用回到审核队列
