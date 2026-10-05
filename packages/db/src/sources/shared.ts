/**
 * CSV 备份导入源的内部共享工具（2026-10 滴答清单导入任务书裁决 12：
 * 只留缝不建框架——这里只放「列别名匹配」「时间戳换算」两样跨源复用的东西，
 * 加上 CSV 基建（parseCsv / 结果结构）。不建注册表、不建 source 接口。
 */

// ---------- CSV 基建 ----------

/** CSV 导入统一返回结构（滴答清单 / generic 两条路径共用） */
export interface CsvImportResult {
  inserted: number
  lists_created: number
  /** 致命问题（坏行跳过/列缺失/编码拒绝），定位到 CSV 物理行号 */
  errors: string[]
  /** 非致命提示（滴答源：文件夹未迁移/RRULE 降维/未知优先级等；generic 恒为空） */
  warnings: string[]
  /** 数据源路由结果：'ticktick' = 识别为滴答清单备份并走专用解析器 */
  source: 'ticktick' | 'generic'
}

/**
 * 解析 CSV 文本为二维数组，并给出每行的起始物理行号（1 基）。
 * 支持引号内逗号/换行、BOM、CRLF；引号内换行占多行，lineOf 据此顺延，
 * 行号才能与文本编辑器里看到的物理行一致（errors 定位用）。
 * 全空行不产出（与既有 parseCsv 行为一致）。
 */
export function parseCsvDetailed(text: string): { rows: string[][]; lineOf: number[] } {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  const lineOf: number[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1 // 当前物理行（引号内换行也计入）
  let rowStart = 1 // 当前行起始物理行
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      if (c === '\n') line++
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      lineOf.push(rowStart)
      row = []
      field = ''
      line++
      rowStart = line
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
    lineOf.push(rowStart)
  }
  // 全空行剔除（行号数组同步剔除）
  const outRows: string[][] = []
  const outLines: number[] = []
  for (let k = 0; k < rows.length; k++) {
    if (rows[k]!.some((cell) => cell.trim() !== '')) {
      outRows.push(rows[k]!)
      outLines.push(lineOf[k]!)
    }
  }
  return { rows: outRows, lineOf: outLines }
}

/** 解析 CSV 文本为二维数组（支持引号内逗号/换行、BOM、CRLF） */
export function parseCsv(text: string): string[][] {
  return parseCsvDetailed(text).rows
}

// ---------- 共享工具 1：列别名匹配 ----------

/** 列别名表：字段 key → 可接受的表头写法（必须是「小写 + 去所有空白」的归一形态） */
export type ColumnAliases = Record<string, string[]>

/**
 * 表头行 → { 字段 key → 列下标 }；未命中的字段不出现在结果里（未知列自然忽略）。
 * 匹配前把表头归一为「小写 + 去所有空白」：'Task Id' / 'taskId' / '任务 ID' 同一形态，
 * 中英双别名由此覆盖（国内版列名未实证，宁多列别名不可硬编码单一拼写）。
 */
export function matchColumns(header: readonly string[], aliases: ColumnAliases): Record<string, number> {
  const norm = header.map((c) => c.trim().toLowerCase().replace(/\s+/g, ''))
  const out: Record<string, number> = {}
  for (const [key, names] of Object.entries(aliases)) {
    const idx = norm.findIndex((h) => names.includes(h))
    if (idx >= 0) out[key] = idx
  }
  return out
}

// ---------- 共享工具 2：时间戳换算（时区换算收口） ----------

/**
 * 备份时间戳：`2025-01-15T10:30:00+0000`（TickTick 官方形态，UTC 带偏移）。
 * 兼容秒省略、Z 后缀、±HHMM / ±HH:MM、空格分隔、date-only。
 */
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:([+-])(\d{2}):?(\d{2})|Z)?)?$/

interface ParsedTs {
  /** 自带偏移折算后的 UTC epoch 毫秒（无偏移按 UTC 解释——TickTick 导出即 UTC 形态） */
  epochMs: number
  /** 原串的日期部分 YYYY-MM-DD（全天/浮动任务：这部分就是本地日期，不得再换算） */
  datePart: string
  hasTime: boolean
}

function parseTs(raw: string): ParsedTs | null {
  const m = TS_RE.exec(raw.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, sign, oh, om] = m
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0))
  const offsetMin = sign ? (Number(oh) * 60 + Number(om)) * (sign === '-' ? -1 : 1) : 0
  return { epochMs: base - offsetMin * 60_000, datePart: `${y}-${mo}-${d}`, hasTime: h !== undefined }
}

// Intl.DateTimeFormat 构造很贵（5000 行逐个建会拖垮导入），按 tz+粒度缓存
const fmtCache = new Map<string, Intl.DateTimeFormat>()
const validTzCache = new Map<string, string | undefined>()

