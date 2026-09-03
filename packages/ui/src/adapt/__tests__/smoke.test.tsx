// @vitest-environment jsdom
// 冒烟测试：验证 ui 与数据适配层在 React + react-query 环境能正常 mount，
// 不触发运行时崩溃（全仓渲染的地基）。完整视觉由 web 预览人工确认。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { setBackend, getBackend, type BackendAdapter } from '../../adapt/api'
import { useViewData, useLayers } from '../../hooks/useApi'
import type { MonthData, ViewMode } from '../../adapt/types'

function makeBackend(): BackendAdapter {
  const layers = [
    { layer_id: 'test', display_name: '测试图层', enabled: true, color: '#fff', sort_order: 1, kind: 'color' as const, group: null, config: {} },
  ]
  return {
    getView: async (mode: ViewMode, _anchor: string) => {
      if (mode === 'year') throw new Error('not in smoke')
      return {
        year: 2026, month: 9, layers,
        days: [],
      } as unknown as MonthData
    },
    getLayers: async () => layers,
    getCountdown: async () => ({ text: '' }),
    getCountdownList: async () => [],
    getTodoLists: async () => [],
    getSyncStatus: async () => ({ configured: false }),
    getSyncConfig: async () => ({ repo: '', branch: '', auto_on_start: false, sync_on_close: false, has_token: false }),
    // 其余方法本轮冒烟不会触发，用安全占位
    getTodoStats: async () => ({ total: 0, incomplete: 0, completed: 0 }),
    getTodos: async () => [],
  } as unknown as BackendAdapter
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('adapt/react 冒烟', () => {
  beforeEach(() => {
    setBackend(makeBackend())
  })

  it('setBackend 后可取到注入的后端', () => {
    expect(getBackend()).toBeTruthy()
  })

  it('useLayers 经 react-query 拉到注入的图层数据', async () => {
    const { result } = renderHook(() => useLayers(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]?.display_name).toBe('测试图层')
  })

  it('useViewData 拉到月视图（42 天网格基础形状）', async () => {
    const { result } = renderHook(() => useViewData('month', '2026-9'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const d = result.current.data as MonthData
    expect(d.month).toBe(9)
  })
})
