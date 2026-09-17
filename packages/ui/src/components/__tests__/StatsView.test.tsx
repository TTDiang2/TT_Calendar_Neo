// @vitest-environment jsdom
/**
 * StatsView 渲染回归（20260917 智者 P0 复审要求）：
 * 分析页曾有 useMemo 挂在 early-return 之后的 hook 顺序违规——tsc 与既有冒烟
 * 都是盲区，只有「冷启动渲染 → 数据到达 → 断言内容出现」这种渲染级测试能抓
 * （loading 帧与 data 帧的 hook 数量不一致时 React 会当场抛错）。
 * 本测试同时守护：loading 帧渲染、数据帧渲染、洞察卡出现。
 */
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { setBackend, type BackendAdapter } from '../../adapt/api'
import { StatsView } from '../StatsView'

// 动画模块 mock 成 no-op：jsdom 的 SVG/布局实现不完整，anime.js 会在
// baseVal/getBBox 上炸——本测试守护的是渲染与 hooks 顺序，不是动画。
vi.mock('../../anim', () => ({
  animStaggerChildren: () => {},
  animCountUp: () => {},
  animGrowBars: () => {},
  animDrawerIn: () => {},
  animRing: () => {},
  animEnter: () => {},
  animSlideDirection: () => {},
  animSpringBack: () => {},
  animSheetUp: () => {},
  animSpringIn: () => {},
}))

// jsdom 没有 matchMedia（anim.ts 的可访问性检测与 useMedia 都依赖它）
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

function statsSummary() {
  return {
    stats: { total: 10, completed: 4, incomplete: 6 },
    quadrant: [],
    daily_done: [
      { date: '2026-09-10', count: 3 },
      { date: '2026-09-11', count: 1 },
    ],
    coloring_daily: [],
    busy_predict: [],
    completion_dates: ['2026-09-10', '2026-09-11'],
    list_names: { l1: '工作清单' },
  }
}

function makeBackend(): BackendAdapter {
  return {
    getStatsSummary: async () => statsSummary(),
    getTodoLists: async () => [{ id: 'l1', display_name: '工作清单', sort_order: 1, created_at: null }],
    getTodos: async () => [],
  } as unknown as BackendAdapter
}

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('StatsView 渲染回归', () => {
  beforeEach(() => {
    setBackend(makeBackend())
  })

  it('冷启动：loading 帧不崩，数据到达后渲染里程碑与洞察卡（hooks 顺序恒定）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { getByText, getAllByText } = render(
        <Wrapper>
          <StatsView
            scopeOpen={false}
            onScopeOpenChange={() => {}}
            milestonesOpen={false}
            onMilestonesOpenChange={() => {}}
          />
        </Wrapper>,
      )

      // 数据帧：里程碑英雄卡与「统计与洞察」主体都要出现；
      // 若 hook 顺序违规，React 在 data 到达那一帧抛「Rendered more hooks…」，
      // 渲染树退化为空，waitFor 会超时失败
      await waitFor(() => expect(getByText('里程碑 · 全部清单')).toBeTruthy())
      await waitFor(() => expect(getAllByText('统计范围').length).toBeGreaterThan(0))
      await waitFor(() => expect(getByText('累计完成')).toBeTruthy())
      await waitFor(() => expect(getByText('最佳单日')).toBeTruthy())
      // 不允许任何 React 报错刷屏
      expect(spy.mock.calls.some((args) => String(args[0]).includes('Rendered more hooks'))).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })
})
