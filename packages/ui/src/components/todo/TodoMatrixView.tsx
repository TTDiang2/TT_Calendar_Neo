import { useMemo } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CalendarClock, Coffee, Hourglass } from 'lucide-react'
import { quadrantOf, type QuadrantKey } from '@tt-calendar/domain'
import type { Todo, TodoList } from '../../adapt/types'
import { dueInDays, urgencyOf } from '../../adapt/todoLogic'
import { useIsMobile } from '../../hooks/useMedia'
import { TodoMiniCard } from './TodoMiniCard'
import { useI18n, type I18n, type TxKey } from '../../i18n'

/**
 * 手机端四象限（20260917 任务书 1.1-7 再修）：每个象限就是一张足够长的大卡，
 * 内容全量展开不再折叠（上一轮的「还有 N 条」批展开被用户否掉——在 小空间里
 * 看四个象限不可接受），整页上下滑顺序看完全部四块。
 * 象限分桶改走 domain 的 quadrantOf()（key: doNow/planIt/delegate/drop，
 * 原 QUADRANT_LABELS 已从 domain 删除），文案在 todo.quadrant.* 字典。
 */
interface Props {
  todos: Todo[]
  lists: TodoList[]
  selectedTodoId: string | null
  onSelect: (id: string) => void
  onToggle: (todo: Todo, done: boolean) => void
}

/** 象限的视觉元数据（图标/配色）；文案一律经 todo.quadrant.* 字典 */
const QUADRANTS: { key: QuadrantKey; icon: typeof AlertTriangle; tone: string; head: string }[] = [
  { key: 'doNow', icon: AlertTriangle, tone: 'border-red-200 bg-red-50/60', head: 'text-red-700' },
  { key: 'planIt', icon: CalendarClock, tone: 'border-blue-200 bg-blue-50/60', head: 'text-blue-700' },
  { key: 'delegate', icon: Coffee, tone: 'border-amber-200 bg-amber-50/60', head: 'text-amber-700' },
  { key: 'drop', icon: Hourglass, tone: 'border-gray-200 bg-gray-50/60', head: 'text-gray-600' },
]

/** 象限文案 key（title=象限名，action=动作短语，desc=空态说明） */
const QUADRANT_TEXT: Record<QuadrantKey, { title: TxKey; action: TxKey; desc: TxKey }> = {
  doNow: { title: 'todo.quadrant.doNow.title', action: 'todo.quadrant.doNow.action', desc: 'todo.quadrant.doNow.desc' },
  planIt: { title: 'todo.quadrant.planIt.title', action: 'todo.quadrant.planIt.action', desc: 'todo.quadrant.planIt.desc' },
  delegate: { title: 'todo.quadrant.delegate.title', action: 'todo.quadrant.delegate.action', desc: 'todo.quadrant.delegate.desc' },
  drop: { title: 'todo.quadrant.drop.title', action: 'todo.quadrant.drop.action', desc: 'todo.quadrant.drop.desc' },
}

/** 卡片副标题：清单名（用户数据）· 截止/计划描述 · 标签（用户数据） */
function subText(i18n: I18n, t: Todo, lists: TodoList[]): string {
  const { t: tr, tPlural } = i18n
  const parts: string[] = []
  const listName = lists.find((l) => l.id === t.list_id)?.display_name
  if (listName) parts.push(listName)
  const din = dueInDays(t)
  if (t.due_date && din !== null) {
    parts.push(din < 0 ? tPlural('todo.sub.overdueBy', -din) : din === 0 ? tr('todo.due.today') : tPlural('todo.sub.dueIn', din))
  } else if (t.planned_date) {
    parts.push(tr('todo.sub.planned', { date: t.planned_date }))
  }
  if ((t.tags ?? []).length) parts.push(t.tags!.map((x) => `#${x}`).join(' '))
  return parts.join(' · ')
}

/** 单个象限卡：手机全量展开（卡片随内容长高，最低半屏），桌面全量展示 */
function QuadrantCard({
  q,
  items,
  isMobile,
  lists,
  selectedTodoId,
  onSelect,
  onToggle,
  text,
}: {
  q: (typeof QUADRANTS)[number]
  items: Todo[]
  isMobile: boolean
  lists: TodoList[]
  selectedTodoId: string | null
  onSelect: (id: string) => void
  onToggle: (todo: Todo, done: boolean) => void
  text: { title: string; action: string; desc: string }
}) {
  const i18n = useI18n()
  const Icon = q.icon
  const soonCount = items.filter((td) => urgencyOf(td) === 'soon').length

  return (
    <div
      className={clsx(
        'rounded-2xl border flex flex-col overflow-hidden',
        q.tone,
        // 手机：每块都是半屏起步的大卡（20260917 任务书 1.1-7：框框要足够长）
        isMobile && 'min-h-[46vh]',
      )}
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-black/5 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={15} className={clsx(q.head, 'flex-shrink-0')} />
          <span className={clsx('text-[15px] font-semibold truncate', q.head)}>{text.title}</span>
          <span className="text-[11px] text-gray-400 hidden sm:inline">{text.action}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {soonCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700" title={i18n.t('todo.matrix.soonTitle')}>
              {i18n.tPlural('todo.matrix.nearing', soonCount)}
            </span>
          )}
          <span className="text-sm font-semibold text-gray-500">{items.length}</span>
        </div>
      </div>
      {/* 手机：内容全量生长、整页滚动承接；桌面：象限内独立滚动（基线行为） */}
      <div className="flex-1 overflow-visible md:overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-300 py-6">{text.desc}</div>
        ) : (
          items.map((td) => (
            <TodoMiniCard
              key={td.id}
              todo={td}
              selected={selectedTodoId === td.id}
              sub={subText(i18n, td, lists)}
              onClick={() => onSelect(td.id)}
              onToggle={(done) => onToggle(td, done)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export function TodoMatrixView({ todos, lists, selectedTodoId, onSelect, onToggle }: Props) {
  const i18n = useI18n()
  const isMobile = useIsMobile()
  const active = useMemo(() => todos.filter((t) => t.status !== 'completed'), [todos])

  const buckets = useMemo(() => {
    const b: Record<QuadrantKey, Todo[]> = { doNow: [], planIt: [], delegate: [], drop: [] }
    for (const t of active) {
      b[quadrantOf(t)].push(t)
    }
    for (const k of Object.keys(b) as QuadrantKey[]) {
      b[k].sort((a, z) => (dueInDays(a) ?? 999) - (dueInDays(z) ?? 999))
    }
    return b
  }, [active])

  // 手机：四象限纵向堆叠、整页滚动（外层唯一滚动面），象限不再内部滚动/折叠成矮块；
  // 桌面：2×2 填满视口
  return (
    <div className="h-full overflow-y-auto md:overflow-visible grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-2.5 md:gap-3 pb-4 content-start md:content-stretch">
      {QUADRANTS.map((q) => {
        const qt = QUADRANT_TEXT[q.key]
        return (
          <QuadrantCard
            key={q.key}
            q={q}
            items={buckets[q.key]}
            isMobile={isMobile}
            lists={lists}
            selectedTodoId={selectedTodoId}
            onSelect={onSelect}
            onToggle={onToggle}
            text={{ title: i18n.t(qt.title), action: i18n.t(qt.action), desc: i18n.t(qt.desc) }}
          />
        )
      })}
    </div>
  )
}
