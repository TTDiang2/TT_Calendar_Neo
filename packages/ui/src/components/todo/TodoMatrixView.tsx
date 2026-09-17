import { useMemo } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CalendarClock, Coffee, Hourglass } from 'lucide-react'
import type { Todo, TodoList } from '../../adapt/types'
import { dueInDays, isImportant, urgencyOf } from '../../adapt/todoLogic'
import { useIsMobile } from '../../hooks/useMedia'
import { TodoMiniCard } from './TodoMiniCard'

/**
 * 手机端四象限（20260917 任务书 1.1-7 再修）：每个象限就是一张足够长的大卡，
 * 内容全量展开不再折叠（上一轮的「还有 N 条」批展开被用户否掉——在 小空间里
 * 看四个象限不可接受），整页上下滑顺序看完全部四块。
 */
interface Props {
  todos: Todo[]
  lists: TodoList[]
  selectedTodoId: string | null
  onSelect: (id: string) => void
  onToggle: (todo: Todo, done: boolean) => void
}

const QUADRANTS = [
  {
    key: 'iu' as const,
    title: '重要 × 紧急',
    action: '立即做',
    icon: AlertTriangle,
    tone: 'border-red-200 bg-red-50/60',
    head: 'text-red-700',
    desc: '今天必须推进的事',
  },
  {
    key: 'in' as const,
    title: '重要 × 不紧急',
    action: '规划做',
    icon: CalendarClock,
    tone: 'border-blue-200 bg-blue-50/60',
    head: 'text-blue-700',
    desc: '矩阵的核心价值区：别让它变成紧急',
  },
  {
    key: 'nu' as const,
    title: '不重要 × 紧急',
    action: '快速清',
    icon: Coffee,
    tone: 'border-amber-200 bg-amber-50/60',
    head: 'text-amber-700',
    desc: '碎片打断：批量快速处理',
  },
  {
    key: 'nn' as const,
    title: '不重要 × 不紧急',
    action: '有空做',
    icon: Hourglass,
    tone: 'border-gray-200 bg-gray-50/60',
    head: 'text-gray-600',
    desc: '不占用最佳精力，有空再说',
  },
]

function subText(t: Todo, lists: TodoList[]): string {
  const parts: string[] = []
  const listName = lists.find((l) => l.id === t.list_id)?.display_name
  if (listName) parts.push(listName)
  const din = dueInDays(t)
  if (t.due_date && din !== null) {
    parts.push(din < 0 ? `截止已过 ${-din} 天` : din === 0 ? '今天截止' : `${din} 天后截止`)
  } else if (t.planned_date) {
    parts.push(`计划 ${t.planned_date}`)
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
}: {
  q: (typeof QUADRANTS)[number]
  items: Todo[]
  isMobile: boolean
  lists: TodoList[]
  selectedTodoId: string | null
  onSelect: (id: string) => void
  onToggle: (todo: Todo, done: boolean) => void
}) {
  const Icon = q.icon
  const soonCount = items.filter((t) => urgencyOf(t) === 'soon').length

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
          <span className={clsx('text-[15px] font-semibold truncate', q.head)}>{q.title}</span>
          <span className="text-[11px] text-gray-400 hidden sm:inline">{q.action}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {soonCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700" title="3-7 天内到期">
              {soonCount} 临近
            </span>
          )}
          <span className="text-sm font-semibold text-gray-500">{items.length}</span>
        </div>
      </div>
      {/* 手机：内容全量生长、整页滚动承接；桌面：象限内独立滚动（基线行为） */}
      <div className="flex-1 overflow-visible md:overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-300 py-6">{q.desc}</div>
        ) : (
          items.map((t) => (
            <TodoMiniCard
              key={t.id}
              todo={t}
              selected={selectedTodoId === t.id}
              sub={subText(t, lists)}
              onClick={() => onSelect(t.id)}
              onToggle={(done) => onToggle(t, done)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export function TodoMatrixView({ todos, lists, selectedTodoId, onSelect, onToggle }: Props) {
  const isMobile = useIsMobile()
  const active = useMemo(() => todos.filter((t) => t.status !== 'completed'), [todos])

  const buckets = useMemo(() => {
    const b: Record<string, Todo[]> = { iu: [], in: [], nu: [], nn: [] }
    for (const t of active) {
      const imp = isImportant(t)
      const urg = urgencyOf(t) === 'urgent'
      b[imp ? (urg ? 'iu' : 'in') : urg ? 'nu' : 'nn'].push(t)
    }
    for (const k of Object.keys(b)) {
      b[k].sort((a, z) => (dueInDays(a) ?? 999) - (dueInDays(z) ?? 999))
    }
    return b
  }, [active])

  // 手机：四象限纵向堆叠、整页滚动（外层唯一滚动面），象限不再内部滚动/折叠成矮块；
  // 桌面：2×2 填满视口
  return (
    <div className="h-full overflow-y-auto md:overflow-visible grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-2.5 md:gap-3 pb-4 content-start md:content-stretch">
      {QUADRANTS.map((q) => (
        <QuadrantCard
          key={q.key}
          q={q}
          items={buckets[q.key]}
          isMobile={isMobile}
          lists={lists}
          selectedTodoId={selectedTodoId}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}
