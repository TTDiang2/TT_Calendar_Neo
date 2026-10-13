/**
 * 本地数据服务（开发预览用，也是将来 desktop sidecar 的服务内核）。
 *
 * 用 Node 内置 http 起一个 REST 服务，方法面与旧 Python routes.py 一致，
 * 内部全部落到 packages/db 的 SqliteBackend。前端 ui 通过 HttpBackendAdapter
 * （apps/web/src/adapt 注入的 createHttpBackend('/api')）调用，vite dev 代理 /api 到本端口。
 *
 * 本轮范围：本地数据的读写联通（视图/图层/事件/日程/标记/待办/倒数日/统计/设置）。
 * 多端同步(sync 相关)与订阅抓取(subscriptions、jisilu)属「联网可选项」，本轮返回明确占位。
 *
 * 启动：node --import tsx apps/web/server.ts  （或见 apps/web package.json 的 dev:server）
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import {
  openDb,
  SqliteBackend,
  SyncService,
  SyncFacade,
  GitHubDataRepo,
  runJisiluImport,
  refreshSubscriptionOnBackend,
  refreshDueOnBackend,
  importTodosCsvOnBackend,
  fetchTodoistSnapshot,
  importTodoistOnBackend,
  todoistPreview,
  TodoistAuthError,
} from '@tt-calendar/db'
import type { TodoSort, TodoStatusFilter } from '@tt-calendar/contracts'

export interface DataServerOptions {
  /** SQLite 文件路径 */
  dbPath: string
  /** 监听端口，默认 8766；传 0 由系统分配（测试用） */
  port?: number
}

export interface DataServerHandle {
  /** 实际监听端口（port=0 时为系统分配值，ready 之后可读） */
  port: number
  ready: Promise<void>
  close: () => Promise<void>
}

/**
 * 跨源 Origin 白名单。绑定 127.0.0.1 并不能挡住浏览器：用户开着任意网页时，
 * 该页可以直接 fetch http://127.0.0.1:8766 读写全部日历数据（跨源请求是否
 * 能读响应由 CORS 决定，但「写」类请求即使 CORS 拒绝也已送达——所以必须在
 * 服务端校验 Origin 而不是只靠响应头）。
 * 放行范围 = 本项目自己的前端：
 * - localhost/127.0.0.1 任意端口：三端 vite dev（5173/5174/5175）
 * - tauri.localhost / tauri://：桌面壳生产模式（API_BASE 直连 8767，Windows
 *   壳 origin 是 http://tauri.localhost，macOS 是 tauri://localhost）
 * - *.vicp.fun：用户经内网穿透访问 vite 预览（vite.config allowedHosts 同款通配）。
 *   注意 vicp.fun 是公共穿透服务，通配意味着「其他 vicp.fun 租户的页面」也在
 *   门禁内——权衡：隧道子域会轮换，钉死精确主机名则换域名即断联；风险面
 *   从「全网任意页面」收窄到「vicp.fun 租户页面」，可接受
 * 无 Origin 头的请求（同源 GET、curl、Node 工具）放行——浏览器跨源请求
 * 必带 Origin，非浏览器客户端不属本威胁模型。
 */
const ALLOWED_ORIGIN: RegExp[] = [
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/,
  /^https?:\/\/tauri\.localhost$/,
  /^tauri:\/\//,
  /^https?:\/\/[a-z0-9-]+\.vicp\.fun$/,
]

function originAllowed(origin: string): boolean {
  return ALLOWED_ORIGIN.some((re) => re.test(origin))
}

function send(res: ServerResponse, code: number, payload: unknown): void {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let data = ''
  for await (const chunk of req) data += chunk
  if (!data) return undefined
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}

/** 读取原始请求体（CSV 导入用，不做 JSON 解析） */
async function readRawBody(req: IncomingMessage): Promise<string> {
  let data = ''
  for await (const chunk of req) data += chunk
  return data
}

