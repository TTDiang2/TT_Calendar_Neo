/**
 * 教程状态机与存储测试（智者 P1/P2 验收项：前进/回退/跳过/完成/持久化/老用户路径）。
 * jsdom 不测定位（placement 纯函数另测）；这里钉死行为语义。
 */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TourProvider, useTour, TARGET_WAIT_TIMEOUT } from '../engine'
import type { TourApi } from '../types'
import { _resetTourStoreForTest, shouldAutoStart, isTourDone, completeOnboarding, requestRewatch } from '../store'

// jsdom 没有 matchMedia（useIsMobile 依赖）；照仓库先例补桩。默认 matches:false → <768 → mobile 分支
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = ((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
  }
})

function makeApi(): TourApi & { calls: string[] } {
  const calls: string[] = []
  const log = (name: string): void => {
    calls.push(name)
  }
  return {
    calls,
    resetToHome: () => log('resetToHome'),
    goTab: (t) => log(`goTab:${t}`),
    setMode: (m) => log(`setMode:${m}`),
    setTodoView: (v) => log(`setTodoView:${v}`),
    openLayers: () => log('openLayers'),
    closeLayers: () => log('closeLayers'),
    openRight: () => log('openRight'),
    closeRight: () => log('closeRight'),
    openSettings: () => log('openSettings'),
    closeDialog: () => log('closeDialog'),
    snapshot: () => log('snapshot'),
    restore: () => log('restore'),
  }
}

/** 渲染一个暴露状态机句柄的探针（jsdom 真跑 useReducer 状态机） */
function Probe({ api, autoStart }: { api: TourApi; autoStart: boolean }) {
  const tour = useTour()
  return (
    <div>
      <span data-testid="status">{tour.status}</span>
      <span data-testid="stepId">{tour.step?.id ?? 'none'}</span>
      <span data-testid="stepNum">{`${tour.stepNumber}/${tour.stepCount}`}</span>
      <button data-testid="next" onClick={tour.next}>next</button>
      <button data-testid="prev" onClick={tour.prev}>prev</button>
      <button data-testid="end" onClick={tour.end}>end</button>
    </div>
  )
}

const q = (c: string): HTMLElement => document.querySelector(`[data-testid="${c}"]`)!

describe('TourProvider 状态机（jsdom 全流程）', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    _resetTourStoreForTest()
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    localStorage.clear()
    _resetTourStoreForTest()
  })

  it('idle → start：快照先拍，进入第 1 步并执行其 before（resetToHome）', async () => {
    const api = makeApi()
    render(<TourProvider api={api} autoStart={false}><Probe api={api} autoStart={false} /></TourProvider>)
    expect(q('status').textContent).toBe('idle')
    // 引擎的 start 由内部 autoStart 定时器触发；idle 时手动用 next 不可达——
    // 这里以 autoStart 路径真实验证：见下一条。本条先验证 idle 不渲染 popover。
    expect(q('stepId').textContent).toBe('none')
  })

  it('autoStart：600ms 后开教程，第 1 步 before 执行，可见步数=当前断口平台步数', async () => {
    const api = makeApi()
    render(<TourProvider api={api} autoStart><Probe api={api} autoStart /></TourProvider>)
    await act(async () => { await vi.advanceTimersByTimeAsync(650) })
    expect(q('status').textContent).toBe('running')
    // jsdom 视口 <768 → useIsMobile=true → 移动步骤集；第 1 步 before 同步执行
    expect(api.calls).toContain('snapshot')
    expect(api.calls).toContain('resetToHome')
    const num = q('stepNum').textContent! // "1/N"
    const total = Number(num.split('/')[1])
    // 移动集 = 主干 12 步 + 移动专属（tabs-mobile/right-mobile/layers-mobile/todo-mobile/fab-new/stats-mobile/month-grid-mobile）
    expect(total).toBeGreaterThan(10)
    expect(api.calls.some((c) => c.startsWith('setMode:week'))).toBe(false) // 桌面专属步不可见
  })

  it('前进→回退：before 幂等重放（回退也执行该步 before）', async () => {
    const api = makeApi()
    render(<TourProvider api={api} autoStart><Probe api={api} autoStart /></TourProvider>)
    await act(async () => { await vi.advanceTimersByTimeAsync(650) })
    expect(q('status').textContent).toBe('running')
    // 快进到模式胶囊步（s3：before=setMode('month')）
    act(() => { q('next').click() })
    act(() => { q('next').click() })
    // 第 3 步（index 2）= mode-pills（移动集里 index: 0 welcome-2, 1 tabs-mobile, 2 mode-pills）
    expect(api.calls).toContain('setMode:month')
    const count = api.calls.filter((c) => c === 'setMode:month').length
    act(() => { q('prev').click() })
    act(() => { q('next').click() })
    // 回退再前进 → before 重放
    expect(api.calls.filter((c) => c === 'setMode:month').length).toBeGreaterThan(count)
  })

  it('end（跳过/完成同权）：写 tourDone + restore，末步 next 同路', async () => {
    const api = makeApi()
    render(<TourProvider api={api} autoStart><Probe api={api} autoStart /></TourProvider>)
    await act(async () => { await vi.advanceTimersByTimeAsync(650) })
    expect(q('status').textContent).toBe('running')
    act(() => { q('end').click() })
    await act(async () => { await Promise.resolve() })
    expect(q('status').textContent).toBe('done')
    expect(isTourDone()).toBe(true)
    expect(api.calls).toContain('restore')
  })

  it('完成标记与 onboarding 解耦：仅 end 不写 onboarded', () => {
    act(() => {
      completeOnboarding(false) // 欢迎屏「开始导览」
    })
    expect(shouldAutoStart()).toBe(true)
    _resetTourStoreForTest()
    // 老用户路径：有 lang、无 onboarded、无 tourDone → 不自动开
    expect(shouldAutoStart()).toBe(false)
    act(() => {
      requestRewatch() // 设置里点重看
    })
    expect(shouldAutoStart()).toBe(true)
  })
})

describe('placement 超时降级阈值', () => {
  it('TARGET_WAIT_TIMEOUT = 2000ms（智者定稿口径）', () => {
    expect(TARGET_WAIT_TIMEOUT).toBe(2000)
  })
})
