// @vitest-environment jsdom
/**
 * 「sort_order 档位」残留手写判别式的清扫回归（20260918 智者 R1/R2）：
 * 1) SettingsDialog 的「集思录投资日历」分区必须用统一订阅判别式——老端自建
 *    图层（固定 sort_order=10）不得混入（此前与自定义图层区重复出现）
 * 2) EventEditor 的图层下拉：老端自建图层（sort_order=10）必须可选（此前被
 *    sort_order<10 档位挡住无法挂事件）；订阅图层与自动图层（coloring/holiday/
 *    todo/todo_done）不可选；important（重要日期）始终保留（手动事件默认落点）
 */
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { setBackend, type BackendAdapter } from '../../adapt/api'
import { SettingsDialog } from '../SettingsDialog'
import { EventEditor } from '../dialogs'
import type { Layer } from '../../adapt/types'

vi.mock('../../anim', () => ({
  animDrawerIn: () => {},
  animSheetUp: () => {},
  animSpringIn: () => {},
  animEnter: () => {},
}))

afterEach(cleanup)

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

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const SUBS = [
  { id: 'builtin:jisilu', display_name: '集思录', source_key: 'jisilu', url: null, rules_text: null, enabled: true, auto_update: true, status: 'ok', last_synced_at: null, config: {} },
]

function layer(overrides: Partial<Layer> & Pick<Layer, 'layer_id' | 'display_name'>): Layer {
  return {
    enabled: true,
    color: '#f00',
    sort_order: 0,
    kind: 'color' as const,
    group: null,
    config: {},
    ...overrides,
  } as Layer
}

// 复刻真实库的档位特征：jisilu 与老端自建图层都是 10，内置层 1-9
const LAYERS: Layer[] = [
  layer({ layer_id: 'important', display_name: '重要日期', sort_order: 1 }),
  layer({ layer_id: 'coloring', display_name: '充实度染色', sort_order: 2 }),
  layer({ layer_id: 'holiday', display_name: '公共节假日', sort_order: 3 }),
  layer({ layer_id: 'todo', display_name: '待办', sort_order: 4 }),
  layer({ layer_id: 'jisilu_CNV', display_name: '集思录·可转债', group: '集思录', sort_order: 10, kind: 'dot' }),
  layer({ layer_id: 'custom_813be064f200', display_name: '早起', group: '打卡', sort_order: 10 }),
]

const backendStub = {
  getSubscriptions: async () => SUBS,
  getTodoBusyConfig: async () => ({ predict_colors: [], done_colors: [], weights: { due: 1, planned: 1, importance: 1 } }),
  getTodoReminderConfig: async () => ({ enabled: false, hour: 9 }),
  getSyncConfig: async () => ({ repo: '', branch: 'main', auto_on_start: false, sync_on_close: false, has_token: false }),
  getSyncStatus: async () => ({ configured: false }),
  getLayerSubActions: async () => [],
} as unknown as BackendAdapter

describe('SettingsDialog 订阅内容清零（20260918 用户决策：Neo 端不做订阅）', () => {
  it('设置页不渲染任何订阅图层（集思录分区已整体移除），自建图层正常出现', async () => {
    setBackend(backendStub)
    render(
      <SettingsDialog
        layers={LAYERS}
        onToggleLayer={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    )

    // 自建图层出现（自定义图层区）
    expect(await screen.findByText('早起')).toBeTruthy()
    // 订阅图层在设置页任何位置都不出现（「事件导入」「集思录投资日历」分区已移除）
    expect(screen.queryByText('集思录·可转债')).toBeNull()
    expect(screen.queryByText('事件导入')).toBeNull()
    expect(screen.queryByText('集思录投资日历')).toBeNull()
  })
})

describe('EventEditor 图层下拉（智者 R2）', () => {
  it('老端自建图层可选；订阅与自动图层不可选；important 保留', () => {
    setBackend(backendStub)
    render(<EventEditor date="2026-09-18" layers={LAYERS} onClose={() => {}} />, { wrapper })

    const select = document.querySelector('select') as HTMLSelectElement
    expect(select).not.toBeNull()
    const options = Array.from(select.options).map((o) => o.textContent)

    expect(options).toContain('重要日期')            // 手动事件默认落点
    expect(options).toContain('早起')                // 老端自建图层（sort_order=10）恢复可选
    expect(options).not.toContain('集思录·可转债')   // 订阅图层
    expect(options).not.toContain('充实度染色')      // 自动图层 coloring
    expect(options).not.toContain('公共节假日')      // 自动图层 holiday
    expect(options).not.toContain('待办')            // 自动图层 todo
  })

  it('编辑归属已不在候选的历史事件时，原图层保留为选项（不悄悄改归属）', () => {
    setBackend(backendStub)
    render(
      <EventEditor
        date="2026-09-18"
        layers={LAYERS}
        event={{ id: 7, layer_id: 'holiday', source: 'manual', date: '2026-09-18', title: '旧事件', description: null, color: null, extra: {}, source_ref: null, sort_key: 0 }}
        onClose={() => {}}
      />,
      { wrapper },
    )
    const select = document.querySelector('select') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('公共节假日')
  })
})
