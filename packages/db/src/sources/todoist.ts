/**
 * Todoist 导入（API token 路线：拉快照 → 一次落库）。
 *
 * 路线裁决（智者定稿 2026-10）：
 *  - 只走 API token 主路线，base 常量唯一：https://api.todoist.com/api/v1/
 *    （旧 /sync/v9 与 /rest/v2 已 410 退役，绝不出现/绝不 fallback）。
 *  - CSV 备份 ZIP 路线完全不做，四条硬伤（任何一条都足以否决）：
 *      1) 免费版墙：automatic_backups:false，免费账号拿不到备份 ZIP；
 *      2) 备份 CSV 无 labels 列，标签数据整体丢失；
 *      3) DATE 列是自然语言（"every day" 等），机器不可靠解析；
 *      4) 备份不含已完成任务，历史时间线断裂。
 *    项目模板 CSV 同样不做（同为天然语言日期 + 无已完成）。
 *
 * token 安全（硬纪律）：
 *  - token 只存在于本次调用的闭包里，用后即弃：不写 meta/config/文件/日志；
 *  - 错误消息与异常零 token 回显（报错只拼 method + path + status，重试路径
 *    的 AbortError 组装同理；token 只进 Authorization 头，绝不进任何字符串拼装）；
 *  - 前端空/空白 token 拦截不发请求；确认导入完成后 UI setToken('')（UI 层职责）。
 *
 * 拉取语义：全部端点拉完才落库（fetchTodoistSnapshot 与 importTodoistOnBackend
 * 分离）——拉取阶段重试耗尽抛错时一次都没进 importTodosBatch，天然「整体失败零落库」。
 * 顺序：/projects → /sections → /labels + /labels/shared → /tasks → 已完成分窗。
 *
 * 字段映射（Todoist API v1 task → Neo todo，只取所需 + 空值兜底，不建校验框架）：
 *  - content trim → title（空 → 跳过 + error，标 task id：API 源无 CSV 物理行号）
 *  - description 非空 → body 原样多行；content 不入 body（Todoist 无标题/正文
 *    二分，content 即标题——与滴答 Content 列语义不同，禁止拼接）
 *  - labels → tags
 *  - parent_id 非空 → title 前缀「↳ 」（无条件加）
 *  - child_order → sort_order；added_at → created_at；completed_at → completed_at
 *    （Todoist datetime 可能带 6 位微秒 ".000000Z"——shared.ts 冻结不许改，
 *    在本文件本地剥 /\.\d+/ 再喂 tsToLocalStamp / tsToLocalDate）
 *  - due.date → due_date 经 shared.tsToLocalDate：date-only 原样；带时间按
 *    due.timezone 换算；无 timezone 的 datetime 按浮动（floating=true 取日期部分）。
 *    （契约里的「due_date/start_date」按「日期字段的换算规则」理解：Todoist 无
 *    start 概念，start_date 不写，避免把截止日污染进详情面板的「开始日期」）
 *  - priority 折档（Neo 枚举无 medium；Todoist 4=客户端 p1 最高）：
 *      4 → high；3 → normal；2 → low；1 → normal；未知值 → normal + 聚合 warning
 *  - is_recurring → 不设 repeat + body 追加一行「重复（未迁移）：{due.string 原文}」
 *    + 聚合 warning「N 个重复规则未迁移」（聚合不逐行）
 *  - deadline / duration → 忽略 + 各自聚合 warning
 *  - comments 零请求：note_count 求和 → 聚合 warning「N 条备注未迁移」
 *  - completed_at 非空或来自 completed 端点 → status=completed
 *
 * project → 清单：按需创建（首条任务落进来才建，不产空清单）；section 非空 →
 * 清单名 `${projectName} / ${sectionName}`（双方 trim）；project_id 特殊值
 * （inbox 或不在已拉项目集合的孤儿）→「收件箱」清单 + 聚合 warning；archived
 * project → 普通清单 + 聚合 warning「N 个已归档项目按普通清单导入」。
 */

import pRetry, { AbortError } from 'p-retry'

import type { SqliteBackend } from '../backend'
import { tsToLocalDate, tsToLocalStamp } from './shared'

