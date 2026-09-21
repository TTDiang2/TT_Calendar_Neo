/**
 * 兼容适配层：旧 frontend/src/api/client.ts 的出口面。
 *
 * 旧实现走 HTTP fetch 到 Python sidecar；Neo 里 UI 不再绑定传输协议，
 * 而是通过 setBackend() 注入一个 BackendAdapter（桌面/移动端 = Tauri 命令
 * 直连 SqliteBackend；Web = HTTP 到 Node 服务）。函数签名与旧 client.ts
 * 逐一对齐，组件代码零改动。
 */

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

// ----- 配置/同步/订阅的接口形态（逐字保留旧 client.ts 定义） -----

export interface TodoBusyConfig {
  weights: {
    due_date: number
    planned_date: number
    importance: { high: number; medium: number; low: number }
    complexity: { high: number; medium: number; low: number }
  }
  thresholds: number[]
  predict_colors: string[]
  done_colors: string[]
}

export interface TodoReminderConfig {
  enabled: boolean
  time: string
}

export interface CountdownInput {
  name: string
  category?: string
  base_date: string
  repeat_yearly?: boolean
  repeat_type?: 'solar' | 'lunar'
  milestone_rule?: string | null
  never_expire?: boolean
  notes?: string | null
  color?: string | null
  sort_order?: number
}

export interface SyncConfig {
  repo: string
  branch: string
  auto_on_start: boolean
  sync_on_close: boolean
  has_token: boolean
}

export interface SyncReport {
  pulled?: number
  pushed?: number
  conflicts?: number
  deleted?: number
  revived?: number
  warning?: string
  initialized?: boolean
}

export interface SyncStatus {
  configured: boolean
  at?: string
  ok?: boolean
  report?: SyncReport
  commit?: string | null
  /** 后台自动同步留下的待办提示（如 needs_decision 等待用户决定） */
  notice?: string
}

export interface SyncResult {
  result: string
  pulled?: number
  pushed?: number
  conflicts?: number
  deleted?: number
  revived?: number
  warning?: string
  commit_url?: string | null
  remote_rows?: number
}

export interface Subscription {
  id: string
  display_name: string
  source_key: string
  url: string | null
  rules_text: string | null
  enabled: boolean
  auto_update: boolean
  status: 'active' | 'pending' | 'error'
  last_synced_at: string | null
  last_error?: string | null
  created_at: string | null
}

// ----- 后端适配器接口（= 旧 client.ts 的全部导出函数签名） -----

export interface BackendAdapter {
  // 视图聚合
  getView(mode: ViewMode, anchor: string): Promise<MonthData | YearData>

  // 图层
  getLayers(): Promise<Layer[]>
  toggleLayer(layerId: string, enabled: boolean): Promise<Layer>
  getLayerSubActions(layerId: string): Promise<{ qtype: string; sub_action: string }[]>
  updateLayerConfig(
    layerId: string,
    data: { enabled?: boolean; sub_qtypes?: { qtype: string; sub_action: string | null }[] },
  ): Promise<Layer>
  createLayer(data: {
    display_name: string
    color?: string | null
    kind?: string
    group?: string | null
    config?: Record<string, unknown>
  }): Promise<Layer>
  deleteLayer(layerId: string): Promise<{ ok: boolean }>

  // 事件
  createEvent(ev: CalEvent): Promise<CalEvent>
  updateEvent(id: number, ev: CalEvent): Promise<CalEvent>
  deleteEvent(id: number): Promise<{ ok: boolean }>

  // 日程（旧版 AM/PM/EV）
  upsertSchedule(d: string, am: string | null, pm: string | null, ev: string | null): Promise<unknown>

  // 日程（新结构）
  getScheduleItems(d: string): Promise<ScheduleItem[]>
  createScheduleItem(item: ScheduleItem): Promise<ScheduleItem>
  updateScheduleItem(id: number, item: ScheduleItem): Promise<ScheduleItem>
  deleteScheduleItem(id: number): Promise<{ ok: boolean }>

  // 充实度
  upsertColoring(d: string, level: number): Promise<unknown>
  deleteColoring(d: string): Promise<unknown>

  // 涂色标记
  upsertMark(layerId: string, d: string, level: number | null, note?: string | null): Promise<{ ok: boolean }>
  deleteMark(layerId: string, d: string): Promise<{ ok: boolean }>

  // 拖拽改期
  moveDay(src: string, dst: string): Promise<{ moved_events: number; moved_schedule: boolean }>

  // 搜索
  searchEvents(q: string): Promise<CalEvent[]>

  // 倒数日
  getCountdown(): Promise<{ text: string }>
  getCountdownList(): Promise<CountdownItem[]>
  createCountdown(data: CountdownInput): Promise<CountdownItem>
  updateCountdown(id: number, data: CountdownInput): Promise<CountdownItem>
  deleteCountdown(id: number): Promise<{ ok: boolean }>

