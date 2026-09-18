import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarClock, Check, ClipboardList, ListTodo } from 'lucide-react'
import type { Day, Layer, MonthData, Todo } from '../adapt/types'
import { COLORING_COLORS, getBusyColors, parseDate, pickContrastColor, todayStr } from '../adapt/data'
import { getTodoBusyConfig, updateTodo, type TodoBusyConfig } from '../adapt/api'
import { useIsMobile } from '../hooks/useMedia'
import { DayCell } from './DayCell'
import { collectDayVisuals } from './dayVisuals'

interface Props {
  monthData: MonthData
  layers: Layer[]
  selectedDate: string | null
  onSelect: (date: string) => void
  /** 呼出当日详情抽屉（议程卡行点击用；与 onSelect 的「只选中」语义区分，智者 P1-2） */
  onOpenDetail?: (date: string) => void
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

/* 手机：iOS 风格月视图 —— 无边框格子、大数字圆片、点点在左上角，涂色=圆底、
   今天=玫瑰色实心圆、选中=粉色圆环；点日期 = 下方信息栏切换显示当天（不弹右抽屉，
   右抽屉只由 dock 右按钮呼出——20260917 任务书 1.1-2）。 */
function MobileMonthGrid({
  monthData,
  layers,
  selectedDate,
  onSelect,
  onOpenDetail,
}: Props) {
  const today = todayStr()
  const qc = useQueryClient()
  // 忙度配色整个网格只查一次配置（桌面 DayCell 是每格一查，量级不同）
  const { data: busyConfig } = useQuery({ queryKey: ['todoBusyConfig'], queryFn: getTodoBusyConfig, staleTime: 60_000 })
  // 议程里的待办可直接勾选（20260916 智者 P1-5：议程是手机月视图下半屏主体）
  const toggleTodoMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateTodo(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
      qc.invalidateQueries({ queryKey: ['todoStats'] })
      qc.invalidateQueries({ queryKey: ['view'] })
    },
  })

  const todayDay = useMemo(() => monthData.days.find((d) => d.date === today) ?? null, [monthData, today])
  // 信息栏默认显示今天；点其它日期后原地切换为那天（20260917 任务书 1.1-2）
  const agendaDay = useMemo(
    () => (selectedDate ? monthData.days.find((d) => d.date === selectedDate) ?? todayDay : todayDay),
    [monthData, selectedDate, todayDay],
  )

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

      {/* 信息栏：默认今天，点选日期后原地切换（无选中且当月不含今天时隐藏，整月铺满） */}
      {agendaDay && (
        <TodayAgenda
          key={agendaDay.date}
          day={agendaDay}
          layers={layers}
          isToday={agendaDay.date === today}
          className="flex-1 min-h-0"
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
          onToggleTodo={(t, done) => toggleTodoMut.mutate({ id: t.id, data: { ...t, id: t.id, status: done ? 'completed' : 'notStarted' } })}
        />
      )}
    </div>
  )
}

/** 手机月格：数字圆片居中 + 点点挂在格子左上角（20260917 任务书 1.1-4：
    底部点点行让人分不清归属上下，挪到左上角一眼就知道是哪天的；最多 3 枚，
    多出的折叠成 +N。） */
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
  const shownDots = dots.slice(0, 3)
  const extraDots = dots.length - shownDots.length

  return (
    <button
      onClick={() => onClick(day.date)}
      className="relative flex flex-col items-center justify-center py-1 rounded-2xl active:bg-pink-50/70 transition-colors min-h-[44px]"
      aria-label={`${day.date}${isToday ? '，今天' : ''}${selected ? '，已选中' : ''}`}
    >
      {/* 点点：左上角一枚枚小色点，密集排布（有涂色的日子自动让位给右上班角） */}
      {(shownDots.length > 0 || extraDots > 0) && (
        <span className="absolute top-[3px] left-[5px] flex items-center gap-[2px] max-w-[70%]">
          {shownDots.map((c, i) => (
            <span key={i} className="w-[5px] h-[5px] rounded-full flex-shrink-0 ring-1 ring-white/80" style={{ backgroundColor: c }} />
          ))}
          {extraDots > 0 && (
            <span className="text-[7px] leading-none text-gray-400 font-semibold tabular-nums">+{extraDots}</span>
          )}
        </span>
      )}
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
        <TodayAgenda day={todayDay} layers={layers} className="md:hidden flex-1 min-h-0" onSelect={onSelect} />
      )}
    </div>
  )
}

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 手机月视图下方常驻的信息栏卡：默认显示今天，点选其它日期后原地切换为那天
 * （20260917 任务书 1.1-2）。日程 / 事件 / 待办一屏扫完；
 * 行为分工（智者 P1-2 重接线）：点日程/事件行 = onOpenDetail 呼出当日详情抽屉，
 * 点日期格 = onSelect 只选中（不开抽屉）；待办行可直接勾选完成。
 */