/** 唯一 base：旧 /sync/v9、/rest/v2 已 410 退役，禁止出现/fallback */
const TODOIST_API_ROOT = 'https://api.todoist.com/api/v1/'

/** 收件箱/孤儿项目任务的兜底清单名（清单名是用户数据，不走 i18n，与滴答先例一致） */
const INBOX_LIST_NAME = '收件箱'

/** 已完成任务回溯：3 个月一窗、硬上限 20 窗（5 年），触顶聚合 warning */
const COMPLETED_WINDOW_MONTHS = 3
const COMPLETED_MAX_WINDOWS = 20

/** 401/403 的用户引导文案（fetch 失败的原样抛出；UI 传输层会按语言重排） */
const AUTH_HINT = 'token 无效或已过期，请在 Todoist 设置 → Integrations → Developer 重新复制'

/** 401/403 专用错误类型：server 据此回 401 + code='todoist_auth'，UI 按语言重排文案 */
export class TodoistAuthError extends Error {
  constructor(message = AUTH_HINT) {
    super(message)
    this.name = 'TodoistAuthError'
  }
}

// ---------- 快照形态（API 响应原样条目；只按需取字段，空值兜底） ----------

/** API 响应条目原样保留（projects 含 archived 与否是真机验证项，保留原始形态便于复核） */
export type TodoistRaw = Record<string, unknown>

export interface TodoistSnapshot {
  /** GET /projects（原样保留，含 archived 与否是真机验证项） */
  projects: TodoistRaw[]
  /** GET /sections（cursor 翻页） */
  sections: TodoistRaw[]
  /** GET /labels + GET /labels/shared 合并 */
  labels: TodoistRaw[]
  /** GET /tasks（cursor 翻页全量，活跃任务） */
  tasks: TodoistRaw[]
  /** GET /tasks/completed/by_completion_date（3 个月窗从 now 向过去翻页） */
  completed: TodoistRaw[]
}

/** 读取进度回调（stage = 正在拉取的端点名） */
export type TodoistProgressStage = 'projects' | 'sections' | 'labels' | 'tasks' | 'completed'

export interface FetchTodoistOptions {
  /** 注入 fetch（测试零真实网络；缺省全局 fetch） */
  fetchImpl?: typeof fetch
  /** 拉取进度（每个端点开始时回调一次） */
  onProgress?: (stage: TodoistProgressStage) => void
}

// ---------- 取值兜底（响应字段只取所需，不建校验框架） ----------

function str(o: TodoistRaw, key: string): string {
  const v = o[key]
  return typeof v === 'string' ? v : ''
}

