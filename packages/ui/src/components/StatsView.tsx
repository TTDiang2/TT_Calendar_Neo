/**
 * 分析面板 —— 20260916 任务书重做：里程碑化 + 统计扩充 + UI 苹果化。
 *
 * 结构（自上而下）：
 *  1. 里程碑英雄卡（渐变玻璃 + 称号 + 距下一里程碑进度 + 连续打卡）——
 *     取代旧版「总完成数 + 97% 完成率」的简陋呈现（任务书点名没意义）；
 *  2. 贡献热力图（GitHub 绿块风格）：完成次数 / 充实度 双切换；
 *  3. 忙度预测条（未来 14 天，琥珀档位）；
 *  4. 每日完成柱状图（7/14/30 窗口翻页，保留）；
 *  5. 未完成分类环形图（保留）；6. 近期完成（保留）；7. 四象限散点（桌面）。
 *
 * 左侧边栏 = 统计范围（全部 / 某清单）+ 设置入口；右侧边栏 = 里程碑成就墙。
 * 两个抽屉 portal 到 body（待办页同理：手势容器内 fixed 会被 transform 圈住）。
 * 全部数据来自 StatsSummary（后端聚合），前端只做窗口切片 / 里程碑推演。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Inbox,
  ListTodo,
  Settings,
  Trophy,
} from 'lucide-react'
import clsx from 'clsx'
import { getStatsSummary, getTodoLists, getTodos } from '../adapt/api'
import { COLORING_COLORS, TODO_BUSY_PREDICT_COLORS, todayStr } from '../adapt/data'
import { animCountUp, animGrowBars, animDrawerIn, animRing, animStaggerChildren } from '../anim'

const SEGMENT_COLORS = [
  '#EC4899', '#F97316', '#10B981', '#3B82F6', '#8B5CF6',
  '#14B8A6', '#F59E0B', '#6366F1', '#EF4444', '#64748B',
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 贡献图配色：完成次数用 GitHub 绿系；充实度直接用它的五档真色（本来就是涂色语言）
const DONE_HEAT_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const EMPTY_CELL = '#ebedf0'

// 累计完成里程碑阶梯（称号, 门槛）
const MILESTONES: { title: string; at: number }[] = [
  { title: '初试身手', at: 10 },
  { title: '渐入佳境', at: 50 },
  { title: '百炼成钢', at: 100 },
  { title: '身经百战', at: 250 },
  { title: '千锤百炼', at: 1000 },
  { title: '二千斩', at: 2000 },
  { title: '待办传奇', at: 5000 },
]

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 连续完成天数（当前 streak 允许「今天还没完成」从昨天起算；longest 为历史最长） */
function computeStreaks(dates: string[]): { current: number; longest: number } {
  const set = new Set(dates)
  let current = 0
  const cursor = new Date()
  if (!set.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (set.has(fmt(cursor))) {
    current += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  const sorted = [...set].sort()
  let longest = 0
  let run = 0
  let prev: Date | null = null
  for (const s of sorted) {
    const d = new Date(s + 'T00:00:00')
    if (prev && (d.getTime() - prev.getTime()) / 86400000 === 1) run += 1
    else run = 1
    longest = Math.max(longest, run)
    prev = d
  }
  return { current, longest }
}

function fmtRangeLabel(dates: string[]): string {
  if (dates.length === 0) return ''
  const head = dates[0]!.slice(5).replace('-', '/')
  const tail = dates[dates.length - 1]!.slice(5).replace('-', '/')
  return dates.length === 1 ? head : `${head} - ${tail}`
}

export function StatsView({
  onGoTodo,
  scopeOpen,
  onScopeOpenChange,
  milestonesOpen,
  onMilestonesOpenChange,
  onOpenSettings,
}: {
  onGoTodo?: () => void
  scopeOpen: boolean
  onScopeOpenChange: (open: boolean) => void
  milestonesOpen: boolean
  onMilestonesOpenChange: (open: boolean) => void
  onOpenSettings?: () => void
}) {
  // 统计范围（左侧边栏决定；持久化，桌面同一份逻辑）
  const [scopeList, setScopeList] = useState<string | null>(() => localStorage.getItem('stats_scope'))
  const setScope = (id: string | null) => {
    if (id) localStorage.setItem('stats_scope', id)
    else localStorage.removeItem('stats_scope')
    setScopeList(id)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'summary', scopeList],
    queryFn: () => getStatsSummary(scopeList ?? undefined),
    staleTime: 30_000,
  })
  const { data: lists = [] } = useQuery({ queryKey: ['todoLists'], queryFn: getTodoLists })
  const { data: recentDone } = useQuery({
    queryKey: ['todos', 'completed-recent'],
    queryFn: async () => {
      // 近期完成按「完成日」取最近 3 天（completed_on），避免按创建时间截断
      // 导致老任务今天完成时漏掉；按 completed_at 排序取前 8。
      const days: string[] = []
      for (let i = 0; i < 3; i += 1) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push(fmt(d))
      }
      const batches = await Promise.all(
        days.map((day) => getTodos({ status: 'completed', completed_on: day })),
      )
      return batches.flat()
    },
    staleTime: 30_000,
  })

  // 每日完成柱状图：窗口大小 + 相对末端的偏移（< 向历史翻，> 向今天回）
  const [windowSize, setWindowSize] = useState<7 | 14 | 30>(30)
  const [windowOffset, setWindowOffset] = useState(0)
  // 贡献热力图模式（完成次数 / 充实度）
  const [heatMode, setHeatMode] = useState<'done' | 'coloring'>('done')

  const gridRef = useRef<HTMLDivElement | null>(null)
  const barsRef = useRef<HTMLDivElement[]>([])
  const doneNumRef = useRef<HTMLSpanElement | null>(null)
  const ringRef = useRef<SVGCircleElement | null>(null)
  const scopeDrawerRef = useRef<HTMLDivElement | null>(null)
  const milestonesDrawerRef = useRef<HTMLDivElement | null>(null)

  const daily = data?.daily_done ?? []
  const coloringDaily = data?.coloring_daily ?? []
  const busyPredict = data?.busy_predict ?? []

  // 里程碑推演
  const milestones = useMemo(() => {
    if (!data) return []
    const completed = data.stats.completed
    return MILESTONES.map((m, i) => {
      const prevAt = i > 0 ? MILESTONES[i - 1]!.at : 0
      const reached = completed >= m.at
      const progress = reached ? 1 : Math.max(0, Math.min(1, (completed - prevAt) / (m.at - prevAt)))
      return { ...m, reached, progress }
    })
  }, [data])

  const currentMilestone = useMemo(() => {
    let cur = { title: '初出茅庐', at: 0 }
    for (const m of MILESTONES) if ((data?.stats.completed ?? 0) >= m.at) cur = m
    return cur
  }, [data])

  const nextMilestone = useMemo(() => MILESTONES.find((m) => (data?.stats.completed ?? 0) < m.at) ?? null, [data])
  // streak 用全量完成日期集（completion_dates 无窗口封顶），不用热力图的 190 天切片；
  // 老 server + 新 UI 时 completion_dates 缺失 → 回落窗口内近似值（20260916 审核记录项）
  const streaks = useMemo(
    () => {
      const full = data?.completion_dates ?? []
      if (full.length) return computeStreaks(full)
      return computeStreaks(daily.filter((d) => d.count > 0).map((d) => d.date))
    },
    [data],
  )
  const coloringDays = useMemo(() => coloringDaily.filter((c) => c.level >= 3).length, [coloringDaily])

  // 贡献热力图数据（近 26 周）
  const doneByDate = useMemo(() => new Map(daily.map((d) => [d.date, d.count])), [daily])
  const coloringByDate = useMemo(() => new Map(coloringDaily.map((c) => [c.date, c.level])), [coloringDaily])

  useEffect(() => {
    if (!data) return
    animStaggerChildren(gridRef.current)
    animCountUp(doneNumRef.current, data.stats.completed)
  }, [data, windowSize, scopeList])

  useEffect(() => {
    // 只保留仍挂在 DOM 上的柱（窗口从 30 天缩到 7 天时旧 ref 不持有已卸载元素）
    barsRef.current = barsRef.current.filter((el) => el && el.isConnected)
    animGrowBars(barsRef.current)
  }, [windowSize, windowOffset])

  useEffect(() => {
    if (scopeOpen) animDrawerIn(scopeDrawerRef.current, -1)
    if (milestonesOpen) animDrawerIn(milestonesDrawerRef.current, 1)
  }, [scopeOpen, milestonesOpen])

  // 完成率环形（里程碑卡内的小环，替代旧版「总完成率大字」）
  const doneRate = data && data.stats.total > 0 ? data.stats.completed / data.stats.total : 0
  const RING_R = 26
  const CIRC = 2 * Math.PI * RING_R

  // 无一次性守卫：切换统计范围（scopeList）后 data/doneRate 变化时都要重绘到新值
  useEffect(() => {
    if (!data) return
    animRing(ringRef.current, CIRC * (1 - doneRate))
  }, [data, doneRate, CIRC, scopeList])

  const windowDates = useMemo(() => {
    if (!data) return []
    // daily_done 已扩到 190 天：柱状图窗口以今天为锚向历史切片
    const anchor = new Date()
    const doneBy = new Map(daily.map((d) => [d.date, d.count]))
    const out: { date: string; count: number }[] = []
    for (let i = windowSize - 1; i >= 0; i -= 1) {
      const d = new Date(anchor)
      d.setDate(d.getDate() - i - windowOffset)
      out.push({ date: fmt(d), count: doneBy.get(fmt(d)) ?? 0 })
    }
    return out
  }, [data, daily, windowSize, windowOffset])

  const maxCount = Math.max(1, ...windowDates.map((d) => d.count))
  const recent = useMemo(() => {
    const rows = [...(recentDone ?? [])]
    rows.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return rows.slice(0, 8)
  }, [recentDone])

  // quadrant（未完成待办）按清单分布 → 环形图扇区
  const segments = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    for (const q of data.quadrant) counts.set(q.list_id, (counts.get(q.list_id) ?? 0) + 1)
    const total = data.quadrant.length
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([listId, count], i) => ({
        listId,
        name: data.list_names[listId] ?? '未命名清单',
        count,
        pct: total > 0 ? count / total : 0,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]!,
      }))
  }, [data])

  if (isLoading || !data) {
    return <main className="flex-1 flex items-center justify-center text-gray-400">加载中…</main>
  }

  const scopeName = scopeList ? data.list_names[scopeList] ?? '未命名清单' : '全部清单'

  // 面板内容（桌面常驻栏 / 手机抽屉共用同一份 JSX，对齐 TodoView 的 TodoListManager 模式）
  const scopePanel = (
    <div className="flex flex-col flex-1 min-h-0">
      <button
        onClick={() => setScope(null)}
        className={clsx(
          'flex items-center justify-between px-2 py-2 rounded-md text-sm mb-0.5',
          scopeList === null ? 'bg-pink-50 text-pink-700 font-medium' : 'text-gray-600 hover:bg-gray-50',
        )}
      >
        <span className="flex items-center gap-1.5"><Inbox size={14} /> 全部清单</span>
      </button>
      {lists.map((l) => (
        <button
          key={l.id}
          onClick={() => setScope(l.id)}
          className={clsx(
            'flex items-center px-2 py-2 rounded-md text-sm mb-0.5 truncate',
            scopeList === l.id ? 'bg-pink-50 text-pink-700 font-medium' : 'text-gray-600 hover:bg-gray-50',
          )}
        >
          <span className="truncate">{l.display_name}</span>
        </button>
      ))}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="mt-auto flex items-center gap-2 px-2 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white/70 rounded-xl transition-colors"
        >
          <Settings size={16} className="text-gray-400" /> 设置
        </button>
      )}
    </div>
  )

  const milestonesPanel = (
    <div className="flex flex-col gap-2">
      {milestones.map((m) => (
        <div
          key={m.title}
          className={clsx(
            'rounded-2xl border p-3',
            m.reached ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50' : 'border-gray-100 bg-white/60',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={clsx('text-sm font-semibold', m.reached ? 'text-amber-700' : 'text-gray-500')}>
              {m.reached ? '🏅 ' : ''}{m.title}
            </span>
            <span className="text-[11px] text-gray-400 tabular-nums">{m.at} 项</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2">
            <div
              className={clsx('h-full rounded-full', m.reached ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-pink-400')}
              style={{ width: `${Math.round(m.progress * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex-1 flex overflow-hidden min-w-0">
      {/* 桌面（md+）：常驻左栏 = 统计范围（与手机抽屉同一份内容，20260916 审核项 A） */}
      <aside className="hidden md:flex w-60 bg-white/55 border-r border-white/60 p-3 overflow-y-auto flex-col flex-shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">统计范围</h2>
        {scopePanel}
      </aside>
      <main className="flex-1 flex flex-col overflow-y-auto min-w-0">
      <div ref={gridRef} className="p-3 md:p-5 grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 pb-24 md:pb-6 max-w-5xl w-full mx-auto">
        {/* ── 里程碑英雄卡（苹果化：品牌渐变 + 玻璃高光 + 大数字） ── */}
        <section className="lg:col-span-2 rounded-3xl p-5 md:p-6 relative overflow-hidden text-white bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 shadow-xl shadow-rose-500/25">
          <div className="absolute inset-0 pointer-events-none opacity-30" style={{ background: 'radial-gradient(24rem 12rem at 85% -10%, rgba(255,255,255,0.85), transparent 60%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/70 flex items-center gap-1.5">
                <Trophy size={13} /> 里程碑 · {scopeName}
              </p>
              <h2 className="text-2xl md:text-3xl font-bold mt-1 drop-shadow-sm">{currentMilestone.title}</h2>
              <p className="text-sm text-white/85 mt-1">
                累计完成 <span ref={doneNumRef} className="text-xl font-bold tabular-nums">0</span> 项待办
              </p>
            </div>
            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 flex-shrink-0 drop-shadow">
              <circle cx="32" cy="32" r={RING_R} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="6" />
              <circle
                ref={ringRef}
                cx="32" cy="32" r={RING_R} fill="none"
                stroke="#ffffff" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC}
              />
            </svg>
          </div>
          {nextMilestone ? (
            <div className="relative mt-4">
              <div className="flex items-center justify-between text-[11px] text-white/85 mb-1">
                <span>下一枚：{nextMilestone.title}</span>
                <span className="tabular-nums">{data.stats.completed} / {nextMilestone.at}</span>
              </div>
              <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/90 transition-[width] duration-700"
                  style={{ width: `${Math.round(((data.stats.completed - currentMilestone.at) / (nextMilestone.at - currentMilestone.at)) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="relative mt-4 text-sm text-white/90">已站上最高里程碑，传奇就是你自己 🏆</p>
          )}
          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-medium">
              <Flame size={13} /> 连续 {streaks.current} 天
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-medium">
              <CheckCircle2 size={13} /> 最长 {streaks.longest} 天
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-300" /> 高充实 {coloringDays} 天
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-medium">
              <ListTodo size={13} /> 待处理 {data.stats.incomplete}
            </span>
          </div>
        </section>

        {/* ── 贡献热力图（GitHub 绿块风格）：完成 / 充实度 双切换 ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-gray-700">贡献热力图</h3>
            <div className="inline-flex rounded-full border border-gray-200 p-0.5 bg-gray-50">
              {(['done', 'coloring'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setHeatMode(m)}
                  className={clsx(
                    'px-2.5 py-0.5 text-xs rounded-full transition',
                    heatMode === m ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {m === 'done' ? '完成' : '充实度'}
                </button>
              ))}
            </div>
          </div>
          <Heatmap mode={heatMode} done={doneByDate} coloring={coloringByDate} />
          <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-gray-400">
            <span>少</span>
            {(heatMode === 'done' ? DONE_HEAT_COLORS : [EMPTY_CELL, ...COLORING_COLORS]).map((c) => (
              <span key={c} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span>多</span>
          </div>
        </section>

        {/* ── 忙度预测：未来 14 天 ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">忙度预测 · 未来 14 天</h3>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {busyPredict.map((b) => {
              const dt = new Date(b.date + 'T00:00:00')
              const today = todayStr()
              return (
                <div key={b.date} className="flex flex-col items-center gap-1 flex-shrink-0 w-9" title={`${b.date}：${b.level != null ? `忙度 ${b.level + 1} 档` : '暂无预测'}`}>
                  <span className={clsx('text-[9px]', b.date === today ? 'text-pink-600 font-semibold' : 'text-gray-400')}>
                    {b.date === today ? '今天' : WEEKDAYS[dt.getDay()].slice(-1)}
                  </span>
                  <span
                    className={clsx(
                      'w-8 h-8 rounded-xl border shadow-sm',
                      b.date === today ? 'border-pink-400' : 'border-white/60',
                    )}
                    style={{ backgroundColor: b.level != null && b.level >= 0 ? TODO_BUSY_PREDICT_COLORS[b.level] : '#f3f4f6' }}
                  />
                  <span className="text-[9px] text-gray-400 tabular-nums">{b.date.slice(8)}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── 每日任务完成（保留） ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-700">每日任务完成</h3>
            <div className="inline-flex rounded-full border border-gray-200 p-0.5 bg-gray-50">
              {([7, 14, 30] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => { setWindowSize(n); setWindowOffset(0) }}
                  className={clsx(
                    'px-2.5 py-0.5 text-xs rounded-full transition',
                    windowSize === n ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {n}天
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 mb-2">
            <button
              onClick={() => setWindowOffset((o) => Math.min(o + windowSize, Math.max(0, 180 - windowSize)))}
              disabled={windowOffset + windowSize >= 180}
              className="p-1 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"
              title="更早"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[11px] text-gray-400 tabular-nums w-24 text-center">{fmtRangeLabel(windowDates.map((d) => d.date))}</span>
            <button
              onClick={() => setWindowOffset((o) => Math.max(0, o - windowSize))}
              disabled={windowOffset === 0}
              className="p-1 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"
              title="更近"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          {windowDates.every((d) => d.count === 0) ? (
            <div className="h-40 flex flex-col items-center justify-center gap-1 text-gray-300">
              <BarChart3 size={22} strokeWidth={1.5} className="opacity-50" />
              <p className="text-xs">该时间窗内没有完成记录</p>
              <p className="text-[11px]">换个更长的时间范围，或先去完成几个待办试试</p>
            </div>
          ) : (
            <div className="flex items-stretch gap-1.5 h-40" aria-label="每日完成任务数柱状图">
              {windowDates.map((d, i) => {
                const h = Math.max(4, (d.count / maxCount) * 100)
                const dt = new Date(d.date + 'T00:00:00')
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.date}：完成 ${d.count} 项`}>
                    <div className="w-full flex-1 flex items-end justify-center min-h-0">
                      <div
                        ref={(el) => { if (el) barsRef.current[i] = el }}
                        className={clsx('w-full max-w-7 rounded-t-md origin-bottom', d.count > 0 ? 'bg-gradient-to-t from-pink-500 to-rose-400' : 'bg-pink-200/70')}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    {windowSize <= 14 && <span className="text-[9px] text-gray-400 truncate max-w-full">{WEEKDAYS[dt.getDay()].slice(-1)}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 未完成任务分类（保留） ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">未完成任务分类</h3>
            <span className="text-[11px] text-gray-400">{data.quadrant.length} 项未完成</span>
          </div>
          {segments.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">太棒了，没有未完成的任务 🎉</p>
          ) : (
            <div className="flex items-center gap-5">
              <svg width="110" height="110" viewBox="0 0 110 110" className="-rotate-90 flex-shrink-0">
                {(() => {
                  let acc = 0
                  return segments.map((s) => {
                    const dash = s.pct * CIRC
                    const el = (
                      <circle
                        key={s.listId}
                        cx="55" cy="55" r={RING_R} fill="none"
                        stroke={s.color} strokeWidth="14"
                        strokeDasharray={`${dash} ${CIRC - dash}`}
                        strokeDashoffset={-acc}
                      />
                    )
                    acc += dash
                    return el
                  })
                })()}
              </svg>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                {segments.map((s) => (
                  <div key={s.listId} className="flex items-center gap-2 text-xs min-w-0">
                    <i className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-gray-600 truncate flex-1">{s.name}</span>
                    <span className="text-gray-400 tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── 近期完成（保留） ── */}
        <section className="glass-card rounded-3xl p-4 md:p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">近期完成</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">还没有已完成任务</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0"
                    role="img"
                    aria-label="已完成"
                  >
                    <CheckCircle2 size={12} className="text-white" />
                  </span>
                  <span className="text-sm text-gray-700 truncate flex-1">{t.title}</span>
                  {t.due_date && <span className="text-[11px] text-gray-300 flex-shrink-0 hidden sm:inline">截止 {t.due_date.slice(5)}</span>}
                  <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
                    {(t.completed_at ?? '').slice(5, 16).replace('T', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {data.quadrant.length > 0 && onGoTodo && (
            <button
              onClick={onGoTodo}
              className="mt-3 text-xs text-pink-500 hover:text-pink-600 transition"
            >
              共 {data.quadrant.length} 项未完成 · 去待办页处理 →
            </button>
          )}
        </section>

        {/* 待办四象限（桌面宽屏附加值） */}
        <section className="hidden lg:block glass-card rounded-3xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">待办四象限</h3>
          <p className="text-[11px] text-gray-400 mb-2">横轴：到期紧迫度 → 纵轴：重要性 ↑（点 = 未完成待办）</p>
          <Quadrant data={data} />
        </section>
      </div>

      {/* ── 左侧边栏：统计范围（portal，理由同待办页抽屉） ── */}
      {scopeOpen && createPortal(
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => onScopeOpenChange(false)} />
          <div ref={scopeDrawerRef} className="glass-sheet absolute inset-y-0 left-0 w-[290px] max-w-[85vw] rounded-r-3xl p-3 pt-3 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-2 pl-1">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">统计范围</h2>
              <button onClick={() => onScopeOpenChange(false)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md text-lg" aria-label="关闭">×</button>
            </div>
            {scopePanel}
            <div className="pt-2">
              <button
                onClick={() => onScopeOpenChange(false)}
                className="w-full flex items-center gap-2 px-2 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white/70 rounded-xl mb-1 transition-colors"
              >
                <Check size={16} className="text-gray-400" /> 完成
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── 右侧边栏：里程碑成就墙 ── */}
      {milestonesOpen && createPortal(
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => onMilestonesOpenChange(false)} />
          <aside ref={milestonesDrawerRef} className="glass-sheet absolute inset-y-0 right-0 w-[300px] max-w-[85vw] rounded-l-3xl p-4 pt-3 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <Trophy size={13} className="text-amber-400" /> 里程碑
              </h2>
              <button onClick={() => onMilestonesOpenChange(false)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md text-lg" aria-label="关闭">×</button>
            </div>
            {milestonesPanel}
          </aside>
        </div>,
        document.body,
      )}
      </main>

      {/* 桌面（lg+）：常驻右栏 = 里程碑成就墙（断点对齐 DetailPanel 的右栏 lg 惯例） */}
      <aside className="hidden lg:flex w-72 bg-white/55 border-l border-white/60 p-3 overflow-y-auto flex-col flex-shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1 flex items-center gap-1.5">
          <Trophy size={13} className="text-amber-400" /> 里程碑
        </h2>
        {milestonesPanel}
      </aside>
    </div>
  )
}

/**
 * GitHub 风格贡献热力图：近 26 周，每列周一开始。
 * 起点按周一回退 0-6 天，实际渲染 26-27 列（27 列 ~348px，手机 overflow-x-auto 兜底）；
 * 后端取数窗口 190 天 = 182 + 6，保证最左回退列也有数据（20260916 审核项 B）。
 */
function Heatmap({
  mode,
  done,
  coloring,
  weeks = 26,
}: {
  mode: 'done' | 'coloring'
  done: Map<string, number>
  coloring: Map<string, number>
  weeks?: number
}) {
  const cells = useMemo(() => {
    const today = new Date()
    // 末列 = 本周（以今天收尾），向历史取 weeks*7 天，并对齐到周一开头
    const end = new Date(today)
    const start = new Date(today)
    start.setDate(start.getDate() - (weeks * 7 - 1))
    const startDow = (start.getDay() + 6) % 7 // 周一=0
    start.setDate(start.getDate() - startDow)
    const out: { date: string; count: number; level: number }[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = fmt(d)
      out.push({ date: key, count: done.get(key) ?? 0, level: coloring.get(key) ?? -1 })
    }
    return out
  }, [done, coloring, weeks])

  const quantize = (n: number): number => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4)

  const columns: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7))

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px] w-max">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, ri) => {
              const cell = col[ri]
              if (!cell) return <span key={ri} className="w-[10px] h-[10px]" />
              let color: string
              let label: string
              if (mode === 'done') {
                color = DONE_HEAT_COLORS[quantize(cell.count)]!
                label = `${cell.date}：完成 ${cell.count} 项`
              } else {
                color = cell.level >= 0 ? COLORING_COLORS[Math.min(cell.level, 4)]! : EMPTY_CELL
                label = `${cell.date}：${cell.level >= 0 ? `充实度 ${cell.level + 1} 档` : '未涂色'}`
              }
              return (
                <span
                  key={ri}
                  title={label}
                  className="w-[10px] h-[10px] rounded-[2px] flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 四象限散点（桌面宽屏附加值，保留） */
function Quadrant({ data }: { data: Awaited<ReturnType<typeof getStatsSummary>> }) {
  const IMPORTANCE_COLOR: Record<string, string> = { high: '#ef4444', normal: '#eab308', low: '#22c55e' }
  const points = data.quadrant.map((q) => {
    const days = q.days_to_due ?? 365
    const urgency = days < 0 ? 0 : Math.min(days / 30, 1)
    const imp = q.importance === 'high' ? 0 : q.importance === 'low' ? 1 : 0.5
    return { ...q, x: urgency, y: imp }
  })
  return (
    <div>
      <div className="relative h-56 border border-gray-100 rounded-xl bg-gray-50/50">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-200" />
        <span className="absolute top-1.5 left-2 text-[10px] text-red-400">紧急·重要</span>
        <span className="absolute top-1.5 right-2 text-[10px] text-orange-400">不紧急·重要</span>
        <span className="absolute bottom-1.5 left-2 text-[10px] text-yellow-500">紧急·次要</span>
        <span className="absolute bottom-1.5 right-2 text-[10px] text-gray-400">不紧急·次要</span>
        {points.map((p) => (
          <div
            key={p.id}
            title={`${p.title}${p.days_to_due != null ? `（${p.days_to_due < 0 ? `已逾期${-p.days_to_due}天` : `${p.days_to_due}天后到期`}）` : '（无到期日）'}`}
            className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 border border-white shadow cursor-pointer"
            style={{
              left: `${(p.x * 85 + 7.5).toFixed(1)}%`,
              top: `${(p.y * 78 + 8).toFixed(1)}%`,
              backgroundColor: IMPORTANCE_COLOR[p.importance] ?? '#eab308',
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: '#ef4444' }} />高</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: '#eab308' }} />普通</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: '#22c55e' }} />低</span>
        <span className="ml-auto flex items-center gap-1"><ListTodo size={10} />{points.length} 个未完成</span>
      </div>
    </div>
  )
}
