/**
 * 新手教程引擎（20261005 智者定稿：自研、零依赖、portal、rAF 两帧稳定等待）。
 *
 * 结构：
 *  - TourProvider：状态机（index/status）+ 可见步骤过滤（platform 按当前 useIsMobile 求值）
 *    + 每步 before/after 的执行（进入执行 before 含后退重放，cleanup 执行 after）
 *    + done 统一收口（完成标记 + 快照恢复，skip/完成/最后一步 next 同路）；
 *  - TourPortal：overlay（4 矩形遮罩 + 洞强调环 + 盖板）+ popover（两段式量尺寸后定位）
 *    + rAF 目标等待（TARGET_WAIT_TIMEOUT 超时降级无洞横幅）+ 重定位监听与清理
 *    + hands-on 步：撤盖板，目标 capture click 推进（放行真实点击——用户体验即教学）。
 *
 * 已知边界（智者定稿口径）：jsdom 的 getBoundingClientRect 恒 0——定位不做 DOM 断言
 * （placement 纯函数单独测），引擎单测只测状态机/超时降级/监听清理。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useT, useLang } from '../i18n'
import { useIsMobile } from '../hooks/useMedia'
import { TOUR_STEPS } from './steps'
import { computePlacement, holeOf, maskRects, type Rect } from './placement'
import { completeTour } from './store'
import type { TourApi, TourStep } from './types'

/** 目标等待超时（ms）：超时降级为无洞横幅，绝不卡死 */
export const TARGET_WAIT_TIMEOUT = 2000

// ── 状态机 ────────────────────────────────────────────────────────────────────

interface TourState {
  status: 'idle' | 'running' | 'done'
  index: number
}

type TourAction = { type: 'start' } | { type: 'next'; max: number } | { type: 'prev' } | { type: 'end' }

function tourReducer(s: TourState, a: TourAction): TourState {
  switch (a.type) {
    case 'start':
      return { status: 'running', index: 0 }
    case 'next':
      // 最后一步的 next = 完成教程
      return s.status === 'running' && s.index < a.max ? { ...s, index: s.index + 1 } : { status: 'done', index: 0 }
    case 'prev':
      return s.status === 'running' && s.index > 0 ? { ...s, index: s.index - 1 } : s
    case 'end':
      return { status: 'done', index: 0 }
  }
}

interface TourContextValue {
  status: TourState['status']
  step: TourStep | null
  stepNumber: number
  stepCount: number
  next: () => void
  prev: () => void
  /** 立即结束教程（= 完成标记，跳过与完成同权） */
  end: () => void
}

const TourCtx = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const v = useContext(TourCtx)
  if (!v) throw new Error('useTour must be used within TourProvider')
  return v
}

export function TourProvider({ api, autoStart, children }: { api: TourApi; autoStart: boolean; children: ReactNode }) {
  const [state, dispatch] = useReducer(tourReducer, { status: 'idle', index: 0 })
  const isMobile = useIsMobile()
  // platform 过滤（智者：按当前断口求值；中途跨断口影响后续步）
  const visibleSteps = useMemo(
    () => TOUR_STEPS.filter((s) => !s.platform || s.platform === (isMobile ? 'mobile' : 'desktop')),
    [isMobile],
  )
  const apiRef = useRef(api)
  apiRef.current = api

  const start = useCallback(() => {
    apiRef.current.snapshot?.()
    dispatch({ type: 'start' })
  }, [])

  // done 统一收口：完成标记 + 快照恢复（skip / 最后一步 next / end 同路）
  const endedRef = useRef(false)
  useEffect(() => {
    if (state.status !== 'done' || endedRef.current) return
    endedRef.current = true
    completeTour()
    apiRef.current.restore?.()
  }, [state.status])
  useEffect(() => {
    if (state.status === 'running') endedRef.current = false
  }, [state.status])

  // 越界兜底（智者终审必改1）：教程进行中跨 768px 断口 → visibleSteps 变短、index
  // 越界 → step=null。绝不静默消失：收口为 done（写标记+restore），UI 正常退场。
  useEffect(() => {
    if (state.status === 'running' && !visibleSteps[state.index]) dispatch({ type: 'end' })
  }, [state.status, state.index, visibleSteps])

  // 自动开（AppGate 决定 autoStart=本次会话刚 onboarding 且 !tourDone；首帧后 600ms）
  useEffect(() => {
    if (!autoStart) return
    const t = setTimeout(() => start(), 600)
    return () => clearTimeout(t)
  }, [autoStart, start])

  const next = useCallback(() => dispatch({ type: 'next', max: visibleSteps.length - 1 }), [visibleSteps.length])
  const prev = useCallback(() => dispatch({ type: 'prev' }), [])
  const end = useCallback(() => dispatch({ type: 'end' }), [])

  const value = useMemo<TourContextValue>(
    () => ({
      status: state.status,
      step: state.status === 'running' ? visibleSteps[state.index] ?? null : null,
      stepNumber: state.index + 1,
      stepCount: visibleSteps.length,
      next,
      prev,
      end,
    }),
    [state, visibleSteps, next, prev, end],
  )

  return (
    <TourCtx.Provider value={value}>
      {children}
      {state.status === 'running' && <TourPortal api={api} />}
    </TourCtx.Provider>
  )
}

