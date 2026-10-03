# i18n 回译抽查报告（补录：zh-Hant / es / ru，智者 P3 复审 F7）

> 抽查方法：从各语言字典按命名空间分层抽样 20 条（含复数条目、占位符条目、
> 标点承载位、术语表词），回译为中文对照 zh-CN 原义。判定：✓ 语义一致 / △ 可接受偏差 / ✗ 需修。
> 本报告为补录（三语言为补录批次）；ja 批次报告见其交付记录（20 条零偏差）；ko/fr 由智者复审抽查覆盖（各约 10 条，未发现缺陷）。

## zh-Hant（20 条，繁化 + 台湾用语）

| key | 译文 | 回译 | 判定 |
|---|---|---|---|
| common.save | 儲存 | 存储（台湾惯用） | ✓ |
| common.loading | 載入中… | 加载中… | ✓ |
| terms.widgets | 小工具 | 小组件（台湾惯用） | ✓ |
| terms.calendar | 日曆 | 日历 | ✓ |
| layers.todoDone | 待辦·已完成 | 待办·已完成 | ✓ |
| topbar.mode.week | 週 | 周 | ✓ |
| topbar.todoMode.stickies | 便籤 | 便签 | ✓ |
| countdown.suffixAnniversary | {n} 週年 | {n} 周年 | ✓ |
| countdown.bannerUpcoming | 距離「{name}」還有 {n} 天 | 距离「{name}」还有 {n} 天 | ✓ |
| calendar.makeUpWorkday | 班 | 班 | ✓ |
| calendar.emptyAgendaToday | 今天還沒有安排，點上方日期格可快速加入 | 今天还没有安排，点上方日期格可快速加入 | ✓ |
| todo.quadrant.planIt.desc | 矩陣的核心價值區：別讓它變成緊急 | 矩阵的核心价值区：别让它变成紧急 | ✓ |
| todo.jar.tagline | 大石頭先進，沙子填縫。 | 大石头先进，沙子填缝。 | ✓ |
| todo.lists.deleteConfirm | 刪除列表「{name}」及其所有待辦？ | 删除列表「{name}」及其所有待办？ | ✓ |
| todoEditor.hint.autosavePrefix | 切換頁面自動儲存 · | 切换页面自动保存 · | ✓ |
| widgetsView.guideIosSteps | 想放到 iPhone 主畫面？…搜尋「TT 日曆」… | 想放到 iPhone 主画面？…搜索「TT 日历」… | ✓（检索词保留中文——zh-Hant 商店可搜到） |
| dialogs.coloringLevel.productive | 高產 | 高产 | ✓ |
| stats.milestone.maxReached | 已站上最高里程碑，傳奇就是你自己 🏆 | 已站上最高里程碑，传奇就是你自己 🏆 | ✓ |
| settings.sync.decisionPrompt | 遠端儲存庫已有 {n} 行資料，本機是首次綁定。如何處理？ | 远端储存库已有 {n} 行数据，本机是首次绑定。如何处理？ | ✓（儲存庫=仓库台湾用语） |
| settings.privacy.rule5Body | 解除安裝 App 即刪除裝置資料… | 卸载 App 即删除设备数据… | ✓（台湾惯用） |

**结论：20/20 ✓。** 终审发现的「节假日」简体泄漏已修（→假日/公共假日）。

## Español（20 条，以 en 为基准）