/** 启动本地数据服务，返回关闭句柄 */
export function startDataServer(opts: DataServerOptions): DataServerHandle {
  const { db, sqlite } = openDb({ path: opts.dbPath })
  const be = new SqliteBackend(db)
  const facade = new SyncFacade({
    backend: be,
    svc: new SyncService(db),
    makeRemote: (cfg) => new GitHubDataRepo(cfg),
  })
  let port = opts.port ?? 8766

  const server = createServer(async (req, res) => {
    // Origin 门禁（见 ALLOWED_ORIGIN 注释）：非白名单跨源请求一律 403，
    // 预检也不例外。白名单 Origin 回写 ACAO 放行真正的跨端调用方（桌面壳）。
    const origin = req.headers.origin
    if (origin !== undefined && !originAllowed(origin)) {
      send(res, 403, { detail: 'origin not allowed' })
      return
    }
    if (origin !== undefined) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    const url = (req.url ?? '/').split('?')[0]
    const qs = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
    const method = (req.method ?? 'GET').toUpperCase()
    const seg = url.replace(/^\/api\//, '').split('/').filter(Boolean)

    // CSV 待办导入：请求体是 text/csv 纯文本（不是 JSON），单独拦截
    if (seg[0] === 'todo' && seg[1] === 'import' && seg[2] === 'csv' && method === 'POST') {
      try {
        const text = await readRawBody(req)
        send(res, 200, importTodosCsvOnBackend(be, text))
      } catch (e) {
        send(res, 500, { detail: e instanceof Error ? e.message : String(e) })
      }
      return
    }

    // Todoist 导入（API token 路线）：JSON body {token, confirm}。
    // token 用完即弃：只在本次请求闭包里存活，不写 meta/config/日志（零持久化）。
    // confirm=false → 只拉预览返回 {preview, warnings}，零落库；confirm=true →
    // 重拉快照再落库返回完整结果。零状态：服务端不保存任何 Todoist 凭据。
    if (seg[0] === 'todo' && seg[1] === 'import' && seg[2] === 'todoist' && method === 'POST') {
      const todoistBody = (await readBody(req)) as { token?: unknown; confirm?: unknown } | undefined
      const token = typeof todoistBody?.token === 'string' ? todoistBody.token.trim() : ''
      const confirm = todoistBody?.confirm === true
      try {
        if (!token) return send(res, 400, { detail: '缺少 Todoist API token' })
        const { snapshot, warnings } = await fetchTodoistSnapshot(token)
        if (!confirm) {
          // 预览：token 用完即丢，零落库
          return send(res, 200, { preview: todoistPreview(snapshot), warnings })
        }
        return send(res, 200, importTodoistOnBackend(be, snapshot))
      } catch (e) {
        if (e instanceof TodoistAuthError) {
          return send(res, 401, { detail: e.message, code: 'todoist_auth' })
        }
        send(res, 502, { detail: e instanceof Error ? e.message : String(e) })
        return
      }
    }

    const body = (await readBody(req)) as Record<string, unknown> | undefined
    try {
      await handle(seg, method, qs, body ?? {}, res, be, facade)
    } catch (e) {
      send(res, 500, { detail: e instanceof Error ? e.message : String(e) })
    }
  })

  const ready = new Promise<void>((resolve) =>
    server.once('listening', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') port = addr.port
      resolve()
    }),
  )
  server.listen(port, '127.0.0.1')
  return {
    get port() {
      return port
    },
    ready,
    close: () =>
      new Promise((r) => {
        server.close(() => r())
        sqlite.close()
      }),
  }
}

