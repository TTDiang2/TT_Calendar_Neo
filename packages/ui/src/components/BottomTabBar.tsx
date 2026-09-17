/**
 * 移动端悬浮 dock（<md 显示）—— iOS 风格的胶囊玻璃导航：日历 / 待办 / 分析。
 * （小组件页已按 20260915 任务书从手机端一级导航移除——它的本意是主屏小组件，
 *  而主屏小组件走 iOS WidgetKit 通道（apps/mobile/widget/），App 内卡片页保留在桌面端。）
 * 桌面端（md+）仍走 TopBar 的分段控件，本组件不渲染。
 *
 * 20260916 任务书：
 *  - 左右两端新增操作按钮（呼出左/右侧边栏），侧边栏不再靠边缘滑动手势；
 *  - 选中指示圆片在切页手势中「跟手连续滑动」，不再先隐藏再出现。
 *    手势进度经 gestureRef（App 每帧写入，不经 setState）驱动 rAF 直改 transform。
 */

import { useEffect, useRef } from 'react'
import { BarChart3, Calendar, CheckSquare } from 'lucide-react'
import clsx from 'clsx'
import type { TopTab } from '../adapt/types'

const TABS: { key: TopTab; label: string; icon: React.ReactNode }[] = [
  { key: 'calendar', label: '日历', icon: <Calendar size={20} /> },
  { key: 'todo', label: '待办', icon: <CheckSquare size={20} /> },
  { key: 'stats', label: '分析', icon: <BarChart3 size={20} /> },
]

export interface DockSideAction {
  icon: React.ReactNode
  label: string
  onPress: () => void
}

/** 手势进行中的指示器进度（-1..1，×一个 tab 位）；App 的切页手势每帧写入 */
export interface DockGestureState {
  active: boolean
  progress: number
}

/** 与 React inline style 完全一致的弹簧过渡（rAF 收尾时写回同一值，保证 React diff 不冲突） */
const SPRING_TRANSITION = 'transform 420ms cubic-bezier(0.22, 1.2, 0.36, 1)'

export function BottomTabBar({
  active,
  onChange,
  suspend = false,
  leftAction,
  rightAction,
  gestureRef,
}: {
  active: TopTab
  onChange: (t: TopTab) => void
  /** 切页手势进行中：指示片进入跟手模式（无过渡），按钮暂停按压缩放 */
  suspend?: boolean
  leftAction?: DockSideAction
  rightAction?: DockSideAction
  gestureRef?: React.RefObject<DockGestureState>
}) {
  const activeIdx = Math.max(0, TABS.findIndex((t) => t.key === active))
  const pillRef = useRef<HTMLSpanElement | null>(null)

  // 跟手模式：rAF 读共享 ref 直改 transform（绕过 React 渲染帧，丝滑且不触发重渲染）；
  // 松手后写回与 React inline 完全一致的弹簧值（写 '' 会清掉过渡且 React diff 不再重写，
  // 圆片从此瞬移——20260916 智者审核缺陷 1）
  useEffect(() => {
    if (!gestureRef) return
    let raf = 0
    let wasActive = false
    const tick = () => {
      const g = gestureRef.current
      const pill = pillRef.current
      if (pill) {
        if (g?.active) {
          wasActive = true
          pill.style.transition = 'none'
          // 预览方向 = 朝目标页移动，而不是跟着手指走（20260917 任务书 1.1-12：
          // 手指左滑去右边页，圆片应向右探出；取负号让进度与位移反向）
          const clamped = Math.max(-1.15, Math.min(1.15, g.progress))
          pill.style.transform = `translateX(${(activeIdx - clamped) * 100}%)`
        } else if (wasActive) {
          wasActive = false
          pill.style.transition = SPRING_TRANSITION
          pill.style.transform = `translateX(${activeIdx * 100}%)`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [gestureRef, activeIdx])

  return (
    <nav
      className={clsx(
        'md:hidden fixed left-1/2 -translate-x-1/2 z-30',
        suspend && 'pointer-events-none',
      )}
      style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      aria-label="主导航"
    >
      <div className="glass-dock rounded-full flex items-center gap-1 pl-1.5 pr-1.5 h-16 max-w-[calc(100vw-1rem)]">
        <DockSideButton action={leftAction} />
        <div className="relative flex items-center flex-1 self-stretch my-1.5" style={{ minWidth: 192 }}>
          {/* 选中指示圆片：宽度 = 1/3 容器，translateX 按位次平移；手势中跟手连续移动 */}
          <span
            ref={pillRef}
            aria-hidden
            className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 shadow-lg shadow-pink-500/30"
            style={{
              width: `${100 / TABS.length}%`,
              transform: `translateX(${activeIdx * 100}%)`,
              transition: suspend ? 'none' : SPRING_TRANSITION,
            }}
          />
          {TABS.map((t) => {
            const on = t.key === active
            return (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                className="pressable relative z-10 flex flex-col items-center justify-center gap-0.5 flex-1 self-stretch py-1"
                aria-current={on ? 'page' : undefined}
                aria-label={t.label}
              >
                <span
                  className={clsx(
                    'flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-300',
                    on ? 'text-white' : 'text-gray-500',
                  )}
                >
                  {t.icon}
                </span>
                <span
                  className={clsx(
                    'text-[10px] leading-none transition-colors',
                    on ? 'text-white font-semibold' : 'text-gray-500',
                  )}
                >
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
        <DockSideButton action={rightAction} />
      </div>
    </nav>
  )
}

function DockSideButton({ action }: { action?: DockSideAction }) {
  if (!action) return <span aria-hidden className="w-11 flex-shrink-0" />
  return (
    <button
      onClick={action.onPress}
      className="pressable flex items-center justify-center w-11 h-11 flex-shrink-0 rounded-full bg-white/60 border border-white/70 text-gray-600 shadow-sm active:bg-pink-50 active:text-pink-600 transition-colors"
      aria-label={action.label}
      title={action.label}
    >
      {action.icon}
    </button>
  )
}
