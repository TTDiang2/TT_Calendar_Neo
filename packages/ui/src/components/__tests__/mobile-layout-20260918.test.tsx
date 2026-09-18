// @vitest-environment jsdom
/**
 * 20260918 任务书渲染回归：
 * 1) 月视图信息栏待办行点击 = 呼出当日详情抽屉（1.3-3；日程/事件行早有此行为，
 *    待办行此前只有勾选框，点行无反馈）
 * 2) 快速新增抽屉「更多选项」展开后全字段可达，保存时把 备注/状态/计划/开始/
 *    复杂度/标签/闹钟 一起带给 createTodo（1.3-4 + 1.3-5 alarm_at）
 * 渲染级断言（jsdom）兜住 JSX 结构与回调接线；动画与视觉由真机/预览人工确认。
 */
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { setBackend, type BackendAdapter } from '../../adapt/api'
import { MonthGrid } from '../MonthGrid'
import { QuickAddSheet, TodoView } from '../TodoView'
import type { Day, MonthData, Todo } from '../../adapt/types'

vi.mock('../../anim', () => ({
  animDrawerIn: () => {},
  animSheetUp: () => {},
  animEnter: () => {},
}))

// vitest globals:false 下 RTL 不会自动注册 afterEach 清理，portal 到 body 的
// 浮层（QuickAddSheet 等）会泄漏进后续用例——必须显式 cleanup
afterEach(cleanup)

// jsdom 没有 matchMedia；这里让「手机竖屏」断点命中，MonthGrid 走 Mobile 分支
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
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

const DATE = '2026-09-18'

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    list_id: 'l1',
    title: '给花浇水',
    body: null,
    status: 'notStarted',
    importance: 'normal',
    due_date: null,
    planned_date: null,
    start_date: null,
    complexity: 'simple',
    tags: null,
    created_at: null,
    completed_at: null,
    sort_order: 0,
    alarm_at: null,
    ...overrides,
  }
}

function makeMonthData(todos: Todo[]): MonthData {
  const day = {
    date: DATE,
    is_today: true,
    lunar: null,
    holiday: null,
    coloring_level: null,
    gradient_bg: null,
    custom_bg: null,
    events_by_layer: {},
    schedule_items: [],
    todos,
  } as unknown as Day
  return { year: 2026, month: 9, layers: [], days: [day] } as unknown as MonthData
}

const backendStub = {
  getTodoBusyConfig: async () => ({ predict_colors: [], done_colors: [], weights: { due: 1, planned: 1, importance: 1 } }),
  getSubscriptions: async () => [],
  updateTodo: async () => ({}),
} as unknown as BackendAdapter

describe('月视图信息栏 · 待办行（1.3-3）', () => {
  it('点待办行呼出当日详情抽屉（onOpenDetail），勾选框不触发抽屉', async () => {
    setBackend(backendStub)
    const todo = makeTodo()
    const onOpenDetail = vi.fn()
    render(
      <MonthGrid
        monthData={makeMonthData([todo])}
        layers={[]}
        selectedDate={DATE}
        onSelect={() => {}}
        onOpenDetail={onOpenDetail}
        onDoubleClick={() => {}}
        onContextMenu={() => {}}
        onDragStart={() => {}}
        onDrop={() => {}}
      />,
      { wrapper },
    )

    const row = await screen.findByText('给花浇水')
    fireEvent.click(row)
    expect(onOpenDetail).toHaveBeenCalledWith(DATE)

    // 勾选框（stopPropagation）：不触发抽屉，onOpenDetail 仍只有上面那一次
    fireEvent.click(screen.getByLabelText('标记为已完成'))
    expect(onOpenDetail).toHaveBeenCalledTimes(1)
  })
})

describe('快速新增待办 · 更多选项（1.3-4 / 1.3-5）', () => {
  it('默认只露快速四件套；展开后备注/状态/计划/开始/复杂度/标签/闹钟可达，保存全量上送', async () => {
    setBackend(backendStub)
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(
      <QuickAddSheet
        lists={[{ id: 'l1', display_name: '任务', sort_order: 0, created_at: null }]}
        defaultListId="l1"
        allTags={['工作']}
        onClose={onClose}
        onCreate={onCreate}
      />,
      { wrapper },
    )

    // 折叠态：闹钟输入框不存在
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()

    fireEvent.click(screen.getByText('更多选项'))
    const alarmInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    expect(alarmInput).not.toBeNull()

    fireEvent.change(screen.getByPlaceholderText('要做什么？'), { target: { value: '写周报' } })
    fireEvent.change(screen.getByPlaceholderText('工作, 学习…'), { target: { value: '工作' } })
    fireEvent.change(alarmInput, { target: { value: '2026-09-19T08:30' } })

    fireEvent.click(screen.getByText('添加待办'))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    const payload = onCreate.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toMatchObject({
      list_id: 'l1',
      title: '写周报',
      tags: ['工作'],
      alarm_at: '2026-09-19T08:30',
      status: 'notStarted',
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('桌面新建待办 · 闹钟不丢（智者 P1 返工回归）', () => {
  // 这次断链的教训：QuickAddSheet 路径有测试、TodoDetailPanel 幻影新建路径没有——
  // TodoView onSave 新建分支手工列字段漏了 alarm_at，TS 因可选字段不报错。
  // 本测试走完整链路：点「新建待办」→ 幻影详情表单设闹钟 → 保存 → createTodo payload。
  it('幻影新建设了闹钟，保存后 createTodo 必须带上 alarm_at', async () => {
    const createTodoSpy = vi.fn(async (data: Record<string, unknown>) => ({ id: 'new1', ...data }))
    setBackend({
      getTodoLists: async () => [{ id: 'l1', display_name: '任务', sort_order: 0, created_at: null }],
      getTodoStats: async () => ({ total: 0, incomplete: 0, completed: 0 }),
      getTodos: async () => [],
      createTodoList: async (name: string) => ({ id: 'l1', display_name: name, sort_order: 0, created_at: null }),
      createTodo: createTodoSpy,
    } as unknown as BackendAdapter)

    render(
      <TodoView
        viewMode="list"
        onViewModeChange={() => {}}
        listsDrawerOpen={false}
        onListsDrawerOpenChange={() => {}}
        onDetailOpenChange={() => {}}
      />,
      { wrapper },
    )

    // 等清单查询就绪（否则 ensureList 走建清单分支，幻影不开）
    await screen.findByText('任务')

    // 桌面工具行的「新建待办」（jsdom 不执行 CSS，hidden 元素同样可点）
    fireEvent.click(await screen.findByText('新建待办'))

    // 幻影新建：先点标题进入编辑（手机分支的编辑 textarea 是全页唯一 textarea）
    fireEvent.click(await screen.findByText('点这里输入标题…'))
    const titleBox = document.querySelector('textarea') as HTMLTextAreaElement
    expect(titleBox).not.toBeNull()
    fireEvent.change(titleBox, { target: { value: '加班' } })

    // 点「闹钟」行进入编辑态，填精确时刻
    fireEvent.click(screen.getByText('闹钟'))
    const alarmInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    expect(alarmInput).not.toBeNull()
    fireEvent.change(alarmInput, { target: { value: '2026-09-20T07:00' } })

    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(createTodoSpy).toHaveBeenCalledTimes(1))
    const payload = createTodoSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toMatchObject({
      list_id: 'l1',
      title: '加班',
      alarm_at: '2026-09-20T07:00',
    })
  })
})
