import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { CalendarClock, ClipboardList, ListTodo } from 'lucide-react'
import type { Day, Layer, MonthData, Todo } from '../adapt/types'
import { parseDate, todayStr } from '../adapt/data'
import { DayCell } from './DayCell'

interface Props {
  monthData: MonthData
  layers: Layer[]
  selectedDate: string | null
  onSelect: (date: string) => void
  onDoubleClick: (date: string) => void
  onContextMenu: (e: { clientX: number; clientY: number }, date: string) => void
  onDragStart: (date: string) => void
  onDrop: (date: string) => void
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function MonthGrid({ monthData, layers, selectedDate, onSelect, onDoubleClick, onContextMenu, onDragStart, onDrop }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const today = todayStr()

  // 今日 agenda：只有当「本视图月份恰好包含今天」时，手机版月视图下方才有可常驻的今日总览；
  // 翻到不含今天的月份时隐藏，让月格子铺满、专注整月浏览（桌面始终铺满、不显示该面板）。
  const todayDay = useMemo(() => monthData.days.find((d) => d.date === today) ?? null, [monthData, today])
  const showAgenda = !!todayDay

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-1.5 md:gap-0">
      {/* 手机：月份网格包进圆角卡片（与小组件/分析页同一视觉语言）；桌面保持铺满无卡片 */}
      <div className="flex flex-col min-h-0 rounded-3xl bg-white border border-gray-100 shadow-sm p-3 md:contents">
        <div className="grid grid-cols-7 gap-1 mb-2 md:mb-1 flex-shrink-0">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`text-center text-[11px] md:text-xs font-medium py-1 ${i >= 5 ? 'text-pink-400' : 'text-gray-400'}`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 月份网格：
            手机且含今日 agenda → 压缩到上半（shrink-0，超高时自身可滚，最大占 ~58% 屏留给 agenda）；
            否则（桌面 / 不含今日的月份）→ 占满剩余高度、超高整月可滚 */}
        <div
          className={clsx(
            'grid grid-cols-7 gap-1',
            showAgenda
              ? 'md:flex-1 md:min-h-0 md:overflow-y-auto shrink-0 min-h-0 max-h-[58dvh] overflow-y-auto'
              : 'flex-1 min-h-0 overflow-y-auto',
          )}
          onDragEnd={() => setDragOver(null)}
        >
          {monthData.days.map((day: Day, i) => (
            <DayCell
              key={i}
              day={day}
              layers={layers}
              selected={selectedDate === day.date}
              dragOver={dragOver === day.date}
              onClick={onSelect}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
              onDragStart={(d) => {
                onDragStart(d)
                setDragOver(d)
              }}
              onDragEnter={(d) => setDragOver(d)}
              onDrop={(d) => {
                setDragOver(null)
                onDrop(d)
              }}
            />
          ))}
        </div>
      </div>

