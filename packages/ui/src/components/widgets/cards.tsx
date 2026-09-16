/**
 * 小组件卡片集 —— 参考 iOS 桌面小组件的视觉语言（大圆角、柔和渐变、深浅搭配）。
 *
 * 每个小组件是自包含组件：自己用 react-query 取数（复用全局缓存 key），
 * 交互（勾选待办、翻月）直接走 BackendAdapter。外壳 WidgetCard 统一
 * 圆角/边距/编辑态删除钮，内容只关心展示。
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckSquare, Circle, Clock3, Flame, Gauge, Palette, X } from 'lucide-react'
import clsx from 'clsx'
import type { Todo } from '../../adapt/types'
import { useViewData } from '../../hooks/useApi'
import { getCountdownList, getTodoStats, getTodos, updateTodo } from '../../adapt/api'
import {
  COLORING_COLORS,
  TODO_BUSY_PREDICT_COLORS,
  parseDate,
  shiftMonthKey,
  todayStr,
} from '../../adapt/data'
import { animCountUp } from '../../anim'

// ---------- 共享数据钩子（同 key 复用 react-query 缓存，多卡片同源零开销） ----------

function useMonth(monthKey: string) {
  return useViewData('month', monthKey)
}

function currentMonthKey(): string {
  const n = new Date()
  return `${n.getFullYear()}-${n.getMonth() + 1}`
}

// ---------- 外壳 ----------

export type WidgetTone = 'light' | 'dark' | 'pink' | 'amber' | 'sky'

const TONE_CLASS: Record<WidgetTone, string> = {
  light: 'bg-white text-gray-800 border-gray-100',
  dark: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-white border-slate-700',
  pink: 'bg-gradient-to-br from-pink-100 to-rose-100 text-gray-800 border-pink-100',
  amber: 'bg-gradient-to-br from-amber-100 to-orange-100 text-gray-800 border-amber-100',
  sky: 'bg-gradient-to-br from-sky-100 to-indigo-100 text-gray-800 border-sky-100',
}

interface CardProps {
  title?: string
  icon?: React.ReactNode
  tone?: WidgetTone
  className?: string
  editing?: boolean
  onRemove?: () => void
  children: React.ReactNode
}

export function WidgetCard({ title, icon, tone = 'light', className, editing, onRemove, children }: CardProps) {
  return (
    <div
      className={clsx(
        'relative h-full w-full rounded-3xl border p-4 flex flex-col gap-2 overflow-hidden',
        'shadow-[0_1px_2px_rgba(16,24,40,0.03),0_8px_20px_rgba(16,24,40,0.06)] hover:shadow-[0_2px_4px_rgba(16,24,40,0.05),0_14px_32px_rgba(16,24,40,0.10)]',
        'transition-shadow',
        TONE_CLASS[tone],
        className,
      )}
    >
      {(title || editing) && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-80 flex-shrink-0">
          {icon}
          {title && <span className="truncate">{title}</span>}
          {editing && onRemove && (
            <button
              onClick={onRemove}
              className="ml-auto w-5 h-5 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-500 transition flex-shrink-0"
              title="移除小组件"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

// ---------- 1. 待办小组件：今天与逾期，可勾选完成 ----------

export function TodoWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  const qc = useQueryClient()
  const { data: todos } = useQuery({
    queryKey: ['todos', null, 'incomplete', 'due_importance'],
    queryFn: () => getTodos({ status: 'notStarted', sort: 'due_importance' }),
    staleTime: 30_000,
  })
  // 勾选后本地立即置 done（慢设备上不用等请求往返，避免重复点击），失败回滚
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set())
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      updateTodo(id, { status: done ? 'completed' : 'notStarted' }),
    onSuccess: (_res, { id }) => {
      setDoneIds((prev) => { const n = new Set(prev); n.delete(id); return n })
      void qc.invalidateQueries({ queryKey: ['todos'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['view'] })
    },
    onError: (_e, { id }) => {
      setDoneIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    },
  })
  const markDone = (id: string) => {
    if (doneIds.has(id)) return
    setDoneIds((prev) => { const n = new Set(prev); n.add(id); return n })
    toggle.mutate({ id, done: true })
  }
  const today = todayStr()
  // 与文案一致：只统计「今天到期或逾期」的待办，无到期日的排最前兜底展示
  const dueToday = useMemo(
    () => (todos ?? []).filter((t: Todo) => !t.due_date || t.due_date <= today),
    [todos, today],
  )
  const list = dueToday.slice(0, 5)
  const restCount = dueToday.length - list.length

  return (
    <WidgetCard title="待办" icon={<CheckSquare size={13} />} tone="pink" editing={editing} onRemove={onRemove}>
      {list.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">今天没有待办，好好休息 ☕</p>
      ) : (
        <div className="flex flex-col gap-2 h-full overflow-hidden">
          {list.map((t) => {
            const done = doneIds.has(t.id)
            return (
              <label key={t.id} className="flex items-center gap-2 min-w-0 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => markDone(t.id)}
                  className="peer sr-only"
                />
                <span className={clsx(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors group-hover:border-pink-400',
                  done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 peer-checked:bg-emerald-500 peer-checked:border-emerald-500',
                )}>
                  {done && <CheckSquare size={9} className="text-white" />}
                </span>
                <span className={clsx('text-xs truncate', done && 'line-through opacity-50')}>{t.title}</span>
                {t.due_date && t.due_date < today && (
                  <span className="text-[9px] text-red-400 flex-shrink-0">逾期</span>
                )}
              </label>
            )
          })}
          {restCount > 0 && <p className="text-[10px] text-gray-400 mt-auto">今天还有 {restCount} 项…</p>}
        </div>
      )}
    </WidgetCard>
  )
}

// ---------- 2. 日历小组件：迷你月历 + 事件点 ----------

export function MiniCalendarWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const { data } = useMonth(monthKey)
  const today = todayStr()
  const days = data && 'days' in data ? data.days : []
  const { y, m } = parseDate(monthKey + '-01')

  return (
    <WidgetCard title="日历" icon={<CalendarDays size={13} />} tone="dark" editing={editing} onRemove={onRemove}>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-3xl font-semibold tabular-nums">{Number(today.slice(8, 10))}</span>
        <span className="text-xs opacity-70">{y} 年 {m} 月</span>
        <span className="ml-auto flex gap-1">
          <button onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-xs leading-none transition">‹</button>
          <button onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-xs leading-none transition">›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
          <span key={w} className="text-[9px] opacity-50">{w}</span>
        ))}
        {days.map((d) => {
          const dayNum = Number(d.date.slice(8, 10))
          const hasEvents = Object.values(d.events_by_layer).some((arr) => arr.length > 0)
          const isToday = d.date === today
          return (
            <span
              key={d.date}
              className={clsx(
                'relative text-[10px] leading-5 rounded-full tabular-nums',
                isToday ? 'bg-pink-500 text-white font-semibold' : d.is_other_month ? 'opacity-30' : '',
              )}
            >
              {dayNum}
              {hasEvents && !isToday && (
                <i className="absolute left-1/2 -translate-x-1/2 bottom-0 w-1 h-1 rounded-full bg-pink-400" />
              )}
            </span>
          )
        })}
      </div>
    </WidgetCard>
  )
}

// ---------- 3. 涂色小组件：本月充实度热力图 ----------

export function ColoringWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const { data } = useMonth(monthKey)
  const days = data && 'days' in data ? data.days : []
  const { m } = parseDate(monthKey + '-01')
  const colored = days.filter((d) => d.coloring_level != null).length

  return (
    <WidgetCard title="涂色" icon={<Palette size={13} />} tone="light" editing={editing} onRemove={onRemove}>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <span className="text-2xl font-semibold text-emerald-600 tabular-nums">{colored}</span>
        <span className="text-[10px] text-gray-400">{m} 月已涂天数</span>
        <span className="ml-auto flex gap-1">
          <button onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))} className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs leading-none transition">‹</button>
          <button onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs leading-none transition">›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const level = d.coloring_level
          return (
            <span
              key={d.date}
              title={`${d.date}${d.lunar ? ` ${d.lunar}` : ''}`}
              className={clsx(
                'aspect-square rounded-[4px]',
                level == null && (d.is_other_month ? 'bg-transparent' : 'bg-gray-100'),
                d.date === todayStr() && 'ring-2 ring-emerald-400',
              )}
              style={level != null ? { background: COLORING_COLORS[level] ?? COLORING_COLORS[0] } : undefined}
            />
          )
        })}
      </div>
    </WidgetCard>
  )
}

// ---------- 4. 点点小组件：今天的事件点点 ----------

export function DotsWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  const { data } = useMonth(currentMonthKey())
  const today = todayStr()
  const day = data && 'days' in data ? data.days.find((d) => d.date === today) : null
  const layers = data?.layers ?? []
  const entries = useMemo(() => {
    if (!day) return []
    const out: { title: string; color: string | null; layer: string }[] = []
    for (const [layerId, evs] of Object.entries(day.events_by_layer)) {
      const layer = layers.find((l) => l.layer_id === layerId)
      for (const ev of evs) {
        out.push({ title: ev.title, color: layer?.color ?? ev.color ?? '#cbd5e1', layer: layer?.display_name ?? '' })
      }
    }
    return out.slice(0, 6)
  }, [day, layers])

  return (
    <WidgetCard title="点点 · 今天" icon={<Circle size={13} />} tone="sky" editing={editing} onRemove={onRemove}>
      {!day || entries.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">今天没有事件点点</p>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-hidden h-full">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <i className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color ?? '#94a3b8' }} />
              <span className="text-xs truncate">{e.title}</span>
              {e.layer && <span className="text-[9px] text-gray-400 ml-auto flex-shrink-0 truncate max-w-16">{e.layer}</span>}
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ---------- 5. 倒数日小组件 ----------

export function CountdownWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  const { data } = useQuery({
    queryKey: ['countdownList'],
    queryFn: getCountdownList,
    staleTime: 60_000,
  })
  const list = useMemo(
    () => (data ?? []).filter((c) => !c.passed).sort((a, b) => a.days_left - b.days_left).slice(0, 3),
    [data],
  )

  return (
    <WidgetCard title="倒数日" icon={<Flame size={13} />} tone="amber" editing={editing} onRemove={onRemove}>
      {list.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">还没有倒数日</p>
      ) : (
        <div className="flex flex-col gap-2.5 h-full justify-around">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-2 min-w-0">
              <span
                className="text-lg font-semibold tabular-nums flex-shrink-0 w-12 text-right"
                style={{ color: c.color ?? '#ea580c' }}
              >
                {c.is_today ? '今天' : c.days_left}
              </span>
              <span className="text-xs truncate">{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ---------- 6. 忙度小组件：未来 7 天预测 ----------

export function BusyWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  // 取当月与下月两份数据：25 号之后「未来 7 天」要能跨月
  const thisMonth = currentMonthKey()
  const nextMonth = shiftMonthKey(thisMonth, 1)
  const { data: cur } = useMonth(thisMonth)
  const { data: nxt } = useMonth(nextMonth)
  const today = todayStr()
  const week = useMemo(() => {
    const all = [...(cur && 'days' in cur ? cur.days : []), ...(nxt && 'days' in nxt ? nxt.days : [])]
    return all.filter((d) => d.date >= today).slice(0, 7)
  }, [cur, nxt, today])
  const WD = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <WidgetCard title="忙度预报" icon={<Gauge size={13} />} tone="light" editing={editing} onRemove={onRemove}>
      <div className="flex items-end justify-between gap-1 h-full pt-1">
        {week.map((d) => {
          const level = d.predict_level
          const dt = new Date(d.date + 'T00:00:00')
          return (
            <div key={d.date} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div
                className="w-full max-w-6 rounded-md"
                style={{
                  height: `${18 + (level ?? 0) * 11}px`,
                  background: level != null ? TODO_BUSY_PREDICT_COLORS[level] : '#f3f4f6',
                }}
                title={`${d.date}：忙度 ${level ?? '—'}`}
              />
              <span className={clsx('text-[9px]', d.date === today ? 'text-pink-500 font-semibold' : 'text-gray-400')}>
                {d.date === today ? '今' : WD[dt.getDay()]}
              </span>
            </div>
          )
        })}
        {week.length === 0 && <p className="text-sm text-gray-400 w-full text-center py-4">暂无预报</p>}
      </div>
    </WidgetCard>
  )
}

// ---------- 7. 时钟小组件：实时时钟 + 农历 ----------

export function ClockWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  const [now, setNow] = useState(() => new Date())
  const { data } = useMonth(currentMonthKey())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const today = todayStr()
  const lunar = data && 'days' in data ? (data.days.find((d) => d.date === today)?.lunar ?? '') : ''
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  return (
    <WidgetCard tone="dark" editing={editing} onRemove={onRemove}>
      <div className="flex flex-col items-center justify-center h-full gap-0.5 py-2">
        <Clock3 size={14} className="opacity-50 mb-1" />
        <p className="text-4xl font-light tabular-nums tracking-wide">
          {hh}<span className="animate-pulse opacity-60">:</span>{mm}
        </p>
        <p className="text-[11px] opacity-70">
          {now.getMonth() + 1} 月 {now.getDate()} 日 {WD[now.getDay()]}
        </p>
        {lunar && <p className="text-[10px] opacity-50">农历 {lunar}</p>}
      </div>
    </WidgetCard>
  )
}

// ---------- 8. 完成概览小组件 ----------

export function StatsWidget({ editing, onRemove }: { editing?: boolean; onRemove?: () => void }) {
  const { data } = useQuery({
    queryKey: ['todoStats', null],
    queryFn: () => getTodoStats(undefined),
    staleTime: 30_000,
  })
  const numRef = useRef2(data?.completed ?? 0)
  const rate = data && data.total > 0 ? data.completed / data.total : 0

  return (
    <WidgetCard title="完成概览" icon={<CheckSquare size={13} />} tone="pink" editing={editing} onRemove={onRemove}>
      <div className="flex items-center gap-3 h-full py-1">
        <div className="text-center">
          <p ref={numRef.ref} className="text-3xl font-semibold text-emerald-600 tabular-nums">0</p>
          <p className="text-[10px] text-gray-400 mt-0.5">已完成</p>
        </div>
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>待处理 {data?.incomplete ?? '—'}</span>
            <span className="tabular-nums">{Math.round(rate * 100)}%</span>
          </div>
          <div className="h-2 bg-pink-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full" style={{ width: `${rate * 100}%` }} />
          </div>
        </div>
      </div>
    </WidgetCard>
  )
}

// 数字滚动需要 ref+effect，包一个小钩子避免污染组件体
function useRef2(target: number) {
  const [el, setEl] = useState<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (el) animCountUp(el, target)
  }, [el, target])
  return { ref: setEl }
}
