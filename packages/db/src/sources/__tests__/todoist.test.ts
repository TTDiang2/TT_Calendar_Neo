/**
 * Todoist API token 导入测试（mock fetchImpl 零真实网络；双驱动 node better-sqlite3 /
 * sql.js wasm 同套件，照 ticktick.test.ts 先例）。
 *
 * 覆盖智者清单：
 *  - 全字段映射：section 清单名（双方 trim）/ parent「↳ 」/ labels→tags /
 *    四档优先级折档（4→high、3→normal、2→low、1→normal）/ recurring body 标注 +
 *    聚合 warning / due date-only vs datetime 时区 vs 浮动 / 微秒剥离（.000000Z）/
 *    空 due / 空标题跳过（error 标 task id）/ inbox 孤儿→收件箱 / archived 警告 /
 *    deadline·duration·note_count 聚合 warning / completed 端点→status=completed
 *  - completed 窗口翻页：空窗即停；硬上限 20 窗（5 年）触顶聚合 warning
 *  - /tasks cursor 翻页；/labels 与 /labels/shared 都请求；onProgress 五阶段
 *  - 401 → TodoistAuthError 明确引导文案（不重试）；429 重试耗尽 → 整体失败零落库、
 *    报错零 token 回显、token 只进 Authorization 头
 *  - 双驱动落库断言（importTodosBatch 一次事务，字面 DB 行值）
 *  - 1000 任务 mock 快速落库（node 驱动）
 *  - 冻结纪律：shared.ts / ticktick.ts / backend.ts 相对 HEAD 零改动（git status）
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { openDb, SqliteBackend } from '../../index'
import { openLocalDb } from '../../local/backend'
import { tsToLocalStamp } from '../shared'
import { fetchTodoistSnapshot, importTodoistOnBackend, TodoistAuthError, todoistPreview } from '../todoist'

const require = createRequire(import.meta.url)

interface Ctx {
  backend: SqliteBackend
  close(): void
  /** 原样 SQL 直查（绕过 backend 门面，断言字面 DB 行值用） */
  rawAll(q: string): Record<string, unknown>[]
}

async function openNode(): Promise<Ctx> {
  const { db, sqlite } = openDb({ path: ':memory:' })
  return {
    backend: new SqliteBackend(db),
    close: () => sqlite.close(),
    rawAll: (q) => sqlite.prepare(q).all() as Record<string, unknown>[],
  }
}

async function openSqlJs(): Promise<Ctx> {
  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
  const h = await openLocalDb({ wasmBinary, autosaveMs: 0, skipLoad: true })
  return { backend: h.backend, close: () => h.sqlite.close(), rawAll: (q) => h.sqlite.prepare(q).all() }
}

const drivers: Array<{ name: string; open: () => Promise<Ctx> }> = [
  { name: 'node better-sqlite3', open: openNode },
  { name: 'sql.js wasm', open: openSqlJs },
]

// ---------- mock fetch（零真实网络；记录 url + Authorization 供断言） ----------

interface RecordedRequest {
  url: string
  auth: string
}

interface MockRoute {
  /** API 根路径之下的 path 前缀（含 query 分隔符精确匹配，防 /tasks 吃掉 /tasks/completed） */
  prefix: string
  respond: (url: string) => { status?: number; body: unknown }
}

