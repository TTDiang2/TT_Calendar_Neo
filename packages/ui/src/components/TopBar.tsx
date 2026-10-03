import { BarChart3, Calendar, CheckSquare, ChevronLeft, ChevronRight, ListTodo, Search, Settings, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type { TopTab, TodoViewMode, ViewMode } from '../adapt/types'
import { useT, type TxKey } from '../i18n'

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
  onOpenSettings: () => void
}

const MODES: { key: ViewMode; labelKey: TxKey; mobileHidden?: boolean }[] = [
  { key: 'month', labelKey: 'topbar.mode.month' },
  // 周视图手机端不呈现（20260916 任务书：手机布局放周视图意义不大；代码保留，桌面照常）
  { key: 'week', labelKey: 'topbar.mode.week', mobileHidden: true },
  { key: 'day', labelKey: 'topbar.mode.day' },
  { key: 'year', labelKey: 'topbar.mode.year' },
  { key: 'countdown', labelKey: 'topbar.mode.countdown' },
]

const TODO_MODES: { key: TodoViewMode; labelKey: TxKey; mobileHidden?: boolean }[] = [
  { key: 'list', labelKey: 'topbar.todoMode.list' },
  { key: 'matrix', labelKey: 'topbar.todoMode.matrix' },
  // 看板手机端不呈现（20260916 任务书：手机不适合看板；代码保留，桌面照常）
  { key: 'kanban', labelKey: 'topbar.todoMode.kanban', mobileHidden: true },
  { key: 'gantt', labelKey: 'topbar.todoMode.gantt' },
  { key: 'stickies', labelKey: 'topbar.todoMode.stickies' },
]

/** 一级 tab 定义：手机端走 BottomTabBar，桌面端走本组件的分段控件 */
const TOP_TABS: { key: TopTab; labelKey: TxKey; icon: React.ReactNode }[] = [
  { key: 'calendar', labelKey: 'terms.calendar', icon: <Calendar size={14} /> },
  { key: 'todo', labelKey: 'terms.todo', icon: <CheckSquare size={14} /> },
  { key: 'stats', labelKey: 'terms.stats', icon: <BarChart3 size={14} /> },
  { key: 'widgets', labelKey: 'terms.widgets', icon: <Sparkles size={14} /> },
]

