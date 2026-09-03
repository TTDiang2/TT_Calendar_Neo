import { z } from 'zod'
import { ColorHex, DateTimeStr, JsonRecord } from './common'

/**
 * 图层：TT Calendar 的核心抽象。见 docs/ARCHITECTURE.md。
 *
 * 两条独立的标记链路，严禁混用：
 *  - 涂色（kind='color'）：背景染色，走 marks 表，**绝不进 events 表**
 *  - 点点（kind='dot'）：左上角色点，走 events 表（事件类）或 schedule_items（日程类）
 */

/** 图层大类 */
export const LayerKind = z.enum(['color', 'dot'])
export type LayerKind = z.infer<typeof LayerKind>

/**
 * 涂色图层的三种逻辑（docs/ARCHITECTURE.md §一）
 *  - solid  打卡：单色，只允许涂一种颜色
 *  - graded 完成度：一种颜色五种色阶
 *  - tag    关联：自动从 tag 关联过来
 */
export const LayerMode = z.enum(['solid', 'graded', 'tag'])
export type LayerMode = z.infer<typeof LayerMode>

/**
 * 日程的 5 个分类。旧版顶层 'schedule' 图层已弃用（AM/PM/EV 三段结构）。
 * 判断一个点点图层是否为日程类，依据是 config.category 是否在此枚举内，
 * **不是** layer_id 前缀（docs/ARCHITECTURE.md 红线 4）。
 */
export const SCHEDULE_CATEGORIES = ['work', 'course', 'sport', 'play', 'other'] as const
export const ScheduleCategory = z.enum(SCHEDULE_CATEGORIES)
export type ScheduleCategory = z.infer<typeof ScheduleCategory>

export const SCHEDULE_CATEGORY_LABELS: Record<ScheduleCategory, string> = {
  work: '工作',
  course: '课程',
  sport: '运动',
  play: '玩耍',
  other: '其他',
}

/**
 * 自动涂色图层：由系统计算/关联，**不允许手动新增涂色**，
 * 不出现在「新增涂色」下拉里（docs/ARCHITECTURE.md 红线 2）。
 */
export const AUTO_COLOR_LAYER_IDS = ['holiday', 'important', 'todo', 'todo_done'] as const
export const AutoColorLayerId = z.enum(AUTO_COLOR_LAYER_IDS)
export type AutoColorLayerId = z.infer<typeof AutoColorLayerId>

/** 内置图层 ID */
export const LayerId = z.object({
  SCHEDULE: z.literal('schedule'),
  IMPORTANT: z.literal('important'),
  COLORING: z.literal('coloring'),
  HOLIDAY: z.literal('holiday'),
  TODO: z.literal('todo'),
})
export const LAYER_IDS = {
  SCHEDULE: 'schedule',
  IMPORTANT: 'important',
  COLORING: 'coloring',
  HOLIDAY: 'holiday',
  TODO: 'todo',
  TODO_DONE: 'todo_done',
} as const

/** 自定义图层前缀（不依赖前缀区分类型，仅命名约定） */
export const CUSTOM_LAYER_PREFIX = 'custom_'
export const JISILU_LAYER_PREFIX = 'jisilu_'

/** 图层 config_json 的结构体（部分字段可选，历史数据可能缺） */
export const LayerConfigJson = z
  .object({
    mode: LayerMode.default('solid'),
    /** solid 模式单色 */
    color: ColorHex.nullish(),
    /** graded 模式 5 档调色板 */
    palette: z.array(ColorHex).nullish(),
    /** tag 模式关联的标签名 */
    tag: z.string().nullish(),
    /** 展示在侧栏/涂色条上的短标签 */
    label: z.string().nullish(),
    /** dot 图层且属于日程分类 → 该图层产出「日程」而非「事件」 */
    category: ScheduleCategory.nullish(),
    /** 集思录类图层的子动作过滤：[{qtype, sub_action}]，空/缺 = 不过滤 */
    sub_qtypes: z
      .array(
        z.object({
          qtype: z.string(),
          sub_action: z.string().nullable().optional(),
        }),
      )
      .nullish(),
  })
  .catchall(z.unknown())
export type LayerConfigJson = z.infer<typeof LayerConfigJson>

/** layer_config 表的行（SQLite 原样） */
export const LayerConfigRow = z.object({
  layer_id: z.string().nullable().optional(),
  display_name: z.string(),
  enabled: z.number().int().nullable().optional(),
  color: ColorHex.nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
  config_json: z.string().nullable().optional(),
  kind: LayerKind.nullable().optional(),
  group_name: z.string().nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
})
export type LayerConfigRow = z.infer<typeof LayerConfigRow>

/** 领域层用的图层（config 已反序列化，enabled 已是布尔） */
export const Layer = z.object({
  layer_id: z.string(),
  display_name: z.string(),
  enabled: z.boolean(),
  color: ColorHex.nullable(),
  sort_order: z.number().int(),
  kind: LayerKind,
  group: z.string().nullable(),
  config: JsonRecord,
})
export type Layer = z.infer<typeof Layer>

/** 行为契约：图层颜色锁定（docs/ARCHITECTURE.md 红线 3） */
export function parseLayerConfig(json: string | null | undefined): LayerConfigJson {
  if (!json) return LayerConfigJson.parse({})
  try {
    return LayerConfigJson.parse(JSON.parse(json))
  } catch {
    return LayerConfigJson.parse({})
  }
}

/** 该图层是否产出「日程」（带起止时间）而非「事件」（无时间） */
export function isScheduleLayer(layer: { kind?: string | null; config?: JsonRecord }): boolean {
  if (layer.kind !== 'dot') return false
  const category = layer.config?.category
  return typeof category === 'string' && (SCHEDULE_CATEGORIES as readonly string[]).includes(category)
}

/** 该图层是否允许手动新增涂色（自动涂色图层不可） */
export function canManuallyColor(layerId: string): boolean {
  return !(AUTO_COLOR_LAYER_IDS as readonly string[]).includes(layerId)
}
