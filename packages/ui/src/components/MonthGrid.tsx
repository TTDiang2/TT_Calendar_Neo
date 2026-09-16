import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarClock, ClipboardList, ListTodo } from 'lucide-react'
import type { Day, Layer, MonthData, Todo } from '../adapt/types'
import { COLORING_COLORS, getBusyColors, parseDate, pickContrastColor, todayStr } from '../adapt/data'
import { getTodoBusyConfig, type TodoBusyConfig } from '../adapt/api'
import { useIsMobile } from '../hooks/useMedia'
import { DayCell } from './DayCell'
import { collectDayVisuals } from './dayVisuals'

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
const WEEKDAYS_SHORT = ['一', '二', '三', '四', '五', '六', '日']

export function MonthGrid(props: Props) {
  const isMobile = useIsMobile()
  return isMobile ? <MobileMonthGrid {...props} /> : <DesktopMonthGrid {...props} />
}

/* 手机：iOS 风格月视图 —— 无边框格子、大数字圆片、点点一行，涂色=圆底、
   今天=玫瑰色实心圆、选中=粉色圆环；点击日期弹出底部详情（右上 FAB 新建）。 */
function MobileMonthGrid({ monthData, layers, selectedDate, onSelect }: Props) {
  const today = todayStr()
  // 忙度配色整个网格只查一次配置（桌面 DayCell 是每格一查，量级不同）
  const { data: busyConfig } = useQuery({ queryKey: ['todoBusyConfig'], queryFn: getTodoBusyConfig, staleTime: 60_000 })

  const todayDay = useMemo(() => monthData.days.find((d) => d.date === today) ?? null, [monthData, today])

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-1.5">
      <div className="flex flex-col min-h-0 glass-card rounded-3xl p-2 pt-1 flex-shrink-0">
        <div className="grid grid-cols-7 mb-0.5 flex-shrink-0">
          {WEEKDAYS_SHORT.map((w, i) => (
            <div
              key={w}
              className={`text-center text-[11px] font-medium py-1 ${i >= 5 ? 'text-weekend' : 'text-gray-500'}`}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 flex-shrink-0">
          {monthData.days.map((day: Day, i) => (
            <MobileDayCell
              key={i}
              day={day}
              layers={layers}
              busyConfig={busyConfig}
              selected={selectedDate === day.date}
              onClick={onSelect}
            />
          ))}
        </div>
      </div>

      {/* 今日 agenda 占满月视图剩余空间（翻到不含今天的月份时隐藏，整月铺满） */}
      {todayDay && <TodayAgenda day={todayDay} layers={layers} className="flex-1 min-h-0" />}
    </div>
  )
}

/** 手机月格：数字圆片 + 点点行（iOS 日历风格，无边框无事件标题） */
function MobileDayCell({
  day,
  layers,
  busyConfig,
  selected,
  onClick,
}: {
  day: Day
  layers: Layer[]
  busyConfig: TodoBusyConfig | undefined
  selected: boolean
  onClick: (date: string) => void
}) {
  const { d } = parseDate(day.date)
  const today = todayStr()

  // 涂色/图层圆底：与桌面 DayCell 同一套 colorLayers 叠层逻辑，取最后一层为主色
  const layerById = new Map(layers.map((l) => [l.layer_id, l]))
  const colorLayers: { id: string; color: string }[] = []
  if (layerById.get('important')?.enabled && day.gradient_bg && day.gradient_bg.toLowerCase() !== '#ffffff') {
    colorLayers.push({ id: 'important', color: day.gradient_bg })
  }
  if (layerById.get('coloring')?.enabled && day.coloring_level != null) {
    colorLayers.push({ id: 'coloring', color: COLORING_COLORS[day.coloring_level] })
  }
  if (layerById.get('holiday')?.enabled && day.holiday?.name) {
    colorLayers.push({ id: 'holiday', color: layerById.get('holiday')!.color ?? '#8E24AA' })
  }
  for (const b of getBusyColors(day, today, busyConfig)) {
    if (layerById.get(b.id)?.enabled) colorLayers.push(b)
  }
  if (day.custom_bg && day.custom_bg.color) {
    colorLayers.push({ id: 'custom', color: day.custom_bg.color })
  }
  const circleColor = colorLayers.length > 0 ? colorLayers[colorLayers.length - 1]!.color : null

  const { dots } = collectDayVisuals(day, layers)
  const isToday = day.is_today

  return (
    <button
      onClick={() => onClick(day.date)}
      className="relative flex flex-col items-center gap-0.5 py-1 rounded-2xl active:bg-pink-50/70 transition-colors"
      aria-label={`${day.date}${isToday ? '，今天' : ''}${selected ? '，已选中' : ''}`}
    >
      <span className="relative flex items-center justify-center w-9 h-9">
        {circleColor && !isToday && (
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: circleColor, opacity: 0.85 }}
          />
        )}
        {isToday && <span className="absolute inset-0 rounded-full bg-rose-500 shadow-md shadow-rose-500/30" />}
        {selected && (
          <span className={clsx('absolute -inset-[3px] rounded-full ring-2', isToday ? 'ring-pink-300' : 'ring-pink-400')} />
        )}
        <span
          className={clsx(
            'relative z-10 text-[15px] font-semibold tabular-nums',
            isToday ? 'text-white' : !circleColor && 'text-gray-800',
          )}
          style={!isToday && circleColor ? { color: pickContrastColor(circleColor) } : undefined}
        >
          {d}
        </span>
        {day.holiday?.is_workday_made_up && (
          <span className="absolute -top-0.5 -right-1.5 text-[8px] leading-none bg-amber-500 text-white px-1 py-px rounded-full z-20">班</span>
        )}
      </span>
      {/* 点点行：高度固定防跳动，没有点点时占位 */}
      <span className="flex items-center gap-[3px] h-1.5">
        {dots.slice(0, 4).map((c, i) => (
          <span key={i} className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
        ))}
      </span>
    </button>
  )
}

/* 桌面：原有月视图（格子大、可承载事件标题与拖拽） */
function DesktopMonthGrid({ monthData, layers, selectedDate, onSelect, onDoubleClick, onContextMenu, onDragStart, onDrop }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const today = todayStr()

  const todayDay = useMemo(() => monthData.days.find((d) => d.date === today) ?? null, [monthData, today])
  const showAgenda = !!todayDay

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-1.5 md:gap-0">
      {/* 桌面保持铺满无卡片（玻璃卡片语言仅用于 <md，本组件在手机分支已被 MobileMonthGrid 接管） */}
      <div className="flex flex-col min-h-0 md:contents">
        <div className="grid grid-cols-7 gap-1 mb-2 md:mb-1 flex-shrink-0">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`text-center text-[11px] md:text-xs font-medium py-1 ${i >= 5 ? 'text-weekend' : 'text-gray-500'}`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 月份网格：占满剩余高度，超高整月可滚 */}
        <div
          className="grid grid-cols-7 gap-1 flex-1 min-h-0 overflow-y-auto"
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

      {/* 今日 agenda 仅 <md 显示（桌面月格子已铺满） */}
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
    <section className={clsx('flex flex-col glass-card rounded-2xl overflow-hidden', className)}>
      <header className="px-3 py-2 border-b border-black/5 flex items-center justify-between gap-2 bg-white/40 flex-shrink-0 rounded-t-2xl">
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