  // 统计
  getStatsSummary(list_id?: string): Promise<StatsSummary>

  // 集思录导入
  importJisilu(start: string, end: string, qtypes?: string[]): Promise<{ inserted: number; error: string | null }>

  // 待办忙度算法配置
  getTodoBusyConfig(): Promise<TodoBusyConfig>
  setTodoBusyConfig(cfg: Partial<TodoBusyConfig>): Promise<TodoBusyConfig>
  recomputeTodoBusy(): Promise<{ days_written: number }>

  // 每日提醒配置
  getTodoReminderConfig(): Promise<TodoReminderConfig>
  setTodoReminderConfig(cfg: Partial<TodoReminderConfig>): Promise<TodoReminderConfig>

  // Todo 列表
  getTodoLists(): Promise<TodoList[]>
  createTodoList(display_name: string): Promise<TodoList>
  updateTodoList(id: string, display_name: string): Promise<TodoList>
  deleteTodoList(id: string): Promise<{ ok: boolean }>
  reorderTodoLists(ordered_ids: string[]): Promise<{ ok: boolean }>
  reorderTodos(ordered_ids: string[]): Promise<{ ok: boolean }>

  // Todo 任务
  getTodos(params?: {
    list_id?: string
    status?: TodoStatusFilter
    sort?: TodoSort
    limit?: number
    completed_on?: string
  }): Promise<Todo[]>
  getTodoStats(list_id?: string): Promise<{ total: number; incomplete: number; completed: number }>
  createTodo(data: {
    list_id: string
    title: string
    body?: string | null
    importance?: string
    due_date?: string | null
    planned_date?: string | null
    start_date?: string | null
    complexity?: string
    tags?: string[] | null
    status?: string
    alarm_at?: string | null
    repeat?: string | null
  }): Promise<Todo>
  updateTodo(id: string, data: Record<string, unknown>): Promise<Todo>
  deleteTodo(id: string): Promise<{ ok: boolean }>
  importTodosCsv(file: File): Promise<{ inserted: number; lists_created: number; errors: string[] }>

  // 多端同步
  getSyncStatus(): Promise<SyncStatus>
  getSyncConfig(): Promise<SyncConfig>
  saveSyncConfig(cfg: {
    repo: string
    branch: string
    token?: string
    auto_on_start: boolean
    sync_on_close?: boolean
  }): Promise<{ ok: boolean }>
  testSync(): Promise<{ ok: boolean; detail: string }>
  syncNow(): Promise<SyncResult>
  resolveSync(mode: 'pull_overwrite' | 'merge_push'): Promise<SyncResult>

  // 订阅
  getSubscriptions(): Promise<Subscription[]>
  createSubscription(data: {
    display_name: string
    url?: string
    rules_text?: string
    auto_update?: boolean
  }): Promise<Subscription>
  patchSubscription(
    id: string,
    data: { display_name?: string; enabled?: boolean; auto_update?: boolean },
  ): Promise<Subscription>
  deleteSubscription(id: string): Promise<{ ok: boolean }>
  refreshSubscription(id: string): Promise<{ id: string; ok: boolean; inserted?: number; error?: string }>
  refreshDueSubscriptions(): Promise<{
    refreshed: { id: string; ok: boolean; inserted?: number; error?: string }[]
  }>
}

// ----- 注入点 -----

let backend: BackendAdapter | null = null

/** 注入后端适配器（app 启动时调用一次；未注入时所有请求抛错） */
export function setBackend(b: BackendAdapter): void {
  backend = b
}

export function getBackend(): BackendAdapter {
  if (!backend) {
    throw new Error('UI 后端未注入：app 启动时需先调用 setBackend() 装配 BackendAdapter')
  }
  return backend
}

// ----- 与旧 client.ts 同名同签名的函数面（组件代码零改动） -----

export const getView = (mode: ViewMode, anchor: string) => getBackend().getView(mode, anchor)

export const getLayers = () => getBackend().getLayers()
export const toggleLayer = (layerId: string, enabled: boolean) => getBackend().toggleLayer(layerId, enabled)
export const getLayerSubActions = (layerId: string) => getBackend().getLayerSubActions(layerId)
export const updateLayerConfig = (
  layerId: string,
  data: { enabled?: boolean; sub_qtypes?: { qtype: string; sub_action: string | null }[] },
) => getBackend().updateLayerConfig(layerId, data)
export const createLayer = (data: {
  display_name: string
  color?: string | null
  kind?: string
  group?: string | null
  config?: Record<string, unknown>
}) => getBackend().createLayer(data)
export const deleteLayer = (layerId: string) => getBackend().deleteLayer(layerId)

export const createEvent = (ev: CalEvent) => getBackend().createEvent(ev)
export const updateEvent = (id: number, ev: CalEvent) => getBackend().updateEvent(id, ev)
export const deleteEvent = (id: number) => getBackend().deleteEvent(id)