      {/* 手机：今日 agenda 占满月视图剩余空间（md 以上隐藏，因桌面月格子已铺满） */}
      {showAgenda && todayDay && (
        <TodayAgenda day={todayDay} layers={layers} className="md:hidden flex-1 min-h-0" />
      )}
    </div>
  )
}

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 手机月视图下方常驻的「今日」议程卡：日程 / 事件 / 待办一屏扫完，最大化利用格子铺不满的留白 */
function TodayAgenda({ day, layers, className }: { day: Day; layers: Layer[]; className?: string }) {
  const { y, m, d } = parseDate(day.date)
  const weekday = WEEK_NAMES[new Date(y, m - 1, d).getDay()]

  const layerById = useMemo(() => new Map(layers.map((l) => [l.layer_id, l])), [layers])

  const events = useMemo(
    () =>
      Object.entries(day.events_by_layer)
        .filter(([lid]) => {
          // events_by_layer 只含「事件类」图层（日程/涂色另有存储），
          // important 内置层始终显示，其余按开关过滤 —— 与 DayCell 逻辑一致
          const l = layerById.get(lid)
          return lid === 'important' || lid === 'schedule' || (l?.enabled ?? false)
        })
        .flatMap(([, evs]) => evs)
        .sort((a, b) => a.sort_key - b.sort_key),
    [day, layerById],
  )
  const schedules = useMemo(
    () => [...(day.schedule_items ?? [])].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [day],
  )
  const openTodos = useMemo(() => (day.todos ?? []).filter((t) => t.status !== 'completed'), [day])
  const doneCount = useMemo(() => (day.todos ?? []).filter((t) => t.status === 'completed').length, [day])

  const colorFor = (lid: string): string | undefined => layerById.get(lid)?.color ?? undefined

  return (
    <section className={clsx('flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden', className)}>
      <header className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2 bg-gray-50/50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-gray-400 flex-shrink-0">今日</span>
          <span className="text-sm font-bold text-gray-800 flex-shrink-0">{m}月{d}日</span>
          <span className="text-[11px] text-gray-400 truncate">{weekday}</span>
          {day.lunar && <span className="text-[11px] text-gray-400 truncate">{day.lunar}</span>}
        </div>
        {day.holiday?.name && (
          <span className="text-[11px] bg-purple-500 text-white px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
            {day.holiday.name}
          </span>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {schedules.length === 0 && events.length === 0 && openTodos.length === 0 && doneCount === 0 ? (
          <p className="text-xs text-gray-300 text-center py-6">今天还没有安排，点上方日期格子可快速添加</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {schedules.length > 0 && (
              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[11px] font-medium text-gray-400 px-0.5 mb-0.5">
                  <CalendarClock size={12} /> 日程
                </p>
                {schedules.map((it) => (
                  <div key={it.id ?? `${it.title}-${it.start_time}`} className="flex items-center gap-2 rounded-md bg-blue-50/50 border border-blue-100 px-2 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: it.color ?? '#3D6BFB' }} />
                    {it.start_time && (
                      <span className="text-[11px] text-gray-500 tabular-nums flex-shrink-0">
                        {it.start_time}
                        {it.end_time ? `-${it.end_time}` : ''}
                      </span>
                    )}
                    <span className="text-xs text-gray-800 truncate">{it.title}</span>
                  </div>
                ))}
              </div>
            )}

            {events.length > 0 && (
              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[11px] font-medium text-gray-400 px-0.5 mb-0.5">
                  <ClipboardList size={12} /> 事件
                </p>
                {events.map((ev) => (
                  <div key={ev.id ?? ev.title} className="flex items-center gap-2 rounded-md bg-gray-50 border border-gray-100 px-2 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color ?? colorFor(ev.layer_id) ?? '#9ca3af' }} />
                    <span className="text-xs text-gray-800 truncate flex-1">{ev.title}</span>
                    {(() => {
                      const l = layerById.get(ev.layer_id)
                      return l ? <span className="text-[10px] text-gray-400 flex-shrink-0">{l.display_name}</span> : null
                    })()}
                  </div>
                ))}
              </div>
            )}

            {(openTodos.length > 0 || doneCount > 0) && (
              <div className="space-y-0.5">
                <p className="flex items-center justify-between gap-1 text-[11px] font-medium text-gray-400 px-0.5 mb-0.5">
                  <span className="flex items-center gap-1"><ListTodo size={12} /> 待办</span>
                  {doneCount > 0 && <span className="text-[10px] font-normal text-gray-400">已完成 {doneCount}</span>}
                </p>
                {openTodos.slice(0, 6).map((t) => (
                  <AgendaTodoRow key={t.id} todo={t} />
                ))}
                {openTodos.length > 6 && (
                  <p className="text-[10px] text-gray-300 text-center pt-0.5">还有 {openTodos.length - 6} 条未完成待办</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function AgendaTodoRow({ todo }: { todo: Todo }) {
  const overdue = todo.due_date && todo.due_date < todayStr()
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1.5">
      <span
        className={clsx(
          'w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center',
          todo.importance === 'high' ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-400',
        )}
      >
        {todo.importance === 'high' && <span className="w-1 h-1 rounded-full bg-current" />}
      </span>
      <span className="text-xs text-gray-800 truncate flex-1">{todo.title}</span>
      {todo.due_date && (
        <span className={clsx('text-[10px] flex-shrink-0', overdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
          {overdue ? '已过期' : todo.due_date.slice(5)}
        </span>
      )}
    </div>
  )
}