function num(o: TodoistRaw, key: string): number | null {
  const v = o[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function bool(o: TodoistRaw, key: string): boolean {
  return o[key] === true
}

/** 任务对象的 due 子对象（非对象一律 null） */
function dueOf(t: TodoistRaw): TodoistRaw | null {
  const d = t['due']
  return d !== null && d !== undefined && typeof d === 'object' ? (d as TodoistRaw) : null
}

/**
 * 剥离 Todoist datetime 的 6 位微秒（.000000Z）：shared.ts 冻结不许改，
 * 其 TS_RE 不认小数秒，本地剥掉再喂（date-only 无点号，原样通过）。
 */
function stripMicro(raw: string): string {
  return raw.replace(/\.\d+/g, '')
}

// ---------- HTTP（重试 + 零 token 回显） ----------

/** 可重试的瞬时失败：429 / 5xx（401/403 等语义错误不重试，照 github.ts 先例） */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * 单次 GET（p-retry 包裹）：429/5xx 指数退避+抖动最多重试 3 次。
 * 报错只拼 method + path + status，零 token 回显（token 只进 Authorization 头）。
 * 401/403 → AbortError(TodoistAuthError)：p-retry 对 AbortError 抛其 originalError，
 * 调用方拿到的就是 TodoistAuthError 本尊（不再重试）。
 */
async function apiGet(fetchImpl: typeof fetch, token: string, path: string): Promise<unknown> {
  return pRetry(
    async () => {
      // fetch 自身的拒绝（网络抖动）默认就会被 p-retry 重试
      const res = await fetchImpl(`${TODOIST_API_ROOT}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!res.ok) {
        // 报错只拼 method + path + status（响应体可能回显请求内容，不拼）
        const msg = `Todoist API GET ${path} → ${res.status}`
        if (res.status === 401 || res.status === 403) throw new AbortError(new TodoistAuthError())
        if (isTransientStatus(res.status)) throw new Error(msg)
        throw new AbortError(msg)
      }
      return (await res.json()) as unknown
    },
    { retries: 3, minTimeout: 500, maxTimeout: 4000, randomize: true },
  )
}

/** 响应 → 条目数组：{results}|{items}|纯数组 三种形态都接（空值兜底，不建框架） */
function resultsOf(data: unknown): TodoistRaw[] {
  if (Array.isArray(data)) return data as TodoistRaw[]
  if (data !== null && data !== undefined && typeof data === 'object') {
    const o = data as TodoistRaw
    if (Array.isArray(o['results'])) return o['results'] as TodoistRaw[]
    if (Array.isArray(o['items'])) return o['items'] as TodoistRaw[]
  }
  return []
}

/** 响应的 next_cursor（非空字符串才续翻） */
function nextCursorOf(data: unknown): string | null {
  if (data !== null && data !== undefined && typeof data === 'object') {
    const c = (data as TodoistRaw)['next_cursor']
    if (typeof c === 'string' && c) return c
  }
  return null
}

/** cursor 翻页拉全一个端点 */
async function apiGetAll(
  fetchImpl: typeof fetch,
  token: string,
  basePath: string,
): Promise<TodoistRaw[]> {
  const out: TodoistRaw[] = []
  let cursor: string | null = null
  do {
    const q = cursor
      ? `${basePath}${basePath.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`
      : basePath
    const data = await apiGet(fetchImpl, token, q)
    out.push(...resultsOf(data))
    cursor = nextCursorOf(data)
  } while (cursor)
  return out
}

/** RFC3339 时刻（去毫秒，Todoist 接受 RFC3339） */
function rfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * 已完成任务：GET /tasks/completed/by_completion_date，从 now 向过去按 3 个月窗
 * 翻页；硬上限 20 窗（5 年）触顶聚合 warning；空窗即停（更早的必然为空的前提
 * 不成立时由触顶 warning 兜底）。
 */
async function fetchCompleted(
  fetchImpl: typeof fetch,
  token: string,
  warnings: string[],
): Promise<TodoistRaw[]> {
  const out: TodoistRaw[] = []
  let until = new Date()
  for (let w = 0; w < COMPLETED_MAX_WINDOWS; w++) {
    const since = new Date(until)
    since.setMonth(since.getMonth() - COMPLETED_WINDOW_MONTHS)
    const path =
      `/tasks/completed/by_completion_date` +
      `?since=${encodeURIComponent(rfc3339(since))}&until=${encodeURIComponent(rfc3339(until))}`
    const items = await apiGetAll(fetchImpl, token, path)
    out.push(...items)
    if (items.length === 0) return out // 空窗即停
    until = since
  }
  warnings.push(
    `已完成任务仅回溯 ${COMPLETED_MAX_WINDOWS * COMPLETED_WINDOW_MONTHS} 个月（上限），更早的未导入`,
  )
  return out
}

// ---------- 快照拉取 ----------

export interface TodoistFetchResult {
  snapshot: TodoistSnapshot
  /** 拉取阶段的聚合 warning（目前只有已完成 20 窗触顶） */
  warnings: string[]
}

/** 顺序拉取全部端点（只读不落库；token 只活在本次调用的闭包里） */
export async function fetchTodoistSnapshot(
  token: string,
  opts: FetchTodoistOptions = {},
): Promise<TodoistFetchResult> {
  const f = opts.fetchImpl ?? fetch
  const warnings: string[] = []
  const report = opts.onProgress ?? ((): void => {})

  report('projects')
  const projects = await apiGetAll(f, token, '/projects') // 原样保留（真机验证项）
  report('sections')
  const sections = await apiGetAll(f, token, '/sections')
  report('labels')
  const labels = [
    ...(await apiGetAll(f, token, '/labels')),
    ...(await apiGetAll(f, token, '/labels/shared')),
  ]
  report('tasks')
  const tasks = await apiGetAll(f, token, '/tasks')
  report('completed')
  const completed = await fetchCompleted(f, token, warnings)

  return { snapshot: { projects, sections, labels, tasks, completed }, warnings }
}

// ---------- 落库编排 ----------

/** 拉取预览计数（confirm=false 时 server 返回给 UI 展示） */
export interface TodoistPreview {
  projects: number
  tasks: number
  completed: number
}

export function todoistPreview(snapshot: TodoistSnapshot): TodoistPreview {
  return {
    projects: snapshot.projects.length,
    tasks: snapshot.tasks.length,
    completed: snapshot.completed.length,
  }
}

export interface TodoistImportResult {
  inserted: number
  lists_created: number
  errors: string[]
  warnings: string[]
  source: 'todoist'
}

/**
 * 快照 → Neo（复用 backend.importTodosBatch，一次事务；复用失败整体抛错零落库）。
 * 纯同步：拉取已完成才有快照，落库阶段不再碰网络（comments 零请求）。
 */
export function importTodoistOnBackend(
  backend: SqliteBackend,
  snapshot: TodoistSnapshot,
): TodoistImportResult {
  const errors: string[] = []
  const warnings: string[] = []

  // ---- project → 清单名解析表（is_inbox_project → 收件箱；archived 照常建清单） ----
  const projectNames = new Map<string, string>()
  const archivedProjectIds = new Set<string>()
  for (const p of snapshot.projects) {
    const id = str(p, 'id').trim()
    if (!id) continue
    if (bool(p, 'is_inbox_project')) {
      projectNames.set(id, INBOX_LIST_NAME)
      continue
    }
    projectNames.set(id, str(p, 'name').trim() || INBOX_LIST_NAME)
    if (bool(p, 'is_archived')) archivedProjectIds.add(id)
  }

  const sectionNames = new Map<string, string>()
  for (const s of snapshot.sections) {
    const id = str(s, 'id').trim()
    const name = str(s, 'name').trim()
    if (id && name) sectionNames.set(id, name)
  }

  // ---- 清单复用/按需创建（首条任务落进来才建，不产空清单） ----
  const listIds = new Map<string, string>()
  for (const l of backend.getTodoLists()) listIds.set(l.display_name, l.id)
  let listsCreated = 0
  const listIdOf = (name: string): string => {
    const hit = listIds.get(name)
    if (hit) return hit
    const created = backend.createTodoList(name)
    listIds.set(name, created.id)
    listsCreated += 1
    return created.id
  }

  type ImportRow = Parameters<SqliteBackend['importTodosBatch']>[0][number]
  const batchRows: ImportRow[] = []

  // ---- 聚合计数（聚合 warning，不逐行） ----
  let orphanTaskCount = 0
  const usedArchivedIds = new Set<string>()
  let recurringCount = 0
  let deadlineCount = 0
  let durationCount = 0
  let unknownPriorityCount = 0
  let notesTotal = 0

  const mapTask = (t: TodoistRaw, fromCompleted: boolean): void => {
    const id = str(t, 'id').trim()
    const title = str(t, 'content').trim()
    if (!title) {
      // API 源无 CSV 物理行号，error 定位用 task id
      errors.push(`任务 ${id || '(无 id)'}：缺少标题，已跳过`)
      return
    }

    // 清单名：project →（section 非空 →「project / section」，双方已 trim）
    const projectId = str(t, 'project_id').trim()
    let projectName = projectNames.get(projectId)
    if (projectName === undefined) {
      // inbox 特殊值或孤儿 project_id → 收件箱 + 聚合 warning
      orphanTaskCount += 1
      projectName = INBOX_LIST_NAME
    } else if (archivedProjectIds.has(projectId)) {
      usedArchivedIds.add(projectId)
    }
    const sectionId = str(t, 'section_id').trim()
    const sectionName = sectionId ? sectionNames.get(sectionId) : undefined
    const listName = sectionName ? `${projectName} / ${sectionName}` : projectName

    // due：date-only 原样；带时间按 due.timezone 换算；无 timezone 的 datetime 按浮动
    const due = dueOf(t)
    let dueDate: string | null = null
    let dueString = ''
    let isRecurring = false
    if (due) {
      dueString = str(due, 'string')
      isRecurring = bool(due, 'is_recurring')
      const raw = stripMicro(str(due, 'date')).trim()
      if (raw) {
        const hasTime = /T\d{2}:\d{2}/.test(raw)
        const tz = str(due, 'timezone').trim() || undefined
        dueDate = tsToLocalDate(raw, tz, hasTime && !tz)
      }
    }

    // 优先级折档：4→high、3→normal、2→low、1→normal（未知值 → normal + 聚合 warning）
    const p = num(t, 'priority')
    let importance = 'normal'
    if (p === 4) importance = 'high'
    else if (p === 2) importance = 'low'
    else if (p !== null && p !== 3 && p !== 1) unknownPriorityCount += 1

    // body：description 原样 + 重复标注行；content 不入 body（content 即标题）
    const desc = str(t, 'description')
    const note = isRecurring && dueString ? `重复（未迁移）：${dueString}` : ''
    const body = [desc, note].filter((s) => s.length > 0).join('\n') || null
    if (isRecurring) recurringCount += 1

    // deadline / duration 忽略 + 聚合 warning；备注零请求（note_count 求和）
    if (t['deadline'] !== null && t['deadline'] !== undefined) deadlineCount += 1
    if (t['duration'] !== null && t['duration'] !== undefined) durationCount += 1
    const nc = num(t, 'note_count')
    if (nc !== null && nc > 0) notesTotal += nc

    // 时间线：微秒剥离后经 shared.tsToLocalStamp（Todoist 串是 UTC Z 形态）
    const addedRaw = stripMicro(str(t, 'added_at')).trim()
    const createdAt = addedRaw ? (tsToLocalStamp(addedRaw, undefined) ?? undefined) : undefined
    const completedRaw = stripMicro(str(t, 'completed_at')).trim()
    const completedAt = completedRaw
      ? (tsToLocalStamp(completedRaw, undefined) ?? undefined)
      : undefined
    const isCompleted = completedRaw !== '' || fromCompleted

    const labelsRaw = t['labels']
    const tags = Array.isArray(labelsRaw)
      ? labelsRaw.map((x) => String(x).trim()).filter(Boolean)
      : []

    // 子任务：parent_id 非空 → title 前缀「↳ 」无条件加
    const parentId = str(t, 'parent_id').trim()
    const finalTitle = parentId ? `↳ ${title}` : title

    batchRows.push({
      list_id: listIdOf(listName),
      title: finalTitle,
      body,
      importance,
      status: isCompleted ? 'completed' : 'notStarted',
      due_date: dueDate,
      start_date: null, // Todoist 无 start 概念，不写（见文件头映射说明）
      tags: tags.length ? tags : null,
      repeat: null, // is_recurring 一律不设 repeat（重复标注进 body）
      created_at: createdAt,
      completed_at: completedAt,
      sort_order: num(t, 'child_order'),
    })
  }

  for (const t of snapshot.tasks) mapTask(t, false)
  for (const t of snapshot.completed) mapTask(t, true)

  // ---- 聚合 warning（不逐行） ----
  if (orphanTaskCount > 0) {
    warnings.push(`${orphanTaskCount} 个收件箱/孤儿项目任务已归入「${INBOX_LIST_NAME}」清单`)
  }
  if (usedArchivedIds.size > 0) {
    warnings.push(`${usedArchivedIds.size} 个已归档项目按普通清单导入`)
  }
  if (recurringCount > 0) warnings.push(`${recurringCount} 个重复规则未迁移`)
  if (deadlineCount > 0) warnings.push(`${deadlineCount} 个截止期限（deadline）未迁移`)
  if (durationCount > 0) warnings.push(`${durationCount} 个时长（duration）未迁移`)
  if (unknownPriorityCount > 0) warnings.push(`${unknownPriorityCount} 个未知优先级按普通处理`)
  if (notesTotal > 0) warnings.push(`${notesTotal} 条备注未迁移`)

  const inserted = backend.importTodosBatch(batchRows)
  return { inserted, lists_created: listsCreated, errors, warnings, source: 'todoist' }
}
