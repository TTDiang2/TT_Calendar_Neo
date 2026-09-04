/**
 * HTTP 传输适配层：让 ui 通过 fetch 调本机 Node 数据服务。
 *
 * 实现对应旧 frontend/src/api/client.ts（Python sidecar REST 面），
 * 现改为指向 apps/web 的数据服务（同一 REST /api 面，Node 端用 SqliteBackend）。
 * 方法面与 adapt/api.ts 的 BackendAdapter 接口逐一对齐，返回对象满足该接口。
 *
 * Web 仅作「开发预览」：数据服务默认跑在 http://127.0.0.1:<port>，由 apps/web
 * 的 vite dev 代理 /api，因此 apiBase 传相对前缀 '/api' 即可同源访问、免 CORS。
 */

import type { BackendAdapter } from './api'
import type {
  CalEvent,
  CountdownItem,
  Layer,
  MonthData,
  ScheduleItem,
  StatsSummary,
  Todo,
  TodoList,
  TodoSort,
  TodoStatusFilter,
  ViewMode,
  YearData,
} from './types'

async function req<T>(apiBase: string, method: string, path: string, body?: unknown): Promise<T> {
  const url = `${apiBase}${path}`
  const opts: RequestInit = { method }
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  }
  const r = await fetch(url, opts)
  if (!r.ok) {
    // 服务端错误可能带 detail；尽力取出来增强报错
    let detail: string | null = null
    try {
      const d = await r.json()
      detail = d?.detail ?? null
    } catch {
      /* ignore */
    }
    throw new Error(detail ?? `${r.status} ${path}`)
  }
  return r.json() as Promise<T>
}