// ── 目标等待（rAF 轮询 + 两帧稳定 + 超时降级） ────────────────────────────────

interface TargetState {
  ready: boolean
  /** 无目标步骤（居中卡）也走这里：rect=null, degraded=false */
  rect: Rect | null
  degraded: boolean
}

function useTargetRect(step: TourStep | null): TargetState {
  const [st, setSt] = useState<TargetState>({ ready: false, rect: null, degraded: false })
  const stepId = step?.id
  const target = step?.target
  useEffect(() => {
    setSt({ ready: false, rect: null, degraded: false })
    if (!stepId) return
    if (!target) {
      setSt({ ready: true, rect: null, degraded: false })
      return
    }
    let cancelled = false
    let stable = 0
    let last: Rect | null = null
    const t0 = performance.now()
    const tick = (): void => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
      if (!el) {
        if (performance.now() - t0 > TARGET_WAIT_TIMEOUT) setSt({ ready: true, rect: null, degraded: true })
        else requestAnimationFrame(tick)
        return
      }
      // 定位用途滚动一律 instant（reduced-motion 语义由智者定稿第 9 条）
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' as ScrollBehavior })
      const r = el.getBoundingClientRect()
      const cur: Rect = { left: r.left, top: r.top, width: r.width, height: r.height }
      if (last && Math.abs(cur.left - last.left) <= 1 && Math.abs(cur.top - last.top) <= 1) stable += 1
      else {
        stable = 0
        last = cur
      }
      if (stable >= 2) setSt({ ready: true, rect: cur, degraded: false })
      else if (performance.now() - t0 > TARGET_WAIT_TIMEOUT) setSt({ ready: true, rect: null, degraded: true })
      else requestAnimationFrame(tick)
    }
    const raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [stepId, target])
  return st
}

/** rect 就绪后的重定位：scroll(capture)/resize/visualViewport → 节流至 rAF 重算 */
function useReposition(active: boolean, target: string | undefined, onRect: (r: Rect) => void): void {
  useEffect(() => {
    if (!active || !target) return
    let raf = 0
    const recompute = (): void => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
      if (!el) return
      const r = el.getBoundingClientRect()
      onRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    const onMove = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recompute)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    window.visualViewport?.addEventListener('resize', onMove)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      window.visualViewport?.removeEventListener('resize', onMove)
    }
  }, [active, target, onRect])
}

// ── Portal 视图 ───────────────────────────────────────────────────────────────

