# TT Calendar 老端多语言适配手册（Handoff）

> 写给在老端仓库（TT_Calendar：Python tt_calendar sidecar + 旧版 frontend）施工 i18n 的 agent。
> 本手册提炼自 Neo 端（TT_Calendar_Neo）2026-10 的完整国际化施工（已过架构终审），所有决策、
> 流程与坑都是实战产出。按本手册顺序施工，可以避免 Neo 端返工过的大部分弯路。
>
> 通用原则：**改之前先读「§2 十二条定稿决策」**；每完成一个文件回到「§4 守门机制」确认棘轮在收窄。

---

## 0. 目标与范围（与 Neo 端对齐）

1. 所有用户**首次打开必须经过语言选择页**（系统语言只做预选高亮，必须显式确认）；此后可在设置中切换，**即时生效、无需刷新**。
2. 首发 8 语言：`zh-CN`（默认/翻译基准）、`zh-Hant`、`en`（pivot）、`ja`、`ko`、`fr`、`es`、`ru`。de/pt-BR 延后。
3. 覆盖面：全部 UI 文案、系统通知、桌面小组件（若有）、日期/星期/月份显示、农历与节假日名。
4. **不翻**：注释、用户数据（日程/待办/倒数日标题）、品牌名 TT Calendar、语言名 endonym。
5. 商店元数据（标题/关键词/描述的多语言）不在 App 内 i18n 范围。

---

## 1. 老端架构 ↔ Neo 端经验映射

| 老端构件 | 对应 Neo 端经验 |
|---|---|
| 旧 frontend/src（JS，Neo 曾从它逐字移植） | 抽词对象主体。JS 没有 TS 类型守门——见 §3.3「无 TS 时的 key 校验替代方案」 |
| tt_calendar/config.py（COLORING_LEVELS / ANNIVERSARY_OFFSETS / JISILU_QTYPES 等常量） | 「持久化数据 vs 显示文案」分类法的重点排查区（§5） |
| backend/aggregator.py（build_countdown_list / build_view 等） | **后端只出结构化数据，不出文案**（§5.1）；中文 label 一律改结构化标签 |
| utils/lunar_utils.py（lunar_display 返回中文串） | 改为返回数值信息，显示串在展示层按语言组装（§5.2） |
| 桌面壳/通知/托盘文案 | 与 Neo 的 reminders.ts 同类：非 React 场景用 `makeI18n(activeLang())` |

---

## 2. 十二条定稿决策（直接抄，含理由）

1. **自研轻量 i18n，不引框架**。唯一真难点是复数，`Intl.PluralRules` 一行解决（Node 与 WebView 都是 full-ICU）。TS 字典可带注释（翻译上下文），JSON 做不到。未来触发迁移的条件：服务端下发文案 / 语言 >15 / 需要 ICU 选择格式——字典保持纯嵌套对象可平滑迁 i18next。
2. **fallback 链终点是 zh-CN 不是 en**（zh-CN 是唯一人工可验证完整性的主字典）。链：自身 → 基础语言（zh-Hant→zh-CN）→ zh-CN。绝不允许空白 UI。
3. **语言解析规则写死**：全标签精确匹配（含 zh-Hans/zh-Hant/地区别名）→ 复合标签按 script 判（zh-Hant-HK→zh-Hant）→ 主语言匹配（en-GB→en）→ zh-CN 兜底。选择器显示 endonym（日本語/Français…）永不翻译，当前项打勾。
4. **语言值三处同步**：localStorage（App 内选择）+ 系统通知（切语言触发全量重排）+ 小组件快照（载荷带 `lang` 字段，渲染端据此选表并 reload）。只存 localStorage 是 Neo 端初版方案被评审打回的硬伤。
5. **复数条目存字典**：值为 `{ one, other, ... }`；zh/ja/ko 只有 `other`；en one/other；fr/es one/other（fr 另有 many ≥1e6）；ru one/few/many/other。**运行时按 `Intl.PluralRules` 选类别，缺类别回落 other**。结构测试遍历 n∈0..1500 + 10 的幂采样校验类别齐全——注意 ru 的 `other` 只用于小数，整数采样永远采不到，类别集合必须**无条件含 other**（Neo 端实测踩坑）。
6. **插值只用具名参数 `{name}`**，禁止位置参数；**禁止拼接式翻译**（`t('共') + n + t('项')`）——各语言词序不同，混排 JSX 必须**整句一个 key**。
7. **日期 pattern 永不进字典**。"M月d日 EEEE" 一律 `Intl.DateTimeFormat`（JS）/`setLocalizedDateFormatFromTemplate`（Swift）按 locale 产出。星期/月份数组禁止手写。数字用 `Intl.NumberFormat`（fr 千分位是窄空格）。相对天数用 `Intl.RelativeTimeFormat`（自带复数与介词）。
8. **一周起点统一周一**（对 ru/fr/es/ja/ko/zh 都正确）；美式周日开头留给 v1.2 用 `Intl.Locale.prototype.weekInfo` 做独立改动，不混进 i18n 轮。
9. **农历三档策略**：zh 全量汉字；ja/ko 翻译显示（旧暦/음력 有文化存在感）；**en/fr/es/ru 默认隐藏**（直译节气/农历是排版灾难），设置开关留 v1.2。判断函数 `isCJK(lang)`。
10. **domain/后端层零文案**：只出枚举 key 与结构化数据。中文 label 出现在 domain 的，一律迁到 UI 字典（Neo 端删除了 QUADRANT_LABELS 死代码、countdown 的中文 next_label 改结构化标签、lunar_display 改数值信息）。
11. **Swift/原生小组件用源码字典**，不用 Localizable.strings+lproj（NSLocalizedString 跟随系统语言，与「跟随 App 内选择」相悖；lproj 的 PBXVariantGroup 机器生成易碎）。日期格式用 ICU template。复数类别函数手写 8 语言规则即可（小组件场景 fr many 不出现）。
12. **App 显示名保留拉丁品牌名**，不做 InfoPlist.strings（收益一个词，坑一整套 lproj 生成）。

