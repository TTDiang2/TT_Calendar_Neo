# i18n 抽词规范（批次作业契约）

> 本文档是各抽词批次的**唯一作业规范**。抽词 = 把面向用户的中文文案改为 i18n 调用，
> 同时在命名空间 fragment 里登记 zh 与 en 译文。完成后文件必须能移出
> `eslint-i18n-allowlist.json`（用 `node scripts/i18n-allowlist.mjs` 验证）。

## 0. 基建 API（packages/ui/src/i18n）

```tsx
import { useT, useTPlural, useLang, fmtWeekday, fmtMonthName, fmtDate, fmtNumber, fmtRelativeDays } from '../../i18n'

const t = useT()               // t('todo.done') / t('todo.items', { n: 3 })
const tPlural = useTPlural()   // tPlural('todo.itemCount', n)  复数（{n} 自动注入）
const lang = useLang()         // 'zh-CN' | 'zh-Hant' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'ru'
```

非 React 场景（工具函数）通过参数把 `t` 传进来；不要在模块顶层调用 hook。

## 1. fragment 文件（每个批次一个，避免并行冲突）

- 位置：`packages/ui/src/i18n/dict/fragments/<namespace>.ts`，导出 `export const <namespace> = { zh: {...}, en: {...} } as const`
- 新 fragment 必须同时挂进两处：
  - `packages/ui/src/i18n/dict/zh-CN.ts`：`export const zhCN = { common, terms, layers, <namespace>, ... } as const`
  - `packages/ui/src/i18n/dict/en.ts`：同构追加 `<namespace>: <namespace>.en`
- 每条 key 上方写中文注释说明**使用场景**（按钮? 弹窗标题? 空态?），这是翻译上下文，必须写。
- en 译文必须同步给出（en 是 pivot 语言；写不好就直译，别留空）。

## 2. t() 使用规则（硬性）

1. **JSX 混排文本必须整体抽**：`<div>共 {n} 项</div>` → `<div>{t('x.total', { n })}</div>`，
   严禁 `t('共') + n + t('项')` 式拼接（俄/英/法语词序完全不同）。存量代码里的
   `'..' + x + '..'` 拼接文案一并消灭。
2. **插值只用具名参数** `{name}`，参数名用英文；数字参数直接传 number。
3. **含数字的计数控文案用复数条目**（值是 `{ one: '...', other: '...' }`，其他类别按需）：
   en 需要 one/other；zh 只写 other。判断标准：译文里数字做主语时（"3 项待办"）必须复数；
   数字做状语时（"3 天后"→Intl.RelativeTimeFormat）不用。
4. **aria-label / title 属性 / 无障碍文案也要抽**（`title="设置"` → `title={t('common.settings')}`）。
5. **中文全角标点随句子进字典**（：、，。？！），由译文决定半角与空格。
6. **多行长文案按段落/句子拆 key**，不要整段塞一个 key。
7. **key 命名**：camelCase；`<命名空间>.<域>.<词>`；布尔/状态含义放词尾（如 `todo.filter.overdue`）。
8. **用户数据永不翻译**：日程/待办/笔记标题、图层用户自定义名原样输出。
9. **console / dev log**：改英文（不在棘轮范围但会破坏 grep 守门）。
10. **错误消息**：用户可见的（会进 UI 的 Error/Toast）→ t()；纯开发者内部错误 → 改英文。

## 3. 日期/星期/月份（硬性）

- 一律用 `i18n/format.ts` 的缓存 Intl 封装：`fmtWeekday(lang, date, width)`、
  `fmtMonthName`、`fmtDate(lang, date, { year:'numeric', month:'long', day:'numeric' })`、
  `fmtRelativeDays(lang, ±days)`、`fmtNumber(lang, n)`。
- **禁止**为各语言手写星期/月份数组；**禁止**把 "M月d日" 这类格式串放字典。
- 星期序（周一开头）不变；DayCell 等窄容器注意 ru/es short 名偏长，保留 truncate。

## 4. 冻结术语表（跨模块共用词，一律用 terms.*，不要在模块里重复定义）

| key | zh | en |
|---|---|---|
| terms.calendar | 日历 | Calendar |
| terms.todo | 待办 | To-dos |
| terms.event | 日程 | Event |
| terms.schedule | 日程安排 | Schedule |
| terms.countdown | 倒数日 | Countdowns |
| terms.layer | 图层 | Layers |
| terms.stats | 分析 | Analysis |
| terms.widgets | 小组件 | Widgets |
| terms.quadrant | 四象限 | Quadrants |
| terms.lunar | 农历 | Lunar calendar |
| terms.solarTerm | 节气 | Solar terms |
| terms.holiday | 节假日 | Holidays |
| terms.coloring | 染色 | Coloring |
| terms.anniversary | 纪念日 | Anniversary |
| terms.note | 笔记 | Notes |
| terms.reminder | 提醒 | Reminders |
| terms.subscription | 订阅 | Subscriptions |

（需要新术语时**加到本表**而不是各自模块；key 唯一。）

## 5. 图层名（内置默认图层 = 持久化数据，显示时映射）

数据库里 `display_name` 是中文种子数据（用户可改名）。显示一律走
`layerLabel(t, layerId, displayName)`（packages/ui/src/adapt/layerLabel.ts）：
内置 ID 显示译文；用户改过名（≠ zh 默认名）显示用户名；未知 ID 原样。
抽词中遇到渲染图层名的地方（Sidebar/DayCell/DetailPanel/StatsView 的 list_names 等）
一律改走它；**不要**直接渲染 `layer.display_name`。

## 6. domain 层纪律

- `packages/domain` 禁止依赖 i18n、禁止面向用户的中文串。
- 用户可见的 domain 常量（如 todo.ts QUADRANT_LABELS、todo-repeat.ts 描述、
  lunar.ts 月名日名、holiday.ts 节日名）→ domain 保留**枚举 key/数值**，label 迁到
  ui 字典（quadrant.* / repeat.* / lunar.* / holiday.* 命名空间）。
- 持久化在数据库的中文（db 包 DEFAULT_LAYERS 等）不在棘轮范围，保持原样。

## 7. 拿不准怎么办

- 语义拿不准 → 在 fragment 文件顶部 `/* TODO-REVIEW: ... */` 记录，仍然抽出来。
- 涉及数据结构/持久化的改动拿不准 → 不要改，在文件顶部记录并在交付说明里上报。
- **禁止**为了过 lint 而删功能或绕开（如把中文塞进注释里渲染）。

## 8. 批次验收（每批都要过）

1. `node scripts/i18n-allowlist.mjs` 后本批文件全部移出白名单；
2. `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` 通过；
3. `node node_modules/vitest/vitest.mjs run` 通过（因抽词失效的中文断言改成按
   当前语言断言：测试里用 `makeI18n('zh-CN')` 或 I18nProvider lang="zh-CN" 渲染后断言 zh 文本）;
4. zh-CN 渲染结果与原版**逐屏一致**（文案、标点、大小写全同）。
