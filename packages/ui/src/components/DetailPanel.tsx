import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CalendarDays, CalendarPlus, CheckCircle2, Clock, Palette, Pencil, Sparkles, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { CalEvent, Day, Layer } from '../adapt/types'
import { COLORING_COLORS, parseDate, TODO_BUSY_PREDICT_COLORS, TODO_BUSY_DONE_COLORS } from '../adapt/data'
import { deleteEvent, deleteMark, deleteScheduleItem, getTodoBusyConfig, updateTodo } from '../adapt/api'

interface Props {
  day: Day | null
  layers: Layer[]
  onEditEvent: (date: string, event: CalEvent) => void
  onEditSchedule: (date: string) => void
  onSetColoring: (date: string) => void
  onAddDot: (date: string) => void
  onAddColor: (date: string) => void
  /** 新建事件入口（手机没有双击新建，桌面也顺带受益） */
  onAddEvent?: (date: string) => void
  /** panel=桌面右侧栏（lg+）；drawer=手机右侧抽屉内容体（20260916：底部弹层已废） */
  variant?: 'panel' | 'drawer'
  /** drawer 模式的关闭回调 */
  onClose?: () => void
}

export function DetailPanel({ day, layers, onEditEvent, onEditSchedule, onSetColoring, onAddDot, onAddColor, onAddEvent, variant = 'panel', onClose }: Props) {
  const qc = useQueryClient()
  const drawer = variant === 'drawer'
  const { data: busyConfig } = useQuery({ queryKey: ['todoBusyConfig'], queryFn: getTodoBusyConfig, staleTime: 60_000 })
  const delMut = useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['view'] })
      qc.invalidateQueries({ queryKey: ['countdown'] })
    },
  })
  const delScheduleMut = useMutation({
    mutationFn: (id: number) => deleteScheduleItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['view'] })
      qc.invalidateQueries({ queryKey: ['scheduleItems'] })
    },
  })
  const delMarkMut = useMutation({
    mutationFn: ({ layerId, date }: { layerId: string; date: string }) => deleteMark(layerId, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['view'] })
    },
  })
  const toggleTodoMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateTodo(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['view'] })
      qc.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  if (!day) {
    if (drawer) {
      return (
        <p className="text-sm text-gray-400 p-4">点月历上的日期，这里会显示当天详情。</p>
      )
    }
    return (
      <aside className="hidden lg:block w-72 bg-white/55 border-l border-white/60 p-4 overflow-y-auto">
        <p className="text-sm text-gray-400">点击日期查看详情</p>
      </aside>
    )
  }

  const { y, m, d } = parseDate(day.date)
  const weekday = '一二三四五六日'[new Date(y, m - 1, d).getDay() === 0 ? 6 : new Date(y, m - 1, d).getDay() - 1]
  const enabledSet = new Set(layers.filter((l) => l.enabled).map((l) => l.layer_id))
  // 涂色图层（kind=color 且 custom_*）的旧 events 不当事件显示（已迁到 marks）
  const colorLayerIds = new Set(layers.filter((l) => l.kind === 'color' && l.layer_id.startsWith('custom_')).map((l) => l.layer_id))
  const events = Object.entries(day.events_by_layer)
    .filter(([lid]) => (lid === 'important' || enabledSet.has(lid)) && !colorLayerIds.has(lid))
    .flatMap(([, evs]) => evs)
  const layerColor = (lid: string) => layers.find((l) => l.layer_id === lid)?.color ?? '#9ca3af'
  const layerName = (lid: string) => layers.find((l) => l.layer_id === lid)?.display_name ?? lid

  return (
    <aside
      className={clsx(
        'overflow-y-auto',
        drawer ? 'w-full' : 'hidden lg:block w-72 bg-white/55 border-l border-white/60 p-4',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] text-gray-400">已选日期</p>
          <p className="text-2xl font-semibold text-gray-800">
            {m} 月 {d} 日
          </p>
          <p className="text-sm text-gray-500">
            {y} 年 · 周{weekday}
            {day.lunar && <span className="ml-2 text-gray-400">{day.lunar}</span>}
            {day.is_today && <span className="ml-2 text-rose-500 text-xs">今天</span>}
          </p>
        </div>
        {drawer && onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md text-lg flex-shrink-0"
            title="关闭"
          >
            ×
          </button>
        )}
      </div>

      {/* 20260917 任务书 1.2-1：手机右抽屉统一为「点点 / 涂色」两个入口——
          事件与日程都是点点（DotEntryDialog 内选图层即涵盖），打卡/完成度等都是涂色；
          桌面右栏保留原四按钮（桌面零变化红线）。 */}
      <div className="flex gap-1.5 mb-4">
        {drawer ? (
          <>
            <button
              onClick={() => onAddDot(day.date)}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-700 py-2.5 rounded-xl bg-white/80 border border-black/5 shadow-sm active:bg-pink-50 active:text-pink-600 transition-colors"
            >
              <Clock size={15} className="text-pink-500" /> 加点点
            </button>
            <button
              onClick={() => onAddColor(day.date)}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-700 py-2.5 rounded-xl bg-white/80 border border-black/5 shadow-sm active:bg-pink-50 active:text-pink-600 transition-colors"
            >
              <Palette size={15} className="text-amber-500" /> 涂色
            </button>
          </>
        ) : (
          <>
            {onAddEvent && (
              <button
                onClick={() => onAddEvent(day.date)}
                className="flex-1 flex items-center justify-center gap-1 text-xs text-white py-1.5 rounded-md bg-pink-500 hover:bg-pink-600"
              >
                <CalendarPlus size={12} /> 事件
              </button>
            )}
            {/* 日程快捷入口常驻：手机端没有桌面右键菜单，「编辑日程」又只在已有日程时出现，
                缺了它空日程日在手机上永远无法添加日程（20260916 智者 P0-3） */}
            <button
              onClick={() => onEditSchedule(day.date)}
              className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-600 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100"
            >
              <CalendarClock size={12} /> 日程
            </button>
            <button
              onClick={() => onAddDot(day.date)}
              className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-600 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100"
            >
              <Clock size={12} /> 点点
            </button>
            <button
              onClick={() => onAddColor(day.date)}
              className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-600 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100"
            >
              <Palette size={12} /> 涂色
            </button>
          </>
        )}
      </div>

      {day.holiday?.name && (
        <div className="mb-3 p-2 rounded-lg bg-purple-50 border border-purple-100">
          <p className="text-xs text-purple-600 font-medium">🏮 {day.holiday.name}</p>
        </div>
      )}

      {/* 5 档涂色：内置充实度 + 自定义 graded marks + 待办忙度 predict/done（无标题） */}
      {(day.coloring_level != null
        || day.marks?.some((mk) => mk.mode === 'graded')
        || day.predict_level != null
        || day.done_level != null) && (
        <div className="mb-3 space-y-1">
          {day.coloring_level != null && (
            <div className="flex items-center gap-2 group">
              <span className="text-[11px] text-gray-500 w-16 flex-shrink-0 truncate">充实度</span>
              <div className="flex-1 flex gap-px h-2 rounded overflow-hidden">
                {COLORING_COLORS.map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c, opacity: i <= day.coloring_level! ? 1 : 0.3 }} />
                ))}
              </div>
              <span className="text-xs text-gray-500">{day.coloring_level + 1}/5</span>
            </div>
          )}
          {(day.marks ?? [])
            .filter((mk) => mk.mode === 'graded')
            .map((mk) => (
              <div key={mk.layer_id} className="flex items-center gap-2 group">
                <span className="text-[11px] text-gray-500 w-16 flex-shrink-0 truncate">{mk.display_name}</span>
                {mk.level != null ? (
                  <>
                    <div className="flex-1 flex gap-px h-2 rounded overflow-hidden">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1"
                          style={{ backgroundColor: mk.color ?? '#9ca3af', opacity: i <= mk.level! ? 1 : 0.3 }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">{(mk.level ?? 0) + 1}/5</span>
                  </>
                ) : (
                  <span className="flex-1 text-[11px] text-gray-300">未标记档位</span>
                )}
                <button
                  onClick={() => delMarkMut.mutate({ layerId: mk.layer_id, date: day.date })}
                  className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition flex-shrink-0"
                  title="删除标记"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          {day.predict_level != null && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 w-16 flex-shrink-0 truncate">待办·未完成</span>
              <div className="flex-1 flex gap-px h-2 rounded overflow-hidden">
                {(busyConfig?.predict_colors ?? TODO_BUSY_PREDICT_COLORS).map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c, opacity: i <= day.predict_level! ? 1 : 0.3 }} />
                ))}
              </div>
              <span className="text-xs text-gray-500">{day.predict_level! + 1}/5</span>
            </div>
          )}
          {day.done_level != null && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 w-16 flex-shrink-0 truncate">待办·已完成</span>
              <div className="flex-1 flex gap-px h-2 rounded overflow-hidden">
                {(busyConfig?.done_colors ?? TODO_BUSY_DONE_COLORS).map((c, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: c, opacity: i <= day.done_level! ? 1 : 0.3 }} />
                ))}
              </div>
              <span className="text-xs text-gray-500">{day.done_level! + 1}/5</span>
            </div>
          )}
        </div>
      )}

      {/* 单色涂色：自定义 solid marks（无标题） */}
      {day.marks?.some((mk) => mk.mode !== 'graded') && (
        <div className="mb-3 space-y-1">
          {day.marks
            .filter((mk) => mk.mode !== 'graded')
            .map((mk) => (
              <div key={mk.layer_id} className="flex items-center gap-2 group">
                <span className="text-[11px] text-gray-500 w-16 flex-shrink-0 truncate">{mk.display_name}</span>
                <div className="flex-1 flex items-center gap-1">
                  <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: mk.color ?? '#9ca3af' }} />
                  <span className="text-[11px] text-gray-400">已标记</span>
                </div>
                <button
                  onClick={() => delMarkMut.mutate({ layerId: mk.layer_id, date: day.date })}
                  className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition flex-shrink-0"
                  title="删除标记"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
        </div>
      )}

      {(day.schedule_items?.length ?? 0) > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock size={12} /> 日程
            </div>
            <button
              onClick={() => onEditSchedule(day.date)}
              className="text-[11px] text-gray-400 hover:text-pink-500"
              title="编辑全部日程"
            >
              编辑
            </button>
          </div>
          <div className="space-y-1">
            {[...(day.schedule_items ?? [])]
              .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
              .map((it) => (
                <div
                  key={it.id ?? `${it.title}-${it.start_time}`}
                  className="flex items-center gap-1.5 group rounded -mx-1 px-1 py-0.5 hover:bg-gray-50"
                >
                  <span className="text-gray-400 flex-shrink-0 tabular-nums whitespace-nowrap text-sm">
                    {it.start_time ? (it.end_time ? `${it.start_time}-${it.end_time}` : it.start_time) : '全天'}
                  </span>
                  <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{it.title}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                    <button
                      onClick={() => onEditSchedule(day.date)}
                      className="p-1 text-gray-400 hover:text-pink-500"
                      title="编辑日程"
                    >
                      <Pencil size={12} />
                    </button>
                    {it.id && (
                      <button
                        onClick={() => delScheduleMut.mutate(it.id!)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="删除这条日程"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-1 mb-1.5 text-xs text-gray-400">
          <CalendarDays size={12} /> 事件（{events.length}）
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-gray-300 flex items-center gap-1">
            <Sparkles size={12} /> 无事件
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((ev, i) => (
              <div key={ev.id ?? i} className="p-2 rounded-lg bg-gray-50 border border-gray-100 group">
                <div className="flex items-start gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: ev.color ?? layerColor(ev.layer_id) }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 leading-tight">{ev.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{layerName(ev.layer_id)}</p>
                    {ev.description && <p className="text-xs text-gray-400 mt-1">{ev.description}</p>}
                  </div>
                  {ev.source === 'manual' && ev.id && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => onEditEvent(day.date, ev)}
                        className="p-1 text-gray-400 hover:text-pink-500"
                        title="编辑"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => ev.id && delMut.mutate(ev.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {day.todos && day.todos.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1 mb-1.5 text-xs text-gray-400">
            <CheckCircle2 size={12} /> 待办（{day.todos.length}）
          </div>
          <div className="space-y-1">
            {day.todos.map((t) => {
              const isDone = t.status === 'completed'
              return (
                <div key={t.id} className="flex items-start gap-1.5 p-1.5 rounded bg-amber-50/50">
                  <button
                    onClick={() => toggleTodoMut.mutate({
                      id: t.id,
                      data: { ...t, id: t.id, status: isDone ? 'notStarted' : 'completed' },
                    })}
                    className={clsx(
                      'w-3.5 h-3.5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center',
                      isDone ? 'bg-amber-500 border-amber-500' : 'border-gray-300 hover:border-amber-400',
                    )}
                  >
                    {isDone && <span className="text-white text-[8px]">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm leading-tight', isDone ? 'text-gray-400 line-through' : 'text-gray-700')}>{t.title}</p>
                    {t.importance === 'high' && !isDone && <span className="text-[10px] text-red-500">⚡高</span>}
                    {t.due_date === day.date && !isDone && (
                      <span className="text-[10px] text-red-500 ml-1">截止</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}