---

## 3. 字典架构（照抄 Neo 端结构）

### 3.1 目录

```
<前端源码根>/i18n/
  core.{ts,js}      # resolveLang / fallbackChain / isCJK / makeI18n / interpolate / pluralCategories
  store.{ts,js}     # localStorage 持久化 + 订阅（chooseLang/onLangChange/activeLang/hasChosenLang）
  runtime.{tsx,js}  # I18nProvider + useT/useTPlural/useLang（React 情形）
  format.{ts,js}    # fmtDate/fmtWeekday/fmtMonthName/fmtNumber/fmtRelativeDays（全部带缓存！）
  keys.ts           # TxKey/PluralKey 类型推导（TS 项目）
  dict/
    zh-CN.ts        # 主字典 = fragments 组装（各 fragment 导出 { zh, en } 两份）
    en.ts           # pivot
    fragments/      # common/terms/<模块命名空间>.ts —— 一个抽词批次一个文件，避免并行冲突
    ja.ts ko.ts fr.ts es.ts ru.ts zh-Hant.ts   # P3 产出，完整树
```

### 3.2 关键运行时纪律

- `t()` 只做五件事：嵌套查找 + fallback 链、具名插值、复数类别选择、缺 key dev 告警一次、**按 lang 记忆化**。
- `makeI18n(lang)` 按语言缓存单例；**Intl 格式化器必须按 locale+选项缓存**（月网格 42 格 × 每次渲染新建 DateTimeFormat 是真实性能事故源）。
- 无 Provider 场景（通知/启动日志/Worker）：`makeI18n(activeLang()).t(...)`，在**每次组装文案时**取（不要模块顶层缓存语言——切换后旧值）。
- 缺 key：dev console.warn 一次，生产静默回落 zh-CN，再缺显示 key 本身（永远不空白）。

### 3.3 无 TS 时的 key 校验替代方案

老端前端若为纯 JS：① 至少给字典文件开 `checkJs`；或 ② 写一个 vitest/jest 结构测试硬校验（见 §4.3），key 拼写错误靠「回译抽查 + 冒烟测试截图」兜底；或 ③ 构建 script 里加一步「扫描源码里的 `t('...')` 字面量，逐一查字典存在性」（20 行脚本，收益接近 TxKey）。

---

## 4. 守门机制（Neo 端核心发明，务必照搬）

### 4.1 先守门、后抽词（棘轮式）

**顺序错了全盘返工**：先让规则上线、存量文件进白名单，然后每抽完一个文件移出白名单。任何新中文都进不来。

1. ESLint 规则（flat config 片段）：

```js
// no-restricted-syntax 三条 selector：
{ selector: 'Literal[value=/[\\u4e00-\\u9fff]/]', message: 'UI 字符串字面量含中文：必须走 t()' }
{ selector: 'JSXText[value=/[\\u4e00-\\u9fff]/]',  message: 'JSX 文本含中文：改为 {t(...)}' }
{ selector: 'TemplateElement[value.raw=/[\\u4e00-\\u9fff]/]', message: '模板串含中文：走 t() 具名插值' }
```
作用域 = 前端源码目录；豁免 = `__tests__`、`*.test.*`、`i18n/**`。**注释天然豁免**（不是 AST Literal）——「注释不翻译」自动满足。

