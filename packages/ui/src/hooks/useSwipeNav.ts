import { useEffect, useRef } from 'react'

export interface SwipeNavOptions {
  /** 手势进行中：跟手位移 */
  onMove?: (dx: number) => void
  /** 越过阈值松手：dir=-1 手指向左（下一个 tab），dir=1 向右（上一个） */
  onCommit?: (dir: -1 | 1) => void
  /** 未越过阈值松手：内容弹回 */
  onCancel?: () => void
  /** 事件是否应被忽略（弹层打开 / 桌面宽度等） */
  disabled?: () => boolean
  /** 水平位移阈值（px），默认 72 */
  threshold?: number
  /** 速度阈值（px/ms），默认 0.5——快甩小位移也能切换 */
  velocityThreshold?: number
}

/**
 * 内容区左右滑切换一级 tab（Pointer Events：手机触摸 / 窄屏鼠标统一处理）。
 *
 * 交互约定（对齐 iOS 原生页签切换手感）：
 *  - 手指水平位移实时映射到内容 translateX（跟手）；
 *  - 松手按「位移阈值或速度阈值」裁决切换/回弹；
 *  - 垂直位移超过水平的 1.2 倍视为滚动，立即放弃；
 *  - 原生滚动接管（pointercancel）视为取消；
 *  - 手势起点在横向滚动容器（看板等）内时不抢事件。
 */
export function useSwipeTabs(
  containerRef: React.RefObject<HTMLElement | null>,
  opts: SwipeNavOptions,
): void {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof window === 'undefined') return
    if (!('onpointerdown' in window)) return

    let startX = 0
    let startY = 0
    let startT = 0
    let pointerId: number | null = null
    let locked: 'h' | 'v' | null = null

    function insideHScroll(target: EventTarget | null): boolean {
      let node = target as HTMLElement | null
      while (node && node !== el) {
        if (node.scrollWidth > node.clientWidth + 4) {
          const ox = getComputedStyle(node).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
        node = node.parentElement
      }
      return false
    }

    function onDown(e: PointerEvent) {
      if (optsRef.current.disabled?.()) return
      // 只认触摸/笔；鼠标仅在手机宽度（开发预览）下参与，桌面误拖不抢
      if (e.pointerType === 'mouse' && window.matchMedia('(min-width: 768px)').matches) return
      if (pointerId !== null) return
      // 左右边缘起手的横滑归属 useEdgeSwipe（呼出抽屉），切页手势不消费
      const EDGE = 28
      if (e.clientX <= EDGE || e.clientX >= window.innerWidth - EDGE) return
      if (insideHScroll(e.target)) return
      startX = e.clientX
      startY = e.clientY
      startT = performance.now()
      pointerId = e.pointerId
      locked = null
    }

    function onMove(e: PointerEvent) {
      if (pointerId !== e.pointerId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!locked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        locked = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
        if (locked === 'v') { pointerId = null; return }
      }
      if (locked === 'h') optsRef.current.onMove?.(dx)
    }

    function finish(e: PointerEvent, cancelled: boolean) {
      if (pointerId !== e.pointerId) return
      pointerId = null
      if (locked !== 'h') return
      locked = null
      if (cancelled) { optsRef.current.onCancel?.(); return }
      const dx = e.clientX - startX
      const dt = Math.max(performance.now() - startT, 1)
      const v = Math.abs(dx) / dt
      const th = optsRef.current.threshold ?? 72
      const vt = optsRef.current.velocityThreshold ?? 0.5
      if (Math.abs(dx) >= th || v >= vt) {
        optsRef.current.onCommit?.(dx < 0 ? -1 : 1)
      } else {
        optsRef.current.onCancel?.()
      }
    }

    const onUp = (e: PointerEvent) => finish(e, false)
    const onCancelEv = (e: PointerEvent) => finish(e, true)

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancelEv)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancelEv)
    }
  }, [containerRef])
}

export interface EdgeSwipeOptions {
  /** 左缘出现的手指向右滑（呼出左侧抽屉） */
  onFromLeft?: () => void
  /** 右缘出现的手指向左滑（呼出右侧抽屉） */
  onFromRight?: () => void
  /** 边缘判定宽度（px），默认 28 */
  edge?: number
  /** 触发位移（px），默认 56 */
  threshold?: number
  disabled?: () => boolean
}

/** 边缘滑动手势：从屏幕左/右缘起手横滑呼出对应侧边栏（越过阈值即触发） */
export function useEdgeSwipe(
  containerRef: React.RefObject<HTMLElement | null>,
  opts: EdgeSwipeOptions,
): void {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof window === 'undefined') return
    if (!('onpointerdown' in window)) return

    let startX = 0
    let startY = 0
    let pointerId: number | null = null
    let fromEdge: 'left' | 'right' | null = null
    let fired = false

    function onDown(e: PointerEvent) {
      if (optsRef.current.disabled?.()) return
      if (e.pointerType === 'mouse' && window.matchMedia('(min-width: 768px)').matches) return
      if (pointerId !== null) return
      const edge = optsRef.current.edge ?? 28
      fromEdge = e.clientX <= edge ? 'left' : e.clientX >= window.innerWidth - edge ? 'right' : null
      startX = e.clientX
      startY = e.clientY
      pointerId = e.pointerId
      fired = false
    }

    function onMove(e: PointerEvent) {
      if (pointerId !== e.pointerId || !fromEdge || fired) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (Math.abs(dy) > Math.abs(dx)) return
      const th = optsRef.current.threshold ?? 56
      if (fromEdge === 'left' && dx >= th) {
        fired = true
        optsRef.current.onFromLeft?.()
      } else if (fromEdge === 'right' && dx <= -th) {
        fired = true
        optsRef.current.onFromRight?.()
      }
    }

    function onEnd(e: PointerEvent) {
      if (pointerId !== e.pointerId) return
      pointerId = null
      fromEdge = null
      fired = false
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onEnd)
    el.addEventListener('pointercancel', onEnd)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onEnd)
      el.removeEventListener('pointercancel', onEnd)
    }
  }, [containerRef])
}