// body → 后端入参用 `as Parameters<typeof be.xxx>[0]` 断言而非 zod 校验：
// 调用方只有本机白名单 Origin 的自家前端（见 ALLOWED_ORIGIN），body 由
// HttpBackendAdapter 按 BackendAdapter 接口的 TS 类型组装，畸形 body 属
// 程序 bug 而非攻击面；断言跟随真实方法签名，后端改签名时这里会 typecheck 报错。
async function handle(
  seg: string[],
  method: string,
  qs: URLSearchParams,
  body: Record<string, unknown>,
  res: ServerResponse,
  be: SqliteBackend,
  f: SyncFacade,
): Promise<void> {
  const [a, b, c, d] = seg // e.g. view/month/2026/9

  // ----- 视图 -----
  if (a === 'view') {
    if (b === 'month' && c && d) return ok(res, be.getView('month', `${c}-${Number(d)}`))
    if (b === 'year' && c) return ok(res, be.getView('year', c))
    if (b === 'week' && c) return ok(res, be.getView('week', c))
    if (b === 'day' && c) return ok(res, be.getView('day', c))
    return bad(res)
  }

  // ----- 图层 -----
  if (a === 'layers') {
    if (!b) {
      if (method === 'GET') return ok(res, be.getLayers())
      if (method === 'POST') return ok(res, be.createLayer(body as Parameters<typeof be.createLayer>[0]))
      return bad(res)
    }
    if (method === 'DELETE') return ok(res, be.deleteLayer(b))
    if (method === 'PUT') {
      if (c === 'config') return ok(res, be.updateLayerConfig(b, body as Parameters<typeof be.updateLayerConfig>[1]))
      if (c === 'sub-actions') return ok(res, be.getLayerSubActions(b))
      return ok(res, be.toggleLayer(b, Boolean(body?.enabled)))
    }
    if (method === 'GET' && c === 'sub-actions') return ok(res, be.getLayerSubActions(b))
    return bad(res)
  }

  // ----- 事件 -----
  if (a === 'events') {
    if (!b) {
      if (method === 'POST') return ok(res, be.createEvent(body as Parameters<typeof be.createEvent>[0]))
      return bad(res)
    }
    if (method === 'DELETE') return ok(res, be.deleteEvent(Number(b)))
    if (method === 'PUT') return ok(res, be.updateEvent(Number(b), body as Parameters<typeof be.updateEvent>[1]))
    return bad(res)
  }

  // ----- 日程 -----
  if (a === 'schedule-items') {
    if (!b) {
      if (method === 'POST') return ok(res, be.createScheduleItem(body as Parameters<typeof be.createScheduleItem>[0]))
      return bad(res)
    }
    if (method === 'DELETE') return ok(res, be.deleteScheduleItem(Number(b)))
    if (method === 'PUT') return ok(res, be.updateScheduleItem(Number(b), body as Parameters<typeof be.updateScheduleItem>[1]))
    if (method === 'GET') return ok(res, be.getScheduleItems(b))
    return bad(res)
  }
  if (a === 'schedule' && b) {
    if (method === 'PUT') {
      return ok(res, be.upsertSchedule(b, (body?.am as string) ?? null, (body?.pm as string) ?? null, (body?.ev as string) ?? null))
    }
    if (method === 'GET') return ok(res, be.getScheduleItems(b))
    return bad(res)
  }

  // ----- 充实度 -----
  if (a === 'coloring' && b) {
    if (method === 'PUT') return ok(res, be.upsertColoring(b, Number(body?.level ?? 0)))
    if (method === 'DELETE') return ok(res, be.deleteColoring(b))
    return bad(res)
  }

  // ----- 涂色标记 -----
  if (a === 'marks') {
    if (!b) {
      if (method === 'POST') return ok(res, be.upsertMark(body?.layer_id as string, body?.date as string, (body?.level as number | null) ?? null, (body?.note as string | null | undefined) ?? null))
      return bad(res)
    }
    if (method === 'DELETE') return ok(res, be.deleteMark(b, c as string))
    return bad(res)
  }

  // ----- 拖拽改期 -----
  if (a === 'move-day') {
    return ok(res, be.moveDay(body?.src as string, body?.dst as string))
  }

  // ----- 搜索 -----
  if (a === 'search') return ok(res, be.searchEvents(qs.get('q') ?? ''))

  // ----- 倒数日 -----
  if (a === 'countdown') {
    if (!b) {
      // getCountdownText 已随 i18n 重构移除（顶部倒数由 UI 层按语言组装）
      if (method === 'POST') return ok(res, be.createCountdown(body as Parameters<typeof be.createCountdown>[0]))
      return bad(res)
    }
    if (b === 'list' && method === 'GET') return ok(res, be.getCountdownList())
    if (method === 'DELETE') return ok(res, be.deleteCountdown(Number(b)))
    if (method === 'PUT') return ok(res, be.updateCountdown(Number(b), body as Parameters<typeof be.updateCountdown>[1]))
    return bad(res)
  }

  // ----- 统计 -----
  if (a === 'stats' && b === 'summary') return ok(res, be.getStatsSummary(qs.get('list_id') ?? undefined))

  // ----- 设置：忙度算法 / 每日提醒 -----
  if (a === 'settings' && b === 'todo-busy') {
    if (method === 'GET') return ok(res, be.getTodoBusyConfig())
    if (method === 'PUT') return ok(res, be.setTodoBusyConfig(body as Parameters<typeof be.setTodoBusyConfig>[0]))
    if (c === 'recompute' && method === 'POST') return ok(res, be.recomputeTodoBusy())
    return bad(res)
  }
  if (a === 'settings' && b === 'todo-reminder') {
    if (method === 'GET') return ok(res, be.getTodoReminderConfig())
    if (method === 'PUT') return ok(res, be.setTodoReminderConfig(body as Parameters<typeof be.setTodoReminderConfig>[0]))
    return bad(res)
  }

  // ----- Todo 列表 -----
  if (a === 'todo' && b === 'lists') {
    if (method === 'GET') return ok(res, be.getTodoLists())
    if (method === 'POST') return ok(res, be.createTodoList((body?.display_name as string) ?? ''))
    if (method === 'PUT' && c === 'reorder') return ok(res, be.reorderTodoLists((body?.ordered_ids as string[]) ?? []))
    return bad(res)
  }
  if (a === 'todo' && b === 'lists' && c) {
    if (method === 'DELETE') return ok(res, be.deleteTodoList(c))
    if (method === 'PUT') return ok(res, be.updateTodoList(c, (body?.display_name as string) ?? ''))
    return bad(res)
  }
  if (a === 'todo' && b === 'reorder') {
    return ok(res, be.reorderTodos((body?.ordered_ids as string[]) ?? []))
  }

  // ----- Todo 任务 -----
  if (a === 'todo' && b === 'stats') {
    return ok(res, be.getTodoStats(qs.get('list_id') ?? undefined))
  }
  if (a === 'todo' && b === 'import') {
    return send(res, 501, { detail: 'CSV 导入本轮未接线' })
  }
  if (a === 'todo' && !b) {
    if (method === 'GET') {
      return ok(res, be.getTodos({ list_id: qs.get('list_id') ?? undefined, status: (qs.get('status') as TodoStatusFilter | null) ?? undefined, sort: (qs.get('sort') as TodoSort | null) ?? undefined, limit: qs.get('limit') ? Number(qs.get('limit')) : undefined, completed_on: qs.get('completed_on') ?? undefined }))
    }
    if (method === 'POST') return ok(res, be.createTodo(body as Parameters<typeof be.createTodo>[0]))
    return bad(res)
  }
  if (a === 'todo' && b) {
    if (method === 'DELETE') return ok(res, be.deleteTodo(b))
    if (method === 'PUT') return ok(res, be.updateTodo(b, body as Parameters<typeof be.updateTodo>[1]))
    return bad(res)
  }

  // ----- 集思录导入（GitHub 之外的数据源：直接抓 jisilu 公开接口） -----
  if (a === 'import' && b === 'jisilu' && method === 'POST') {
    const r = await runJisiluImport(be, {
      start: String(body?.start ?? ''),
      end: String(body?.end ?? ''),
      qtypes: (body?.qtypes as string[] | undefined) ?? undefined,
    })
    return ok(res, r)
  }

  // ----- 多端同步（GitHub 数据仓 REST 通道；手机/PC 同一份 SyncFacade） -----
  if (a === 'sync') {
    if (b === 'status') return ok(res, f.getStatus())
    if (b === 'config' && method === 'GET') return ok(res, f.getConfig())
    if (b === 'config' && method === 'PUT') return ok(res, f.saveConfig(body as Parameters<typeof f.saveConfig>[0]))
    if (b === 'test' && method === 'POST') return ok(res, await f.test())
    if (b === 'now' && method === 'POST') return ok(res, await f.sync('merge'))
    if (b === 'resolve' && method === 'POST')
      return ok(res, await f.resolveFirstBind((body?.mode as 'pull_overwrite' | 'merge_push') ?? 'merge_push'))
    return bad(res)
  }

  // ----- 订阅（列表/新建/更新/删除用 db 现成方法；刷新按 source_key 分发） -----
  if (a === 'subscriptions') {
    if (!b) {
      if (method === 'GET') return ok(res, be.getSubscriptions())
      if (method === 'POST') return ok(res, be.createSubscription(body as Parameters<typeof be.createSubscription>[0]))
      return bad(res)
    }
    if (b === 'refresh-due' && method === 'POST') return ok(res, await refreshDueOnBackend(be))
    if (method === 'DELETE') return ok(res, be.deleteSubscription(b))
    if (method === 'PATCH') return ok(res, be.patchSubscription(b, body as Parameters<typeof be.patchSubscription>[1]))
    if (method === 'POST' && c === 'refresh') {
      const sub = be.getSubscriptions().find((s) => s.id === b)
      if (!sub) return send(res, 404, { detail: '订阅不存在' })
      return ok(res, await refreshSubscriptionOnBackend(be, sub))
    }
    return bad(res)
  }

  return bad(res)
}

function ok(res: ServerResponse, data: unknown): void {
  send(res, 200, data)
}
function bad(res: ServerResponse): void {
  send(res, 404, { detail: 'not found' })
}

// 直接运行：node --import tsx server.ts [--port 8766] [--db path]
// 命令行参数优先于环境变量 —— .bat 里 `set PORT=8767` 的引号嵌套很容易写错，
// 用 --port 传参在 Windows 上更稳。web 用 8766，desktop 用 8767，可同时运行。
// 直接运行守卫：被 import（server.test.ts / 桌面 sidecar 复用）时不自启，
// 避免测试进程打开真实 calendar.db 的副作用。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  function cliArg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? process.argv[i + 1] : undefined
  }

  const dbPath = cliArg('db') ?? process.env.CAL_DB_PATH ?? 'E:/TT_Calendar_Neo/data/calendar.db'
  const port = Number(cliArg('port') ?? process.env.PORT ?? 8766)
  const { port: listeningPort } = startDataServer({ dbPath, port })
  console.log(`[data-server] listening on http://127.0.0.1:${listeningPort}  db=${dbPath}`)
}
