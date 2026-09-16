import { useMemo } from 'react'
import clsx from 'clsx'
import { StickyNote } from 'lucide-react'
import type { Todo } from '../../adapt/types'

const PALETTE = [
  'bg-[#fdf6b8]', // 经典黄
  'bg-[#fbd5e5]', // 粉
  'bg-[#cfe5fd]', // 蓝
  'bg-[#cdeed8]', // 绿
  'bg-[#ffe2c4]', // 橙
  'bg-[#e3dcf9]', // 淡紫
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface Props {
  todos: Todo[]
  selectedTodoId: string | null
  onSelect: (id: string) => void
  onOpenNotes?: (id: string) => void
}

export function TodoStickiesView({ todos, selectedTodoId, onSelect, onOpenNotes }: Props) {
  const stickies = useMemo(
    () =>
      todos.map((t) => {
        const h = hashStr(t.id)
        return {
          todo: t,
          color: PALETTE[h % PALETTE.length],
          rotate: ((h >> 3) % 7) - 3, // -3° ~ +3°
          tapeRotate: ((h >> 6) % 9) - 4, // 胶带 -4° ~ +4°
        }
      }),
    [todos],
  )

  if (!todos.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-stone-400">
        <StickyNote size={28} strokeWidth={1.5} className="opacity-40" />
        <p className="text-sm">墙上一张便签都没有</p>
        <p className="text-xs text-stone-300">点「新建待办」贴上第一张</p>
      </div>
    )
  }

  return (
    // 20260916 任务书：便签要一眼看到备注内容，且页面上下滑（不是左右滑）。
    // 关键结构：外层只做纵向滚动，内层 columns-2 不给固定高度——
    // CSS 多列在固定高度下会向右溢出成横向翻页（旧版「左右滑」的根源）；
    // 高度放开后两列纵向平衡、容器向下生长，自然形成纵向瀑布流。
    <div className="h-full overflow-y-auto p-3 md:p-5 [background-image:radial-gradient(#e7e2d8_1px,transparent_1px)] [background-size:22px_22px]">
      <div className="columns-2 lg:columns-3 2xl:columns-4 gap-3 md:gap-5">
        {stickies.map(({ todo, color, rotate, tapeRotate }) => {
          const selected = selectedTodoId === todo.id
          return (
            <div
              key={todo.id}
              onClick={() => onSelect(todo.id)}
              onDoubleClick={onOpenNotes ? () => onOpenNotes(todo.id) : undefined}
              title="双击查看 / 编辑备注"
              style={{ transform: `rotate(${rotate}deg)` }}
              className={clsx(
                'relative mb-3 md:mb-5 break-inside-avoid rounded-xl md:rounded-[2px] px-3 pt-5 pb-3 md:px-4 md:pt-6 md:pb-4 cursor-pointer',
                'shadow-[0_1px_2px_rgba(87,70,38,0.08),0_6px_16px_rgba(87,70,38,0.10)]',
                'transition-all duration-200 ease-out',
                'hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_2px_4px_rgba(87,70,38,0.10),0_12px_28px_rgba(87,70,38,0.16)]',
                selected && 'ring-2 ring-pink-400/80 rotate-0',
                color,
              )}
            >
              {/* 胶带 */}
              <span
                aria-hidden
                style={{ transform: `rotate(${tapeRotate}deg)` }}
                className="absolute -top-2 left-1/2 -ml-6 w-12 h-5 rounded-[1px] bg-white/45 shadow-[0_1px_2px_rgba(0,0,0,0.06)] backdrop-blur-[0.5px] border-x border-y border-white/60"
              />
              <p className="text-[13px] md:text-[15px] font-medium text-stone-800 leading-snug line-clamp-3 md:line-clamp-2 break-words">{todo.title}</p>
              {/* 备注内容：便签的本体就是备注（20260916），两端都展示，手机限高六行 */}
              {todo.body && (
                <p className="mt-2 text-[12px] md:text-[12.5px] text-stone-600/90 leading-relaxed break-words whitespace-pre-wrap line-clamp-6 md:line-clamp-none">
                  {todo.body}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
