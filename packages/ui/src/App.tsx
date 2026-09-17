import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, FolderOpen, Layers, Palette, Plus, SlidersHorizontal, Trophy } from 'lucide-react'
import { useViewData, useCountdown } from './hooks/useApi'
import { toggleLayer, moveDay, getTodoStats, getTodos, getSyncStatus, getSyncConfig, syncNow, refreshDueSubscriptions, getSubscriptions, getTodoBusyConfig, setTodoBusyConfig } from './adapt/api'
import { shiftMonthKey, shiftYearKey, todayStr } from './adapt/data'
import type { CalEvent, Day, Layer, MonthData, TopTab, TodoViewMode, ViewMode, YearData } from './adapt/types'
import { TopBar } from './components/TopBar'
import { Sidebar, MobileLayersDrawer } from './components/Sidebar'
import { MonthGrid } from './components/MonthGrid'
import { WeekView } from './components/WeekView'
import { DayView } from './components/DayView'
import { YearView } from './components/YearView'
import { DetailPanel } from './components/DetailPanel'
import { TodoView, type TodoViewHandle } from './components/TodoView'
import { CountdownView } from './components/CountdownView'
import { StatsView } from './components/StatsView'
import { WidgetsView } from './components/WidgetsView'
import { BottomTabBar, type DockGestureState } from './components/BottomTabBar'
import { animDrawerIn, animEnter, animSlideDirection, animSpringBack } from './anim'
import { useSwipeTabs } from './hooks/useSwipeNav'
import {
  EventEditor,
  ScheduleEditor,
  ColoringPicker,
  SearchDialog,
  SubscriptionDialog,
  ContextMenu,
  DotEntryDialog,
  ColorEntryDialog,
} from './components/dialogs'
import { SettingsDialog } from './components/SettingsDialog'
import { ReminderBanner } from './components/ReminderBanner'
import { useIsMobile } from './hooks/useMedia'

type DialogState =
  | { kind: 'event'; date: string; event?: CalEvent | null }
  | { kind: 'schedule'; date: string }
  | { kind: 'coloring'; date: string }
  | { kind: 'dot'; date: string }
  | { kind: 'color'; date: string }
  | { kind: 'search' }
  | { kind: 'subscription' }
  | { kind: 'settings' }
  | null

interface CtxMenuState {
  x: number
  y: number
  date: string
}

/** 手机右侧详情抽屉：右缘左滑呼出（等同桌面的右侧边栏），玻璃材质 + 弹簧滑入 */
function RightDetailDrawer(props: {
  day: Day | null
  layers: Layer[]
  onClose: () => void
  onEditEvent: (date: string, event: CalEvent) => void
  onEditSchedule: (date: string) => void
  onSetColoring: (date: string) => void
  onAddDot: (date: string) => void
  onAddColor: (date: string) => void
  onAddEvent: (date: string) => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    animDrawerIn(panelRef.current, 1)
  }, [])
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={props.onClose} />
      <aside
        ref={panelRef}
        className="glass-sheet absolute inset-y-0 right-0 w-[300px] max-w-[85vw] rounded-l-3xl overflow-y-auto"
      >
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DetailPanel
            variant="drawer"
            day={props.day}
            layers={props.layers}
            onEditEvent={props.onEditEvent}
            onEditSchedule={props.onEditSchedule}
            onSetColoring={props.onSetColoring}
            onAddDot={props.onAddDot}
            onAddColor={props.onAddColor}
            onAddEvent={props.onAddEvent}
            onClose={props.onClose}
          />
        </div>
      </aside>
    </div>
  )
}

/**
 * 手机日历页内联头部（20260917 任务书 1.1-3：Top Bar 整体移除后，日期导航与
 * 视图切换的移动端新家——不再是横贯 App 的玻璃条，而是日历内容自己的大标题行）。
 */
