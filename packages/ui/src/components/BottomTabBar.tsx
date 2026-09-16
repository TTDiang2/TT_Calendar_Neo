/**
 * 移动端悬浮 dock（<md 显示）—— iOS 风格的胶囊玻璃导航：日历 / 待办 / 分析。
 * （小组件页已按 20260915 任务书从手机端一级导航移除——它的本意是主屏小组件，
 *  而主屏小组件走 iOS WidgetKit 通道（apps/mobile/widget/），App 内卡片页保留在桌面端。）
 * 桌面端（md+）仍走 TopBar 的分段控件，本组件不渲染。
 *
 * 苹果化细节：悬浮胶囊液态玻璃 + 选中项粉色渐变圆片 + 按压回弹。
 */

import { BarChart3, Calendar, CheckSquare } from 'lucide-react'
import clsx from 'clsx'
import type { TopTab } from '../adapt/types'

const TABS: { key: TopTab; label: string; icon: React.ReactNode }[] = [
  { key: 'calendar', label: '日历', icon: <Calendar size={20} /> },
  { key: 'todo', label: '待办', icon: <CheckSquare size={20} /> },
  { key: 'stats', label: '分析', icon: <BarChart3 size={20} /> },
]

export function BottomTabBar({
  active,
  onChange,
  suspend = false,
}: {
  active: TopTab
  onChange: (t: TopTab) => void
  /** 滑动切 tab 手势进行中：dock 下沉淡出，松手后弹回（App 的手势钩子接线） */
  suspend?: boolean
}) {
  return (
    <nav
      className={clsx(
        'md:hidden fixed left-1/2 -translate-x-1/2 z-30 transition-all duration-300',
        suspend ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100',
      )}
      style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      aria-label="主导航"
    >
      <div className="glass-dock rounded-full flex items-center gap-0.5 px-1.5 h-16">
        {TABS.map((t) => {
          const on = t.key === active
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className="pressable relative flex flex-col items-center justify-center gap-0.5 w-[4.25rem] py-1 rounded-full"
              aria-current={on ? 'page' : undefined}
              aria-label={t.label}
            >
              <span
                className={clsx(
                  'flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300',
                  on
                    ? 'bg-gradient-to-br from-pink-400 to-rose-500 text-white shadow-lg shadow-pink-500/30 scale-105'
                    : 'text-gray-500',
                )}
              >
                {t.icon}
              </span>
              <span
                className={clsx(
                  'text-[10px] leading-none transition-colors',
                  on ? 'text-pink-600 font-semibold' : 'text-gray-500',
                )}
              >
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
