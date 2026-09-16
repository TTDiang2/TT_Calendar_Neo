import { useEffect, useRef, type ReactNode } from 'react'
import { animSpringIn } from '../../anim'

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

  // 玻璃弹窗入场：弹簧缩放 + 上浮（reduced-motion 时 animSpringIn 自动跳过）
  useEffect(() => {
    animSpringIn(panelRef.current)
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="glass-sheet rounded-3xl flex flex-col max-h-[90vh]"
        style={{ width, maxWidth: 'calc(100vw - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
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