function MobileCalendarBar({
  title,
  mode,
  onModeChange,
  onPrev,
  onNext,
  onToday,
}: {
  title: string
  mode: ViewMode
  onModeChange: (m: ViewMode) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  const MODES: { key: ViewMode; label: string }[] = [
    { key: 'month', label: '月' },
    { key: 'day', label: '日' },
    { key: 'year', label: '年' },
    { key: 'countdown', label: '倒数' },
  ]
  return (
    <div className="md:hidden flex items-center justify-between gap-1 px-1 pt-0.5 pb-1.5 flex-shrink-0 min-w-0">
      <div className="flex items-center gap-0 min-w-0">
        {mode !== 'countdown' && (
          <button onClick={onPrev} className="p-1.5 -ml-1 rounded-full text-gray-500 active:bg-black/5 transition-colors" aria-label="上一页">
            <ChevronLeft size={20} />
          </button>
        )}
        <h1 className="text-[19px] font-bold text-gray-900 truncate px-0.5">{title}</h1>
        {mode !== 'countdown' && (
          <button onClick={onNext} className="p-1.5 rounded-full text-gray-500 active:bg-black/5 transition-colors" aria-label="下一页">
            <ChevronRight size={20} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="inline-flex rounded-full border border-black/5 bg-white/60 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              className={clsx(
                'px-2.5 py-1 text-xs rounded-full transition whitespace-nowrap',
                mode === m.key ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-500 active:text-gray-700',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode !== 'countdown' && (
          <button
            onClick={onToday}
            className="px-2.5 py-1 text-xs font-semibold text-pink-600 bg-pink-50 rounded-full active:bg-pink-100 transition-colors flex-shrink-0"
          >
            今天
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * 统一新建的底部选择抽屉（20260917 任务书 1.2-3）：日历页 FAB 弹出，
 * 只有两个符合产品哲学的入口——加点点 / 涂色。
 */
function CalendarAddSheet(props: { date: string; onDot: () => void; onColor: () => void; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    animDrawerIn(sheetRef.current, 1)
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={props.onClose} />
      <div
        ref={sheetRef}
        className="glass-sheet relative w-full rounded-t-3xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <p className="text-center text-xs text-gray-400 mb-3">添加到 {props.date.slice(5).replace('-', ' 月 ')} 日</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={props.onDot}
            className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-white/80 border border-black/5 shadow-sm active:bg-pink-50 active:scale-[0.98] transition"
          >
            <span className="w-11 h-11 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center text-lg font-bold">·</span>
            <span className="text-sm font-medium text-gray-800">加点点</span>
            <span className="text-[11px] text-gray-400">事件 · 日程 · 备忘</span>
          </button>
          <button
            onClick={props.onColor}
            className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-white/80 border border-black/5 shadow-sm active:bg-pink-50 active:scale-[0.98] transition"
          >
            <span className="w-11 h-11 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center">
              <Palette size={20} />
            </span>
            <span className="text-sm font-medium text-gray-800">涂色</span>
            <span className="text-[11px] text-gray-400">打卡 · 完成度 · 重要日期</span>
          </button>
        </div>
        <button
          onClick={props.onClose}
          className="w-full mt-3 py-2.5 text-sm text-gray-500 rounded-xl active:bg-black/5 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}

export default function App() {
  // 初始锚点 = 当前月（不能硬编码：三端冷启动都会落在写死的月份上，
  // 真机验收时极易被误读成「数据没保存/白屏没修好」）。注意 monthKey
  // 全程使用未补零格式（如 2026-9），与 shiftMonthKey/goToday 一致
  const [monthKey, setMonthKey] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${n.getMonth() + 1}`
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // 日/周视图的「导航游标」：与 selectedDate(详情弹层选中) 解耦。
  // 过去用 selectedDate 兼任锚点，一旦被关闭详情弹层等操作清空，
  // 日/周视图就回落 monthKey 当月 1 号（monthKey 在 day/week 下从不更新，默认 2026-8 → 跳回 8.1）。
  const [dayCursor, setDayCursor] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>('month')
  const [topTab, setTopTab] = useState<TopTab>('calendar')
  const [todoView, setTodoViewState] = useState<TodoViewMode>(() => {
    const v = localStorage.getItem('todo-view')
    return v === 'matrix' || v === 'kanban' || v === 'gantt' || v === 'stickies' ? v : 'list'
  })
  const setTodoView = (v: TodoViewMode) => {
    localStorage.setItem('todo-view', v)
    setTodoViewState(v)
  }
  const [dialog, setDialog] = useState<DialogState>(null)
  // 统一新建抽屉（1.2-3）：日历页 FAB 弹出的「点点/涂色」选择层，值为目标日期
  const [addSheetDate, setAddSheetDate] = useState<string | null>(null)
  // 综合搜索点中待办后要聚焦的待办 id（切到待办页由 TodoView 消费后清空）
  const [todoFocusId, setTodoFocusId] = useState<string | null>(null)
  const [exitSync, setExitSync] = useState<{ state: 'syncing' } | { state: 'failed'; error: string } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false)
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false)
  // 待办页抽屉的开合上报（详情抽屉状态在 TodoView 内部，这里只镜像用于禁手势）
  const [todoListsOpen, setTodoListsOpen] = useState(false)
  const [todoDetailOpen, setTodoDetailOpen] = useState(false)
  // 分析页抽屉（左=统计范围，右=里程碑），同为手势禁用镜像
  const [statsScopeOpen, setStatsScopeOpen] = useState(false)
  const [statsMilestonesOpen, setStatsMilestonesOpen] = useState(false)
  const todoViewRef = useRef<TodoViewHandle>(null)
  const [dockSuspended, setDockSuspended] = useState(false)
  const dragSource = useRef<string | null>(null)
  const qc = useQueryClient()

  // 一级 tab / 视图切换的内容入场动效（ anime.js；reduced-motion 时自动跳过）。
  // 方向记忆：目标位次 > 来源位次 → 内容从右滑入（前进），反之从左（退回）。
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lastNavIndex = useRef(0)
  useEffect(() => {
    const idx = topTab === 'todo' ? 1 : topTab === 'stats' ? 2 : topTab === 'widgets' ? 3 : 0
    animSlideDirection(contentRef.current, idx - lastNavIndex.current, { distance: 26 })
    lastNavIndex.current = idx
    // 抽屉镜像状态只服务「禁切页手势」；切走后必须复位，否则视图卸载后
    // 手势会带着 true 残留在其它 tab 上整体失效（20260916 审核缺陷 2）
    if (topTab !== 'todo') {
      setTodoListsOpen(false)
      setTodoDetailOpen(false)
    }
    if (topTab !== 'stats') {
      setStatsScopeOpen(false)
      setStatsMilestonesOpen(false)
    }
  }, [topTab])
  // 日历内 月/周/日/年/倒数日 切换保持轻量上浮入场
  useEffect(() => {
    animEnter(contentRef.current, { distance: 8, duration: 260 })
  }, [mode])

  // ── 手机手势（<md）：左右滑切一级 tab；两侧边栏改由 dock 左右按钮呼出
  //    （20260916 任务书：边滑呼侧边栏与切页手势互相打架，一律废除边滑）──────
  const gestureRef = useRef<HTMLDivElement | null>(null)
  const gestureDx = useRef(0)
  // dock 指示片的跟手进度：每帧直写 ref（不 setState），BottomTabBar 的 rAF 消费
  const dockGesture = useRef<DockGestureState>({ active: false, progress: 0 })
  const gestureDisabled = useCallback(
    () =>
      !!dialog ||
      !!ctxMenu ||
      !!addSheetDate ||
      mobileLayersOpen ||
      rightDrawerOpen ||
      todoListsOpen ||
      todoDetailOpen ||
      statsScopeOpen ||
      statsMilestonesOpen ||
      (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches),
    [dialog, ctxMenu, addSheetDate, mobileLayersOpen, rightDrawerOpen, todoListsOpen, todoDetailOpen, statsScopeOpen, statsMilestonesOpen],
  )
  const TAB_ORDER: TopTab[] = ['calendar', 'todo', 'stats']
  useSwipeTabs(gestureRef, {
    disabled: gestureDisabled,
    onLock: () => setDockSuspended(true),
    onMove: (dx) => {
      const idx = TAB_ORDER.indexOf(topTab)
      const atEdge = (idx === 0 && dx > 0) || (idx === TAB_ORDER.length - 1 && dx < 0)
      const applied = atEdge ? dx * 0.25 : dx // 边缘阻尼：告诉用户没有更多页了
      gestureDx.current = applied
      if (contentRef.current) contentRef.current.style.transform = `translateX(${applied}px)`
      dockGesture.current = {
        active: true,
        progress: applied / Math.max(window.innerWidth * 0.4, 1),
      }
    },
    onCommit: (dir) => {
      const idx = TAB_ORDER.indexOf(topTab)
      const next = TAB_ORDER[Math.min(TAB_ORDER.length - 1, Math.max(0, idx + (dir === -1 ? 1 : -1)))]
      const dx = gestureDx.current
      gestureDx.current = 0
      dockGesture.current = { active: false, progress: 0 }
      if (next !== topTab) {
        // 滑入动画统一交给 [topTab] effect（animSlideDirection），这里不手动触发避免双重动画
        if (contentRef.current) contentRef.current.style.transform = ''
        setTopTab(next)
      } else {
        // 已处边缘 tab 仍越过阈值：没有页可切，走弹簧回弹而不是瞬移归零
        animSpringBack(contentRef.current, dx)
      }
      setDockSuspended(false)
    },
    onCancel: () => {
      animSpringBack(contentRef.current, gestureDx.current)
      gestureDx.current = 0
      dockGesture.current = { active: false, progress: 0 }
      setDockSuspended(false)
    },
  })

  const isDayWeek = mode === 'week' || mode === 'day'
  const prevIsDayWeek = useRef<boolean | null>(null)

  // 日/周视图锚点：只由 dayCursor 决定（不再受 selectedDate 清空影响）
  const dayAnchor = useMemo(() => {
    if (dayCursor) return dayCursor
    if (selectedDate) return selectedDate
    const [y, m] = monthKey.split('-').map(Number)
    return `${y}-${String(m).padStart(2, '0')}-01`
  }, [dayCursor, selectedDate, monthKey])

  // 切到 day/week：优先跟随「月视图当前选中日期」，无选中则沿用上次游标/今天，
  // 避免首屏落到陈旧的 monthKey 当月 1 号（默认 2026-8 → 8.1）
  useEffect(() => {
    if (isDayWeek !== prevIsDayWeek.current) {
      prevIsDayWeek.current = isDayWeek
      if (isDayWeek) {
        setDayCursor((c) => selectedDate ?? c ?? todayStr())
      }
    }
  }, [isDayWeek, selectedDate])

  const { data: monthData, isLoading } = useViewData(
    mode === 'countdown' ? 'month' : mode,
    isDayWeek ? dayAnchor : monthKey,
  )
  const { data: countdownData } = useCountdown()

  // 预取待办数据：首次进入日历页时就后台拉取，切到待办 tab 秒开
  useEffect(() => {
    if (topTab === 'calendar') {
      qc.prefetchQuery({ queryKey: ['todoStats', null], queryFn: () => getTodoStats(undefined) })
      qc.prefetchQuery({ queryKey: ['todos', null, 'incomplete', 'due_importance'], queryFn: () => getTodos({ status: 'notStarted', sort: 'due_importance' }) })
    }
  }, [qc, topTab])

  // 启动自动同步：延迟到首屏渲染后静默执行，失败不打扰
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const [st, cfg] = await Promise.all([getSyncStatus(), getSyncConfig()])
        if (st.configured && cfg.auto_on_start) {
          await syncNow()
          qc.invalidateQueries()
        }
      } catch {
        /* 网络异常等，静默跳过 */
      }
      // 订阅自动更新：enabled+auto_update+今日未刷的订阅静默拉取（如集思录）
      try {
        const r = await refreshDueSubscriptions()
        if (r.refreshed.some((x) => x.ok && (x.inserted ?? 0) > 0)) {
          qc.invalidateQueries({ queryKey: ['view'] })
        }
      } catch {
        /* 拉取失败不打扰启动 */
      }
    }, 2000)
    return () => clearTimeout(t)
  }, [qc])

  // 关闭前自动同步（仅 Tauri 桌面版）：拦截窗口关闭 → 同步 → 自动退出；
  // 失败时询问（重试/强制退出/取消）；「正在进行中」视为已有同步在跑，直接退出
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    let unlisten: (() => void) | null = null
    let cancelled = false
    import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow()
      unlisten = await w.onCloseRequested(async (event) => {
        try {
          const [st, cfg] = await Promise.all([getSyncStatus(), getSyncConfig()])
          if (!st.configured || !cfg.sync_on_close) return
          event.preventDefault()
          setExitSync({ state: 'syncing' })
          try {
            await syncNow()
            await w.destroy()
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (msg.includes('正在进行')) {
              await w.destroy()
              return
            }
            setExitSync({ state: 'failed', error: msg })
          }
        } catch {
          /* 配置读取失败（后端已死等）→ 不拦截，正常关闭 */
        }
      })
      if (cancelled) unlisten?.()
    })
    return () => { cancelled = true; unlisten?.() }
  }, [])

  // 看板手机端不呈现（20260916）：持久化的 kanban 视图在手机上回落到列表，
  // 避免「视图停在看板但切回按钮已被隐藏」的死胡同；桌面不受影响
  const isMobile = useIsMobile()
  const effectiveTodoView = isMobile && todoView === 'kanban' ? 'list' : todoView

  const layers = monthData?.layers ?? []

  // 订阅来源的图层在手机端一律不呈现（20260917 任务书 1.2-2：代码保留、前端不露面）。
  // 判别式：jisilu_* 固定前缀 + 「订阅 display_name = 图层组名」约定（与 Sidebar 一致）
  const { data: subs = [] } = useQuery({ queryKey: ['subscriptions'], queryFn: getSubscriptions })
  const subNames = useMemo(() => new Set(subs.map((s) => s.display_name)), [subs])
  const isSubLayer = useCallback(
    (l: Layer) => l.layer_id.startsWith('jisilu_') || (!!l.group && subNames.has(l.group)),
    [subNames],
  )
  const calLayers = useMemo(
    () => (isMobile ? layers.filter((l) => !isSubLayer(l)) : layers),
    [layers, isMobile, isSubLayer],
  )

  // 20260917 任务书 1.2-4：充实度染色不再作为默认染色（用户想用随时可在图层里打开）。
  // 一次性迁移：手机端首次运行把内置 coloring 图层关掉并落 flag，之后不再主动动它。
  useEffect(() => {
    if (!isMobile) return
    let flag = false
    try { flag = localStorage.getItem('coloring-default-off-v1') === '1' } catch { /* 隐私模式等 */ }
    if (flag || layers.length === 0) return
    try { localStorage.setItem('coloring-default-off-v1', '1') } catch { /* 同上 */ }
    const coloring = layers.find((l) => l.layer_id === 'coloring')
    if (coloring?.enabled) {
      toggleLayer('coloring', false)
        .then(() => qc.invalidateQueries({ queryKey: ['view'] }))
        .catch(() => { /* 关不掉就保持现状（用户可手动关） */ })
    }
  }, [isMobile, layers, qc])

  // 20260917 任务书 1.2-5：已完成热力色阶迁到 GitHub 绿。默认值已改绿，但
  // meta 表里可能存着旧钢蓝配置——一次性覆写 done_colors（只动颜色，不动权重）。
  useEffect(() => {
    let flag = false
    try { flag = localStorage.getItem('busy-done-green-v1') === '1' } catch { /* 同上 */ }
    if (flag) return
    try { localStorage.setItem('busy-done-green-v1', '1') } catch { /* 同上 */ }
    const GREEN = ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39']
    getTodoBusyConfig()
      .then((cfg) => {
        if (JSON.stringify(cfg.done_colors) === JSON.stringify(GREEN)) return
        return setTodoBusyConfig({ done_colors: GREEN }).then(() => {
          qc.invalidateQueries({ queryKey: ['todoBusyConfig'] })
          qc.invalidateQueries({ queryKey: ['view'] })
        })
      })
      .catch(() => { /* 迁移失败不影响主流程 */ })
  }, [qc])

  const toggleMutation = useMutation({
    mutationFn: ({ layerId, enabled }: { layerId: string; enabled: boolean }) =>
      toggleLayer(layerId, enabled),
    onMutate: async ({ layerId, enabled }) => {
      const cache = qc.getQueryData<MonthData>(['view', mode, mode === 'week' || mode === 'day' ? dayAnchor : monthKey])
      if (cache) {
        qc.setQueryData(['view', mode, mode === 'week' || mode === 'day' ? dayAnchor : monthKey], {
          ...cache,
          layers: cache.layers.map((l) => (l.layer_id === layerId ? { ...l, enabled } : l)),
        })
      }
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['view'] })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['view'] })
    },
  })

  const moveMutation = useMutation({
    mutationFn: ({ src, dst }: { src: string; dst: string }) => moveDay(src, dst),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['view'] }),
  })

  function toggleLayerFn(layerId: string) {
    const current = layers.find((l) => l.layer_id === layerId)
    if (!current) return
    toggleMutation.mutate({ layerId, enabled: !current.enabled })
  }

  function navigate(delta: number) {
    if (mode === 'countdown') return
    if (mode === 'week') {
      const d = new Date(dayAnchor + 'T00:00:00')
      d.setDate(d.getDate() + delta * 7)
      shiftAnchor(d)
    } else if (mode === 'day') {
      const d = new Date(dayAnchor + 'T00:00:00')
      d.setDate(d.getDate() + delta)
      shiftAnchor(d)
    } else {
      setMonthKey((k) => (mode === 'year' ? shiftYearKey(k, delta) : shiftMonthKey(k, delta)))
    }
  }

  function shiftAnchor(d: Date) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setDayCursor(iso)
    // 同步 monthKey，保证日/周视图翻页后切回月视图月份也对齐
    setMonthKey(`${d.getFullYear()}-${d.getMonth() + 1}`)
  }

  function goToday() {
    const now = new Date()
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setMonthKey(`${now.getFullYear()}-${now.getMonth() + 1}`)
    if (mode === 'week' || mode === 'day') {
      shiftAnchor(now)
    } else {
      setSelectedDate(iso)
    }
  }

  const openEvent = useCallback((date: string, event: CalEvent | null = null) => {
    setDialog({ kind: 'event', date, event })
  }, [])

  // 非宽屏（<lg）：月/日视图点选日期 = 只选中，信息由月视图下方信息栏原地展示
  // （20260917 任务书 1.1-2：不再自动弹右抽屉；右抽屉只由 dock 右按钮呼出）。
  const handleSelectDate = useCallback(
    (date: string) => {
      setSelectedDate(date)
    },
    [],
  )

  const handleDoubleClick = useCallback((date: string) => openEvent(date), [openEvent])

  const handleContextMenu = useCallback(
    (e: { clientX: number; clientY: number }, date: string) => {
      setSelectedDate(date)
      setCtxMenu({ x: e.clientX, y: e.clientY, date })
    },
    [],
  )

  const handleDragStart = useCallback((date: string) => {
    dragSource.current = date
  }, [])

  const handleDrop = useCallback(
    (dst: string) => {
      const src = dragSource.current
      dragSource.current = null
      if (!src || src === dst) return
      moveMutation.mutate({ src, dst })
    },
    [moveMutation],
  )

  // 键盘快捷键：←→ 翻月，T 今天，N 新建，/ 搜索
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (dialog || ctxMenu) return
      if (e.key === 'ArrowLeft') navigate(-1)
      else if (e.key === 'ArrowRight') navigate(1)
      else if (e.key === 't' || e.key === 'T') goToday()
      else if ((e.key === 'n' || e.key === 'N') && selectedDate) openEvent(selectedDate)
      else if (e.key === '/') {
        e.preventDefault()
        setDialog({ kind: 'search' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, ctxMenu, selectedDate, openEvent, mode, dayAnchor])

  const title = useMemo(() => {
    if (!monthData) return '—'
    if (mode === 'year' && 'year' in monthData && !('days' in monthData)) return `${monthData.year} 年`
    return `${monthData.year} 年 ${('month' in monthData ? monthData.month : '')} 月`
  }, [mode, monthData])

  const selectedDay = useMemo(() => {
    if (!selectedDate || !monthData || mode === 'year') return null
    if (!('days' in monthData)) return null
    return monthData.days.find((d) => d.date === selectedDate) ?? null
  }, [selectedDate, monthData, mode])

  function jumpToEvent(ev: CalEvent) {
    const [y, m] = ev.date.split('-').map(Number)
    setMonthKey(`${y}-${m}`)
    setSelectedDate(ev.date)
    setDialog(null)
  }

  /** 综合搜索点中待办：切到待办页并打开该待办的详情抽屉（1.1-1） */
  const jumpToTodo = useCallback((t: { id: string }) => {
    setDialog(null)
    setTodoFocusId(t.id)
    setTopTab('todo')
  }, [])

  // 手机内联头部的短标题（大标题行，Top Bar 移除后日历页的月份锚点）
  const shortTitle = useMemo(() => {
    if (mode === 'countdown') return '倒数日'
    if (!monthData) return '…'
    if (mode === 'year' && 'year' in monthData && !('days' in monthData)) return `${monthData.year}年`
    if (mode === 'week' || mode === 'day') {
      const d = dayAnchor.slice(5).split('-')
      return `${Number(d[0])}月${Number(d[1])}日`
    }
    return monthData && 'month' in monthData ? `${monthData.month}月` : '…'
  }, [mode, monthData, dayAnchor])

  const monthData2 = mode === 'year' || !monthData || !('days' in monthData) ? null : monthData
  const importStart = monthData2?.days[6]?.date ?? '2026-08-01'
  const importEnd = monthData2?.days[36]?.date ?? '2026-08-31'

  return (
    <div className="h-full flex flex-col ambient-root">
      <div className="ambient-content flex flex-col flex-1 min-h-0">
      {exitSync && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 w-[360px] max-w-[calc(100vw-2rem)] text-center">
            {exitSync.state === 'syncing' ? (
              <>
                <div className="mx-auto mb-3 w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-700">正在同步，同步完成后会自动退出……</p>
              </>
            ) : (
              <>
                <p className="text-sm text-red-600 font-medium mb-1">关闭前同步失败</p>
                <p className="text-xs text-gray-500 mb-4 break-all max-h-24 overflow-y-auto">{exitSync.error}</p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={async () => {
                      setExitSync({ state: 'syncing' })
                      try {
                        await syncNow()
                        const { getCurrentWindow } = await import('@tauri-apps/api/window')
                        await getCurrentWindow().destroy()
                      } catch (e) {
                        setExitSync({ state: 'failed', error: e instanceof Error ? e.message : String(e) })
                      }
                    }}
                    className="px-4 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                  >
                    重试同步
                  </button>
                  <button
                    onClick={async () => {
                      const { getCurrentWindow } = await import('@tauri-apps/api/window')
                      await getCurrentWindow().destroy()
                    }}
                    className="px-4 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                  >
                    强制退出
                  </button>
                  <button
                    onClick={() => setExitSync(null)}
                    className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
                  >
                    取消关闭
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* 20260917 任务书 1.1-3：Top Bar 整体移除（手机端）。它承载的一级 tab 与底部
          dock 重复、搜索已收进左侧抽屉；手机端的日期导航/视图切换由日历页内联的
          MobileCalendarBar 与待办页工具行接管。桌面（md+）保持原 Top Bar（桌面零变化红线）。 */}
      <div className="hidden md:block">
        <TopBar
          title={isLoading ? '加载中…' : title}
          topTab={topTab}
          mode={mode}
          todoView={effectiveTodoView}
          onTopTabChange={setTopTab}
          onModeChange={setMode}
          onTodoViewChange={setTodoView}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
          onToday={goToday}
          canPrev={true}
          canNext={true}
          onOpenSearch={() => setDialog({ kind: 'search' })}
          onOpenSubscription={() => setDialog({ kind: 'subscription' })}
          onOpenSettings={() => setDialog({ kind: 'settings' })}
        />
      </div>
      <ReminderBanner onJumpToTodo={() => setTopTab('todo')} />
      {/* 手机手势面：左右滑切一级 tab；内层承接入场/跟手位移动画。
          touch-action: manipulation —— 禁双击缩放但放行全部原生滚动方向：
          pan-y 会与子树 overflow-x 容器取交集，把甘特图/热力图/忙度条的
          原生横向滚动禁成死区（手势不接管+浏览器不滚，20260916 智者 P0-1）；
          横滑切页的接管已由 useSwipeNav 锁横向后的非被动 touchmove
          preventDefault 确定性解决，不依赖 touch-action。 */}
      <div
        ref={gestureRef}
        className="flex-1 flex overflow-hidden pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-0"
        style={{ touchAction: 'manipulation' }}
      >
      <div ref={contentRef} className="flex-1 flex min-w-0">
        {topTab === 'todo' ? (
          <TodoView
            ref={todoViewRef}
            viewMode={effectiveTodoView}
            onViewModeChange={setTodoView}
            listsDrawerOpen={todoListsOpen}
            onListsDrawerOpenChange={setTodoListsOpen}
            onDetailOpenChange={setTodoDetailOpen}
            focusTodoId={todoFocusId}
            onTodoFocusHandled={() => setTodoFocusId(null)}
            onOpenSettings={() => {
              setTodoListsOpen(false)
              setDialog({ kind: 'settings' })
            }}
          />
        ) : topTab === 'stats' ? (
          <StatsView
            onGoTodo={() => setTopTab('todo')}
            scopeOpen={statsScopeOpen}
            onScopeOpenChange={setStatsScopeOpen}
            milestonesOpen={statsMilestonesOpen}
            onMilestonesOpenChange={setStatsMilestonesOpen}
            onOpenSettings={() => {
              setStatsScopeOpen(false)
              setDialog({ kind: 'settings' })
            }}
          />
        ) : topTab === 'widgets' ? (
          <WidgetsView />
        ) : mode === 'countdown' ? (
          <>
            {isMobile && (
              <div className="px-3 pt-2 flex-shrink-0">
                <MobileCalendarBar
                  title={shortTitle}
                  mode={mode}
                  onModeChange={setMode}
                  onPrev={() => navigate(-1)}
                  onNext={() => navigate(1)}
                  onToday={goToday}
                />
              </div>
            )}
            <CountdownView />
          </>
        ) : (
          <>
            <Sidebar
              layers={layers}
              onToggle={toggleLayerFn}
              countdown={countdownData?.text ?? '…'}
            />
            <main className="flex-1 flex flex-col p-2 md:p-4 min-w-0">
              {isMobile && (
                <MobileCalendarBar
                  title={shortTitle}
                  mode={mode}
                  onModeChange={setMode}
                  onPrev={() => navigate(-1)}
                  onNext={() => navigate(1)}
                  onToday={goToday}
                />
              )}
              {isLoading || !monthData ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">加载中…</div>
              ) : mode === 'year' ? (
                <YearView
                  yearData={monthData as YearData}
                  layers={calLayers}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    const [y, m] = date.split('-').map(Number)
                    setMonthKey(`${y}-${m}`)
                    setSelectedDate(date)
                    setMode('month')
                  }}
                />
              ) : mode === 'week' ? (
                <WeekView
                  monthData={monthData2!}
                  layers={calLayers}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  onDoubleClick={handleDoubleClick}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                />
              ) : mode === 'day' ? (
                <DayView
                  monthData={monthData2!}
                  layers={calLayers}
                  selectedDate={selectedDate}
                  onSelect={handleSelectDate}
                  onDoubleClick={handleDoubleClick}
                />
              ) : (
                <MonthGrid
                  monthData={monthData2!}
                  layers={calLayers}
                  selectedDate={selectedDate}
                  onSelect={handleSelectDate}
                  onDoubleClick={handleDoubleClick}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                />
              )}
            </main>
            {mode !== 'year' && (
              /* 桌面（lg+）：右侧详情栏。手机端的日期详情统一走上方 RightDetailDrawer */
              <DetailPanel
                day={selectedDay}
                layers={calLayers}
                onEditEvent={openEvent}
                onEditSchedule={(d) => setDialog({ kind: 'schedule', date: d })}
                onSetColoring={(d) => setDialog({ kind: 'coloring', date: d })}
                onAddDot={(d) => setDialog({ kind: 'dot', date: d })}
                onAddColor={(d) => setDialog({ kind: 'color', date: d })}
                onAddEvent={openEvent}
              />
            )}
          </>
        )}
      </div>
      </div>

      {/* 手机：右侧详情抽屉（右缘左滑呼出，等同桌面的右侧边栏） */}
      {rightDrawerOpen && mode !== 'year' && topTab === 'calendar' && (
        <RightDetailDrawer
          day={selectedDay ?? monthData2?.days.find((d) => d.is_today) ?? null}
          layers={calLayers}
          onClose={() => setRightDrawerOpen(false)}
          onEditEvent={openEvent}
          onEditSchedule={(d) => setDialog({ kind: 'schedule', date: d })}
          onSetColoring={(d) => setDialog({ kind: 'coloring', date: d })}
          onAddDot={(d) => setDialog({ kind: 'dot', date: d })}
          onAddColor={(d) => setDialog({ kind: 'color', date: d })}
          onAddEvent={openEvent}
        />
      )}

      {/* 手机：图层抽屉（dock 左按钮唤出）——设置与综合搜索入口也收在这里（20260917） */}
      <MobileLayersDrawer
        open={mobileLayersOpen}
        onClose={() => setMobileLayersOpen(false)}
        layers={layers}
        onToggle={toggleLayerFn}
        countdown={countdownData?.text ?? '…'}
        onOpenSearch={() => {
          setMobileLayersOpen(false)
          setDialog({ kind: 'search' })
        }}
        onOpenSettings={() => {
          setMobileLayersOpen(false)
          setDialog({ kind: 'settings' })
        }}
      />

      {/* 手机：悬浮 dock——左右按钮呼出两侧边栏（按 tab 分派），中间切 tab；
          切页手势中指示圆片跟手连续滑动（不再隐藏重现） */}
      <BottomTabBar
        active={topTab}
        onChange={setTopTab}
        suspend={dockSuspended}
        gestureRef={dockGesture}
        leftAction={
          topTab === 'calendar' ? (
            { icon: <Layers size={20} />, label: '图层（左侧边栏）', onPress: () => setMobileLayersOpen(true) }
          ) : topTab === 'todo' ? (
            { icon: <FolderOpen size={20} />, label: '待办清单（左侧边栏）', onPress: () => setTodoListsOpen(true) }
          ) : topTab === 'stats' ? (
            { icon: <SlidersHorizontal size={20} />, label: '统计范围（左侧边栏）', onPress: () => setStatsScopeOpen(true) }
          ) : undefined
        }
        rightAction={
          topTab === 'calendar' ? (
            {
              icon: <CalendarDays size={20} />,
              label: '当日详情（右侧边栏）',
              onPress: () => {
                if (mode !== 'year') setRightDrawerOpen(true)
              },
            }
          ) : topTab === 'todo' ? (
            /* 20260917 任务书 1.2-3：dock 右按钮改为待办统计（右抽屉不再承担新建/编辑） */
            { icon: <Trophy size={20} />, label: '待办统计（右侧边栏）', onPress: () => todoViewRef.current?.openStats() }
          ) : topTab === 'stats' ? (
            { icon: <Trophy size={20} />, label: '里程碑（右侧边栏）', onPress: () => setStatsMilestonesOpen(true) }
          ) : undefined
        }
      />

      {/* 统一新建 FAB（20260917 任务书 1.2-3）：日历/待办页右下角粉色加号，
          点开从底部弹抽屉——日历选「点点/涂色」，待办直接进入快速新增 */}
      {isMobile && (topTab === 'calendar' || topTab === 'todo') && (
        <button
          onClick={() => {
            if (topTab === 'calendar') setAddSheetDate(selectedDate ?? todayStr())
            else todoViewRef.current?.openQuickAdd()
          }}
          className="md:hidden fixed right-4 z-30 w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-xl shadow-pink-500/40 flex items-center justify-center active:scale-90 transition-transform"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
          aria-label="新建"
        >
          <Plus size={26} />
        </button>
      )}

      {/* 日历页统一新建抽屉：点点 / 涂色 二选一（1.2-1 + 1.2-3） */}
      {addSheetDate && (
        <CalendarAddSheet
          date={addSheetDate}
          onDot={() => {
            const d = addSheetDate
            setAddSheetDate(null)
            setDialog({ kind: 'dot', date: d })
          }}
          onColor={() => {
            const d = addSheetDate
            setAddSheetDate(null)
            setDialog({ kind: 'color', date: d })
          }}
          onClose={() => setAddSheetDate(null)}
        />
      )}

      {/* 20260916 任务书：日历页悬浮加号按钮已删——呼出右侧边栏即是添加事件的入口 */}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          date={ctxMenu.date}
          onNew={() => {
            const d = ctxMenu.date
            setCtxMenu(null)
            openEvent(d)
          }}
          onSchedule={() => {
            const d = ctxMenu.date
            setCtxMenu(null)
            setDialog({ kind: 'schedule', date: d })
          }}
          onColoring={() => {
            const d = ctxMenu.date
            setCtxMenu(null)
            setDialog({ kind: 'coloring', date: d })
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {dialog?.kind === 'event' && (
        <EventEditor
          date={dialog.date}
          layers={layers}
          event={dialog.event}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'schedule' && (
        <ScheduleEditor
          date={dialog.date}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'coloring' && (
        <ColoringPicker
          date={dialog.date}
          current={selectedDay?.coloring_level ?? null}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'dot' && (
        <DotEntryDialog
          date={dialog.date}
          layers={layers}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'color' && (
        <ColorEntryDialog
          date={dialog.date}
          layers={layers}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'search' && (
        <SearchDialog
          onClose={() => setDialog(null)}
          onJump={jumpToEvent}
          onJumpTodo={jumpToTodo}
          layers={layers}
          hideSubscriptions={isMobile}
        />
      )}
      {dialog?.kind === 'subscription' && (
        <SubscriptionDialog onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          layers={layers}
          onToggleLayer={toggleLayerFn}
          defaultStart={importStart}
          defaultEnd={importEnd}
          onClose={() => setDialog(null)}
        />
      )}
      </div>
    </div>
  )
}