function TodayAgenda({
  day,
  layers,
  isToday = true,
  className,
  onSelect,
  onOpenDetail,
  onToggleTodo,
}: {
  day: Day
  layers: Layer[]
  /** 显示的是否今天（false 时头部标出具体日期，提示用户已离开「今日」） */
  isToday?: boolean
  className?: string
  onSelect?: (date: string) => void
  onOpenDetail?: (date: string) => void
  onToggleTodo?: (todo: Todo, done: boolean) => void
}) {
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
          {isToday ? (
            <span className="text-xs font-semibold text-gray-400 flex-shrink-0">今日</span>
          ) : (
            <span className="text-[11px] font-semibold text-pink-500 bg-pink-50 rounded-full px-2 py-0.5 flex-shrink-0">已选</span>
          )}
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
          <p className="text-xs text-gray-300 text-center py-6">{isToday ? '今天还没有安排，点上方日期格子可快速添加' : '这天还没有安排'}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {schedules.length > 0 && (
              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[11px] font-medium text-gray-400 px-0.5 mb-0.5">
                  <CalendarClock size={12} /> 日程
                </p>
                {schedules.map((it) => (
                  <div
                    key={it.id ?? `${it.title}-${it.start_time}`}
                    onClick={onOpenDetail ? () => onOpenDetail(day.date) : undefined}
                    className={clsx('flex items-center gap-2 rounded-md bg-blue-50/50 border border-blue-100 px-2 py-1.5', onOpenDetail && 'active:bg-blue-100/70 cursor-pointer transition-colors')}
                  >
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
                  <div
                    key={ev.id ?? ev.title}
                    onClick={onOpenDetail ? () => onOpenDetail(day.date) : undefined}
                    className={clsx('flex items-center gap-2 rounded-md bg-gray-50 border border-gray-100 px-2 py-1.5', onOpenDetail && 'active:bg-gray-100 cursor-pointer transition-colors')}
                  >
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
                  <AgendaTodoRow key={t.id} todo={t} onToggle={onToggleTodo} onOpen={onOpenDetail ? () => onOpenDetail(day.date) : undefined} />
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

function AgendaTodoRow({ todo, onToggle, onOpen }: { todo: Todo; onToggle?: (todo: Todo, done: boolean) => void; onOpen?: () => void }) {
  const overdue = todo.due_date && todo.due_date < todayStr()
  const done = todo.status === 'completed'
  return (
    // 20260918 任务书 1.3-3：行点击 = 呼出当日详情抽屉，与上方日程/事件行对齐
    //（此前只有勾选框可点，点待办行没有任何反馈）；勾选框 stopPropagation 保持独立
    <div
      onClick={onOpen}
      className={clsx('flex items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1.5', onOpen && 'active:bg-gray-100 cursor-pointer transition-colors')}
    >
      <button
        aria-label={done ? '标记为未完成' : '标记为已完成'}
        onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(todo, !done) } : undefined}
        className={clsx(
          'w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center border active:scale-90 transition-transform',
          done
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : todo.importance === 'high'
              ? 'bg-red-100 border-red-200 text-red-500'
              : 'bg-gray-100 border-gray-200 text-gray-400',
        )}
      >
        {done ? <Check size={10} /> : todo.importance === 'high' && <span className="w-1 h-1 rounded-full bg-current" />}
      </button>
      <span className="text-xs text-gray-800 truncate flex-1">{todo.title}</span>
      {todo.due_date && (
        <span className={clsx('text-[10px] flex-shrink-0', overdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
          {overdue ? '已过期' : todo.due_date.slice(5)}
        </span>
      )}
    </div>
  )
}