export function TopBar({ title, topTab, mode, todoView, onTopTabChange, onModeChange, onTodoViewChange, onPrev, onNext, onToday, canPrev, canNext, onOpenSearch, onOpenSettings }: Props) {
  const t = useT()
  return (
    /* 布局：手机竖屏（<md）flex-wrap 拆行——一级 tab 交给底部标签栏（md:hidden），
         本栏只剩：第 1 行 标题+操作、第 2 行 视图模式横滚。
       桌面（md+）：md:flex-nowrap 合并单行（tab → 标题/导航 → 模式 → 操作） */
    <header className="glass-topbar flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 md:px-4 py-1.5 md:py-0 md:h-14 md:flex-nowrap flex-shrink-0">
      {/* 一级 tab：仅桌面显示（手机用底部标签栏，避免双份导航） */}
      <div className="hidden md:inline-flex rounded-xl border border-white/70 p-0.5 bg-white/50 md:mr-3 flex-shrink-0">
        {TOP_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTopTabChange(tab.key)}
            className={clsx(
              'flex items-center gap-1 px-3 py-1 text-sm rounded-md transition',
              topTab === tab.key ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab.icon} {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {topTab === 'stats' || topTab === 'widgets' ? (
        /* 分析 / 小组件：标题 + 右侧操作（无视图模式切换） */
        <>
          <div className="order-2 w-full md:w-auto md:flex-none justify-center flex items-center gap-1.5 min-w-0">
            {topTab === 'stats' ? <BarChart3 size={18} className="flex-shrink-0" /> : <Sparkles size={18} className="flex-shrink-0" />}
            <h1 className="text-sm md:text-lg font-semibold text-gray-800 truncate">
              {topTab === 'stats' ? t('terms.stats') : t('terms.widgets')}
            </h1>
          </div>
          <div className="order-1 md:order-4 ml-auto flex items-center gap-1 md:gap-2 flex-shrink-0">
            {/* 订阅入口已随「Neo 端不做订阅」决策移除（20260918）；设置手机端收进左侧边栏（20260916） */}
            <button onClick={onOpenSettings} className="hidden md:block p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-100 transition" title={t('common.settings')}>
              <Settings size={18} />
            </button>
          </div>
        </>
      ) : topTab === 'calendar' ? (
        <>
          {/* 标题 / 日期导航：手机独占整行居中（宽按钮大、标题截断不挤 tab），桌面回原位置 */}
          {mode !== 'countdown' ? (
            <div className="order-2 w-full md:w-auto md:flex-none justify-center flex items-center gap-0.5 md:gap-1 min-w-0">
              <button
                onClick={onPrev}
                disabled={!canPrev}
                className="p-1.5 md:p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex-shrink-0 active:bg-gray-100"
                title={mode === 'year' ? t('topbar.nav.prevYear') : mode === 'week' ? t('topbar.nav.prevWeek') : mode === 'day' ? t('topbar.nav.prevDay') : t('topbar.nav.prevMonth')}
              >
                <ChevronLeft size={18} />
              </button>
              <h1 className="flex-1 min-w-0 truncate text-center text-sm md:text-lg font-semibold text-gray-800 md:flex-none md:min-w-[140px]">{title}</h1>
              <button
                onClick={onNext}
                disabled={!canNext}
                className="p-1.5 md:p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex-shrink-0 active:bg-gray-100"
                title={mode === 'year' ? t('topbar.nav.nextYear') : mode === 'week' ? t('topbar.nav.nextWeek') : mode === 'day' ? t('topbar.nav.nextDay') : t('topbar.nav.nextMonth')}
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={onToday}
                className="ml-1 md:ml-2 px-2.5 md:px-3 py-1.5 text-sm font-medium text-pink-600 hover:bg-pink-50 active:bg-pink-50 rounded-lg transition flex-shrink-0"
              >
                {t('common.today')}
              </button>
            </div>
          ) : (
            <div className="order-2 w-full md:w-auto md:flex-none justify-center flex items-center gap-1.5 min-w-0">
              <ListTodo size={18} className="flex-shrink-0" />
              <h1 className="text-sm md:text-lg font-semibold text-gray-800 truncate">{t('terms.countdown')}</h1>
            </div>
          )}

          {/* 模式切换：手机最后一行整行横滚，桌面保持原位置（移动端胶囊化加大触点）。
              mobileHidden 的视图（周）只在桌面出现 */}
          <div className="order-4 md:order-3 w-full md:w-auto md:ml-4 -mx-2 px-2 md:mx-0 md:px-0 overflow-x-auto flex-shrink-0">
            <div className="inline-flex rounded-full border border-white/70 p-0.5 bg-white/50">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => onModeChange(m.key)}
                  className={clsx(
                    'flex-1 md:flex-none px-3 md:px-3 py-1.5 md:py-1 text-sm rounded-full transition whitespace-nowrap',
                    m.mobileHidden && 'hidden md:flex',
                    mode === m.key ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧操作：手机并入第 1 行（order-1）靠最右，桌面回单行最右。
              手机只保留搜索图标（搜索是日历页刚需，20260916 智者 P0-2）；
              图层/详情走 dock 左右按钮，设置收进左侧边栏抽屉；桌面保持原样 */}
          <div className="order-1 md:order-4 ml-auto md:ml-auto flex items-center gap-1 md:gap-2 flex-shrink-0">
            <button onClick={onOpenSearch} className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-100 transition" title={t('topbar.searchTitle')} aria-label={t('topbar.searchTitle')}>
              <Search size={18} />
            </button>
            <button
              onClick={onOpenSearch}
              className="relative hidden md:flex items-center w-48 pl-2.5 pr-3 py-1.5 text-sm text-gray-400 bg-white/60 border border-white/80 rounded-lg hover:bg-white hover:text-gray-600 transition"
            >
              <Search size={14} className="mr-2" />
              {t('topbar.searchPlaceholder')}
            </button>
            <button onClick={onOpenSettings} className="hidden md:block p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-100 transition" title={t('common.settings')}>
              <Settings size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="order-2 w-full md:w-auto md:flex-none justify-center flex items-center gap-1.5 min-w-0">
            <ListTodo size={18} className="flex-shrink-0" />
            <h1 className="text-sm md:text-lg font-semibold text-gray-800 truncate">{t('terms.todo')}</h1>
          </div>

          <div className="order-4 md:order-3 w-full md:w-auto md:ml-4 -mx-2 px-2 md:mx-0 md:px-0 overflow-x-auto flex-shrink-0">
            <div className="inline-flex rounded-full border border-white/70 p-0.5 bg-white/50">
              {TODO_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => onTodoViewChange(m.key)}
                  className={clsx(
                    'flex-1 md:flex-none px-3 md:px-3 py-1.5 md:py-1 text-sm rounded-full transition whitespace-nowrap',
                    m.mobileHidden && 'hidden md:flex',
                    todoView === m.key ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="order-1 md:order-4 ml-auto flex items-center gap-1 md:gap-2 flex-shrink-0">
            <button onClick={onOpenSettings} className="hidden md:block p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-100 transition" title={t('common.settings')}>
              <Settings size={18} />
            </button>
          </div>
        </>
      )}
    </header>
  )
}
