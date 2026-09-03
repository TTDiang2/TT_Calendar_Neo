import { z } from 'zod'

/** 'YYYY-MM-DD' —— 全项目日期一律用本地日期字符串，绝不走 Date 的 UTC 序列化 */
export const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须是 YYYY-MM-DD')
export type DateStr = z.infer<typeof DateStr>

/** 'YYYY-MM-DD HH:MM:SS'（SQLite datetime('now','localtime') 的产物） */
export const DateTimeStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/, '时间格式应为 YYYY-MM-DD[ HH:MM[:SS]]')
export type DateTimeStr = z.infer<typeof DateTimeStr>

/** 'HH:MM' */
export const TimeStr = z.string().regex(/^\d{2}:\d{2}$/, '时间必须是 HH:MM')
export type TimeStr = z.infer<typeof TimeStr>

/** #rgb / #rrggbb / rgb() / rgba() */
export const ColorHex = z
  .string()
  .regex(/^(#([0-9a-f]{3}|[0-9a-f]{6})|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*[\d.]+)?\))$/i)
export type ColorHex = z.infer<typeof ColorHex>

/** SQLite 里以 INTEGER 0/1 存的布尔 */
export const SqliteBool = z.union([z.literal(0), z.literal(1)]).nullable().default(0)
export type SqliteBool = z.infer<typeof SqliteBool>

/** extra_json / config_json / rules 等自由形态 JSON 字段 */
export const JsonRecord = z.record(z.string(), z.unknown())
export type JsonRecord = z.infer<typeof JsonRecord>

/** 参与同步的表都会带 sync_uid + updated_at（见 SYNC_PROTOCOL.md） */
export const SyncFields = z.object({
  sync_uid: z.string().nullable().optional(),
  updated_at: DateTimeStr.nullable().optional(),
})
export type SyncFields = z.infer<typeof SyncFields>

/** 可空的 SQLite 时间戳（建表默认 datetime('now','localtime')） */
export const CreatedAt = DateTimeStr.nullable().optional()
export const UpdatedAt = DateTimeStr.nullable().optional()

/** 把可能是字符串/数组的东西规整成字符串数组 */
export const StringList = z
  .union([z.string(), z.array(z.string()), z.null()])
  .transform((v) => {
    if (v == null) return null
    if (Array.isArray(v)) return v
    if (v.trim() === '') return null
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed.map(String) : [String(v)]
    } catch {
      return v.split(',').map((s) => s.trim()).filter(Boolean)
    }
  })
  .nullable()
export type StringList = z.infer<typeof StringList>