function TourPortal({ api }: { api: TourApi }) {
  const { step, next, prev, end, stepNumber, stepCount } = useTour()
  const t = useT()
  const lang = useLang()
  const wait = useTargetRect(step)
  // 就绪后的实时 rect（初值=等待结果；重定位监听持续更新）
  const [liveRect, setLiveRect] = useState<Rect | null>(null)
  useEffect(() => setLiveRect(wait.rect), [wait.rect])
  const setLiveRectStable = useCallback((r: Rect) => setLiveRect(r), [])
  useReposition(wait.ready && !!wait.rect, step?.target, setLiveRectStable)

  // before：每次进入该步执行（含后退重放——幂等绝对断言）；after：离开时执行
  const stepId = step?.id
  useEffect(() => {
    if (!step) return
    step.before?.(api)
    return () => {
      step.after?.(api)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 步骤对象来自静态表，按 id 驱动足够
  }, [stepId, api])

  // hands-on：撤盖板 + 目标 capture click 推进（放行真实点击——点日期的真实反馈即教学内容）。
  // next 经 ref 取用（智者终审：跨断口后不残留过期闭包——推进恒用最新 max）
  const handsOn = step?.advanceOnTargetClick === true
  const nextRef = useRef(next)
  nextRef.current = next
  useEffect(() => {
    if (!handsOn || !step?.target || !wait.ready) return
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    if (!el) return
    const onClick = (): void => nextRef.current()
    el.addEventListener('click', onClick, true)
    return () => el.removeEventListener('click', onClick, true)
  }, [handsOn, step?.target, wait.ready])

  // Esc = 打开/关闭跳过确认（a11y：行内二次确认防误触）
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setConfirming((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // popover 两段式：先渲染量尺寸，再定位
  const popRef = useRef<HTMLDivElement | null>(null)
  const [popSize, setPopSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!wait.ready) return
    const el = popRef.current
    if (el) setPopSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [wait.ready, stepId, lang])

  if (!step) return null

  const vp = { width: window.innerWidth, height: window.innerHeight }
  const hole = liveRect ? holeOf(liveRect) : null
  const placement =
    hole && liveRect && popSize
      ? computePlacement({
          target: liveRect,
          pop: { left: 0, top: 0, width: popSize.w, height: popSize.h },
          viewport: vp,
          prefer: step.placement ?? 'bottom',
        })
      : null
  const masks = hole ? maskRects(hole, vp) : [fullRect(vp)]
  const isSheet = placement?.kind === 'sheet'
  const isLast = stepNumber >= stepCount

  const popStyle: CSSProperties = popSize
    ? isSheet || !placement || placement.kind !== 'absolute'
      ? { left: 0, top: Math.max(vp.height - popSize.h, 0) }
      : { left: placement.left, top: placement.top }
    : { left: 0, top: 0, visibility: 'hidden' }

  return createPortal(
    <div lang={lang}>
      {/* 4 矩形遮罩（智者：不用 SVG path）；无洞步骤 = 整屏一块 */}
      {masks.map((m, i) => (
        <div key={i} className="fixed z-[70] bg-black/45" style={{ left: m.left, top: m.top, width: m.width, height: m.height }} />
      ))}
      {/* 洞：2px 强调环 + 盖板（锁交互；hands-on 步撤盖板放行点击） */}
      {hole && (
        <>
          <div className="fixed z-[70] rounded-lg border-2 border-pink-400 pointer-events-none" style={rectStyle(hole)} />
          {!handsOn && <div className="fixed z-[70]" style={rectStyle(hole)} onClick={(e) => e.preventDefault()} aria-hidden />}
        </>
      )}
      {/* 超时降级：无洞横幅 */}
      {wait.degraded && (
        <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[71] max-w-[92vw]">
          <div className="rounded-xl bg-white/95 backdrop-blur shadow-xl border border-white/70 px-4 py-2 text-sm text-gray-600">
            {t('tour.engine.loadingFallback')}
          </div>
        </div>
      )}
      {/* popover */}
      <div ref={popRef} role="dialog" aria-label={t(step.titleKey)} className="fixed z-[71]" style={popStyle}>
        <div
          className={
            isSheet
              ? 'rounded-t-2xl bg-white/95 backdrop-blur shadow-2xl border border-white/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] w-[100vw] max-w-none'
              : 'rounded-2xl bg-white/95 backdrop-blur shadow-xl border border-white/70 p-4 w-[min(340px,92vw)]'
          }
        >
          <p className="text-sm font-semibold text-gray-800">{t(step.titleKey)}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{t(step.bodyKey)}</p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => setConfirming(true)} className="text-xs text-gray-400 hover:text-gray-600 transition">
              {t('tour.btn.skip')}
            </button>
            <span className="flex-1" />
            <span className="text-[11px] tabular-nums text-gray-400 select-none" aria-hidden>
              {stepNumber} / {stepCount}
            </span>
            {confirming && (
              <button
                onClick={end}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
              >
                {t('tour.btn.skipConfirm')}
              </button>
            )}
            {stepNumber > 1 && (
              <button onClick={prev} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                {t('tour.btn.prev')}
              </button>
            )}
            <button
              onClick={next}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-pink-500 text-white shadow-sm hover:bg-pink-600 transition"
            >
              {isLast ? t('tour.btn.done') : t('tour.btn.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function fullRect(vp: { width: number; height: number }): Rect {
  return { left: 0, top: 0, width: vp.width, height: vp.height }
}

function rectStyle(r: Rect): CSSProperties {
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