2. 白名单脚本（Neo: `scripts/i18n-allowlist.mjs`）：用 ESLint JS API 以「只有中文规则」的配置扫全部作用域文件，有违规 → 留在 `eslint-i18n-allowlist.json`，无违规 → 移出。**坑**：独立 ESLint 实例必须显式挂 TS parser（`languageOptions.parser: tseslint.parser`），否则所有 TS 文件「解析失败」被当成违规，白名单虚高（Neo 端实测 65 vs 真实 43）。Windows 下偶尔 EBUSY/文件锁读到陈旧结果，**隔 2 秒重跑一次**再下结论。

3. 抽词批次 = 白名单逐文件清零。批次验收：`eslint` 零错 + `tsc` 过 + 测试过 + **zh-CN 渲染与原版逐屏一致**。

### 4.2 zh 逐屏一致红线

抽词期间 zh 译文与原版**逐字一致**（含全角标点、空格、emoji）。Intl 化引入的展示差异（如「10 月」→「10月」）逐处记录并显式裁决。宁可留着不合理，不可「顺手优化」——逐屏一致是抽词不出回归的唯一可机检代理。措辞统一（同义词多套词表合并）是抽词**之后**的独立任务。

### 4.3 结构测试（防翻译产出烂掉）

vitest/jest 一套四查（Neo: `i18n-structure.test.ts`，注册新语言自动纳入）：
1. 非复数 key：各语言与 zh-CN **深度相等**（双向：不多不少）；
2. 复数 key：`pluralCategories(lang)` 的每个类别都有对应后缀（含 other）；
3. 简单条目值都是字符串；
4. 插值占位符集合与 zh-CN 一致。
**守门必须自证会红**：测试里放一个「mutation 自检」（构造缺 key 的字典跑同一套检查，断言能查出）——守门测试自己没失败过等于没有守门。

### 4.4 其他必须的自动化

- 行为测试：语言切换即时生效（chooseLang 后同树文本变化，注意包 `act()`）；首启动选择页确认流；jsdom 的 `navigator.language` 恒 en-US——**测试显式控制语言，禁止依赖宿主默认**。
- golden 日期测试：8 语言星期/月份/相对天数/农历显示各取样断言（注意 CLDR standalone 月名与组合日期不同：zh 独立月名是「十月」，组合里是「10月」——都是对的，别写错断言）。
- **类型级 mutation**（TS 项目）：临时写 `t('common.confirmX')` 断言 `tsc` 编译失败，证明 TxKey 真的在工作。

---

## 5. 数据 vs 文案分类法（最容易翻车的地方）

### 5.1 判定流程

遇到每个中文字符串问三问：
1. 会**写进数据库/文件/快照**吗？（种子数据、默认名、meta 提示语）→ 是「数据」。
2. 会**被代码拿来做比较/判断**吗？（`category === '纪念日'`）→ 是「逻辑键」。
3. 只是渲染？→ 是「文案」，抽 t()。

**数据与逻辑键保持原样不动**（改了就是数据迁移事故），改为**显示时映射**：
- 内置/默认类数据：建「存储值 → 字典 key」映射表 + `zhDefault` 基准做改名检测（用户改过名 ≠ zh 默认名 → 显示用户名）。Neo: `adapt/layerLabel.ts`。
- 枚举类数据：domain 出结构化标签（`{kind:'solarAnniversary', years:3}`），UI 按语言组装文案。Neo: `CountdownLabel` + `adapt/labels.ts countdownLabelSuffix`。
- 自定义数据（用户输入的默认名随语言入库）：可接受，标注裁决即可（用户可改名，语义=用户数据）。

### 5.2 本产品已裁决的具体案例（老端同名结构直接套）

