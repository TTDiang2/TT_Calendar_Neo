/**
 * 移动端底部标签栏（<md 显示）—— 参考现代待办应用的拇指导航：
 * 日历 / 待办 / 分析 / 小组件 四个一级入口，毛玻璃底 + 安全区避让。
 * 桌面端（md+）仍走 TopBar 的分段控件，本组件不渲染。
 */

import { BarChart3, Calendar, CheckSquare, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type { TopTab } from '../adapt/types'

const TABS: { key: TopTab; label: string; icon: React.ReactNode }[] = [
  { key: 'calendar', label: '日历', icon: <Calendar size={20} /> },
  { key: 'todo', label: '待办', icon: <CheckSquare size={20} /> },
  { key: 'stats', label: '分析', icon: <BarChart3 size={20} /> },
  { key: 'widgets', label: '小组件', icon: <Sparkles size={20} /> },
]

export function BottomTabBar({ active, onChange }: { active: TopTab; onChange: (t: TopTab) => void }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/85 backdrop-blur border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch h-14">
        {TABS.map((t) => {
          const on = t.key === active
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
                on ? 'text-pink-500' : 'text-gray-400 active:text-gray-600',
              )}
              aria-current={on ? 'page' : undefined}
            >
              {t.icon}
              <span className={clsx('text-[10px]', on && 'font-medium')}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