| key | 译文 | 回译（经 en） | 判定 |
|---|---|---|---|
| common.confirm | Confirmar | Confirm | ✓ |
| common.today | Hoy | Today | ✓ |
| terms.todo | Tareas | To-dos | ✓ |
| terms.countdown | Cuentas atrás | Countdowns | ✓ |
| terms.lunar | Calendario lunar | Lunar calendar | ✓ |
| layers.coloring | Coloreado de actividad | Fullness coloring | ✓（意译可接受） |
| topbar.mode.week | Semana | Week | ✓ |
| countdown.suffixAnniversary | aniversario {n} | {n}-year anniversary | △ 语序差异（aniversario de {n} años 更自然），语义一致；简单 key 无法分形同 F10 |
| countdown.bannerUpcoming (other) | Faltan {n} días para "{name}" | {n} days until "{name}" | ✓ |
| calendar.ariaTodaySuffix | , hoy | , today | ✓（前导逗号保留） |
| calendar.makeUpWorkday | L | 班（调休班） | △ 拉美无此概念，取 Lunes 首字母示意；低频 |
| todo.quadrant.planIt.desc | El núcleo de la matriz: no dejes que se vuelva urgente | Matrix's core: don't let it become urgent | ✓ |
| todo.jar.tagline | Primero las piedras grandes; la arena rellena los huecos. | Big rocks first; sand fills the gaps. | ✓ |
| todo.card.overdueBy (other) | Vencida hace {n} días | Overdue by {n} days | ✓ |
| todoEditor.repeat.weekdays | Entre semana | Weekdays | ✓ |
| widgetsView.milestoneLabel | Aniversarios automáticos (días separados por comas) | Auto anniversaries (comma-separated days) | ✓ |
| dialogs.reminder.plannedLeft (one) | Queda 1 tarea planificada por completar hoy | 1 planned task left to complete today | ✓ |
| stats.chip.streak (other) | Racha de {n} días | {n}-day streak | ✓ |
| settings.sync.decisionPrompt (other) | …ya tiene {n} filas de datos…¿Qué hacemos? | …already has {n} rows…what do we do? | ✓ |
| mobile.reminder.overdueCount (other) | {n} tareas vencidas | {n} overdue tasks | ✓ |
| settings.privacy.intro | Tus datos son tuyos… | Your data is entirely yours… | ✓ |

**结论：18 ✓ + 2 △（语序/文化适配，可接受）。** 终审 F2/F3（TT Calendar 检索词、尊称统一）已修。

## Русский（20 条，以 en 为基准）

| key | 译文 | 回译（经 en） | 判定 |
|---|---|---|---|
| common.loading | Загрузка… | Loading… | ✓ |
| common.daysAfter (few) | Через {n} дня | In {n} days (2-4) | ✓（грамматика 正确） |
| terms.todo | Задачи | To-dos | ✓ |
| terms.countdown | Обратный отсчёт | Countdown | ✓ |
| terms.widgets | Виджеты | Widgets | ✓ |
| layers.scheduleGroup | Расписание | Schedule | ✓ |
| topbar.mode.week | Неделя | Week | ✓ |
| countdown.suffixMilestone | День {n} | Day {n} | ✓ |
| countdown.bannerUpcoming (few) | До «{name}» осталось {n} дня | {n} days (2-4) left until "{name}" | ✓（主谓配合正确） |
| calendar.makeUpWorkday | Р | 班 | △ 文化空缺，取字母示意 |
| todo.imp.high | Важная | Important | ✓（阴性与 задача 一致） |
| todo.card.complexity.hard | Сложная | Hard | ✓ |
| todo.jar.tagline | Сначала большие камни, песком — щели. | Big stones first, sand for the gaps. | ✓ |
| todo.kanban.dragHint | Перетащите карточку…круглая кнопка — выполнить | Drag the card…round button — complete | ✓ |
| widgetsView.cardDaysLeft (many) | Осталось {n} дней | {n} days (5+) left | ✓ |
| widgetsView.repeatLunar | По лунному календарю (Новый год по-lunar и др.) | By lunar calendar (Lunar New Year etc.) | △ «по-lunar» 混拉丁字母，应改 «по лунному календарю»；已列入修复 |
| dialogs.detail.allDay | Весь день | All day | ✓ |
| stats.milestone.thousand.desc | Веха в тысячу: сложный процент постоянства налицо | Thousand milestone: compound interest of consistency is visible | ✓ |
| settings.sync.report | Получено {pulled} · Отправлено {pushed} · Конфликты… | Pulled · Pushed · Conflicts · Deleted | ✓ |
| mobile.reminder.overdueCount (few) | Просрочены {n} задачи | {n} (2-4) tasks overdue | ✓ |
| settings.privacy.rule2Body | …песочница приложения… | …app sandbox… | ✓ |

**结论：17 ✓ + 2 △ + 1 修（repeatLunar 的 «по-lunar» 已改为 «по лунному календарю»）。**
终审 F4（Високосный→Вставной）已修。

## 补修记录

| 项 | 修复 |
|---|---|
| ru repeatLunar «по-lunar» | 改为 «По лунному календарю (восточный Новый год и др.)» |
| es banner 引号混用 | 保持 «…»（与 es 排版惯例一致），bannerToday/Passed 改 «…» |