| 数据 | 裁决 |
|---|---|
| 默认图层 display_name（重要日期/待办/课程…） | 持久化数据，显示时映射 |
| 集思录订阅图层名（新股上市/可转债…） | 同上 |
| 倒数日分类（生日/纪念日/节日/重要事件/其他） | 存储值不变，显示映射；逻辑判断用 contracts 导出的常量 `COUNTDOWN_CATEGORY_ANNIVERSARY`，**禁止字面中文出现在 domain** |
| 倒数日 next_label（「3 周年」「800 天」「今年」） | 改结构化 `{kind, years/days}` |
| 农历显示串（七月初四/闰六月） | domain 只出 `{year,month,day,leap}`，显示层组装（初一只显月名、闰带「闰」等约定迁到显示层） |
| 节假日名（chinese_calendar 数据是中文） | 精确映射表，未收录原样显示 |
| 充实度档位（COLORING_LEVELS：key 是英文 Relaxed..） | key 小写映射字典，存储不动 |
| 调色板中文名（GRADED_PALETTES 的 绿/蓝/…） | **确认不持久化后**（存的是色值数组）改 ASCII key + 字典标签 |
| 四象限标签（QUADRANT_LABELS） | 若无消费者直接删；有消费者则改按 key 映射 |
| 纪念日偏移（ANNIVERSARY_OFFSETS「一周年/1314 天」） | 若持久化按数据处理；纯展示改 key |
| 同步提示写入 meta 的文案 | **已知未决**：持久化的组装文案语言会滞后。正解=meta 存结构化码+参数、展示时组装；涉及数据结构变更，单独排期 |

---

## 6. 通知 / 小组件 / 多进程「滞后带」（评审打回过初版方案的地方）

语言切换的生效面有三处 React 树之外的「滞后带」，漏一处就是「改了语言界面变了但通知/小组件还是旧语言」：

1. **已排期系统通知**：切语言 → 触发通知全量 cancel + 重排（挂在现有「数据变化 → nudgeReminders」钩子上，语言变化也走它）。
2. **桌面/主屏小组件**：数据快照带 `lang` 字段；原生侧读快照选文案表 + reload 时间线。文案表用源码字典（决策 #11），key 带 `<key>_one/_other` 后缀走复数函数。
3. **Worker/子进程**：Worker realm 没有 localStorage/navigator，`activeLang()` 会安全回落 zh-CN——主线程组装好的文案传下去，或 meta 存结构化码。**不要**假设语言全局可见。

---

## 7. 翻译生产流程（P3）

顺序严格执行（Neo 定稿）：
1. **术语表冻结**（每语言一列固定译法，含理由）。Neo 的 8 语术语表在 `docs/i18n-translation-spec.md §2`，直接抄。
2. **zh-CN 主字典**（每条 key 带使用场景注释——这是 AI 翻译质量的最大杠杆）→ **en**（pivot）。
3. **ja/ko 以 zh 为基准直译**（绕道 en 会丢语义）；**fr/es/ru 以 en 为基准**参照 zh 消歧；**zh-Hant** 从 zh-CN 转换 + 台港惯用语审校（軟體/設定/待辦）。
4. 每语言一个独立批次（agent），产出完整语言文件 + 原生小组件表；结构测试做硬门禁。
5. **质检三件套**：结构测试（自动）+ 回译抽查 ≥20 条/语言（报告归档）+ 长度审计（按钮/Tab 译文 ≤ zh 2 倍，ru 是重灾区）。质量定位：en/ja/ko 一等；fr/es/ru AI 质量上线，后续请母语者抽查。
6. 语体要求：ja 按钮「保存/削除」体言止め、说明句です・ます；ko 按钮 명사형 + 합쇼체；fr 冒号前空格随译文；es 中性拉美通用；ru 按钮不定式。
7. 农历月日名 ja 用「1月…12月/1日…30日」+ `閏` 前缀，daySep 空格；ko 类似（음력 1월…）。

---

## 8. 踩坑实录（Neo 端真实发生的，施工时对照规避）

**抽词/代码层**
1. JSX 混排 `<div>共 {n} 项</div>` 必须整句抽；局部变量名 `t`（tag/timer/循环变量）遮蔽翻译函数 `t`——抽词时顺手改名（tagName/intervalId/td）。
2. 模块级常量数组里的 label 改 `labelKey`，渲染时 `t(m.labelKey)`；参考 `TopBar.tsx` 的 MODES 写法。
3. 字典分组 key **禁止叫 `other`/`one`/`few`/`many`/`zero`**（会被结构测试误判为复数条目；Neo 端 tsc 实测报错后改名 `cat.misc`）。
4. aria-label / title / 无障碍文案也是用户可见文案，全抽。
5. 多行长文案按句拆 key；「键位高亮 span 夹在句子中间」拆前后两段或用哨兵占位（滚动数字节点用后者）。
6. `<b>` 加粗 span 抽句后可能丢失——文案不变但格式变，逐处记录裁决。
7. `console.*` 与开发者内部错误改英文（不进字典也不留中文——会破坏 grep 守门的一致性）。

