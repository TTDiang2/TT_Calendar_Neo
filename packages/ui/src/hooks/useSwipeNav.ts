import { useEffect, useRef } from 'react'

export interface SwipeNavOptions {
  /** 手势进行中：跟手位移 */
  onMove?: (dx: number) => void
  /** 手势锁定为横向的一瞬间（每次手势恰好一次：挂起 dock / 停 transition 等一次性副作用） */
  onLock?: () => void
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
 * 内容区左右滑切换一级 tab。
 *
 * 为什么在 Pointer Events 之外还要挂非被动 touchmove（20260916 任务书「滑不动」的根因）：
 * WKWebView 对「touch-action 只写在滚动容器的祖先上」并不总买账——手指落在列表项 /
 * 面板控件上时，内核可能仍按 pan-y 起手本地滚动并向我们发 pointercancel，手势刚锁横向
 * 就被掐死（空白处能滑、控件上滑不动的现象由此而来）。锁定横向后对 touchmove 调
 * preventDefault 是唯一能确定性禁止内核接管横滑的手段；同时把指针捕获到容器上，
 * 避免手势中途子树重渲染换掉 target 导致事件断流。
 *
 * 交互约定（对齐 iOS 原生页签切换手感）：
 *  - 手指水平位移实时映射到内容 translateX（跟手）；
 *  - 松手按「位移阈值或速度阈值」裁决切换/回弹；
 *  - 垂直位移超过水平的 1.2 倍视为滚动，立即放弃；
 *  - 手势起点在横向滚动容器（切页胶囊条等）内时不抢事件；
 *  - 横向手势消费后抑制紧随其后的 click（滑动不应选中手指起点的列表项）。
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
    // 闭包里用的非空别名（函数声明会被提升，TS 不保留对 el 的收窄）
    const root: HTMLElement = el

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

    /** 横向手势已消费：吞掉紧随其后的 click（合成点击会落在手指起点的控件上）。
     *  kill 留在捕获链上直到「下一次 pointerdown」（合成 click 前不会有新手指落下，
     *  而真实点击前必有——用事件顺序区分而非固定时间窗，450ms 只是无点击时的兜底清理）。
     *  定时器只摘自己那一次的 kill（捕获局部引用），避免误摘紧随其后新手势的 kill */
    let kill: ((e: MouseEvent) => void) | null = null
    function swallowClickOnce() {
      const k = (e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
      }
      kill = k
      root.addEventListener('click', k, { capture: true, once: true })
      setTimeout(() => {
        if (kill === k) kill = null
        root.removeEventListener('click', k, { capture: true })
      }, 450)
    }

    function onDown(e: PointerEvent) {
      // 新手指落下 = 上一次手势的合成 click 窗口结束，解除点击抑制（防误杀真实点击）
      if (kill) {
        root.removeEventListener('click', kill, { capture: true })
        kill = null
      }
      if (optsRef.current.disabled?.()) return
      // 只认触摸/笔；鼠标仅在手机宽度（开发预览）下参与，桌面误拖不抢
      if (e.pointerType === 'mouse' && window.matchMedia('(min-width: 768px)').matches) return
      if (pointerId !== null) return
      // 左右边缘起手的横滑不再归属切页（侧边栏已改底部按钮呼出），正常参与切页
      if (insideHScroll(e.target)) return
      startX = e.clientX
      startY = e.clientY
      startT = performance.now()
      pointerId = e.pointerId
      locked = null
    }

    function lockHorizontal(id: number) {
      locked = 'h'
      optsRef.current.onLock?.()
      // 捕获到容器：子树重渲染/滚动接管都不再截走后续指针事件
      try {
        root.setPointerCapture(id)
      } catch {
        /* 指针已失效时捕获失败无碍，事件仍会冒泡到容器 */
      }
    }

    function onMove(e: PointerEvent) {
      if (pointerId !== e.pointerId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!locked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        if (Math.abs(dx) > Math.abs(dy) * 1.2) lockHorizontal(e.pointerId)
        else {
          locked = 'v'
          pointerId = null
          return
        }
      }
      if (locked === 'h') optsRef.current.onMove?.(dx)
    }

    function finish(e: PointerEvent, cancelled: boolean) {
      if (pointerId !== e.pointerId) return
      pointerId = null
      try {
        if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
      } catch {
        /* 捕获已随指针失效释放 */
      }
      if (locked !== 'h') {
        locked = null
        return
      }
      locked = null
      swallowClickOnce()
      if (cancelled) {
        optsRef.current.onCancel?.()
        return
      }
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

    /** 内核一旦按 pan-y 起手本地滚动会发 pointercancel 掐死手势；锁横向后直接禁掉 */
    function onTouchMove(e: TouchEvent) {
      if (locked === 'h' && e.cancelable) e.preventDefault()
    }

    const onUp = (e: PointerEvent) => finish(e, false)
    const onCancelEv = (e: PointerEvent) => finish(e, true)

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onCancelEv)
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onCancelEv)
      root.removeEventListener('touchmove', onTouchMove)
    }
  }, [containerRef])
}
