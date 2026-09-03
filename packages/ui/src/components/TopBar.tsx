import { Calendar, CheckSquare, ChevronLeft, ChevronRight, Layers, ListTodo, Rss, Search, Settings } from 'lucide-react'
import clsx from 'clsx'
import type { TopTab, TodoViewMode, ViewMode } from '../adapt/types'

interface Props {
  title: string
  topTab: TopTab
  mode: ViewMode
  todoView: TodoViewMode
  onTopTabChange: (t: TopTab) => void
  onModeChange: (m: ViewMode) => void
  onTodoViewChange: (v: TodoViewMode) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  canPrev: boolean
  canNext: boolean
  onOpenSearch: () => void
  onOpenSubscription: () => void
  onOpenSettings: () => void
  onOpenLayers?: () => void
}

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'month', label: '月' },
  { key: 'week', label: '周' },
  { key: 'day', label: '日' },
  { key: 'year', label: '年' },
  { key: 'countdown', label: '倒数日' },
]

const TODO_MODES: { key: TodoViewMode; label: string }[] = [
  { key: 'list', label: '列表' },
  { key: 'matrix', label: '矩阵' },
  { key: 'kanban', label: '看板' },
  { key: 'gantt', label: '甘特' },
  { key: 'stickies', label: '便签' },
]

export function TopBar({ title, topTab, mode, todoView, onTopTabChange, onModeChange, onTodoViewChange, onPrev, onNext, onToday, canPrev, canNext, onOpenSearch, onOpenSubscription, onOpenSettings, onOpenLayers }: Props) {
  return (
    /* 手机竖屏：flex-wrap 换两行 —— 第一行 tab+翻页+标题+操作图标，第二行模式切换（横向滚动）；
       桌面（md+）：单行，与旧版顺序一致（tab → 翻页/标题 → 模式 → 右侧操作） */
    <header className="bg-white border-b border-gray-200 flex flex-wrap items-center gap-x-1 gap-y-1.5 px-2 md:px-4 py-1.5 md:py-0 md:h-14 md:flex-nowrap">
      {/* 顶级 tab：日历 / 待办 */}
      <div className="order-1 inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 md:mr-3 flex-shrink-0">
        <button
          onClick={() => onTopTabChange('calendar')}
          className={clsx(
            'flex items-center gap-1 px-2 md:px-3 py-1 text-sm rounded-md transition',
            topTab === 'calendar' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Calendar size={14} /> 日历
        </button>
        <button
          onClick={() => onTopTabChange('todo')}
          className={clsx(
            'flex items-center gap-1 px-2 md:px-3 py-1 text-sm rounded-md transition',
            topTab === 'todo' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <CheckSquare size={14} /> 待办
        </button>
      </div>

      {topTab === 'calendar' ? (
        <>
          {/* 翻页 + 标题（手机上标题 flex-1 可截断） */}
          {mode !== 'countdown' ? (
            <div className="order-2 flex items-center gap-0.5 md:gap-1 min-w-0 flex-1 md:flex-none">
              <button
                onClick={onPrev}
                disabled={!canPrev}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex-shrink-0"
                title={mode === 'year' ? '上一年' : mode === 'week' ? '上一周' : mode === 'day' ? '上一天' : '上一月'}
              >
                <ChevronLeft size={18} />
              </button>
              <h1 className="flex-1 min-w-0 truncate text-center text-sm md:text-lg font-semibold text-gray-800 md:min-w-[140px]">{title}</h1>
              <button
                onClick={onNext}
                disabled={!canNext}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex-shrink-0"
                title={mode === 'year' ? '下一年' : mode === 'week' ? '下一周' : mode === 'day' ? '下一天' : '下一月'}
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={onToday}
                className="ml-1 md:ml-2 px-2 md:px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition flex-shrink-0"
              >
                今天
              </button>
            </div>
          ) : (
            <div className="order-2 flex items-center gap-1.5 min-w-0 flex-1 md:flex-none md:min-w-[140px]">
              <ListTodo size={18} className="flex-shrink-0" />
              <h1 className="text-sm md:text-lg font-semibold text-gray-800 truncate">倒数日</h1>
            </div>
          )}

          {/* 模式切换：手机第二行整行滚动，桌面保持原位置 */}
          <div className="order-4 md:order-3 w-full md:w-auto md:ml-4 -mx-2 px-2 md:mx-0 md:px-0 overflow-x-auto flex-shrink-0">
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => onModeChange(m.key)}
                  className={clsx(
                    'px-3 py-1 text-sm rounded-md transition whitespace-nowrap',
                    mode === m.key ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧操作：手机只留图标（搜索框图标化、图层入口），桌面原样 */}
          <div className="order-3 md:order-4 ml-auto md:ml-auto flex items-center gap-1 md:gap-2 flex-shrink-0">
            {onOpenLayers && (
              <button onClick={onOpenLayers} className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition" title="图层">
                <Layers size={18} />
              </button>
            )}
            <button
              onClick={onOpenSearch}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
              title="搜索事件"
            >
              <Search size={18} />
            </button>
            <button
              onClick={onOpenSearch}
              className="relative hidden md:flex items-center w-48 pl-2.5 pr-3 py-1.5 text-sm text-gray-400 bg-gray-50 border border-gray-200 rounded-lg hover:bg-white hover:text-gray-600 transition"
            >
              <Search size={14} className="mr-2" />
              搜索事件…
            </button>
            <button onClick={onOpenSubscription} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition" title="订阅">
              <Rss size={18} />
            </button>
            <button onClick={onOpenSettings} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition" title="设置">
              <Settings size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="order-2 flex items-center gap-1.5 min-w-0 flex-1 md:flex-none">
            <ListTodo size={18} className="flex-shrink-0" />
            <h1 className="text-sm md:text-lg font-semibold text-gray-800 truncate">待办</h1>
          </div>

          <div className="order-4 md:order-3 w-full md:w-auto md:ml-4 -mx-2 px-2 md:mx-0 md:px-0 overflow-x-auto flex-shrink-0">
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {TODO_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => onTodoViewChange(m.key)}
                  className={clsx(
                    'px-3 py-1 text-sm rounded-md transition whitespace-nowrap',
                    todoView === m.key ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="order-3 md:order-4 ml-auto flex items-center gap-1 md:gap-2 flex-shrink-0">
            <button onClick={onOpenSubscription} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition" title="订阅">
              <Rss size={18} />
            </button>
            <button onClick={onOpenSettings} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition" title="设置">
              <Settings size={18} />
            </button>
          </div>
        </>
      )}
    </header>
  )
}
