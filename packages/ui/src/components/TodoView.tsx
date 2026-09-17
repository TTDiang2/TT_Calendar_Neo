import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, Flame, FolderOpen, Inbox, ListPlus, Pencil, Plus, Settings, Star, Trash2, Upload } from 'lucide-react'
import clsx from 'clsx'
import { getTodoLists, getTodos, getTodoStats, createTodo, updateTodo, deleteTodo, createTodoList, updateTodoList, deleteTodoList, importTodosCsv, reorderTodoLists, reorderTodos } from '../adapt/api'
import { todayStr } from '../adapt/todoLogic'
import type { Todo, TodoList, TodoSort, TodoViewMode } from '../adapt/types'
import { TodoDetailPanel, DueDateQuickPicker, type TodoDetailPanelRef } from './TodoDetailPanel'
import { TodoMatrixView } from './todo/TodoMatrixView'
import { TodoKanbanView } from './todo/TodoKanbanView'
import { TodoGanttView } from './todo/TodoGanttView'
import { TodoJarView } from './todo/TodoJarView'
import { TodoStickiesView } from './todo/TodoStickiesView'
import { animDrawerIn } from '../anim'

const SORT_OPTIONS: { key: TodoSort; label: string }[] = [
  { key: 'manual', label: '手动排序' },
  { key: 'due_importance', label: '截止+重要性' },
  { key: 'due_planned_importance', label: '截止+计划+重要性' },
  { key: 'due', label: '截止日' },
  { key: 'planned', label: '计划日' },
  { key: 'importance', label: '重要性' },
  { key: 'created', label: '创建时间' },
]

/** 手机端视图切换选项（Top Bar 移除后收进工具行；看板手机端不呈现，与 20260916 一致） */
const MOBILE_TODO_VIEWS: { key: TodoViewMode; label: string }[] = [
  { key: 'list', label: '列表' },
  { key: 'matrix', label: '矩阵' },
  { key: 'gantt', label: '甘特' },
  { key: 'stickies', label: '便签' },
]

const IMPORTANCE_LABEL: Record<string, string> = {
  high: '重要',
  normal: '普通',
  low: '次要',
}
const IMPORTANCE_TAG_CLS: Record<string, string> = {
  high: 'bg-red-50 text-red-600',
  normal: 'bg-gray-100 text-gray-500',
  low: 'bg-green-50 text-green-600',
}

const STATUS_LABEL: Record<string, string> = {
  notStarted: '未开始',
  inProgress: '进行中',
  completed: '已完成',
  waitingOnOthers: '等待他人',
  deferred: '已推迟',
}
const STATUS_TAG_CLS: Record<string, string> = {
  notStarted: 'bg-gray-100 text-gray-500',
  inProgress: 'bg-blue-50 text-blue-600',
  completed: 'bg-gray-100 text-gray-400',
  waitingOnOthers: 'bg-amber-50 text-amber-600',
  deferred: 'bg-purple-50 text-purple-600',
}

const COMPLEXITY_LABEL: Record<string, string> = {
  simple: '简单',
  medium: '中等',
  hard: '复杂',
}
const COMPLEXITY_TAG_CLS: Record<string, string> = {
  simple: 'bg-green-50 text-green-600',
  medium: 'bg-gray-100 text-gray-500',
  hard: 'bg-purple-50 text-purple-600',
}

const DEFAULT_LIST_KEY = 'tt_default_todo_list'

/** App 的 dock 右按钮 / FAB 经此句柄触发统计抽屉与快速新增（自动建默认清单的逻辑留在内部） */
export interface TodoViewHandle {
  /** 打开快速新增待办抽屉（20260917：统一新建入口，底部弹层） */
  openQuickAdd: () => void
  /** 打开待办统计抽屉（20260917：dock 右按钮改为统计，右抽屉不再承担新建/编辑） */
  openStats: () => void
}

