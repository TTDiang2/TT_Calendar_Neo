import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import type { Todo, TodoList } from '../../adapt/types'
import { ganttRange, STATUS_LABELS } from '../../adapt/todoLogic'
import { useIsMobile } from '../../hooks/useMedia'

interface Props {
  todos: Todo[]
  lists: TodoList[]
  selectedTodoId: string | null
  onSelect: (id: string) => void
}

const DAY = 86400000
const LABEL_W = 210
const ROW_H = 34
const BAR_H = 18
const HEAD_H = 40
const VISIBLE_DAYS = 30

// 手机端专属尺度（20260916 任务书：甘特图照搬桌面端，任务一多时间跨度一长就崩坏）：
// 列宽固定 10px 不随跨度压缩（长跨度横向滚动，而不是把条压成细丝），
// 行高加大放双行标签，标签列收窄把宽度让给时间轴
const M_LABEL_W = 116
const M_ROW_H = 52
const M_BAR_H = 22
const M_HEAD_H = 44
const M_DAY_W = 10

function dayIndex(d: string): number {
  return Math.floor(new Date(d + 'T00:00:00').getTime() / DAY)
}

const BAR_STYLE: Record<string, string> = {
  completed: 'bg-emerald-400 border-emerald-500',
  inProgress: 'bg-blue-400 border-blue-500',
  notStarted: 'bg-gray-300 border-gray-400',
  waitingOnOthers: 'bg-purple-300 border-purple-400',
  deferred: 'bg-amber-300 border-amber-400',
}

