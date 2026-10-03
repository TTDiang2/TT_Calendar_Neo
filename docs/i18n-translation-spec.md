# i18n 翻译批次作业规范（P3，每语言一个批次）

> 前置：P1 抽词全部完成、zh-CN 主字典冻结后启动。本规范是各语言翻译批次的作业契约。

## 0. 产出物（每个语言批次交付两处）

1. **`packages/ui/src/i18n/dict/<lang>.ts`**：完整字典树，形态：
   ```ts
   import type { DeepPartialDict } from './types'
   import type { Dict } from './zh-CN'
   export const ja: DeepPartialDict<Dict> = { /* 全 key 翻译 */ }
   ```
   并在 `dict/index.ts` 的 `DICTS` 注册（该文件仅这一行改动）。
2. **`apps/mobile/widget/TTCalendarWidget.swift`** 的 `L10n.tables` 增加该语言表（33 条 key，
   对照 zh-CN/en 表；复数条目按 `<key>_one/_few/_many/_other` 提供该语言所需类别）。
   ⚠️ 该文件 8 个语言批次共享——**只允许新增自己语言的表**，不得动其他行。

## 1. 语义基准（Wisdom 定稿）

- **ja / ko / zh-Hant**：以 zh-CN 为语义基准（直译优于绕道英文）。
- **fr / es / ru**：以 en 为语义基准，参照 zh 消歧。
- 译文不追求逐字对应，追求**母语者自然表达**；界面标签宁短勿长（按钮/Tab 空间有限）。

## 2. 冻结术语表（必须全文一致，不得同词异译）

| key | zh-CN | en | ja | ko | fr | es | ru | zh-Hant |
|---|---|---|---|---|---|---|---|---|
| terms.todo | 待办 | To-dos | ToDo | 할 일 | Tâches | Tareas | Задачи | 待辦 |
| terms.event | 日程 | Event | 予定 | 일정 | Événement | Evento | Событие | 行程 |
| terms.countdown | 倒数日 | Countdowns | カウントダウン | 디데이 | Comptes à rebours | Cuentras atrás | Обратный отсчёт | 倒數日 |
| terms.layer | 图层 | Layers | レイヤー | 레이어 | Calques | Capas | Слои | 圖層 |
| terms.stats | 分析 | Analysis | 分析 | 통계 | Analyse | Análisis | Анализ | 分析 |
| terms.widgets | 小组件 | Widgets | ウィジェット | 위젯 | Widgets | Widgets | Виджеты | 小工具 |
| terms.quadrant | 四象限 | Quadrants | 4象限 | 4분면 | Quadrants | Cuadrantes | Квадранты | 四象限 |
| terms.lunar | 农历 | Lunar calendar | 旧暦 | 음력 | Calendrier lunaire | Calendario lunar | Лунный календарь | 農曆 |
| terms.coloring | 染色 | Coloring | クリップ | 채색 | Coloration | Coloreado | Раскраска | 塗色 |
| terms.anniversary | 纪念日 | Anniversary | 記念日 | 기념일 | Anniversaire | Aniversario | Годовщина | 紀念日 |
| 打卡（shell/widgets 语境） | 打卡 | Check-in | チェックイン | 체크인 | Pointage | Check-in | Отметка | 打卡 |

（未列出的专有词在批次内首译时定名，并在交付报告中追加到此表。）

## 3. 复数与插值（硬性）

- 复数条目（值为 `{ one, other }` 等）按目标语言 CLDR 类别补全：
  - en: one/other；fr: one/many(≥1e6)/other；es: one/other；ru: one/few/many/other；zh/ja/ko/zh-Hant: other
  - 结构测试会遍历 `Intl.PluralRules` 校验，缺类别直接红。
- **占位符纪律**：`{n}` `{name}` `{done}` `{total}` 等与源文一一对应，不得增删改名的；
  在译文中的位置按目标语言词序自由安排。
- 禁止拼接式翻译（把一句拆成多个 key）；译文必须是完整自然句。

## 4. 各语言细节要求

- **ja**：UI 文案用常体（だ・である調ではなく、です・ます調の短文）；按钮用体言止め（「保存」「削除」）。
- **ko**：按钮用명사형（「저장」「삭제」）；해요체/합쇼체 统一用 합쇼체 短句。
- **fr**：UI 空格规则由译文自然携带（法语冒号前窄空格在 UI 标签中省略亦可，但正文 key 保留）。
- **es**：多用动词原形做按钮；中性拉美/西班牙通用词汇（不用地区俚语）。
- **ru**：按钮用不定式；注意「N 天后」等与动词配合的格变化已由完整句 key 承担，选对 few/many 形态即可。
- **zh-Hant**：用台湾常用语（軟體/設定/資料）；「待办→待辦」「日程→行程」；不逐字对转简体。

## 5. 不得翻译的内容

- 用户数据占位（`{name}` 指代的日程/待办/倒数日名）原样保留。
- 品牌名 TT Calendar、语言名 endonym（日本語/Français…）不动。
- 农历/节气名：ja/ko 用当用汉字/汉字语（立春/雨水、입춘/우수）；en/fr/es/ru 的农历月日文案已在
  `lunar` fragment（"7th lunar month"式），保持风格一致。
- key 本身、注释、TODO-REVIEW 一律不动。

## 6. 质检门禁（每语言批次必须全过）

1. `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`（类型 + key 拼写全验）。
2. `node node_modules/vitest/vitest.mjs run packages/ui/src/i18n --reporter=dot`
   （结构测试：key 深度一致 + 复数类别齐全 + 插值参数一致）。
3. 交付时**自行回译抽查**：随机抽 20 条译文还原成中文，对照原义，偏差的当场修正；
   报告列出这 20 条（key → 译文 → 回译）。
4. 长度红线：按钮/Tab 类短标签译文不得超过 zh 原文 2 倍长度（ru/de 常见超长，
   用省略/缩写压回来，如 ru «Настройки» 可以，长解释句不行——那些不是按钮）。

## 7. 禁止事项

- 禁止改 zh-CN.ts / en.ts / fragments/*（那是基准，动了所有语言都要返工）。
- 禁止改组件代码（翻译批次只产出字典 + Swift 表）。
- 禁止机翻腔直出：每条译文过一遍「母语者会不会这么说」的自检。
