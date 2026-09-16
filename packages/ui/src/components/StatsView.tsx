/**
 * 分析面板 —— 任务完成情况深度分析（参考现代待办应用的统计页重做）。
 *
 * 布局：任务概述大数字卡 → 每日任务完成柱状图（7/14/30 天窗口可翻页）→
 * 未完成任务分类环形图 → 近期完成时间线 → 待办四象限散点（桌面双列）。
 * 全部数据来自 StatsSummary（后端聚合）+ getTodos(completed)（近期完成），
 * 前端不做业务计算，只做窗口切片与图形编码。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ListTodo,
} from 'lucide-react'
import clsx from 'clsx'
import { getStatsSummary, getTodos } from '../adapt/api'
import { todayStr } from '../adapt/data'
import { animCountUp, animGrowBars, animRing, animStaggerChildren } from '../anim'

const SEGMENT_COLORS = [
  '#EC4899', '#F97316', '#10B981', '#3B82F6', '#8B5CF6',
  '#14B8A6', '#F59E0B', '#6366F1', '#EF4444', '#64748B',
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function fmtRangeLabel(dates: string[]): string {
  if (dates.length === 0) return ''
  const head = dates[0]!.slice(5).replace('-', '/')
  const tail = dates[dates.length - 1]!.slice(5).replace('-', '/')
  return dates.length === 1 ? head : `${head} - ${tail}`
}

export function StatsView({ onGoTodo }: { onGoTodo?: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: getStatsSummary,
    staleTime: 30_000,
  })
  const { data: recentDone } = useQuery({
    queryKey: ['todos', 'completed-recent'],
    queryFn: async () => {
      // 近期完成按「完成日」取最近 3 天（completed_on），避免按创建时间截断
      // 导致老任务今天完成时漏掉；按 completed_at 排序取前 8。
      const days: string[] = []
      for (let i = 0; i < 3; i += 1) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      }
      const batches = await Promise.all(days.map((day) => getTodos({ status: 'completed', completed_on: day })))
      return batches.flat()
    },
    staleTime: 30_000,
  })

  // 每日完成柱状图：窗口大小 + 相对末端的偏移（< 向历史翻，> 向今天回）。
  // 默认 30 天：7 天太窄，近期无完成记录时整版全零柱，看起来像「图表坏了」
  const [windowSize, setWindowSize] = useState<7 | 14 | 30>(30)
  const [windowOffset, setWindowOffset] = useState(0)

  const gridRef = useRef<HTMLDivElement | null>(null)
  const barsRef = useRef<HTMLDivElement[]>([])
  const doneNumRef = useRef<HTMLSpanElement | null>(null)
  const todoNumRef = useRef<HTMLSpanElement | null>(null)
  const ringRef = useRef<SVGCircleElement | null>(null)
  const ringed = useRef(false)

  const daily = data?.daily_done ?? []
  // daily_done 是「有完成记录的日子」的稀疏序列（后端 GROUP BY 完成日）。
  // 柱状图必须画连续日期轴——零完成的日子整根柱归零，"断档"才是关键信息。
  // 以序列末位（≈今天）为锚，向历史方向取连续 N 天，用 Map 查计数，缺省 0。
  const doneByDate = useMemo(() => new Map(daily.map((d) => [d.date, d.count])), [daily])
  // 锚点 = max(今天, 最后一个有完成记录的日期)：今天零完成时轴上也要有"今天"
  const anchorDate = useMemo(() => {
    const today = todayStr()
    const last = daily.length > 0 ? daily[daily.length - 1]!.date : today
    return last > today ? last : today
  }, [daily])
  const windowDates = useMemo(() => {
    const anchor = new Date(anchorDate + 'T00:00:00')
    const out: { date: string; count: number }[] = []
    for (let i = windowSize - 1; i >= 0; i -= 1) {
      const d = new Date(anchor)
      d.setDate(d.getDate() - i - windowOffset)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ date: iso, count: doneByDate.get(iso) ?? 0 })
    }
    return out
  }, [anchorDate, doneByDate, windowSize, windowOffset])

  useEffect(() => {
    if (!data) return
    animStaggerChildren(gridRef.current)
    animCountUp(doneNumRef.current, data.stats.completed)
    animCountUp(todoNumRef.current, data.stats.incomplete)
  }, [data, windowSize])

  useEffect(() => {
    // 只保留仍挂在 DOM 上的柱（窗口从 30 天缩到 7 天时旧 ref 不持有已卸载元素）
    barsRef.current = barsRef.current.filter((el) => el && el.isConnected)
    animGrowBars(barsRef.current)
  }, [windowDates])

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

  const doneRate = data && data.stats.total > 0 ? data.stats.completed / data.stats.total : 0
  const RING_R = 34
  const CIRC = 2 * Math.PI * RING_R

  useEffect(() => {
    if (!data || ringed.current) return
    ringed.current = true
    animRing(ringRef.current, CIRC * (1 - doneRate))
  }, [data, doneRate, CIRC])

  const maxCount = Math.max(1, ...windowDates.map((d) => d.count))
  const recent = useMemo(() => {
    const rows = [...(recentDone ?? [])]
    rows.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return rows.slice(0, 8)
  }, [recentDone])

  if (isLoading || !data) {
    return <main className="flex-1 flex items-center justify-center text-gray-400">加载中…</main>
  }

  return (
    <main className="flex-1 flex flex-col overflow-y-auto min-w-0 bg-gray-50">
      <div ref={gridRef} className="p-3 md:p-5 grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 pb-24 md:pb-6 max-w-5xl w-full mx-auto">
        {/* 任务概述 */}
        <section className="glass-card rounded-2xl p-4 md:p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-4">
            <BarChart3 size={16} className="text-pink-500" /> 任务概述
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[120px] rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
              <p className="text-[11px] text-gray-400 mb-1 flex items-center justify-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-500" /> 完成的任务
              </p>
              <span ref={doneNumRef} className="text-3xl font-semibold text-emerald-600 tabular-nums">{data.stats.completed}</span>
            </div>
            <div className="flex-1 min-w-[120px] rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
              <p className="text-[11px] text-gray-400 mb-1 flex items-center justify-center gap-1">
                <CircleAlert size={12} className="text-amber-500" /> 待处理的任务
              </p>
              <span ref={todoNumRef} className="text-3xl font-semibold text-amber-600 tabular-nums">{data.stats.incomplete}</span>
            </div>
            <div className="flex-1 min-w-[120px] rounded-xl bg-pink-50 border border-pink-100 p-4 flex items-center justify-center gap-3">
              <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
                <circle cx="42" cy="42" r={RING_R} fill="none" stroke="#fce7f3" strokeWidth="8" />
                <circle
                  ref={ringRef}
                  cx="42" cy="42" r={RING_R} fill="none"
                  stroke="#ec4899" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC}
                />
              </svg>
              <div>
                <p className="text-2xl font-semibold text-pink-600 tabular-nums">{Math.round(doneRate * 100)}%</p>
                <p className="text-[11px] text-gray-400">总完成率（共 {data.stats.total} 项）</p>
              </div>
            </div>
          </div>
        </section>

        {/* 每日任务完成 */}
        <section className="glass-card rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-700">每日任务完成</h3>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {([7, 14, 30] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => { setWindowSize(n); setWindowOffset(0) }}
                  className={clsx(
                    'px-2 py-0.5 text-xs rounded-md transition',
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
              onClick={() => setWindowOffset((o) => Math.min(o + windowSize, Math.max(0, 90 - windowSize)))}
              disabled={windowOffset + windowSize >= 90}
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
                  {/* 关键：容器必须 items-stretch（列高才有定值）、百分比高度才解析得出来；
                      旧版 items-end + height:100% 让每根柱子高度恒为 0（图表看起来「坏了」） */}
                  <div className="w-full flex-1 flex items-end justify-center min-h-0">
                    <div
                      ref={(el) => { if (el) barsRef.current[i] = el }}
                      className={clsx('w-full max-w-7 rounded-t-md origin-bottom', d.count > 0 ? 'bg-pink-500' : 'bg-pink-200/70')}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                  {windowSize <= 14 && <span className="text-[9px] text-gray-400 truncate max-w-full">{WEEKDAYS[dt.getDay()]}</span>}
                </div>
              )
            })}
          </div>
          )}
        </section>

        {/* 未完成任务分类 */}
        <section className="glass-card rounded-2xl p-4 md:p-5">
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

        {/* 近期完成 */}
        <section className="glass-card rounded-2xl p-4 md:p-5 lg:col-span-2">
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
        <section className="hidden lg:block glass-card rounded-2xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">待办四象限</h3>
          <p className="text-[11px] text-gray-400 mb-2">横轴：到期紧迫度 → 纵轴：重要性 ↑（点 = 未完成待办）</p>
          <Quadrant data={data} />
        </section>
      </div>
    </main>
  )
}

/** 四象限散点（原 StatsView 逻辑，宽度自适应容器） */
function Quadrant({ data }: { data: NonNullable<Awaited<ReturnType<typeof getStatsSummary>>> }) {
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