export const upsertSchedule = (d: string, am: string | null, pm: string | null, ev: string | null) =>
  getBackend().upsertSchedule(d, am, pm, ev)

export const getScheduleItems = (d: string) => getBackend().getScheduleItems(d)
export const createScheduleItem = (item: ScheduleItem) => getBackend().createScheduleItem(item)
export const updateScheduleItem = (id: number, item: ScheduleItem) => getBackend().updateScheduleItem(id, item)
export const deleteScheduleItem = (id: number) => getBackend().deleteScheduleItem(id)

export const upsertColoring = (d: string, level: number) => getBackend().upsertColoring(d, level)
export const deleteColoring = (d: string) => getBackend().deleteColoring(d)

export const upsertMark = (layerId: string, d: string, level: number | null, note: string | null = null) =>
  getBackend().upsertMark(layerId, d, level, note)
export const deleteMark = (layerId: string, d: string) => getBackend().deleteMark(layerId, d)

export const moveDay = (src: string, dst: string) => getBackend().moveDay(src, dst)

export const searchEvents = (q: string) => getBackend().searchEvents(q)

export const getCountdown = () => getBackend().getCountdown()
export const getCountdownList = () => getBackend().getCountdownList()
export const createCountdown = (data: CountdownInput) => getBackend().createCountdown(data)
export const updateCountdown = (id: number, data: CountdownInput) => getBackend().updateCountdown(id, data)
export const deleteCountdown = (id: number) => getBackend().deleteCountdown(id)

export const getStatsSummary = (list_id?: string) => getBackend().getStatsSummary(list_id)

export const importJisilu = (start: string, end: string, qtypes?: string[]) =>
  getBackend().importJisilu(start, end, qtypes)

export const getTodoBusyConfig = () => getBackend().getTodoBusyConfig()
export const setTodoBusyConfig = (cfg: Partial<TodoBusyConfig>) => getBackend().setTodoBusyConfig(cfg)
export const recomputeTodoBusy = () => getBackend().recomputeTodoBusy()

export const getTodoReminderConfig = () => getBackend().getTodoReminderConfig()
export const setTodoReminderConfig = (cfg: Partial<TodoReminderConfig>) => getBackend().setTodoReminderConfig(cfg)

export const getTodoLists = () => getBackend().getTodoLists()
export const createTodoList = (display_name: string) => getBackend().createTodoList(display_name)
export const updateTodoList = (id: string, display_name: string) => getBackend().updateTodoList(id, display_name)
export const deleteTodoList = (id: string) => getBackend().deleteTodoList(id)
export const reorderTodoLists = (ordered_ids: string[]) => getBackend().reorderTodoLists(ordered_ids)
export const reorderTodos = (ordered_ids: string[]) => getBackend().reorderTodos(ordered_ids)

export const getTodos = (
  params: {
    list_id?: string
    status?: TodoStatusFilter
    sort?: TodoSort
    limit?: number
    completed_on?: string
  } = {},
) => getBackend().getTodos(params)
export const getTodoStats = (list_id?: string) => getBackend().getTodoStats(list_id)
export const createTodo = (data: {
  list_id: string
  title: string
  body?: string | null
  importance?: string
  due_date?: string | null
  planned_date?: string | null
  start_date?: string | null
  complexity?: string
  tags?: string[] | null
  status?: string
  alarm_at?: string | null
  repeat?: string | null
}) => getBackend().createTodo(data)
export const updateTodo = (id: string, data: Record<string, unknown>) => getBackend().updateTodo(id, data)
export const deleteTodo = (id: string) => getBackend().deleteTodo(id)
export const importTodosCsv = (file: File) => getBackend().importTodosCsv(file)

export const getSyncStatus = () => getBackend().getSyncStatus()
export const getSyncConfig = () => getBackend().getSyncConfig()
export const saveSyncConfig = (cfg: {
  repo: string
  branch: string
  token?: string
  auto_on_start: boolean
  sync_on_close?: boolean
}) => getBackend().saveSyncConfig(cfg)
export const testSync = () => getBackend().testSync()
export const syncNow = () => getBackend().syncNow()
export const resolveSync = (mode: 'pull_overwrite' | 'merge_push') => getBackend().resolveSync(mode)

export const getSubscriptions = () => getBackend().getSubscriptions()
export const createSubscription = (data: {
  display_name: string
  url?: string
  rules_text?: string
  auto_update?: boolean
}) => getBackend().createSubscription(data)
export const patchSubscription = (
  id: string,
  data: { display_name?: string; enabled?: boolean; auto_update?: boolean },
) => getBackend().patchSubscription(id, data)
export const deleteSubscription = (id: string) => getBackend().deleteSubscription(id)
export const refreshSubscription = (id: string) => getBackend().refreshSubscription(id)
export const refreshDueSubscriptions = () => getBackend().refreshDueSubscriptions()