function routeMatches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}&`)
}

function makeFetch(routes: MockRoute[], log: RecordedRequest[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    log.push({ url, auth: headers['Authorization'] ?? '' })
    const path = url.startsWith('https://api.todoist.com/api/v1/')
      ? url.slice('https://api.todoist.com/api/v1/'.length)
      : url
    for (const r of routes) {
      if (routeMatches(path, r.prefix)) {
        const { status = 200, body } = r.respond(url)
        // 代码只消费 ok/status/json，最小假响应即可（不建 Response 实例）
        return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
      }
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  }) as unknown as typeof fetch
}

const TOKEN = 'TESTTOKEN-abcdef123456'

// ---------- fixture（重建样例，覆盖一张任务一映射点） ----------

const PROJECTS = [
  { id: 'proj-inbox', name: 'Inbox', is_inbox_project: true, is_archived: false },
  { id: 'proj-work', name: '工作', is_inbox_project: false, is_archived: false },
  { id: 'proj-archived', name: ' 旧项目 ', is_inbox_project: false, is_archived: true },
]

const SECTIONS = [{ id: 'sec-dev', project_id: 'proj-work', name: ' 开发 ' }]

const LABELS = [{ id: 'lb-1', name: 'urgent' }]
const LABELS_SHARED = [{ id: 'lb-2', name: '工作协作' }]

/** 缺省字段兜底的最小任务（测试里用 spread 覆盖关注字段） */
function task(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 't-x',
    content: '',
    description: '',
    project_id: 'proj-work',
    section_id: '',
    parent_id: '',
    labels: [],
    priority: 1,
    child_order: 0,
    added_at: '2025-01-01T00:00:00.000000Z',
    completed_at: '',
    note_count: 0,
    due: null,
    deadline: null,
    duration: null,
    is_completed: false,
    ...over,
  }
}

const TASKS = [
  // 全字段：section 清单名 / description 多行 body / labels tags / p4→high /
  // child_order / added_at 微秒剥离 / date-only due
  task({
    id: 't-full',
    content: '全字段任务',
    description: '第一行\n第二行',
    section_id: 'sec-dev',
    labels: ['urgent', ' 重点 '],
    priority: 4,
    child_order: 5,
    added_at: '2025-01-10T02:30:00.000000Z',
    due: { date: '2025-01-15', string: 'Jan 15', timezone: '', is_recurring: false },
  }),
  // 优先级折档 3→normal / 2→low / 1→normal
  task({ id: 't-p3', content: '优先级3', priority: 3 }),
  task({ id: 't-p2', content: '优先级2', priority: 2 }),
  task({ id: 't-p1', content: '优先级1', priority: 1 }),
  // 子任务：parent_id 非空 → 「↳ 」前缀
  task({ id: 't-child', content: '子任务', parent_id: 't-full' }),
  // 重复：is_recurring → 不设 repeat + body 标注 + 聚合 warning
  task({
    id: 't-recur',
    content: '每天锻炼',
    due: { date: '2025-02-01', string: 'every day', timezone: '', is_recurring: true },
  }),
  // 带时间带时区：微秒剥离 + 按时区换算（UTC 16:00 + Asia/Shanghai → 次日）
  task({
    id: 't-tz',
    content: '定时任务',
    due: { date: '2025-01-15T16:00:00.000000Z', string: 'Jan 16 1:00 AM', timezone: 'Asia/Shanghai', is_recurring: false },
  }),
  // 带时间无时区：浮动 → 取日期部分
  task({
    id: 't-float',
    content: '浮动任务',
    due: { date: '2025-02-01T23:00:00.000000', string: 'Feb 1 11:00 PM', timezone: '', is_recurring: false },
  }),
  // deadline / duration → 忽略 + 聚合 warning；note_count 求和
  task({
    id: 't-extra',
    content: '带期限时长备注',
    deadline: { date: '2025-01-20', lang: 'en' },
    duration: { amount: 30, unit: 'minute' },
    note_count: 3,
  }),
  // 未知优先级 → normal + 聚合 warning
  task({ id: 't-p9', content: '未知优先级', priority: 9 }),
  // inbox 特殊 project_id → 收件箱清单 + 聚合 warning
  task({ id: 't-inbox', content: '收件箱任务', project_id: 'inbox' }),
  // 孤儿 project_id（不在已拉项目集合）→ 收件箱清单 + 聚合 warning
  task({ id: 't-orphan', content: '孤儿任务', project_id: 'proj-gone' }),
  // archived project → 普通清单（名字 trim）+ 聚合 warning
  task({ id: 't-arch', content: '归档项目任务', project_id: 'proj-archived' }),
  // 空标题 → 跳过 + error 标 task id
  task({ id: 't-empty', content: '   ' }),
]

const COMPLETED = [
  // 来自 completed 端点 → status=completed；completed_at 微秒剥离落库
  task({
    id: 'c-1',
    content: '已完成任务',
    priority: 2,
    completed_at: '2025-03-01T08:00:00.000000Z',
    is_completed: true,
  }),
]

function snapshotRoutes(completedRespond: (url: string) => { status?: number; body: unknown }): MockRoute[] {
  return [
    { prefix: '/tasks/completed/by_completion_date', respond: completedRespond },
    { prefix: '/tasks', respond: () => ({ body: { results: TASKS, next_cursor: null } }) },
    { prefix: '/labels/shared', respond: () => ({ body: { results: LABELS_SHARED, next_cursor: null } }) },
    { prefix: '/labels', respond: () => ({ body: { results: LABELS, next_cursor: null } }) },
    { prefix: '/sections', respond: () => ({ body: { results: SECTIONS, next_cursor: null } }) },
    { prefix: '/projects', respond: () => ({ body: { results: PROJECTS, next_cursor: null } }) },
  ]
}

function fullSnapshot() {
  return {
    projects: PROJECTS,
    sections: SECTIONS,
    labels: [...LABELS, ...LABELS_SHARED],
    tasks: TASKS,
    completed: COMPLETED,
  }
}

function byTitle(todos: ReturnType<SqliteBackend['getTodos']>, title: string) {
  const hit = todos.find((t) => t.title === title)
  expect(hit, `找不到待办「${title}」`).toBeTruthy()
  return hit!
}

// ---------- 快照拉取（纯 fetch 层，无 DB） ----------

describe('fetchTodoistSnapshot（mock fetch，零真实网络）', () => {
  it('顺序拉全部端点：labels+shared 都请求、cursor 翻页、onProgress 五阶段、token 只进 Authorization 头', async () => {
    const log: RecordedRequest[] = []
    const stages: string[] = []
    const routes = snapshotRoutes(() => ({ body: { items: [], next_cursor: null } }))
    // /tasks 两页 cursor 翻页
    routes.splice(1, 1, {
      prefix: '/tasks',
      respond: (url) =>
        url.includes('cursor=page2')
          ? { body: { results: [TASKS[0]!], next_cursor: null } }
          : { body: { results: [TASKS[1]!], next_cursor: 'page2' } },
    })
    const { snapshot, warnings } = await fetchTodoistSnapshot(TOKEN, {
      fetchImpl: makeFetch(routes, log),
      onProgress: (s) => stages.push(s),
    })

    expect(stages).toEqual(['projects', 'sections', 'labels', 'tasks', 'completed'])
    expect(warnings).toEqual([]) // 空窗即停，未触顶
    expect(snapshot.tasks).toHaveLength(2) // 两页拼接
    expect(snapshot.labels.map((l) => l['name'])).toEqual(['urgent', '工作协作'])
    expect(snapshot.projects.map((p) => p['id'])).toEqual(['proj-inbox', 'proj-work', 'proj-archived'])

    const paths = log.map((r) => r.url.replace('https://api.todoist.com/api/v1/', ''))
    expect(paths.filter((p) => p.startsWith('/labels/shared')).length).toBe(1)
    expect(paths.filter((p) => p.startsWith('/labels?') || p === '/labels').length).toBe(1)
    expect(paths.filter((p) => p.startsWith('/tasks?') || p === '/tasks').length).toBe(2)
    // token 零落 URL；只进 Authorization 头
    for (const r of log) {
      expect(r.url).not.toContain(TOKEN)
      expect(r.auth).toBe(`Bearer ${TOKEN}`)
    }
    // base 常量唯一：绝不出现旧端点
    for (const r of log) {
      expect(r.url).not.toContain('/sync/v9')
      expect(r.url).not.toContain('/rest/v2')
    }
  })

  it('completed 窗口：空窗即停（第二窗空 → 只请求 2 窗、无 warning）', async () => {
    const log: RecordedRequest[] = []
    let first = true
    const routes = snapshotRoutes(() => {
      const wasFirst = first
      first = false
      return { body: { items: wasFirst ? [COMPLETED[0]!] : [], next_cursor: null } }
    })
    const { snapshot, warnings } = await fetchTodoistSnapshot(TOKEN, { fetchImpl: makeFetch(routes, log) })
    expect(snapshot.completed).toHaveLength(1)
    expect(warnings).toEqual([])
    const completedCalls = log.filter((r) => r.url.includes('/tasks/completed/by_completion_date'))
    expect(completedCalls).toHaveLength(2)
    // since/until 递推：第二窗的 until = 第一窗的 since
    const u1 = new URL(completedCalls[0]!.url)
    const u2 = new URL(completedCalls[1]!.url)
    expect(u2.searchParams.get('until')).toBe(u1.searchParams.get('since'))
  })

  it('completed 窗口：20 窗触顶聚合 warning（每窗都有数据 → 恰好 20 次请求）', async () => {
    const log: RecordedRequest[] = []
    const routes = snapshotRoutes(() => ({ body: { items: [COMPLETED[0]!], next_cursor: null } }))
    const { snapshot, warnings } = await fetchTodoistSnapshot(TOKEN, { fetchImpl: makeFetch(routes, log) })
    expect(snapshot.completed).toHaveLength(20)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('60 个月')
    const completedCalls = log.filter((r) => r.url.includes('/tasks/completed/by_completion_date'))
    expect(completedCalls).toHaveLength(20) // 硬上限 20 窗（5 年）
  })

  it('401 → TodoistAuthError 明确引导文案，且不重试', async () => {
    const log: RecordedRequest[] = []
    const routes: MockRoute[] = [{ prefix: '/projects', respond: () => ({ status: 401, body: {} }) }]
    const err = await fetchTodoistSnapshot(TOKEN, { fetchImpl: makeFetch(routes, log) }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(TodoistAuthError)
    expect((err as Error).message).toContain('token 无效或已过期')
    expect(log).toHaveLength(1) // 401 不重试
  })

  it('429 重试耗尽：1+3 次请求后整体失败、报错零 token 回显、零落库', async () => {
    const ctx = await openNode()
    try {
      const log: RecordedRequest[] = []
      let calls = 0
      const routes: MockRoute[] = [
        {
          prefix: '/projects',
          respond: () => {
            calls += 1
            return { status: 429, body: {} }
          },
        },
      ]
      const err = await fetchTodoistSnapshot(TOKEN, { fetchImpl: makeFetch(routes, log) }).then(
        () => null,
        (e: unknown) => e,
      )
      expect(calls).toBe(4) // 首次 + 3 次重试（照 github.ts 先例 retries:3）
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain('429')
      expect((err as Error).message).not.toContain(TOKEN) // 零 token 回显
      // 整体失败零落库：拉完才落库语义，fetch 抛错时什么都没写
      expect(ctx.backend.getTodos({ status: 'all' })).toHaveLength(0)
      expect(ctx.backend.getTodoLists()).toHaveLength(0)
    } finally {
      ctx.close()
    }
  }, 30_000)
})

// ---------- 落库映射（双驱动） ----------

for (const d of drivers) {
  describe(`Todoist 导入落库 [${d.name}]`, () => {
    it('全字段映射：section 清单名/↳ 前缀/labels/优先级折档/recurring/时区/微秒/收件箱/归档/聚合 warning', async () => {
      const ctx = await d.open()
      try {
        const r = importTodoistOnBackend(ctx.backend, fullSnapshot())

        // 计数：14 活跃任务 − 空标题 1 = 13，+ 1 已完成 = 14
        expect(r.source).toBe('todoist')
        expect(r.inserted).toBe(14)
        // 清单：工作 / 开发、工作、旧项目、收件箱 = 4（inbox 项目无任务不建清单）
        expect(r.lists_created).toBe(4)
        expect(r.errors).toEqual(['任务 t-empty：缺少标题，已跳过'])

        const todos = ctx.backend.getTodos({ status: 'all' })
        expect(todos).toHaveLength(14)

        // 清单名：section 非空 →「project / section」（双方 trim）；inbox/孤儿 → 收件箱
        const lists = ctx.backend.getTodoLists().map((l) => l.display_name)
        expect(lists).toContain('工作 / 开发')
        expect(lists).toContain('工作')
        expect(lists).toContain('旧项目') // archived project 名字 trim 后按普通清单导入
        expect(lists).toContain('收件箱')
        expect(lists).not.toContain('Inbox') // inbox 项目无任务落进来，不产空清单

        // 全字段任务逐项断言
        const full = byTitle(todos, '全字段任务')
        const devList = ctx.backend.getTodoLists().find((l) => l.display_name === '工作 / 开发')
        expect(full.list_id).toBe(devList!.id)
        expect(full.body).toBe('第一行\n第二行') // description 原样多行；content 不入 body
        expect(full.tags).toEqual(['urgent', '重点'])
        expect(full.importance).toBe('high') // 4→high
        expect(full.repeat).toBeNull()
        expect(full.due_date).toBe('2025-01-15') // date-only 原样
        expect(full.start_date).toBeNull() // Todoist 无 start 概念
        expect(full.sort_order).toBe(5)
        expect(full.status).toBe('notStarted')
        // 微秒剥离：.000000Z 剥掉后经 tsToLocalStamp（同函数算期望，不依赖测试机时区）
        expect(full.created_at).toBe(tsToLocalStamp('2025-01-10T02:30:00Z', undefined))

        // 直查 todo 表字面行：created_at/sort_order/due_date 确实落库
        const rawRow = ctx.rawAll("SELECT created_at, sort_order, due_date, completed_at FROM todo WHERE title = '全字段任务'")[0]!
        expect(rawRow).toMatchObject({
          created_at: tsToLocalStamp('2025-01-10T02:30:00Z', undefined),
          sort_order: 5,
          due_date: '2025-01-15',
        })

        // 优先级折档：3→normal、2→low、1→normal（Neo 枚举无 medium）
        expect(byTitle(todos, '优先级3').importance).toBe('normal')
        expect(byTitle(todos, '优先级2').importance).toBe('low')
        expect(byTitle(todos, '优先级1').importance).toBe('normal')

        // 子任务：↳ 前缀无条件加
        expect(byTitle(todos, '↳ 子任务').title).toBe('↳ 子任务')

        // 重复：不设 repeat + body 追加标注行（due.string 原文）
        const recur = byTitle(todos, '每天锻炼')
        expect(recur.repeat).toBeNull()
        expect(recur.body).toBe('重复（未迁移）：every day')

        // due 三形态：datetime+时区换算次日 / 无时区浮动取日期 / 空 due → null
        expect(byTitle(todos, '定时任务').due_date).toBe('2025-01-16')
        expect(byTitle(todos, '浮动任务').due_date).toBe('2025-02-01')
        expect(byTitle(todos, '带期限时长备注').due_date).toBeNull()

        // 收件箱特殊值与孤儿 project_id → 同一收件箱清单
        const inboxList = ctx.backend.getTodoLists().find((l) => l.display_name === '收件箱')
        expect(byTitle(todos, '收件箱任务').list_id).toBe(inboxList!.id)
        expect(byTitle(todos, '孤儿任务').list_id).toBe(inboxList!.id)

        // archived project → 普通清单 + 名字 trim
        const archList = ctx.backend.getTodoLists().find((l) => l.display_name === '旧项目')
        expect(byTitle(todos, '归档项目任务').list_id).toBe(archList!.id)

        // completed 端点任务 → status=completed，completed_at 微秒剥离落库
        const done = byTitle(todos, '已完成任务')
        expect(done.status).toBe('completed')
        expect(done.importance).toBe('low')
        expect(done.completed_at).toBe(tsToLocalStamp('2025-03-01T08:00:00Z', undefined))

        // 聚合 warning（各一条，不逐行）
        expect(r.warnings).toContain('2 个收件箱/孤儿项目任务已归入「收件箱」清单')
        expect(r.warnings).toContain('1 个已归档项目按普通清单导入')
        expect(r.warnings).toContain('1 个重复规则未迁移')
        expect(r.warnings).toContain('1 个截止期限（deadline）未迁移')
        expect(r.warnings).toContain('1 个时长（duration）未迁移')
        expect(r.warnings).toContain('1 个未知优先级按普通处理')
        expect(r.warnings).toContain('3 条备注未迁移')
        expect(r.warnings).toHaveLength(7)
      } finally {
        ctx.close()
      }
    }, 15_000)
  })
}

// ---------- 幂等预览与千级任务（node 驱动） ----------

describe('Todoist 预览与批量（node better-sqlite3）', () => {
  it('todoistPreview：三计数', () => {
    expect(todoistPreview(fullSnapshot())).toEqual({ projects: 3, tasks: 14, completed: 1 })
  })

  it('1000 任务 mock 快速落库（含 50 条已完成）', async () => {
    const ctx = await openNode()
    try {
      const tasks = Array.from({ length: 1000 }, (_, i) =>
        task({
          id: `bulk-${i}`,
          content: `批量任务 ${i}`,
          project_id: 'proj-work',
          priority: (i % 4) + 1,
          child_order: i,
          added_at: '2025-01-01T00:00:00.000000Z',
        }),
      )
      const completed = Array.from({ length: 50 }, (_, i) =>
        task({
          id: `bdone-${i}`,
          content: `批量完成 ${i}`,
          project_id: 'proj-work',
          completed_at: '2025-03-01T08:00:00.000000Z',
        }),
      )
      const r = importTodoistOnBackend(ctx.backend, {
        projects: PROJECTS,
        sections: [],
        labels: [],
        tasks,
        completed,
      })
      expect(r.inserted).toBe(1050)
      expect(r.lists_created).toBe(1)
      expect(ctx.backend.getTodos({ status: 'all' })).toHaveLength(1050)
      expect(ctx.backend.getTodos({ status: 'completed' })).toHaveLength(50)
    } finally {
      ctx.close()
    }
  }, 30_000)
})

// ---------- 冻结纪律 ----------

describe('冻结纪律（智者终审第 1 条）', () => {
  it('shared.ts / ticktick.ts / backend.ts 相对 HEAD 零改动', () => {
    const cwd = dirname(fileURLToPath(import.meta.url))
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
    const paths = [
      'packages/db/src/sources/shared.ts',
      'packages/db/src/sources/ticktick.ts',
      'packages/db/src/backend.ts',
    ]
    // 防空转：三个文件必须真实被 git 跟踪（路径错了 ls-files 为空，断言立即红）
    const tracked = execFileSync('git', ['ls-files', '--', ...paths], { cwd: repoRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
    expect(tracked).toHaveLength(3)
    const out = execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: repoRoot, encoding: 'utf8' })
    expect(out).toBe('')
  })
})