export function TodoGanttView({ todos, lists, selectedTodoId, onSelect }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(0)
  const didInitScroll = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setViewW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => {
    return todos
      .map((t) => ({ t, r: ganttRange(t, today) }))
      .sort((a, b) => dayIndex(a.r.start) - dayIndex(b.r.start) || a.t.title.localeCompare(b.t.title, 'zh'))
  }, [todos, today])

  const geo = useMemo(() => {
    if (rows.length === 0) {
      return { t0: dayIndex(today), totalDays: 1, dayW: 24, months: [] as { start: number; label: string }[], weekendCols: [] as number[] }
    }
    const starts = rows.map((x) => dayIndex(x.r.start))
    const ends = rows.map((x) => dayIndex(x.r.end))
    const min = Math.min(...starts)
    const max = Math.max(...ends, dayIndex(today)) + 2
    const span = max - min
    // 手机：列宽固定 10px——跨度再长也只是横向滚动，绝不把条压成细丝；
    // 桌面：维持原「按视口算列宽」的逻辑
    if (isMobile) {
      return { t0: min, totalDays: span + 1, dayW: M_DAY_W, months: [] as { start: number; label: string }[], weekendCols: [] as number[] }
    }
    const w = viewW > LABEL_W + 40 ? Math.max((viewW - LABEL_W) / VISIBLE_DAYS, 3) : 24
    const months: { start: number; label: string }[] = []
    const weekendCols: number[] = []
    for (let i = 0; i <= span; i += 1) {
      const d = new Date((min + i) * DAY)
      if (d.getDate() === 1 || i === 0) months.push({ start: i, label: `${d.getMonth() + 1} 月` })
      if (d.getDay() === 0 || d.getDay() === 6) weekendCols.push(i)
    }
    return { t0: min, totalDays: span + 1, dayW: w, months, weekendCols }
  }, [rows, today, viewW, isMobile])

  const labelW = isMobile ? M_LABEL_W : LABEL_W
  const rowH = isMobile ? M_ROW_H : ROW_H
  const barH = isMobile ? M_BAR_H : BAR_H
  const headH = isMobile ? M_HEAD_H : HEAD_H
  const laneW = geo.totalDays * geo.dayW
  const todayX = (dayIndex(today) - geo.t0) * geo.dayW

  useEffect(() => {
    if (didInitScroll.current || viewW === 0) return
    const el = scrollRef.current
    if (!el) return
    didInitScroll.current = true
    el.scrollLeft = Math.min(Math.max(todayX - 30, 0), Math.max(labelW + laneW - viewW, 0))
  }, [viewW, todayX, laneW, labelW])

  const listName = useMemo(() => {
    const m = new Map(lists.map((l) => [l.id, l.display_name]))
    return (id: string) => m.get(id)
  }, [lists])

  if (rows.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-gray-300">暂无待办</div>
  }

  const showDayNums = !isMobile && geo.dayW >= 12
  // 手机表头：列宽 10px 放不下逐日数字，改为「今天 N 日 →」的游标提示
  const todayDayNum = new Date(today + 'T00:00:00').getDate()

  return (
    <div ref={scrollRef} className="h-full overflow-auto pb-4">
      <div className="relative min-w-max" style={{ width: labelW + laneW }}>
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex" style={{ height: headH }}>
          <div className="sticky left-0 z-30 bg-white border-r border-gray-100 flex-shrink-0" style={{ width: labelW }} />
          <div className="relative flex-shrink-0" style={{ width: laneW }}>
            {isMobile ? (
              <div className="absolute top-0 bottom-0 flex items-center pl-1.5 text-[11px] text-gray-500 font-medium">
                今天 {todayDayNum} 日 →
              </div>
            ) : (
              <>
                {geo.months.map((m) => (
                  <div
                    key={m.start}
                    className="absolute top-0 h-1/2 flex items-center text-[11px] text-gray-500 font-medium border-l border-gray-300 pl-1"
                    style={{ left: m.start * geo.dayW }}
                  >
                    {m.label}
                  </div>
                ))}
                {showDayNums && Array.from({ length: geo.totalDays }, (_, i) => {
                  const d = new Date((geo.t0 + i) * DAY)
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div
                      key={i}
                      className={clsx('absolute bottom-0 h-1/2 flex items-start justify-center text-[9px]', weekend ? 'text-gray-300' : 'text-gray-400')}
                      style={{ left: i * geo.dayW, width: geo.dayW }}
                    >
                      {d.getDate()}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        <div className="relative">
          {geo.weekendCols.map((i) => (
            <div
              key={`wk-${i}`}
              className="absolute top-0 bg-gray-50/80 pointer-events-none"
              style={{ left: labelW + i * geo.dayW, width: geo.dayW, height: rows.length * rowH + headH }}
            />
          ))}
          <div
            className="absolute border-l-2 border-dashed border-red-400 z-10 pointer-events-none"
            style={{ left: labelW + todayX, top: 0, height: rows.length * rowH }}
          />

          {rows.map(({ t, r }) => {
            const x = (dayIndex(r.start) - geo.t0) * geo.dayW
            const w = Math.max((dayIndex(r.end) - dayIndex(r.start) + 1) * geo.dayW - 2, geo.dayW - 2)
            const selected = selectedTodoId === t.id
            const ln = listName(t.list_id)
            return (
              <div
                key={t.id}
                className={clsx('flex border-b border-gray-50 hover:bg-pink-50/30 cursor-pointer relative z-[5]', selected && 'bg-pink-50/60')}
                onClick={() => onSelect(t.id)}
                style={{ height: rowH }}
              >
                <div
                  className={clsx(
                    'sticky left-0 z-10 flex-shrink-0 border-r border-gray-100',
                    isMobile ? 'px-2 py-1.5 flex flex-col justify-center gap-0.5' : 'px-2 flex items-center gap-1.5',
                    selected ? 'bg-pink-50' : 'bg-white',
                  )}
                  style={{ width: labelW }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {isMobile ? (
                    <>
                      <div className="flex items-center gap-1 min-w-0">
                        {r.completed && <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />}
                        <span className={clsx('text-[11px] leading-tight truncate', r.completed ? 'text-gray-400 line-through' : 'text-gray-700')}>
                          {t.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-gray-400 leading-none">
                        <span className="tabular-nums">{r.start.slice(5)} → {r.end.slice(5)}</span>
                        {r.overdue && <span className="text-red-500 font-medium">逾期</span>}
                        {ln && <span className="truncate">{ln}</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      {r.completed && <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />}
                      <span className={clsx('text-xs truncate', r.completed ? 'text-gray-400 line-through' : 'text-gray-700')}>
                        {t.title}
                      </span>
                      {ln && <span className="text-[10px] text-gray-300 flex-shrink-0 ml-auto">{ln}</span>}
                    </>
                  )}
                </div>
                <div className="relative flex-shrink-0" style={{ width: laneW }}>
                  <div
                    className={clsx(
                      'absolute rounded-md border flex items-center px-1.5 overflow-hidden whitespace-nowrap',
                      isMobile ? 'text-[10px]' : 'text-[9px] text-white',
                      r.overdue ? 'bg-red-400 border-red-500 text-white' : BAR_STYLE[t.status] ?? BAR_STYLE.notStarted,
                      selected && 'ring-2 ring-pink-400',
                    )}
                    style={{ left: x, width: w, top: (rowH - barH) / 2, height: barH }}
                    title={`${r.start} → ${r.end}${r.overdue ? '（已过期）' : ''} · ${STATUS_LABELS[t.status] ?? t.status}`}
                  >
                    {r.overdue && <span className="font-medium">逾期中</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}