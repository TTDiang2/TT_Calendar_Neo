/**
 * 集思录投资日历源（移植自 legacy Python `tt_calendar/sources/jisilu.py`）。
 *
 * API（Playwright 抓真实请求确认，无需登录，但要带浏览器样 headers）：
 *   GET https://www.jisilu.cn/data/calendar/get_calendar_data/
 *       ?qtype=<TYPE>&start=<unix秒>&end=<unix秒>&_=<unix毫秒>
 * 返回 JSON 数组 [{id, code, title, start, description, url, color}, ...]；
 * 该 qtype 无数据时返回字面 `false`。
 *
 * 落库语义（对齐 legacy）：
 *   - 每个事件 layer_id = `jisilu_<qtype>`，source = 'jisilu'，
 *     source_ref = `<qtype>:<id>` —— (layer_id, source_ref) 唯一，重复导入是更新
 *   - 图层缺失时自动补建（sort_order ≥ 10，设置面板按此识别 jisilu 区块）
 */

import type { CalEvent, DateStr } from '@tt-calendar/contracts'

import type { SqliteBackend } from '../backend'

export const JISILU_CALENDAR_API = 'https://www.jisilu.cn/data/calendar/get_calendar_data/'
export const JISILU_LAYER_PREFIX = 'jisilu_'

/** qtype → 显示名/默认颜色/是否默认启用（与 legacy config.JISILU_QTYPES 一致） */
export const JISILU_QTYPES: Record<string, { label: string; enabled: boolean; color: string }> = {
  newstock_onlist: { label: '新股上市', enabled: true, color: '#FF7043' },
  newstock_apply: { label: '新股申购', enabled: true, color: '#FF8A65' },
  CNV: { label: '可转债', enabled: true, color: '#FFB300' },
  CBDIV: { label: '正股分红', enabled: true, color: '#9CCC65' },
  cnreits: { label: 'REITs', enabled: true, color: '#26A69A' },
  FUND: { label: '基金', enabled: false, color: '#5C6BC0' },
  BOND: { label: '债券', enabled: false, color: '#78909C' },
  STOCK: { label: '股票', enabled: false, color: '#42A5F5' },
  OTHER: { label: '其它', enabled: false, color: '#B0BEC5' },
  newbond_apply: { label: '新债申购', enabled: true, color: '#FFA726' },
  newbond_onlist: { label: '新债上市', enabled: true, color: '#FB8C00' },
  diva: { label: 'A股分红', enabled: true, color: '#66BB6A' },
  divhk: { label: 'H股分红', enabled: true, color: '#26C6DA' },
  idxfut: { label: '股指期货', enabled: true, color: '#EF5350' },
  idxopt: { label: '股指期权', enabled: true, color: '#EC407A' },
}

export const JISILU_DEFAULT_QTYPES = Object.entries(JISILU_QTYPES)
  .filter(([, info]) => info.enabled)
  .map(([qt]) => qt)

const JISILU_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  Referer: 'https://www.jisilu.cn/data/calendar/',
  'X-Requested-With': 'XMLHttpRequest',
}

const JISILU_TIMEOUT_MS = 15_000

/** 'YYYY-MM-DD' → 当地零点的 unix 秒 */
function dayStartTs(dateStr: string): number {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error(`日期格式应为 YYYY-MM-DD：${dateStr}`)
  return Math.floor(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() / 1000)
}

/** 集思录的 start 字段容错解析：unix 秒/毫秒、ISO、'YYYY-MM-DD …' → 'YYYY-MM-DD' */
export function tryParseJisiluDate(raw: string): DateStr | null {
  const s = raw.trim()
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10)
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString().slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** HTML → 纯文本（去标签 + 常见实体 + 折叠空白） */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** 单条原始 item → 导入事件；解析失败返回 null（跳过） */
export function parseJisiluItem(
  item: Record<string, unknown>,
  qtype: string,
): Omit<CalEvent, 'id'> | null {
  const d = tryParseJisiluDate(String(item['start'] ?? ''))
  if (!d) return null
  const title = String(item['title'] ?? '').trim()
  if (!title) return null
  const color = item['color'] ? String(item['color']) : null
  const extra: Record<string, unknown> = { qtype }
  if (item['code']) extra['code'] = String(item['code'])
  if (item['url']) extra['url'] = `https://www.jisilu.cn${String(item['url'])}`
  return {
    layer_id: `${JISILU_LAYER_PREFIX}${qtype}`,
    source: 'jisilu',
    date: d as DateStr,
    title,
    description: htmlToPlain(String(item['description'] ?? '')) || null,
    color,
    source_ref: `${qtype}:${String(item['id'] ?? '')}`,
    extra,
    sort_key: 0,
  }
}

export interface FetchJisiluOptions {
  start: string
  end: string
  /** 缺省 = legacy 默认启用集 */
  qtypes?: string[]
  fetchImpl?: typeof fetch
}

export interface JisiluFetchResult {
  events: Omit<CalEvent, 'id'>[]
  /** 每 qtype 的错误（HTTP 非 200 / 响应异常），join 后作为 error 字段 */
  errors: string[]
}