export const TodoView = forwardRef<TodoViewHandle, {
  viewMode: TodoViewMode
  /** 视图切换（Top Bar 移除后手机端工具行的视图下拉回调，App 持有持久化状态） */
  onViewModeChange?: (v: TodoViewMode) => void
  /** 清单抽屉（受控：App 需要知道它开着以禁切页手势） */
  listsDrawerOpen: boolean
  onListsDrawerOpenChange: (open: boolean) => void
  /** 详情抽屉开合上报（App 用于禁手势）；开合本体由内部 selectedTodoId 驱动 */
  onDetailOpenChange?: (open: boolean) => void
  /** 综合搜索点中的待办（App 切到本页后要自动打开的详情 id，消费完回调清空） */
  focusTodoId?: string | null
  onTodoFocusHandled?: () => void
  /** 设置入口（20260916：设置已撤出 Top Bar，手机端收在各页左侧抽屉底部） */
  onOpenSettings?: () => void
}>(function TodoView(
  { viewMode, onViewModeChange, listsDrawerOpen, onListsDrawerOpenChange, onDetailOpenChange, focusTodoId, onTodoFocusHandled, onOpenSettings },
  ref,
) {
  const qc = useQueryClient()
  const [selectedList, setSelectedList] = useState<string | null>(() => localStorage.getItem(DEFAULT_LIST_KEY))
  const [sort, setSort] = useState<TodoSort>('due_planned_importance')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null)
  const [autoList, setAutoList] = useState(false)
  const [csvResult, setCsvResult] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())
  const [manualOrder, setManualOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragTodoId = useRef<string | null>(null)
  const detailRef = useRef<TodoDetailPanelRef>(null)
  const listsDrawerRef = useRef<HTMLElement | null>(null)

  useImperativeHandle(ref, () => ({
    openQuickAdd: () => void openQuickAddFn(),
    openStats: () => setStatsOpen(true),
  }))

  // 详情/统计/快速新增任一浮层打开都上报（App 据此禁切页手势）
  useEffect(() => {
    onDetailOpenChange?.(selectedTodoId !== null || statsOpen || quickAddOpen)
  }, [selectedTodoId, statsOpen, quickAddOpen, onDetailOpenChange])

  // 综合搜索点中的待办：切到本页后自动打开详情（清空清单筛选确保能命中）
  useEffect(() => {
    if (!focusTodoId) return
    setSelectedList(null)
    setSelectedTodoId(focusTodoId)
    onTodoFocusHandled?.()
  }, [focusTodoId, onTodoFocusHandled])

  // 详情抽屉开合上报（App 据此禁切页手势）
  useEffect(() => {
    onDetailOpenChange?.(selectedTodoId !== null)
  }, [selectedTodoId, onDetailOpenChange])

  const { data: lists = [] } = useQuery({
    queryKey: ['todoLists'],
    queryFn: getTodoLists,
  })

  // 轻量统计（首屏立即显示完成数量，不用拉全量）
  const { data: stats } = useQuery({
    queryKey: ['todoStats', selectedList],
    queryFn: () => getTodoStats(selectedList ?? undefined),
  })

  // 未完成 + 进行中：首屏只拉这一部分（快）
  const { data: rawIncomplete = [] } = useQuery({
    queryKey: ['todos', selectedList, 'incomplete', sort],
    queryFn: () => getTodos({ list_id: selectedList ?? undefined, status: 'notStarted', sort }),
  })

  const incomplete = rawIncomplete

  // 已完成：列表展开 / 看板（按状态维度）时拉，限制 500 条
  const { data: completed = [], isLoading: loadingCompleted } = useQuery({
    queryKey: ['todos', selectedList, 'completed', sort],
    queryFn: () => getTodos({ list_id: selectedList ?? undefined, status: 'completed', sort, limit: 500 }),
    enabled: showCompleted || viewMode === 'kanban',
  })

  // 量筒：今日完成（completed_on 精确过滤，避免全量 completed 截断丢今日）
  const today = todayStr()
  const { data: todayDone = [] } = useQuery({
    queryKey: ['todos', 'doneOn', today],
    queryFn: () => getTodos({ status: 'completed', completed_on: today }),
    enabled: viewMode === 'jar',
  })

  // 看板已完成：tag 筛选后用于展开列（计数直接用 stats）
  const filteredCompleted = useMemo(() => {
    return tagFilter ? completed.filter((t) => (t.tags ?? []).includes(tagFilter)) : completed
  }, [completed, tagFilter])

  const selectedTodo = useMemo(
    () => {
      if (!selectedTodoId) return null
      return [...incomplete, ...completed].find((t) => t.id === selectedTodoId) ?? null
    },
    [incomplete, completed, selectedTodoId],
  )

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['todos'] })
    qc.invalidateQueries({ queryKey: ['todoStats'] })
    qc.invalidateQueries({ queryKey: ['todoLists'] })
    qc.invalidateQueries({ queryKey: ['view'] })
  }

  const createMut = useMutation({ mutationFn: createTodo, onSuccess: invalidate })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateTodo(id, data),
    onSuccess: invalidate,
  })
  const deleteMut = useMutation({ mutationFn: deleteTodo, onSuccess: invalidate })
  const reorderTodoMut = useMutation({
    mutationFn: (ordered_ids: string[]) => reorderTodos(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
      qc.invalidateQueries({ queryKey: ['view'] })
    },
  })

  // 无清单时先自动建一个默认清单（桌面新建按钮 / 手机快速新增共用）
  const ensureList = async (): Promise<boolean> => {
    if (lists.length) return true
    setAutoList(true)
    try {
      const tl = await createTodoList('任务')
      setSelectedList(tl.id)
      invalidate()
    } catch {
      setAutoList(false)
      return false
    }
    setAutoList(false)
    return true
  }

  // 桌面「新建待办」按钮：走详情抽屉的幻影新建（桌面零变化红线）
  const openNewTodo = async () => {
    if (!(await ensureList())) return
    setSelectedTodoId('__NEW__')
  }

  // 手机 FAB：快速新增底部抽屉（20260917 任务书 1.2-3——新建不再占用右抽屉）
  const openQuickAddFn = async () => {
    if (await ensureList()) setQuickAddOpen(true)
  }

  const handleToggle = (t: Todo, done: boolean) => {
    setLeavingIds((prev) => new Set(prev).add(t.id))
    if (leavingTimer.current) clearTimeout(leavingTimer.current)
    leavingTimer.current = setTimeout(() => {
      updateMut.mutate({ id: t.id, data: { ...t, id: t.id, status: done ? 'completed' : 'notStarted' } })
      setLeavingIds((prev) => {
        const next = new Set(prev)
        next.delete(t.id)
        return next
      })
    }, 280)
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of incomplete) m.set(t.list_id, (m.get(t.list_id) ?? 0) + 1)
    return m
  }, [incomplete])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const t of [...incomplete, ...completed]) (t.tags ?? []).forEach((tag) => s.add(tag))
    return Array.from(s).sort()
  }, [incomplete, completed])

  const filteredIncomplete = useMemo(() => {
    const base = tagFilter ? incomplete.filter((t) => (t.tags ?? []).includes(tagFilter)) : incomplete
    if (manualOrder) {
      const orderMap = new Map(manualOrder.map((id, i) => [id, i]))
      return [...base].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
    }
    return base
  }, [incomplete, tagFilter, manualOrder])

  const jarTodos = useMemo(() => [...filteredIncomplete, ...todayDone], [filteredIncomplete, todayDone])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setCsvResult(null)
      csvMut.mutate(f)
    }
    e.target.value = ''
  }

  const csvMut = useMutation({
    mutationFn: importTodosCsv,
    onSuccess: (r: { inserted: number; lists_created: number; errors: string[] }) => {
      invalidate()
      setCsvResult(`导入 ${r.inserted} 条，新建 ${r.lists_created} 个列表${r.errors.length ? `，${r.errors.length} 行错误` : ''}`)
    },
    onError: (e: unknown) => setCsvResult(`导入失败: ${e instanceof Error ? e.message : 'unknown'}`),
  })

  const completedCount = stats?.completed ?? (showCompleted ? completed.length : undefined)
  const currentListName = selectedList ? lists.find((l) => l.id === selectedList)?.display_name ?? '全部' : '全部'

  // 清单抽屉打开时弹簧滑入（20260916：左侧边栏 = 当前待办清单的管理面板）
  useEffect(() => {
    if (listsDrawerOpen) animDrawerIn(listsDrawerRef.current, -1)
  }, [listsDrawerOpen])

  const selectList = (id: string | null) => {
    setSelectedList(id)
    setSelectedTodoId(null)
    setManualOrder(null)
  }

  // roomy：手机端抽屉里的大行距 + 操作按钮常显（触屏没有 hover，hover-only
  // 按钮等于永远不可见——20260917 任务书 1.1-5 抽屉手机化）
  const listManager = (
    <TodoListManager
      lists={lists}
      statsIncomplete={stats?.incomplete}
      counts={counts}
      selectedList={selectedList}
      onSelect={selectList}
      onDefaultList={setDefaultList}
      roomy
    />
  )

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 左列表栏 — 桌面（md+）固定列；手机由 dock 左按钮唤出同内容的抽屉 */}
      <div className="hidden md:flex w-60 bg-white/55 border-r border-white/60 p-3 overflow-y-auto flex flex-col flex-shrink-0">
        {listManager}
      </div>

      {/* 中任务区 */}
      <div className="flex-1 flex flex-col p-2 md:p-4 overflow-hidden min-w-0">
        {/* 20260917 任务书 1.1-9：原三行（清单提示 / 排序筛选 / 新建待办）并为一行；
            新建待办撤出工具行（手机统一走右下角 FAB，桌面按钮保留）。视图切换在
            手机端也收进本行（Top Bar 移除后的新家），用下拉保持紧凑。 */}
        <div className="flex items-center gap-2 mb-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => onListsDrawerOpenChange(true)}
            className="md:hidden pressable flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-full bg-white/70 border border-white/80 text-gray-700 shadow-sm active:bg-pink-50 transition-colors flex-shrink-0"
            aria-label="切换待办清单"
          >
            <FolderOpen size={14} className="text-pink-500" />
            <span className="font-medium max-w-[88px] truncate">{currentListName}</span>
            <span className="text-[11px] text-gray-400">{stats?.incomplete ?? ''}</span>
          </button>
          {/* 不加 overflow-x-auto：一轴 auto 会把另一轴的 visible 算成 auto，
              FilterSelect 的 absolute 下拉会被裁进行高里（20260916 智者 P0-4） */}
          <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
            <FilterSelect
              label="排序"
              value={sort}
              options={SORT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              onChange={(v) => { setSort(v as TodoSort); setManualOrder(null) }}
            />
            {allTags.length > 0 && (
              <FilterSelect
                label="筛选"
                value={tagFilter}
                options={[{ value: '', label: '全部标签' }, ...allTags.map((t) => ({ value: t, label: t }))]}
                onChange={(v) => { setTagFilter(v); setManualOrder(null) }}
              />
            )}
            {/* 手机端视图切换（md:hidden）：Top Bar 移除后收进工具行 */}
            <div className="md:hidden">
              <FilterSelect
                label="视图"
                value={viewMode}
                options={MOBILE_TODO_VIEWS.map((o) => ({ value: o.key, label: o.label }))}
                onChange={(v) => onViewModeChange?.(v as TodoViewMode)}
              />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* CSV 导入桌面专属：手机文件选择器体验边缘，与移动瘦身方针一致（20260916 智者 P2-8） */}
            <label className="hidden md:flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer" title="CSV 导入">
              <Upload size={14} /> CSV 导入
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </label>
            <button
              onClick={() => void openNewTodo()}
              disabled={autoList}
              className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-40"
            >
              <Plus size={14} /> 新建待办
            </button>
          </div>
        </div>

        {csvResult && <div className="mb-2 text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded flex-shrink-0">{csvResult}</div>}

        <div className={viewMode === 'list' ? 'flex-1 overflow-y-auto' : 'flex-1 min-h-0'}>
          {viewMode === 'matrix' ? (
            <TodoMatrixView todos={filteredIncomplete} lists={lists} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} onToggle={handleToggle} />
          ) : viewMode === 'kanban' ? (
            <TodoKanbanView
              openTodos={filteredIncomplete}
              completedTodos={filteredCompleted}
              completedCount={stats?.completed ?? completed.length}
              lists={lists}
              selectedTodoId={selectedTodoId}
              onSelect={setSelectedTodoId}
              onToggle={handleToggle}
              onUpdate={(id, data) => updateMut.mutate({ id, data })}
            />
          ) : viewMode === 'gantt' ? (
            <TodoGanttView todos={filteredIncomplete} lists={lists} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} />
          ) : viewMode === 'stickies' ? (
            <TodoStickiesView
              todos={filteredIncomplete}
              selectedTodoId={selectedTodoId}
              onSelect={setSelectedTodoId}
              onOpenNotes={(id) => { setSelectedTodoId(id); detailRef.current?.openNotes() }}
            />
          ) : viewMode === 'jar' ? (
            <TodoJarView
              todos={jarTodos}
              selectedTodoId={selectedTodoId}
              onSelect={setSelectedTodoId}
              onOpenNotes={(id) => { setSelectedTodoId(id); detailRef.current?.openNotes() }}
            />
          ) : filteredIncomplete.length === 0 && completedCount === undefined ? (
            <div className="h-full flex items-center justify-center text-gray-300 text-sm">
              {tagFilter ? `没有「${tagFilter}」标签的待办` : '暂无待办，点右下角 + 新建'}
            </div>
          ) : (
            <div className="flex flex-col gap-2 md:gap-1">
              {filteredIncomplete.length === 0 && completedCount === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">没有未完成待办</p>
              )}
              {filteredIncomplete.map((t) => {
                const listName = lists.find((l) => l.id === t.list_id)?.display_name
                const overdue = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      dragTodoId.current = t.id
                      setDraggingId(t.id)
                    }}
                    onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverId(t.id) }}
                    onDrop={() => {
                      const src = dragTodoId.current
                      dragTodoId.current = null
                      setDraggingId(null)
                      setDragOverId(null)
                      if (!src || src === t.id) return
                      const ids = filteredIncomplete.map((x) => x.id)
                      const from = ids.indexOf(src)
                      const to = ids.indexOf(t.id)
                      if (from < 0 || to < 0) return
                      ids.splice(to, 0, ids.splice(from, 1)[0])
                      setManualOrder(ids)
                      reorderTodoMut.mutate(ids)
                      setSort('manual')
                    }}
                    className={clsx(
                      'transition-opacity rounded-lg select-none cursor-grab active:cursor-grabbing',
                      draggingId === t.id && 'opacity-30',
                      dragOverId === t.id && draggingId !== t.id && 'ring-2 ring-pink-400 ring-offset-1',
                    )}
                  >
                    <TodoRow
                      todo={t}
                      listName={listName}
                      isDone={false}
                      overdue={!!overdue}
                      selected={selectedTodoId === t.id}
                      leaving={leavingIds.has(t.id)}
                      onSelect={() => setSelectedTodoId(t.id)}
                      onToggle={() => handleToggle(t, true)}
                      onOpenNotes={() => { setSelectedTodoId(t.id); detailRef.current?.openNotes() }}
                    />
                  </div>
                )
              })}

              {(completedCount ?? 0) > 0 && (
                <div className="mt-3 border-t border-gray-100 pt-2">
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md"
                  >
                    <span>已完成（{completedCount}）</span>
                    {showCompleted ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showCompleted && (
                    <div className="mt-1 flex flex-col gap-1">
                      {loadingCompleted && <p className="text-xs text-gray-400 px-3 py-1">加载中…</p>}
                      {completed.map((t) => {
                        const listName = lists.find((l) => l.id === t.list_id)?.display_name
                        return (
                          <TodoRow
                            key={t.id}
                            todo={t}
                            listName={listName}
                            isDone={true}
                            overdue={false}
                            selected={selectedTodoId === t.id}
                            leaving={leavingIds.has(t.id)}
                            onSelect={() => setSelectedTodoId(t.id)}
                            onToggle={() => handleToggle(t, false)}
                            onOpenNotes={() => { setSelectedTodoId(t.id); detailRef.current?.openNotes() }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右详情抽屉 — 手机（<lg）为右侧边栏（20260916：与日历页右侧边栏统一），桌面为右列 */}
      <TodoDetailPanel
        ref={detailRef}
        todo={selectedTodoId === '__NEW__'
          ? { id: '' as string, list_id: selectedList ?? lists[0]?.id ?? '', title: '', body: null, importance: 'normal', due_date: null, planned_date: null, start_date: null, complexity: 'medium', tags: null, status: 'notStarted', created_at: null, completed_at: null, sort_order: 0 }
          : selectedTodo}
        lists={lists}
        onClose={() => setSelectedTodoId(null)}
        onSave={(data) => {
          if (!data.id) {
            createMut.mutate({
              list_id: data.list_id,
              title: data.title,
              body: data.body,
              importance: data.importance,
              due_date: data.due_date,
              planned_date: data.planned_date,
              start_date: data.start_date,
              complexity: data.complexity,
              tags: data.tags,
              status: data.status,
            })
          } else {
            updateMut.mutate({ id: data.id, data: { ...data, id: data.id } })
          }
        }}
        onDelete={(id) => { deleteMut.mutate(id); setSelectedTodoId(null) }}
      />

      {/* 手机：快速新增待办——FAB 唤出的底部抽屉（20260917 任务书 1.2-3）。
          portal 到 body：手势容器残留 transform 会把 fixed 圈进内容区（同清单抽屉的理由） */}
      {quickAddOpen && createPortal(
        <QuickAddSheet
          lists={lists}
          defaultListId={selectedList ?? lists[0]?.id ?? ''}
          onClose={() => setQuickAddOpen(false)}
          onCreate={(data) => {
            createMut.mutate(data)
            setQuickAddOpen(false)
          }}
        />,
        document.body,
      )}

      {/* 手机：待办统计右抽屉——dock 右按钮唤出（20260917 任务书 1.2-3：
          右抽屉回归「查看」，新建/编辑走 FAB + 点条目；这里呈现轻统计） */}
      {statsOpen && createPortal(
        <TodoStatsDrawer lists={lists} currentListName={currentListName} onClose={() => setStatsOpen(false)} onGoDetail={(id) => { setStatsOpen(false); setSelectedTodoId(id) }} />,
        document.body,
      )}

      {/* 手机：清单抽屉（dock 左按钮 / 清单提示 chip 唤出）——与桌面左列同一份管理组件。
          portal 到 body：待办页在手势容器内，容器残留 transform 会把 fixed 抽屉圈进
          内容区矩形（遮罩盖不住 dock），portal 彻底绕开包含块问题 */}
      {listsDrawerOpen && createPortal(
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => onListsDrawerOpenChange(false)} />
          <aside ref={listsDrawerRef} className="glass-sheet absolute inset-y-0 left-0 w-[290px] max-w-[85vw] rounded-r-3xl p-3 pt-3 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-2 pl-1">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">待办清单</h2>
              <button
                onClick={() => onListsDrawerOpenChange(false)}
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md text-lg"
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            {listManager}
            <div className="mt-auto pt-2">
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="w-full flex items-center gap-2 px-2 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white/70 rounded-xl transition-colors"
                >
                  <Settings size={16} className="text-gray-400" /> 设置
                </button>
              )}
              <button
                onClick={() => onListsDrawerOpenChange(false)}
                className="w-full flex items-center gap-2 px-2 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white/70 rounded-xl mb-1 transition-colors"
              >
                <Check size={16} className="text-gray-400" /> 完成
              </button>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </div>
  )

  function setDefaultList(id: string | null) {
    if (id) localStorage.setItem(DEFAULT_LIST_KEY, id)
    else localStorage.removeItem(DEFAULT_LIST_KEY)
    setSelectedList(id)
  }
})

/**
 * 快速新增待办（手机底部抽屉，20260917 任务书 1.2-3）：标题 + 清单 + 截止 + 重要性，
 * 一次滑动一次输入法，保存即建。detail 抽屉回归纯查看/编辑。
 */
function QuickAddSheet({
  lists,
  defaultListId,
  onClose,
  onCreate,
}: {
  lists: TodoList[]
  defaultListId: string
  onClose: () => void
  onCreate: (data: { list_id: string; title: string; importance: string; due_date: string | null }) => void
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [title, setTitle] = useState('')
  const [listId, setListId] = useState(defaultListId)
  const [dueDate, setDueDate] = useState('')
  const [importance, setImportance] = useState<'high' | 'normal' | 'low'>('normal')

  useEffect(() => {
    animDrawerIn(sheetRef.current, 1)
  }, [])

  const canSave = title.trim().length > 0 && !!listId

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div ref={sheetRef} className="glass-sheet relative w-full rounded-t-3xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">新建待办</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-full text-xl" aria-label="关闭">
            ×
          </button>
        </div>

        <input
          autoFocus
          className="tt-input text-base mb-3"
          placeholder="要做什么？"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onCreate({ list_id: listId, title: title.trim(), importance, due_date: dueDate || null })
          }}
        />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="text-xs text-gray-500">
            <span className="block mb-1">清单</span>
            <select className="tt-input" value={listId} onChange={(e) => setListId(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.display_name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            <span className="block mb-1">截止日期</span>
            <DueDateQuickPicker value={dueDate} onChange={setDueDate} expanded={false} setExpanded={() => {}} />
          </label>
        </div>

        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1.5">重要性</p>
          <div className="grid grid-cols-3 gap-2">
            {([['high', '重要'], ['normal', '普通'], ['low', '次要']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setImportance(k)}
                className={clsx(
                  'py-2 rounded-xl text-sm border transition',
                  importance === k
                    ? 'border-pink-400 bg-pink-50 text-pink-700 font-semibold'
                    : 'border-gray-200 bg-white/70 text-gray-600',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => canSave && onCreate({ list_id: listId, title: title.trim(), importance, due_date: dueDate || null })}
          disabled={!canSave}
          className="w-full py-3 text-[15px] font-semibold bg-pink-500 text-white rounded-2xl active:bg-pink-600 disabled:opacity-40 transition-colors"
        >
          添加待办
        </button>
      </div>
    </div>
  )
}

/**
 * 待办统计右抽屉（20260917 任务书 1.2-3）：dock 右按钮呼出的轻统计——
 * 未完成 / 已过期 / 即将到期 / 重要 / 今日计划 / 今日已完成 + 各清单分布。
 */
function TodoStatsDrawer({
  lists,
  currentListName,
  onClose,
  onGoDetail,
}: {
  lists: TodoList[]
  currentListName: string
  onClose: () => void
  onGoDetail: (id: string) => void
}) {
  const drawerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    animDrawerIn(drawerRef.current, 1)
  }, [])
  const today = todayStr()
  const listNameOf = (id: string) => lists.find((l) => l.id === id)?.display_name ?? '未命名清单'
  const { data: stats } = useQuery({ queryKey: ['todoStats', null], queryFn: () => getTodoStats(undefined) })
  const { data: open = [] } = useQuery({
    queryKey: ['todos', null, 'incomplete', 'due_importance'],
    queryFn: () => getTodos({ status: 'notStarted', sort: 'due_importance' }),
  })
  const { data: todayDone = [] } = useQuery({
    queryKey: ['todos', 'doneOn', today],
    queryFn: () => getTodos({ status: 'completed', completed_on: today }),
  })

  const dayDiff = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
  const overdue = open.filter((t) => t.due_date != null && dayDiff(t.due_date) < 0)
  const dueToday = open.filter((t) => t.due_date === today)
  const dueSoon = open.filter((t) => t.due_date != null && dayDiff(t.due_date) >= 0 && dayDiff(t.due_date) <= 7)
  const important = open.filter((t) => t.importance === 'high')
  const plannedToday = open.filter((t) => t.planned_date === today)

  const byList = new Map<string, Todo[]>()
  for (const t of open) {
    const arr = byList.get(t.list_id) ?? []
    arr.push(t)
    byList.set(t.list_id, arr)
  }

  const rows: { icon: React.ReactNode; label: string; count: number; tone: string; items?: Todo[] }[] = [
    { icon: <Inbox size={15} />, label: '未完成', count: stats?.incomplete ?? open.length, tone: 'text-gray-500' },
    { icon: <AlertTriangle size={15} />, label: '已过期', count: overdue.length, tone: 'text-red-500', items: overdue },
    { icon: <Clock size={15} />, label: '今天截止', count: dueToday.length, tone: 'text-orange-500', items: dueToday },
    { icon: <Clock size={15} />, label: '7 天内到期', count: dueSoon.length, tone: 'text-amber-500', items: dueSoon },
    { icon: <Flame size={15} />, label: '重要', count: important.length, tone: 'text-rose-500', items: important },
    { icon: <Star size={15} />, label: '今日计划', count: plannedToday.length, tone: 'text-pink-500', items: plannedToday },
  ]

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <aside ref={drawerRef} className="glass-sheet absolute inset-y-0 right-0 w-[300px] max-w-[85vw] rounded-l-3xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800">待办统计</h2>
            <p className="text-[11px] text-gray-400 truncate">范围：全部清单 · 当前查看「{currentListName}」</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-full text-xl flex-shrink-0" aria-label="关闭">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            {rows.map((r) => (
              <div key={r.label} className="rounded-2xl bg-white/80 border border-black/5 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <span className={r.tone}>{r.icon}</span>
                  {r.label}
                </p>
                <p className="text-xl font-bold text-gray-800 tabular-nums mt-0.5">{r.count}</p>
              </div>
            ))}
            <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <Check size={15} className="text-emerald-500" />
                今日已完成
              </p>
              <p className="text-xl font-bold text-emerald-600 tabular-nums mt-0.5">{todayDone.length}</p>
            </div>
          </div>

          {/* 即将到期/重要的具体条目：点一条直接打开其详情 */}
          {(dueToday.length > 0 || overdue.length > 0) && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5">需要立刻关注</p>
              <div className="flex flex-col gap-1">
                {[...overdue, ...dueToday].slice(0, 5).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onGoDetail(t.id)}
                    className="flex items-center gap-2 text-left px-2.5 py-2 rounded-xl bg-white/80 border border-black/5 active:bg-pink-50 transition-colors"
                  >
                    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', overdue.includes(t) ? 'bg-red-500' : 'bg-orange-400')} />
                    <span className="text-[13px] text-gray-700 truncate flex-1">{t.title}</span>
                    <span className={clsx('text-[10px] flex-shrink-0', overdue.includes(t) ? 'text-red-500 font-medium' : 'text-gray-400')}>
                      {overdue.includes(t) ? '已过期' : '今天'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {byList.size > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1.5">各清单未完成</p>
              <div className="flex flex-col gap-1 px-1">
                {[...byList.entries()].map(([lid, arr]) => (
                  <div key={lid} className="flex items-center gap-2 text-[13px]">
                    <span className="text-gray-600 truncate flex-1">{listNameOf(lid)}</span>
                    <span className="text-gray-400 tabular-nums">{arr.length}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

/** 清单管理（桌面左列 / 手机抽屉共用）：全部 + 各清单（拖拽排序、重命名、删默认星标）+ 新建 */
function TodoListManager({
  lists,
  statsIncomplete,
  counts,
  selectedList,
  onSelect,
  onDefaultList,
  roomy = false,
}: {
  lists: TodoList[]
  statsIncomplete?: number
  counts: Map<string, number>
  selectedList: string | null
  onSelect: (id: string | null) => void
  onDefaultList: (id: string | null) => void
  roomy?: boolean
}) {
  const qc = useQueryClient()
  const [creatingList, setCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const dragListId = useRef<string | null>(null)

  const createListMut = useMutation({ mutationFn: (name: string) => createTodoList(name), onSuccess: () => qc.invalidateQueries({ queryKey: ['todoLists'] }) })
  const renameListMut = useMutation({
    mutationFn: ({ id, display_name }: { id: string; display_name: string }) => updateTodoList(id, display_name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todoLists'] })
      setRenamingListId(null)
    },
  })
  const cancelRename = () => { setRenamingListId(null); setRenameDraft('') }
  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim()
    if (!trimmed) { cancelRename(); return }
    renameListMut.mutate({ id, display_name: trimmed })
  }
  const deleteListMut = useMutation({
    mutationFn: deleteTodoList,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todoLists'] })
      qc.invalidateQueries({ queryKey: ['todos'] })
      qc.invalidateQueries({ queryKey: ['todoStats'] })
      qc.invalidateQueries({ queryKey: ['view'] })
    },
  })
  const reorderListMut = useMutation({
    mutationFn: (ordered_ids: string[]) => reorderTodoLists(ordered_ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todoLists'] }),
  })

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <button
        onClick={() => onSelect(null)}
        className={clsx(
          'flex items-center justify-between rounded-xl text-sm mb-1',
          roomy ? 'px-2.5 py-3' : 'px-2 py-1.5 rounded-md',
          selectedList === null ? 'bg-pink-50 text-pink-700 font-medium' : 'text-gray-600 hover:bg-gray-50',
        )}
      >
        <span className="flex items-center gap-1.5"><Inbox size={14} /> 全部</span>
        {statsIncomplete !== undefined && <span className="text-xs text-gray-400">{statsIncomplete}</span>}
      </button>
      {lists.map((l) => {
        const isDefault = localStorage.getItem(DEFAULT_LIST_KEY) === l.id
        return (
          <div
            key={l.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', l.id)
              e.dataTransfer.effectAllowed = 'move'
              dragListId.current = l.id
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={() => {
              const src = dragListId.current
              dragListId.current = null
              if (!src || src === l.id) return
              const ids = lists.map((x) => x.id)
              const from = ids.indexOf(src)
              const to = ids.indexOf(l.id)
              if (from < 0 || to < 0) return
              ids.splice(to, 0, ids.splice(from, 1)[0])
              reorderListMut.mutate(ids)
            }}
            className={clsx(
              'group flex items-center justify-between rounded-xl text-sm cursor-pointer mb-0.5 transition-colors select-none',
              roomy ? 'px-2.5 py-3' : 'px-2 py-1.5 rounded-md',
              selectedList === l.id ? 'bg-pink-50 text-pink-700 font-medium' : 'text-gray-600 hover:bg-gray-100',
            )}
            onClick={() => onSelect(l.id)}
          >
            <span className="truncate flex-1 flex items-center gap-1">
              <span className="opacity-30 group-hover:opacity-60 text-[10px] select-none">⋮⋮</span>
              {renamingListId === l.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => commitRename(l.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(l.id) }
                    else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 bg-white border border-pink-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-400"
                />
              ) : (
                l.display_name
              )}
            </span>
            <span className="flex items-center gap-1">
              {counts.get(l.id) ? <span className="text-xs text-gray-400">{counts.get(l.id)}</span> : null}
              <button
                onClick={(e) => { e.stopPropagation(); onDefaultList(isDefault ? null : l.id) }}
                className={clsx('text-gray-300 hover:text-amber-400', isDefault ? 'text-amber-400' : roomy ? '' : 'opacity-0 group-hover:opacity-100')}
                title={isDefault ? '取消默认' : '设为默认列表'}
              >
                <Star size={12} fill={isDefault ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRenamingListId(l.id); setRenameDraft(l.display_name) }}
                className={clsx('text-gray-400 hover:text-pink-500', !roomy && 'opacity-0 group-hover:opacity-100')}
                title="重命名"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm(`删除列表「${l.display_name}」及其所有待办？`)) deleteListMut.mutate(l.id) }}
                className={clsx('text-gray-400 hover:text-red-500', !roomy && 'opacity-0 group-hover:opacity-100')}
              >
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        )
      })}

      {creatingList ? (
        <div className="mt-2 flex gap-1">
          <input
            autoFocus
            className="tt-input flex-1 text-sm"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newListName.trim()) { createListMut.mutate(newListName.trim()); setNewListName(''); setCreatingList(false) }
              if (e.key === 'Escape') { setCreatingList(false); setNewListName('') }
            }}
            placeholder="列表名"
          />
        </div>
      ) : (
        <button onClick={() => setCreatingList(true)} className={clsx('flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mt-1 rounded-xl hover:bg-black/[0.03]', roomy ? 'px-2.5 py-3' : 'px-2 py-1.5')}>
          <ListPlus size={14} /> 新建列表
        </button>
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 text-sm rounded-lg border transition',
          open
            ? 'border-pink-300 bg-pink-50 text-pink-700 shadow-sm'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300',
        )}
      >
        <span className="text-gray-400">{label}</span>
        <span className="font-medium">{current?.label}</span>
        <ChevronDown size={14} className={clsx('text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[170px] bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-30">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={clsx(
                'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left transition',
                o.value === value
                  ? 'text-pink-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} className="text-pink-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TodoRow({ todo, listName, isDone, overdue, selected, leaving, onSelect, onToggle, onOpenNotes }: {
  todo: Todo
  listName?: string
  isDone: boolean
  overdue: boolean
  selected: boolean
  leaving?: boolean
  onSelect: () => void
  onToggle: () => void
  onOpenNotes?: () => void
}) {
  const dueState = useMemo(() => {
    if (!todo.due_date) return null
    const today = new Date(new Date().toDateString()).getTime()
    const due = new Date(todo.due_date).getTime()
    const diff = Math.round((due - today) / 86400000)
    if (diff < 0) return { label: '已过期', cls: 'bg-red-100 text-red-600' }
    if (diff === 0) return { label: '今天截止', cls: 'bg-orange-100 text-orange-600' }
    if (diff === 1) return { label: '明天截止', cls: 'bg-amber-100 text-amber-600' }
    return null
  }, [todo.due_date])

  const todayStr = new Date().toISOString().slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const plannedToday = todo.planned_date === todayStr
  const plannedTomorrow = todo.planned_date === tomorrowStr

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpenNotes}
      className={clsx(
        'group flex items-start gap-2.5 px-3 py-2.5 md:py-2 rounded-2xl md:rounded-lg cursor-pointer border transition-all duration-200 tt-row-enter',
        selected
          ? 'bg-pink-50 border-pink-200 shadow-sm'
          : 'bg-white md:bg-transparent border-gray-100 md:border-transparent shadow-sm md:shadow-none hover:bg-gray-100 hover:border-gray-200 active:scale-[0.99]',
        leaving && 'opacity-0 scale-[0.98] -translate-x-2 max-h-0 py-0 my-0 overflow-hidden',
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className={clsx(
          'w-[18px] h-[18px] mt-0.5 rounded-full border flex-shrink-0 flex items-center justify-center transition-all duration-200 active:scale-75',
          isDone ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50',
        )}
      >
        {isDone && <Check size={12} className="text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-[15px] md:text-sm leading-snug break-words whitespace-normal', isDone ? 'text-gray-400 line-through' : 'text-gray-800')}>{todo.title}</p>
        {todo.body && <p className="text-xs text-gray-400 break-words whitespace-normal mt-0.5">{todo.body}</p>}
        <div className="flex flex-wrap gap-1 mt-1">
          {todo.complexity && (
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', COMPLEXITY_TAG_CLS[todo.complexity] ?? COMPLEXITY_TAG_CLS.medium)}>
              {COMPLEXITY_LABEL[todo.complexity] ?? todo.complexity}
            </span>
          )}
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', IMPORTANCE_TAG_CLS[todo.importance] ?? IMPORTANCE_TAG_CLS.normal)}>
            {IMPORTANCE_LABEL[todo.importance] ?? todo.importance}
          </span>
          {!isDone && todo.status && todo.status !== 'notStarted' && (
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', STATUS_TAG_CLS[todo.status] ?? STATUS_TAG_CLS.notStarted)}>
              {STATUS_LABEL[todo.status] ?? todo.status}
            </span>
          )}
          {(todo.tags ?? []).map((tag) => (
            <span key={tag} className="text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5 flex-wrap justify-end">
        {listName && !isDone && <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{listName}</span>}
        {todo.due_date && !isDone && (
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', dueState ? dueState.cls : 'bg-gray-100 text-gray-500')}>
            {dueState ? `${dueState.label} · ${todo.due_date.slice(5)}` : todo.due_date.slice(5)}
          </span>
        )}
        {plannedToday && !isDone && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-600">今日计划</span>
        )}
        {plannedTomorrow && !isDone && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-600">明日计划</span>
        )}
      </div>
    </div>
  )
}
