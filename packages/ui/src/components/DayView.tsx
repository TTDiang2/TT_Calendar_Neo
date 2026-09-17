import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarClock, Check, ClipboardList, ListTodo, Plus } from 'lucide-react'
import type { Layer, MonthData, Todo } from '../adapt/types'
import { COLORING_COLORS, getBusyColors, parseDate, todayStr } from '../adapt/data'
import { getTodoBusyConfig } from '../adapt/api'
import { useIsMobile } from '../hooks/useMedia'

interface Props {
  monthData: MonthData
  layers: Layer[]
  selectedDate: string | null
  onSelect: (date: string) => void
  onDoubleClick: (date: string) => void
}

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 20260917 任务书 1.1-6：日视图手机端苹果化。与 MonthGrid 同一拆分模式——
    手机走 MobileDayView（iOS 内嵌分组列表），桌面走 DesktopDayView（逐字原版，零变化红线）。 */
export function DayView(props: Props) {
  const isMobile = useIsMobile()
  return isMobile ? <MobileDayView {...props} /> : <DesktopDayView {...props} />
}


/** 手机端：iOS 内嵌分组列表风（20260917 任务书 1.1-6 苹果化——
    与桌面版拆分为两个分支，桌面保持逐字原样，零变化红线） */
function MobileDayView({ monthData, layers, onSelect, onDoubleClick }: Props) {
  const day = monthData.days[0]
  if (!day) return <div className="flex-1 flex items-center justify-center text-gray-400">无数据</div>

  const { y, m, d } = parseDate(day.date)
  const weekday = WEEK_NAMES[new Date(y, m - 1, d).getDay()]
  const layerById = new Map(layers.map((l) => [l.layer_id, l]))
  const today = todayStr()

  const visibleEvents = Object.entries(day.events_by_layer)
    .filter(([lid]) => {
      const l = layerById.get(lid)
      return lid === 'important' || lid === 'schedule' || (l?.enabled ?? false)
    })
    .flatMap(([, evs]) => evs)
    .sort((a, b) => a.sort_key - b.sort_key)

  const schedules = useMemo(
    () => [...(day.schedule_items ?? [])].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [day],
  )
  const openTodos = useMemo(() => (day.todos ?? []).filter((t) => t.status !== 'completed'), [day])
  const doneTodos = useMemo(() => (day.todos ?? []).filter((t) => t.status === 'completed'), [day])

  const colorLayers: string[] = []
  if (layerById.get('important')?.enabled && day.gradient_bg && day.gradient_bg.toLowerCase() !== '#ffffff') {
    colorLayers.push(day.gradient_bg)
  }
  if (layerById.get('coloring')?.enabled && day.coloring_level != null) {
    colorLayers.push(COLORING_COLORS[day.coloring_level])
  }
  const barColor = colorLayers[0]

  const isEmpty = schedules.length === 0 && visibleEvents.length === 0 && openTodos.length === 0 && doneTodos.length === 0

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {/* 头部：iOS 大标题卡（日期徽章渐变 + 周几大字 + 农历/节假日元信息行） */}
      <div
        className="glass-card rounded-3xl flex items-center gap-3.5 px-4 py-3 flex-shrink-0 cursor-pointer active:opacity-90 transition-opacity"
        onClick={() => onSelect(day.date)}
        onDoubleClick={() => onDoubleClick(day.date)}
      >
        <div
          className={clsx(
            'w-14 h-14 rounded-2xl flex-shrink-0 flex flex-col items-center justify-center text-white shadow-md',
            day.is_today ? 'bg-gradient-to-br from-rose-500 to-pink-500 shadow-rose-500/30' : 'bg-gradient-to-br from-gray-400 to-gray-500',
          )}
          style={!day.is_today && barColor ? { background: barColor } : undefined}
        >
          <span className="text-[10px] leading-none opacity-90 font-medium">{m}月</span>
          <span className="text-[26px] font-bold leading-tight tracking-tight">{d}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-lg font-bold text-gray-900 tracking-tight">
              {weekday}
              {day.is_today && <span className="text-rose-500"> · 今天</span>}
            </span>
            {day.holiday?.name && (
              <span className="text-[11px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-medium">{day.holiday.name}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5 flex-wrap">
            <span>{y}年{day.is_weekend ? ' · 周末' : ''}</span>
            {day.lunar && <span className="text-gray-300">|</span>}
            {day.lunar && <span>{day.lunar}</span>}
          </div>
        </div>
      </div>

      {/* 主内容：内嵌分组列表（白色通栏行 + 大写字头 + 细分隔线）；新建统一走 FAB */}
      <div className="glass-card rounded-3xl flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 py-10">
            <p className="text-sm text-gray-400">这天还没有安排</p>
            <button
              onClick={() => onDoubleClick(day.date)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-pink-500 text-white rounded-full shadow-sm active:bg-pink-600"
            >
              <Plus size={15} /> 添加事件
            </button>
          </div>
        ) : (
          <div className="p-3 flex flex-col gap-4">
            {schedules.length > 0 && (
              <MSection icon={<CalendarClock size={14} />} title="日程" count={schedules.length}>
                {schedules.map((it, idx) => (
                  <div
                    key={it.id ?? `${it.title}-${it.start_time}`}
                    className={clsx(
                      'flex items-center gap-3 px-3.5 py-2.5 bg-white',
                      idx > 0 && 'border-t border-black/5',
                      idx === 0 && 'rounded-t-2xl',
                      idx === schedules.length - 1 && 'rounded-b-2xl',
                    )}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: it.color ?? '#3D6BFB' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-gray-800 truncate">{it.title}</p>
                    </div>
                    {it.start_time && (
                      <span className="text-[13px] font-semibold text-blue-600 tabular-nums flex-shrink-0">
                        {it.start_time}
                        {it.end_time ? `-${it.end_time}` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </MSection>
            )}

            {visibleEvents.length > 0 && (
              <MSection icon={<ClipboardList size={14} />} title="事件" count={visibleEvents.length}>
                {visibleEvents.map((ev, idx) => {
                  const l = layerById.get(ev.layer_id)
                  return (
                    <div
                      key={ev.id ?? ev.title}
                      className={clsx(
                        'flex items-start gap-3 px-3.5 py-2.5 bg-white',
                        idx > 0 && 'border-t border-black/5',
                        idx === 0 && 'rounded-t-2xl',
                        idx === visibleEvents.length - 1 && 'rounded-b-2xl',
                      )}
                    >
                      <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: ev.color ?? l?.color ?? '#9ca3af' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-gray-800">{ev.title}</p>
                        {l && <p className="text-[11px] text-gray-400 mt-0.5">{l.display_name}</p>}
                        {ev.description && <p className="text-xs text-gray-500 mt-1 leading-snug">{ev.description}</p>}
                      </div>
                    </div>
                  )
                })}
              </MSection>
            )}

            {(openTodos.length > 0 || doneTodos.length > 0) && (
              <MSection icon={<ListTodo size={14} />} title="待办" count={openTodos.length + doneTodos.length}>
                <div className="bg-white rounded-2xl overflow-hidden">
                  {openTodos.map((t, i) => <MTodoLine key={t.id} todo={t} divider={i > 0 || doneTodos.length > 0} />)}
                  {doneTodos.map((t, i) => <MTodoLine key={t.id} todo={t} done divider={i > 0 || openTodos.length > 0} />)}
                </div>
              </MSection>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MSection({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
        <span className="text-gray-400">{icon}</span>
        {title}
        <span className="text-[10px] font-normal text-gray-400 bg-gray-100 rounded-full px-1.5 normal-case">{count}</span>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

function MTodoLine({ todo, done, divider }: { todo: Todo; done?: boolean; divider?: boolean }) {
  const overdue = !done && todo.due_date != null && todo.due_date < todayStr()
  return (
    <div className={clsx('flex items-center gap-3 px-3.5 py-2.5', divider && 'border-t border-black/5')}>
      <span
        className={clsx(
          'w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center',
          done
            ? 'bg-emerald-500'
            : todo.importance === 'high'
              ? 'border-2 border-rose-400'
              : 'border-2 border-gray-300',
        )}
      >
        {done && <Check size={11} className="text-white" strokeWidth={3} />}
      </span>
      <p className={clsx('text-[15px] flex-1 min-w-0 truncate', done ? 'text-gray-400 line-through' : 'text-gray-800')}>{todo.title}</p>
      {!done && todo.due_date && (
        <span className={clsx('text-[11px] flex-shrink-0 font-medium', overdue ? 'text-red-500' : 'text-gray-400')}>
          {overdue ? '已过期' : `截止 ${todo.due_date.slice(5)}`}
        </span>
      )}
    </div>
  )
}

function DesktopDayView({ monthData, layers, selectedDate: _selectedDate, onSelect, onDoubleClick }: Props) {
  const { data: busyConfig } = useQuery({ queryKey: ['todoBusyConfig'], queryFn: getTodoBusyConfig, staleTime: 60_000 })
  const day = monthData.days[0]
  if (!day) return <div className="flex-1 flex items-center justify-center text-gray-400">无数据</div>

  const { y, m, d } = parseDate(day.date)
  const weekday = WEEK_NAMES[new Date(y, m - 1, d).getDay()]
  const layerById = new Map(layers.map((l) => [l.layer_id, l]))
  const today = todayStr()

  const visibleEvents = Object.entries(day.events_by_layer)
    .filter(([lid]) => {
      const l = layerById.get(lid)
      return lid === 'important' || lid === 'schedule' || (l?.enabled ?? false)
    })
    .flatMap(([, evs]) => evs)
    .sort((a, b) => a.sort_key - b.sort_key)

  const schedules = useMemo(
    () => [...(day.schedule_items ?? [])].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [day],
  )
  const openTodos = useMemo(() => (day.todos ?? []).filter((t) => t.status !== 'completed'), [day])
  const doneTodos = useMemo(() => (day.todos ?? []).filter((t) => t.status === 'completed'), [day])

  const colorLayers: string[] = []
  if (layerById.get('important')?.enabled && day.gradient_bg && day.gradient_bg.toLowerCase() !== '#ffffff') {
    colorLayers.push(day.gradient_bg)
  }
  if (layerById.get('coloring')?.enabled && day.coloring_level != null) {
    colorLayers.push(COLORING_COLORS[day.coloring_level])
  }
  for (const b of getBusyColors(day, today, busyConfig)) {
    if (layerById.get(b.id)?.enabled) colorLayers.push(b.color)
  }
  const barColor = colorLayers[0]

  const isEmpty = schedules.length === 0 && visibleEvents.length === 0 && openTodos.length === 0 && doneTodos.length === 0

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {/* 头部：日期 / 农历 / 放假 / 染色状态 */}
      <div
        className="glass-card rounded-3xl md:rounded-xl md:bg-white md:border md:border-gray-200 md:shadow-none flex items-center gap-3 px-3 py-2 md:px-4 md:py-3 flex-shrink-0 cursor-pointer"
        onClick={() => onSelect(day.date)}
        onDoubleClick={() => onDoubleClick(day.date)}
      >
        <div
          className={clsx(
            'w-11 h-11 md:w-14 md:h-14 rounded-xl flex-shrink-0 flex flex-col items-center justify-center text-white shadow-sm',
            day.is_today ? 'bg-rose-500' : 'bg-gray-300',
          )}
          style={!day.is_today && barColor ? { backgroundColor: barColor } : undefined}
        >
          <span className="text-[9px] leading-none opacity-90">{m}月</span>
          <span className="text-xl font-bold leading-tight">{d}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base md:text-lg font-bold text-gray-800">{y}年{day.is_today ? ' · 今天' : ''}</span>
            {day.holiday?.name && (
              <span className="text-[11px] bg-purple-500 text-white px-1.5 py-0.5 rounded">{day.holiday.name}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] md:text-xs text-gray-400 mt-0.5 flex-wrap">
            <span>{weekday}{day.is_weekend ? ' · 周末' : ''}</span>
            {day.lunar && <span className="text-gray-300">|</span>}
            {day.lunar && <span>{day.lunar}</span>}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDoubleClick(day.date) }}
          className="flex items-center gap-1 px-3 md:px-3 py-1.5 text-xs md:text-sm bg-pink-500 text-white rounded-full md:rounded-lg hover:bg-pink-600 active:bg-pink-600 flex-shrink-0"
        >
          <Plus size={14} /> 新建
        </button>
      </div>

      {/* 主内容：分区卡片流，纵向铺满、超高可滚 */}
      <div className="glass-card rounded-3xl md:rounded-xl md:bg-white md:border md:border-gray-200 md:shadow-none flex-1 min-h-0 overflow-y-auto">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 py-10">
            <p className="text-sm text-gray-400">这天还没有安排</p>
            <button
              onClick={() => onDoubleClick(day.date)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-pink-500 text-white rounded-full shadow-sm hover:bg-pink-600 active:bg-pink-600"
            >
              <Plus size={15} /> 添加事件
            </button>
          </div>
        ) : (
          <div className="p-3 md:p-4 flex flex-col gap-3">
            {schedules.length > 0 && (
              <Section icon={<CalendarClock size={14} />} title="日程" count={schedules.length}>
                {schedules.map((it) => (
                  <div
                    key={it.id ?? `${it.title}-${it.start_time}`}
                    className="flex items-center gap-2.5 rounded-lg border border-blue-100 bg-blue-50/40 px-2.5 py-2"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: it.color ?? '#3D6BFB' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{it.title}</p>
                    </div>
                    {it.start_time && (
                      <span className="text-xs font-medium text-blue-600 tabular-nums flex-shrink-0">
                        {it.start_time}
                        {it.end_time ? `-${it.end_time}` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {visibleEvents.length > 0 && (
              <Section icon={<ClipboardList size={14} />} title="事件" count={visibleEvents.length}>
                {visibleEvents.map((ev) => {
                  const l = layerById.get(ev.layer_id)
                  return (
                    <div
                      key={ev.id ?? ev.title}
                      className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-2.5 py-2"
                    >
                      <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: ev.color ?? l?.color ?? '#9ca3af' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{ev.title}</p>
                        {l && <p className="text-[11px] text-gray-400">{l.display_name}</p>}
                        {ev.description && <p className="text-xs text-gray-500 mt-1 leading-snug">{ev.description}</p>}
                      </div>
                    </div>
                  )
                })}
              </Section>
            )}

            {(openTodos.length > 0 || doneTodos.length > 0) && (
              <Section icon={<ListTodo size={14} />} title="待办" count={openTodos.length + doneTodos.length}>
                {openTodos.map((t) => <TodoLine key={t.id} todo={t} />)}
                {doneTodos.map((t) => <TodoLine key={t.id} todo={t} done />)}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5 px-0.5">
        <span className="text-gray-400">{icon}</span>
        {title}
        <span className="text-[10px] font-normal text-gray-400 bg-gray-100 rounded-full px-1.5">{count}</span>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

function TodoLine({ todo, done }: { todo: Todo; done?: boolean }) {
  const overdue = !done && todo.due_date != null && todo.due_date < todayStr()
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-2.5 py-2">
      <span
        className={clsx(
          'w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center',
          done ? 'bg-emerald-500 text-white' : todo.importance === 'high' ? 'bg-red-500 text-white' : 'border border-gray-300',
        )}
      />
      <p className={clsx('text-sm flex-1 min-w-0 truncate', done ? 'text-gray-400 line-through' : 'text-gray-800')}>{todo.title}</p>
      {!done && todo.due_date && (
        <span className={clsx('text-[11px] flex-shrink-0', overdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
          {overdue ? '已过期' : `截止 ${todo.due_date.slice(5)}`}
        </span>
      )}
    </div>
  )
}