/** 拉取 [start, end] 区间内所有请求 qtype 的事件（并发 4 路，防反爬） */
export async function fetchJisiluEvents(opts: FetchJisiluOptions): Promise<JisiluFetchResult> {
  const qtypes = opts.qtypes?.length ? opts.qtypes : JISILU_DEFAULT_QTYPES
  const startTs = dayStartTs(opts.start)
  const endTs = dayStartTs(opts.end) + 86399
  const ms = Date.now()
  const f = opts.fetchImpl ?? fetch
  const errors: string[] = []
  const events: Omit<CalEvent, 'id'>[] = []

  const fetchOne = async (qtype: string): Promise<void> => {
    const url =
      `${JISILU_CALENDAR_API}?qtype=${encodeURIComponent(qtype)}` +
      `&start=${startTs}&end=${endTs}&_=${ms}`
    try {
      const resp = await f(url, { headers: JISILU_HEADERS, signal: AbortSignal.timeout(JISILU_TIMEOUT_MS) })
      if (!resp.ok) {
        errors.push(`${qtype}: HTTP ${resp.status}`)
        return
      }
      const data: unknown = await resp.json()
      if (data === false || data === 'false') return // 该 qtype 无数据，不算错误
      if (!Array.isArray(data)) {
        errors.push(`${qtype}: unexpected response ${JSON.stringify(data).slice(0, 80)}`)
        return
      }
      for (const item of data) {
        const ev = parseJisiluItem(item as Record<string, unknown>, qtype)
        if (ev) events.push(ev)
      }
    } catch (e) {
      errors.push(`${qtype}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const CHUNK = 4
  for (let i = 0; i < qtypes.length; i += CHUNK) {
    await Promise.all(qtypes.slice(i, i + CHUNK).map(fetchOne))
  }
  return { events, errors }
}

/**
 * 完整导入流程：拉取 → 补建缺失的 jisilu 图层（sort_order=10）→ 按
 * (layer_id, source_ref) upsert。返回 { inserted, error }，与
 * BackendAdapter.importJisilu 的返回形态一致。
 */
export async function runJisiluImport(
  backend: SqliteBackend,
  opts: { start: string; end: string; qtypes?: string[]; fetchImpl?: typeof fetch },
): Promise<{ inserted: number; error: string | null }> {
  const { events, errors } = await fetchJisiluEvents(opts)
  const qtypes = new Set(
    events.map((e) => (e.extra as { qtype?: string })['qtype'] ?? '').filter(Boolean),
  )
  const existing = new Set(backend.getLayers().map((l) => l.layer_id))
  for (const qtype of qtypes) {
    const layerId = `${JISILU_LAYER_PREFIX}${qtype}`
    if (existing.has(layerId)) continue
    const meta = JISILU_QTYPES[qtype]
    backend.ensureLayer({
      layer_id: layerId,
      display_name: meta?.label ?? qtype,
      color: meta?.color ?? null,
      sort_order: 10,
    })
  }
  const inserted = backend.upsertImportedEvents(events)
  return { inserted, error: errors.length ? errors.join('; ').slice(0, 300) : null }
}

// ---------------------------------------------------------------------------
// 订阅刷新（source_key = 'jisilu' 的分发分支；其余 source_key = pending_adaptation，
// 与 legacy routes.py 的 _refresh_one_subscription 语义一致）
// ---------------------------------------------------------------------------

export interface SubscriptionLike {
  id: string
  source_key: string
  last_synced_at?: string | null
  enabled?: number | boolean | null
  auto_update?: number | boolean | null
}

export interface RefreshOutcome {
  id: string
  ok: boolean
  inserted?: number
  error?: string
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() + days)
  return isoDate(dt)
}

/**
 * 刷新单个订阅：jisilu 源按「上次成功刷新 → 今天+90 天」增量区间抓取并
 * upsert；其余 source_key 返回 pending_adaptation（等 agent 现场适配）。
 */
export async function refreshSubscriptionOnBackend(
  backend: SqliteBackend,
  sub: SubscriptionLike,
  fetchImpl?: typeof fetch,
): Promise<RefreshOutcome> {
  if (sub.source_key !== 'jisilu') {
    return { id: sub.id, ok: false, error: 'pending_adaptation：该订阅源尚未实装' }
  }
  const today = isoDate(new Date())
  const floor = addDays(today, -180)
  const last = sub.last_synced_at?.slice(0, 10) ?? ''
  const start = last && last > floor ? last : floor
  const end = addDays(today, 90)
  try {
    const r = await runJisiluImport(backend, { start, end, fetchImpl })
    if (r.error) {
      backend.touchSubscriptionSynced(sub.id, 'error', r.error)
      return { id: sub.id, ok: false, inserted: r.inserted, error: r.error }
    }
    backend.touchSubscriptionSynced(sub.id, 'active')
    return { id: sub.id, ok: true, inserted: r.inserted }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    backend.touchSubscriptionSynced(sub.id, 'error', msg)
    return { id: sub.id, ok: false, error: msg }
  }
}

/** 到期自动刷新：枚举 enabled && auto_update 的订阅逐个刷新 */
export async function refreshDueOnBackend(
  backend: SqliteBackend,
  fetchImpl?: typeof fetch,
): Promise<{ refreshed: RefreshOutcome[] }> {
  const due = backend
    .getSubscriptions()
    .filter((s) => s.enabled && s.auto_update)
  const refreshed: RefreshOutcome[] = []
  for (const sub of due) {
    refreshed.push(await refreshSubscriptionOnBackend(backend, sub, fetchImpl))
  }
  return { refreshed }
}
