import { useEffect, useRef, type ReactNode } from 'react'
import { animSheetUp, animSpringIn } from '../../anim'
import { useIsMobile } from '../../hooks/useMedia'

/**
 * 通用弹窗。桌面（md+）：居中玻璃卡；手机（<md）：iOS 心智的底部 sheet——
 * 大圆角贴底、安全区内边距、上滑入场（20260916 智者 P2-9，全部编辑弹窗一次受益）。
 */
export function Modal({
  title,
  children,
  onClose,
  width = 440,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // useIsMobile 惰性初始化：首帧即拿到真实断点，避免手机首开弹窗先闪一帧桌面布局
  const isMobile = useIsMobile()

  // 入场动效：手机底部上滑，桌面弹簧缩放（reduced-motion 时两者都自动跳过）
  useEffect(() => {
    if (isMobile) animSheetUp(panelRef.current)
    else animSpringIn(panelRef.current)
  }, [isMobile])

  return (
    <div
      className={
        isMobile
          ? 'fixed inset-0 bg-black/25 backdrop-blur-[2px] flex items-end z-50'
          : 'fixed inset-0 bg-black/25 backdrop-blur-[2px] flex items-center justify-center z-50 p-4'
      }
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={
          isMobile
            ? 'glass-sheet rounded-t-3xl flex flex-col max-h-[88dvh] w-full pb-[max(0.75rem,env(safe-area-inset-bottom))]'
            : 'glass-sheet rounded-3xl flex flex-col max-h-[90vh]'
        }
        style={isMobile ? { maxWidth: '100vw' } : { width, maxWidth: 'calc(100vw - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {isMobile && (
          <div className="flex justify-center pt-2">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>
        )}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-full text-lg transition-colors"
          >
            ×
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}