**Intl 层**
8. ru 复数的 `other` 整数采样采不到（只用于小数）——类别集合无条件含 `other`。
9. zh 独立月份名是「十月」（CLDR standalone），组合日期才是「10月」——golden 断言别写混。
10. `Intl.RelativeTimeFormat` 的 zh 输出是「3天后」（无空格）、en 是「in 3 days」——它自带介词，别再造「N 天后」字典。
11. 日期锚点用本地时区构造（`new Date(2026,9,3)`），防 UTC 翻日。

**环境/工具层**
12. Worker/无 DOM 环境没有 localStorage/navigator——activeLang 安全回落 zh-CN，主线程组装文案再传入。
13. jsdom `navigator.language` 恒 en-US；无 Provider 的测试回落要固定 zh-CN（否则 CI 绿真机红）。
14. Windows + Git Bash：Node 22 PATH 必须显式 export；EBUSY/UNKNOWN 文件锁隔 2 秒重试；独立 ESLint 实例忘挂 TS parser 会让白名单虚高。
15. 全文中文 grep（`grep -rlP '[\x{4e00}-\x{9fff}'`）命中 ≠ 违规——注释与对象 key（`生日:` 是 Identifier）会命中；AST 级（eslint 规则）才是精确判据。
16. 正则提取字符串字面量时灾难性回溯会卡死——按行处理后逐行匹配。

---

## 9. 分阶段施工计划与验收（Neo 实际执行序列）

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 基建 | i18n 运行时 + zh/en 骨架 + 棘轮&白名单 + 结构测试 + mutation 验证 | 加中文串必红；删 en key 测试必红；App 视觉零变化 |
| P1 抽词 | 试点 1 文件定规范（写进 docs）→ 分批清空白名单；domain 常量迁出；formatters 落地 | 白名单归零；AST 级中文残留为零；zh 逐屏一致 |
| P2 语言选择 | 首启动选择页 + 设置项 + 三滞后带同步 | 新装必见选择页；切换即时生效；重启保持；通知/小组件跟随 |
| P3 翻译 | 术语冻结 → en → ja/ko → fr/es/ru → zh-Hant | 结构测试全绿；回译抽查报告归档；长度超限清零 |
| P4 原生小组件 | 源码字典 + lang 字段 + 复数函数 + 日期 template | CI 原生编译过；切语言后小组件文案/日期跟随 |
| P5 农历/日期 locale 化 | 三档策略 + Intl 化收尾 + golden 测试 | 非 CJK 默认无农历角标；golden 全绿 |

P4 与 P3 后半可并行；P5 必须在 P1 的 formatters 落地后开工。

## 10. 终审清单（泛化自 Neo 端 22 条，交审前自查）

命令级：干净检出全量验证绿；加中文串必红（棘轮生效性）；白名单空或条目有豁免注释；无 `t(..)+` 拼接；domain/后端零 i18n 依赖；TxKey 类型 mutation 红；`new Intl.*` 全部在缓存封装内；删任意语言任意 key 结构测试红；ru 1/2/5/21 天四种形态不同。
行为级：首启动必见选择页（endonym/预选/确认）；切换即时生效重启保持；缺 key 回落 zh-CN 无空白；IndexedDB 抽样核实枚举存的是 key 不是中文；用户数据原样。
原生级：CI 原生编译过；小组件语言/日期跟随；通知重排新语言且复数正确（en 1 day/2 days、ru 三形态）；Swift 表与 JS key 命名规则一致（文档化）。
翻译级：字典条目带上下文注释；回译抽查报告归档；长度审计无超限；术语表 4 词 × 8 语言全文一致（倒数日/图层/待办/订阅）。
真机级（Neo 亦待验）：375px 宽 4 语言目检无溢出（ru 重灾区）；权限弹窗等系统 UI 永远跟系统语言（产品预期，向用户说明）。

## 11. Neo 端可参考物索引（路径）

- 运行时：`packages/ui/src/i18n/`（core/store/runtime/format/keys）
- 字典：`packages/ui/src/i18n/dict/`（fragments/ 一批一文件）
- 守门：`eslint.config.js` 棘轮块 + `scripts/i18n-allowlist.mjs` + `packages/ui/src/i18n/__tests__/i18n-structure.test.ts`
- 显示时映射：`packages/ui/src/adapt/layerLabel.ts`、`adapt/labels.ts`
- 首启动页：`packages/ui/src/components/LanguagePickerScreen.tsx`
- Swift 小组件：`apps/mobile/widget/TTCalendarWidget.swift`（L10n enum）
- 测试：`i18n-runtime.test.tsx` / `i18n-language-switch.test.tsx` / `i18n-format-golden.test.tsx`
- 两份规范：`docs/i18n-extraction-spec.md`（抽词）、`docs/i18n-translation-spec.md`（翻译）