/** 校验 IANA 时区名；空/非法 → undefined（退回运行时本地时区） */
function validTz(tz: string | undefined | null): string | undefined {
  const key = tz ?? ''
  if (!key) return undefined
  if (validTzCache.has(key)) return validTzCache.get(key)
  let resolved: string | undefined
  try {
    new Intl.DateTimeFormat('en', { timeZone: key })
    resolved = key
  } catch {
    resolved = undefined
  }
  validTzCache.set(key, resolved)
  return resolved
}

function formatter(tz: string | undefined, withTime: boolean): Intl.DateTimeFormat {
  const key = `${validTz(tz) ?? '<local>'}|${withTime ? 't' : 'd'}`
  let f = fmtCache.get(key)
  if (!f) {
    // en-CA 的 formatToParts 逐字段给出数值型 YYYY/MM/DD（不受 locale 文案干扰）
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: validTz(tz),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' } : {}),
    })
    fmtCache.set(key, f)
  }
  return f
}

function partsInTz(
  epochMs: number,
  tz: string | undefined,
  withTime: boolean,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const num = (t: string) =>
    Number(
      formatter(tz, withTime)
        .formatToParts(new Date(epochMs))
        .find((p) => p.type === t)?.value ?? 0,
    )
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour'),
    minute: num('minute'),
    second: num('second'),
  }
}

interface TzReading {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  offsetMin: number
}

// Intl formatToParts 每次约百微秒，逐行换算 5000 行会吃掉大半导入预算。
// 偏移按「时区 + UTC 小时桶」缓存：IANA 多数时区的 DST 切换落在 UTC 整点（例外如 Australia/Lord_Howe 在半点切换，秒级 stamp 最坏偏 ≤30 分钟，日期粒度不受影响），
// 同一小时桶内的读数必然相同（备份时间戳批量换算的命中近乎 100%）。
const tzReadingCache = new Map<string, TzReading>()

function tzReading(epochMs: number, tz: string | undefined): TzReading {
  const key = `${tz ?? ''}|${Math.floor(epochMs / 3_600_000)}`
  let r = tzReadingCache.get(key)
  if (!r) {
    const p = partsInTz(epochMs, tz, true)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    r = { ...p, offsetMin: Math.round((asUtc - epochMs) / 60_000) }
    if (tzReadingCache.size > 200_000) tzReadingCache.clear() // 兜底：超大跨度导入不撑爆内存
    tzReadingCache.set(key, r)
  }
  return r
}

const p2 = (n: number) => String(n).padStart(2, '0')
const p4 = (n: number) => String(n).padStart(4, '0')

/**
 * 备份时间戳 → 本地日期 'YYYY-MM-DD'（时区换算收口：所有日期换算都走这一个函数）。
 *  - 带时间的时间戳【一律】按时区换算到 timezone 再取日期：
 *    · All Day 任务：真实 dida365 导出实证（2026-10，fixtures/dida365-real-export.csv）
 *      表明全天任务的本地日期被写成「本地午夜的 UTC 时刻」（本地 10-05 00:00 →
 *      10-04T16:00+0000），不换算会整体偏移一天（智者硬伤 2 的实证场景）；
 *      （`2025-01-15T16:00:00+0000` + Asia/Shanghai → 次日 2025-01-16）
 *    · Floating 浮动任务例外：用户只表达纯日期意图（无时区概念），取串的日期部分，
 *      不换算（isFloating=true 短路）。
 *  - date-only 串（无时间成分）原样返回；空/无法解析返回 null
 */
export function tsToLocalDate(raw: string, timezone: string | undefined, isFloating = false): string | null {
  const ts = parseTs(raw)
  if (!ts) return null
  if (isFloating || !ts.hasTime) return ts.datePart
  const r = tzReading(ts.epochMs, timezone)
  return `${p4(r.year)}-${p2(r.month)}-${p2(r.day)}`
}

/**
 * 备份时间戳 → 本地时刻 'YYYY-MM-DD HH:mm:ss±HH:MM'（Created/Completed Time 落库形态，
 * 与 backend now() 的带偏移格式对齐，忙度 done 染色按前 10 位日期取日）。
 * 与 tsToLocalDate 共用同一 parseTs/tzReading 核心，只是输出形态不同。
 */
export function tsToLocalStamp(raw: string, timezone: string | undefined): string | null {
  const ts = parseTs(raw)
  if (!ts) return null
  if (!ts.hasTime) return `${ts.datePart} 00:00:00`
  const r = tzReading(ts.epochMs, timezone)
  const a = Math.abs(r.offsetMin)
  const suffix = `${r.offsetMin < 0 ? '-' : '+'}${p2(Math.floor(a / 60))}:${p2(a % 60)}`
  return `${p4(r.year)}-${p2(r.month)}-${p2(r.day)} ${p2(r.hour)}:${p2(r.minute)}:${p2(r.second)}${suffix}`
}