/** 装配一个通过 HTTP 访问数据服务的 BackendAdapter */
export function createHttpBackend(apiBase = '/api'): BackendAdapter {
  const get = <T>(p: string) => req<T>(apiBase, 'GET', p)
  const post = <T>(p: string, b?: unknown) => req<T>(apiBase, 'POST', p, b)
  const put = <T>(p: string, b?: unknown) => req<T>(apiBase, 'PUT', p, b)
  const patch = <T>(p: string, b?: unknown) => req<T>(apiBase, 'PATCH', p, b)
  const del = <T>(p: string) => req<T>(apiBase, 'DELETE', p)

  return {
    // ----- 视图聚合 -----
    async getView(mode, anchor) {
      if (mode === 'countdown') throw new Error('countdown 视图不走 getView')
      if (mode === 'year') {
        const y = Number(anchor.split('-')[0])
        return get<YearData>(`/view/year/${y}`)
      }
      if (mode === 'month') {
        const [y, mm] = anchor.split('-').map(Number)
        return get<MonthData>(`/view/month/${y}/${mm}`)
      }
      if (mode === 'week') return get<MonthData>(`/view/week/${anchor}`)
      return get<MonthData>(`/view/day/${anchor}`)
    },

    // ----- 图层 -----
    async getLayers() {
      return get<Layer[]>('/layers')
    },
    async toggleLayer(layerId, enabled) {
      return put<Layer>(`/layers/${layerId}`, { enabled })
    },
    async getLayerSubActions(layerId) {
      return get<{ qtype: string; sub_action: string }[]>(`/layers/${layerId}/sub-actions`)
    },
    async updateLayerConfig(layerId, data) {
      return put<Layer>(`/layers/${layerId}/config`, data)
    },
    async createLayer(data) {
      return post<Layer>('/layers', data)
    },
    async deleteLayer(layerId) {
      return del<{ ok: boolean }>(`/layers/${layerId}`)
    },

    // ----- 事件 -----
    async createEvent(ev) {
      return post<CalEvent>('/events', ev)
    },
    async updateEvent(id, ev) {
      return put<CalEvent>(`/events/${id}`, ev)
    },
    async deleteEvent(id) {
      return del<{ ok: boolean }>(`/events/${id}`)
    },

    // ----- 日程（新结构） -----
    async upsertSchedule(d, am, pm, ev) {
      return put(`/schedule/${d}`, { date: d, am: am || null, pm: pm || null, ev: ev || null })
    },
    async getScheduleItems(d) {
      return get<ScheduleItem[]>(`/schedule-items/${d}`)
    },
    async createScheduleItem(item) {
      return post<ScheduleItem>('/schedule-items', item)
    },
    async updateScheduleItem(id, item) {
      return put<ScheduleItem>(`/schedule-items/${id}`, item)
    },
    async deleteScheduleItem(id) {
      return del<{ ok: boolean }>(`/schedule-items/${id}`)
    },

    // ----- 充实度 -----
    async upsertColoring(d, level) {
      return put(`/coloring/${d}`, { level })
    },
    async deleteColoring(d) {
      return del(`/coloring/${d}`)
    },

    // ----- 涂色标记 -----
    async upsertMark(layerId, d, level, note) {
      return post<{ ok: boolean }>('/marks', { layer_id: layerId, date: d, level, note: note ?? null })
    },
    async deleteMark(layerId, d) {
      return del<{ ok: boolean }>(`/marks/${layerId}/${d}`)
    },

    // ----- 拖拽改期 -----
    async moveDay(src, dst) {
      return post<{ moved_events: number; moved_schedule: boolean }>('/move-day', { src, dst })
    },

    // ----- 搜索 -----
    async searchEvents(q) {
      return get<CalEvent[]>(`/search?q=${encodeURIComponent(q)}`)
    },

    // ----- 倒数日 -----
    async getCountdown() {
      return get<{ text: string }>('/countdown')
    },
    async getCountdownList() {
      return get<CountdownItem[]>('/countdown/list')
    },
    async createCountdown(data) {
      return post<CountdownItem>('/countdown', data)
    },
    async updateCountdown(id, data) {
      return put<CountdownItem>(`/countdown/${id}`, data)
    },
    async deleteCountdown(id) {
      return del<{ ok: boolean }>(`/countdown/${id}`)
    },

    // ----- 统计 -----
    async getStatsSummary() {
      return get<StatsSummary>('/stats/summary')
    },

    // ----- 集思录导入 -----
    async importJisilu(start, end, qtypes) {
      return post<{ inserted: number; error: string | null }>('/import/jisilu', { start, end, qtypes })
    },

    // ----- 待办忙度算法配置 -----
    async getTodoBusyConfig() {
      return get('/settings/todo-busy')
    },
    async setTodoBusyConfig(cfg) {
      return put('/settings/todo-busy', cfg)
    },
    async recomputeTodoBusy() {
      return post<{ days_written: number }>('/settings/todo-busy/recompute')
    },

    // ----- 每日提醒配置 -----
    async getTodoReminderConfig() {
      return get('/settings/todo-reminder')
    },
    async setTodoReminderConfig(cfg) {
      return put('/settings/todo-reminder', cfg)
    },

    // ----- Todo 列表 -----
    async getTodoLists() {
      return get<TodoList[]>('/todo/lists')
    },
    async createTodoList(display_name) {
      return post<TodoList>('/todo/lists', { display_name, sort_order: 0 })
    },
    async updateTodoList(id, display_name) {
      return put<TodoList>(`/todo/lists/${id}`, { display_name, sort_order: 0 })
    },
    async deleteTodoList(id) {
      return del<{ ok: boolean }>(`/todo/lists/${id}`)
    },
    async reorderTodoLists(ordered_ids) {
      return put<{ ok: boolean }>('/todo/lists/reorder', { ordered_ids })
    },
    async reorderTodos(ordered_ids) {
      return put<{ ok: boolean }>('/todo/reorder', { ordered_ids })
    },

    // ----- Todo 任务 -----
    async getTodos(params) {
      const qs = new URLSearchParams()
      if (params?.list_id) qs.set('list_id', params.list_id)
      if (params?.status) qs.set('status', params.status)
      if (params?.sort) qs.set('sort', params.sort)
      if (params?.limit) qs.set('limit', String(params.limit))
      if (params?.completed_on) qs.set('completed_on', params.completed_on)
      const suffix = qs.toString() ? `?${qs}` : ''
      return get<Todo[]>(`/todo${suffix}`)
    },
    async getTodoStats(list_id) {
      const qs = list_id ? `?list_id=${encodeURIComponent(list_id)}` : ''
      return get<{ total: number; incomplete: number; completed: number }>(`/todo/stats${qs}`)
    },
    async createTodo(data) {
      return post<Todo>('/todo', data)
    },
    async updateTodo(id, data) {
      return put<Todo>(`/todo/${id}`, data)
    },
    async deleteTodo(id) {
      return del<{ ok: boolean }>(`/todo/${id}`)
    },
    async importTodosCsv(file) {
      // text/csv 纯文本体：Node 数据服务避免解析 multipart
      const text = await file.text()
      const r = await fetch(`${apiBase}/todo/import/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      })
      return r.json() as Promise<{ inserted: number; lists_created: number; errors: string[] }>
    },

    // ----- 多端同步 -----
    async getSyncStatus() {
      return get('/sync/status')
    },
    async getSyncConfig() {
      return get('/sync/config')
    },
    async saveSyncConfig(cfg) {
      return put<{ ok: boolean }>('/sync/config', cfg)
    },
    async testSync() {
      return post<{ ok: boolean; detail: string }>('/sync/test')
    },
    async syncNow() {
      const r = await fetch(`${apiBase}/sync/now`, { method: 'POST' })
      if (r.status === 409) {
        const d = await r.json().catch(() => null)
        return { result: 'needs_decision' as const, remote_rows: d?.detail?.remote_rows ?? 0 }
      }
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        throw new Error(d?.detail ?? `同步失败（${r.status}）`)
      }
      return r.json()
    },
    async resolveSync(mode) {
      return post('/sync/resolve', { mode })
    },

    // ----- 订阅 -----
    async getSubscriptions() {
      return get('/subscriptions')
    },
    async createSubscription(data) {
      return post('/subscriptions', data)
    },
    async patchSubscription(id, data) {
      return patch(`/subscriptions/${id}`, data)
    },
    async deleteSubscription(id) {
      return del<{ ok: boolean }>(`/subscriptions/${id}`)
    },
    async refreshSubscription(id) {
      return post<{ id: string; ok: boolean; inserted?: number; error?: string }>(`/subscriptions/${id}/refresh`)
    },
    async refreshDueSubscriptions() {
      return post<{ refreshed: { id: string; ok: boolean; inserted?: number; error?: string }[] }>(
        '/subscriptions/refresh-due',
      )
    },
  }
}
